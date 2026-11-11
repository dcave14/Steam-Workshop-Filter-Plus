// search-terms-hook.js
// Runs in the page's MAIN world (see manifest.json) so it can wrap the page's
// own window.fetch, which the isolated content script world cannot replace.
//
// Single responsibility: append the saved keyword filters (saved-filters.js)
// to the search text of Steam's browse requests, so Steam's server applies
// them to mod titles, optionally including descriptions, while the address bar and search box
// keep showing only what the user typed.
//
// Steam's new browse page loads results with two request shapes:
//   - POST "routeAction" (x-valve-request-type header): search, filters and
//     paging. The server reads the JSON body's search_text, not the URL.
//   - GET "routeData": history navigation. The server reads the URL's
//     searchtext parameter.
// Both are rewritten. The terms come from the data-wshs-terms attribute on
// <html>, which saved-filters.js keeps current; attributes are shared across
// worlds, so no messaging is needed. When a rewritten routeAction answers,
// data-wshs-fetched on <html> is bumped so saved-filters.js (and the tests)
// can tell the filtered results have arrived.

(function () {
    'use strict';

    var TERMS_ATTR = 'data-wshs-terms';
    var FETCHED_ATTR = 'data-wshs-fetched';
    var REQUESTED_TERMS_ATTR = 'data-wshs-requested-terms';
    var SCOPE_ATTR = 'data-wshs-description-search';
    var originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    function getTerms() {
        return (document.documentElement.getAttribute(TERMS_ATTR) || '').trim();
    }

    function withTerms(text, terms) {
        return ((text || '').trim() + ' ' + terms).trim();
    }

    function requestType(input, init) {
        var headers = (init && init.headers) || (input instanceof Request ? input.headers : null);
        if (!headers) return null;
        try {
            return new Headers(headers).get('x-valve-request-type');
        } catch (error) {
            return null;
        }
    }

    function rewrite(input, init) {
        var terms = getTerms();
        if (!terms) return null;
        var type = requestType(input, init);
        if (type !== 'routeAction' && type !== 'routeData') return null;
        var url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        if (url.origin !== window.location.origin || !/\/workshop\/browse\/?$/.test(url.pathname)) return null;
        // A native query has its own field scope and boolean grammar. There is
        // no per-clause field scope, so appending saved title-only phrases could
        // change both OR precedence and Description Only semantics. Leave that
        // query entirely to Steam; saved rules still run on its returned cards.
        var body = null, args = null;
        if (type === 'routeAction' && init && typeof init.body === 'string') {
            body = JSON.parse(init.body);
            args = Array.isArray(body) ? body : [body];
        }
        var texts = args && args.filter(function (arg) { return arg && typeof arg.search_text === 'string'; });
        if (texts && texts.length ? texts.some(function (arg) { return arg.search_text.trim(); }) : (url.searchParams.get('searchtext') || '').trim()) return null;
        if (type === 'routeAction' && (!texts || !texts.length)) return null;
        url.searchParams.set('searchtext', withTerms(url.searchParams.get('searchtext'), terms));
        // Steam's native targets: 1 = titles only; 0 = titles + descriptions.
        var target = document.documentElement.getAttribute(SCOPE_ATTR) === '1' ? 0 : 1;
        url.searchParams.set('search_text_target', String(target));
        var nextInit = init;
        if (init && typeof init.body === 'string' && init.body.indexOf('"search_text"') !== -1) {
            for (var i = 0; i < args.length; i++) {
                if (args[i] && typeof args[i].search_text === 'string') {
                    args[i].search_text = withTerms(args[i].search_text, terms);
                    args[i].search_text_target = target;
                }
            }
            nextInit = Object.assign({}, init, { body: JSON.stringify(body) });
        }
        var nextInput = input instanceof Request ? new Request(url.href, input) : url.href;
        return { input: nextInput, init: nextInit, isAction: type === 'routeAction' };
    }

    window.fetch = function (input, init) {
        var next = null;
        try {
            next = rewrite(input, init);
        } catch (error) {
            // A request this hook does not understand goes out unchanged.
            next = null;
        }
        if (!next) return originalFetch.apply(this, arguments);
        if (next.isAction) {
            document.documentElement.setAttribute(REQUESTED_TERMS_ATTR, getTerms());
            document.documentElement.setAttribute('data-wshs-requested-description-search', document.documentElement.getAttribute(SCOPE_ATTR) || '0');
        }
        var pending = originalFetch.call(this, next.input, next.init);
        if (next.isAction) {
            pending.then(function () {
                var root = document.documentElement;
                root.setAttribute(FETCHED_ATTR, String(Number(root.getAttribute(FETCHED_ATTR) || 0) + 1));
            }, function () {});
        }
        return pending;
    };
})();
