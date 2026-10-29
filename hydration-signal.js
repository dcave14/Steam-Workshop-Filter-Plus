// hydration-signal.js
// Runs in the page's MAIN world (see manifest.json) so it can see React's
// per-node expando keys (__reactFiber$<hash>), which the isolated content
// script world cannot read.
//
// Single responsibility: tell content.js the moment React has hydrated the
// row that holds the native sort button. React attaches the fiber key to a
// host node when that node finishes hydrating, after all of its children, so
// once the row has one, inserting our controls into it can no longer cause a
// hydration mismatch (#418). The signal is the data-wshs-hydrated attribute
// on <html>: attributes are shared across worlds and content.js's document
// MutationObserver already watches attributes, so no messaging is needed.
// Saved Filters modifies a separate Suspense boundary in the sidebar. Steam's
// root hydration flag can precede that boundary, so also check its handlers.
// data-wshs-page-hydrated carries that stronger signal across script worlds.
//
// If the row never shows a fiber key (legacy page, layout change, React
// internals renamed), polling stops after MAX_WAIT_MS and content.js keeps its
// old load-plus-quiet-period gate as the fallback.

(function () {
    'use strict';

    var POLL_MS = 50;
    var MAX_WAIT_MS = 20000;
    var started = Date.now();

    function hasFiber(node) {
        if (!node) return false;
        var keys = Object.keys(node);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0) return true;
        }
        return false;
    }

    function hasHydratedClickHandler(node) {
        var fiber = null;
        var props = null;
        var keys = Object.keys(node);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0) fiber = node[keys[i]];
            if (keys[i].indexOf('__reactProps$') === 0) props = node[keys[i]];
        }
        if (!fiber || !props || typeof props.onClick !== 'function') return false;
        // A parent Suspense/root boundary can still be dehydrated even after
        // host nodes appear. Do not insert siblings into that subtree yet.
        for (var current = fiber; current; current = current.return) {
            var state = current.memoizedState;
            if (state && (state.dehydrated || state.isDehydrated)) return false;
        }
        return true;
    }

    function sidebarIsHydrated() {
        var svgs = document.querySelectorAll('#CommunityTemplate [role="button"] > svg[viewBox="0 0 14 14"]');
        var rows = 0;
        for (var i = 0; i < svgs.length; i++) {
            if (svgs[i].closest('.wshs-saved-filters')) continue;
            var row = svgs[i].parentElement.parentElement;
            if (row.children.length < 3 || !row.children[0].matches('[role="button"]') ||
                !row.children[1].matches('[role="button"]')) continue;
            rows++;
            if (!hasHydratedClickHandler(row.children[0]) || !hasHydratedClickHandler(row.children[1])) return false;
        }
        return rows > 0;
    }

    // Same structural match as steam-dom.js findSortButtonIn(): a
    // div[role=button][tabindex] containing the 12x8 chevron, preferring the
    // one that also holds the 32x18 sort glyph.
    function findSortRow() {
        var buttons = document.querySelectorAll('div[role="button"][tabindex]');
        var chevronOnly = null;
        for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            if (!button.querySelector('svg[viewBox="0 0 12 8"]')) continue;
            var wrapper = button.parentElement;
            if (!wrapper || !wrapper.parentElement) continue;
            if (button.querySelector('svg[viewBox="0 0 32 18"]')) return wrapper.parentElement;
            if (!chevronOnly) chevronOnly = wrapper.parentElement;
        }
        return chevronOnly;
    }

    function check() {
        var row = findSortRow();
        var root = document.documentElement;
        if (row && !root.hasAttribute('data-wshs-page-hydrated')) {
            root.setAttribute('data-wshs-page-hydrated', '0');
        }
        var rowReady = row && hasFiber(row);
        if (rowReady && !document.documentElement.hasAttribute('data-wshs-hydrated')) {
            document.documentElement.setAttribute('data-wshs-hydrated', '1');
        }
        var pageReady = !!(window.SSR && window.SSR.hydrated === true && sidebarIsHydrated());
        var previews = document.querySelectorAll('#CommunityTemplate .aspectratio_16x9 img, #CommunityTemplate .aspectratio_square img');
        if (window.SSR && window.SSR.hydrated === true && previews.length && Array.prototype.every.call(previews, hasFiber)) {
            root.setAttribute('data-wshs-previews-ready', '1');
        }
        if (pageReady) root.setAttribute('data-wshs-page-hydrated', '1');
        if ((!rowReady || !pageReady) && Date.now() - started < MAX_WAIT_MS) {
            setTimeout(check, POLL_MS);
        } else if (!pageReady && root.getAttribute('data-wshs-page-hydrated') === '0') {
            // Unknown/new Steam internals: release the load-plus-quiet fallback
            // only after the bounded readiness probe has expired.
            root.removeAttribute('data-wshs-page-hydrated');
        }
    }

    check();
})();
