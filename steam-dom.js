// steam-dom.js
// Adapter for Steam's new React SSR Workshop layout ("CommunityTemplate").
// Loaded before content.js (see manifest.json) and exposes window.WSHSDom.
//
// The new layout uses hashed CSS-module class names, so this adapter only relies on
// stable hooks: the CommunityTemplate root, sharedfiles/filedetails links, the
// aspectratio_* preview frames and the SVGIcon_* icon names. Subscribed state is not
// part of the SSR HTML: the page fetches it with
// GET /sharedfiles/actions?q=GetUserListStatus&qp=[...]. Observing that request from
// the page world would require injecting an inline <script>, but MV3 subjects scripts
// created by a content script to the extension's CSP, so the page nonce cannot
// authorize them and the injection is always blocked (console CSP error). The hook is
// therefore not attempted; ids the page did not ask about are replayed in batches of
// 100 with an inferred fallback template, and the replay is skipped when no Steam
// user is signed in.

(function () {
    'use strict';

    var LOG_PREFIX = '[WSHS]';
    var ITEM_LINK_SELECTOR = 'a[href*="sharedfiles/filedetails/?id="]';
    var PREVIEW_SELECTOR = '.aspectratio_16x9, .aspectratio_square';
    var BATCH_SIZE = 100;
    var REPLAY_COOLDOWN_MS = 15000;

    var statusById = new Map();
    var requestedIds = new Set();
    var listeners = [];
    var learnedTemplate = null;
    var warned = false;
    var replayCooldownUntil = 0;
    var starFallback = null;
    var cachedAppId = null;

    // ---------------------------------------------------------------------
    // Status store (fed by the replay below)
    // ---------------------------------------------------------------------

    window.addEventListener('message', function (event) {
        var message = event.data;
        if (!message || message.__wshs !== true) return;
        if (message.type === 'status') {
            if (recordRows(message.rows)) {
                notifyListeners();
            }
        } else if (message.type === 'template') {
            if (message.template && Array.isArray(message.template.args) && typeof message.template.idsIndex === 'number') {
                learnedTemplate = message.template;
            }
        }
    });

    function recordRows(rows) {
        if (!Array.isArray(rows)) return false;
        var changed = false;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || row.publishedfileid == null || typeof row.inlist !== 'boolean') continue;
            var id = String(row.publishedfileid);
            if (!statusById.has(id) || statusById.get(id) !== row.inlist) {
                statusById.set(id, row.inlist);
                changed = true;
            }
        }
        return changed;
    }

    function notifyListeners() {
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i]();
            } catch (error) {
                // a listener must not break the others
            }
        }
    }

    // ---------------------------------------------------------------------
    // GetUserListStatus replay
    // ---------------------------------------------------------------------

    function getAppId() {
        if (cachedAppId !== null) return cachedAppId;
        cachedAppId = 0;
        try {
            var fromQuery = new URLSearchParams(window.location.search).get('appid');
            if (fromQuery && /^\d+$/.test(fromQuery)) {
                cachedAppId = Number(fromQuery);
            } else {
                var match = /\/app\/(\d+)\//.exec(window.location.pathname);
                if (match) {
                    cachedAppId = Number(match[1]);
                }
            }
        } catch (error) {
            cachedAppId = 0;
        }
        return cachedAppId;
    }

    function removeRequested(ids) {
        for (var i = 0; i < ids.length; i++) {
            requestedIds.delete(ids[i]);
        }
    }

    // GetUserListStatus answers 500 without a session, which would show up as a
    // failed request on every logged-out page load. The SSR shell embeds
    // window.UserConfig in inline script text (readable from the isolated world),
    // and the header shows a login link when signed out. Unknown state is treated
    // as signed in and left uncached so a slow-rendering shell can be re-checked.
    var loggedInState = null;

    function isLoggedIn() {
        if (loggedInState !== null) return loggedInState;
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            var text = scripts[i].textContent || '';
            if (text.indexOf('window.UserConfig') === -1) continue;
            var config = parseAssignedJson(text, 'window.UserConfig');
            if (config && typeof config.logged_in === 'boolean') {
                loggedInState = config.logged_in;
                return loggedInState;
            }
        }
        if (document.querySelector('a[href="/login/"]')) {
            loggedInState = false;
        }
        return loggedInState === null ? true : loggedInState;
    }

    // Firefox runs content-script fetch() as the extension, so the request
    // would not carry the page's Steam session; content.fetch() (Firefox
    // only) makes it as the page itself. Chrome's content-script fetch is
    // already page-origin.
    function pageFetch(input, init) {
        if (typeof content !== 'undefined' && content && typeof content.fetch === 'function') {
            return content.fetch(input, init);
        }
        return fetch(input, init);
    }

    function sendReplayBatch(batch) {
        var args;
        var idsIndex;
        var endpoint;
        if (learnedTemplate) {
            args = learnedTemplate.args.slice();
            idsIndex = learnedTemplate.idsIndex;
            endpoint = learnedTemplate.endpoint;
        } else {
            // Inferred replay fallback, used only while no page query template has
            // been snooped: [appid, list_type, file_type, ids]. Research was logged
            // out, so the list_type/file_type values are a guess, not verified; a
            // snooped template (above) stays preferred and authoritative.
            var appId = getAppId();
            if (!appId) {
                removeRequested(batch);
                return;
            }
            args = [appId, 1, 0, null];
            idsIndex = 3;
            endpoint = '/sharedfiles/actions';
        }
        args[idsIndex] = batch;
        var url = new URL(endpoint, window.location.href);
        url.searchParams.set('q', 'GetUserListStatus');
        url.searchParams.set('qp', JSON.stringify(args));

        pageFetch(url.href, { headers: { 'x-valve-refetch-payload': 'queryAction' } })
            .then(function (response) {
                if (!response.ok) throw new Error('GetUserListStatus HTTP ' + response.status);
                return response.json();
            })
            .then(function (payload) {
                if (recordRows(payload && payload.data)) {
                    notifyListeners();
                }
            })
            .catch(function () {
                replayCooldownUntil = Date.now() + REPLAY_COOLDOWN_MS;
                removeRequested(batch);
            });
    }

    function requestStatuses(ids) {
        if (Date.now() < replayCooldownUntil) return;
        if (!isLoggedIn()) return;
        var batch = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (statusById.has(id) || requestedIds.has(id)) continue;
            requestedIds.add(id);
            batch.push(id);
            if (batch.length >= BATCH_SIZE) {
                sendReplayBatch(batch);
                batch = [];
            }
        }
        if (batch.length) sendReplayBatch(batch);
    }

    // ---------------------------------------------------------------------
    // New-layout DOM helpers
    // ---------------------------------------------------------------------

    function isNewLayout() {
        if (document.getElementById('CommunityTemplate')) return true;
        if (document.querySelector('[data-react-nav-root="CommunityTemplate"]')) return true;
        var links = document.querySelectorAll(ITEM_LINK_SELECTOR);
        for (var i = 0; i < links.length && i < 3; i++) {
            if (links[i].closest(PREVIEW_SELECTOR)) return true;
        }
        return false;
    }

    // The row with the filter controls: it contains both the Special Filters /
    // sort combobox and the "Filter by Date" button (button[data-accent-color]),
    // and no item links. Localized pages are still matched structurally; the
    // button text is only a secondary hint.
    function getControlArea() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return null;
        var comboboxes = root.querySelectorAll('[role="combobox"]');
        for (var i = 0; i < comboboxes.length; i++) {
            var node = comboboxes[i].parentElement;
            while (node && node !== root) {
                if (node.querySelector('button[data-accent-color]') && !node.querySelector(ITEM_LINK_SELECTOR)) {
                    return node;
                }
                node = node.parentElement;
            }
        }
        var buttons = root.querySelectorAll('button[data-accent-color]');
        for (var j = 0; j < buttons.length; j++) {
            var text = (buttons[j].textContent || '').toLowerCase();
            if (text.indexOf('filter by date') !== -1) {
                var parent = buttons[j].parentElement;
                return parent && parent.parentElement ? parent.parentElement : parent;
            }
        }
        return null;
    }

    function getSortButton() {
        var scope = getControlArea();
        var result = findSortButtonIn(scope);
        if (result) return result;
        return findSortButtonIn(document.getElementById('CommunityTemplate')) ||
            findSortButtonIn(document);
    }

    // The native sort dropdown is a div[role="button"][tabindex] containing the
    // 12x8 chevron svg. Nav dropdowns also use that chevron, so a button that
    // contains the 32x18 sort glyph is preferred before falling back to a
    // chevron-only match. Its parent is the fit-content wrapper used as the
    // insertion anchor. No hashed class names are used as selectors.
    function findSortButtonIn(scope) {
        if (!scope) return null;
        var buttons = scope.querySelectorAll('div[role="button"][tabindex]');
        var chevronOnly = null;
        for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            if (!button.querySelector('svg[viewBox="0 0 12 8"]')) continue;
            var wrapper = button.parentElement;
            if (!wrapper) continue;
            var entry = { button: button, wrapper: wrapper };
            if (button.querySelector('svg[viewBox="0 0 32 18"]')) return entry;
            if (!chevronOnly) chevronOnly = entry;
        }
        return chevronOnly;
    }

    // Labels of the native sort popover's options, used by content.js for the
    // frozen worst-case ink. Steam mounts the popover children only while it is
    // open, so a closed menu returns [] and the fixed label set in content.js
    // is the authority; this is the live enumeration path when the popover is
    // mounted. Options are radios in a "SORT ORDER" / "TIME FRAME" radiogroup,
    // so only groups with such a header are read. No hashed class names.
    function getSortOptionLabels() {
        var labels = [];
        var seen = {};
        var groups = document.querySelectorAll('[role="radiogroup"]');
        for (var i = 0; i < groups.length; i++) {
            var group = groups[i];
            var header = group.previousElementSibling;
            var hint = header ? (header.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() : '';
            if (hint.indexOf('sort') === -1 && hint.indexOf('time') === -1) continue;
            var options = group.querySelectorAll('[role="radio"]');
            for (var j = 0; j < options.length; j++) {
                var text = (options[j].textContent || '').replace(/\s+/g, ' ').trim();
                if (!text || seen[text]) continue;
                seen[text] = true;
                labels.push(text);
            }
        }
        return labels;
    }

    function parsePublishedFileId(href) {
        var match = /[?&]id=(\d+)/.exec(href || '');
        return match ? match[1] : null;
    }

    function collectPublishedFileIds(node) {
        var ids = new Set();
        var links = node.querySelectorAll(ITEM_LINK_SELECTOR);
        for (var i = 0; i < links.length; i++) {
            var id = parsePublishedFileId(links[i].href);
            if (id) ids.add(id);
        }
        return ids;
    }

    // Card root = highest ancestor of the item link that still looks like a single
    // card: it contains the aspectratio preview and only one distinct publishedfileid
    // (the card has two filedetails links - preview and title - but they point at the
    // same id). If the climb is cut short by the page boundary (body / CommunityTemplate)
    // while the candidate still looks like a card, the candidate cannot be told apart
    // from a page-level wrapper (single-card pages), so null is returned and nothing is
    // hidden. The final root is re-validated against the same rule; fail safe.
    function findCardRoot(link) {
        var id = parsePublishedFileId(link.href);
        if (!id) return null;
        var templateRoot = document.getElementById('CommunityTemplate') ||
            document.querySelector('[data-react-nav-root="CommunityTemplate"]');
        var node = link.parentElement;
        var root = null;
        while (node && node !== document.body && node !== document.documentElement && node !== templateRoot) {
            if (!node.matches(PREVIEW_SELECTOR) && !node.querySelector(PREVIEW_SELECTOR)) break;
            var ids = collectPublishedFileIds(node);
            if (ids.size !== 1 || !ids.has(id)) break;
            root = node;
            node = node.parentElement;
        }
        if (!root) return null;
        if (node === document.body || node === document.documentElement || node === templateRoot) {
            // The climb never met a non-card ancestor, so the candidate could be a
            // whole-page container; hide nothing.
            return null;
        }
        var rootIds = collectPublishedFileIds(root);
        if (rootIds.size !== 1 || !rootIds.has(id) || !root.querySelector(PREVIEW_SELECTOR)) {
            return null;
        }
        return root;
    }

    function enumerateCards() {
        var scope = document.getElementById('CommunityTemplate') || document;
        var links = scope.querySelectorAll(ITEM_LINK_SELECTOR);
        var cards = [];
        var seen = new Set();
        for (var i = 0; i < links.length; i++) {
            var id = parsePublishedFileId(links[i].href);
            if (!id || seen.has(id)) continue;
            var root = findCardRoot(links[i]);
            if (!root) continue;
            seen.add(id);
            cards.push({ id: id, root: root });
        }
        return cards;
    }

    function median(values) {
        if (!values.length) return 0;
        var sorted = values.slice().sort(function (a, b) { return a - b; });
        var mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Geometry of the card grid for the round-4 button layout: card border-box
    // width, gap between columns, column count and a representative card to
    // observe for reflows. Cards hidden by our filtering are display:none and
    // would report a zero box, which used to make W/columns depend on how many
    // cards a star/hide filter left visible (fallback latch). They are
    // un-hidden for this synchronous measurement and restored before the
    // function returns, so the result always describes the unfiltered grid and
    // filtering can never change the button geometry. Only genuinely invisible
    // cards (still zero after the pass) are skipped. Returns null when no card
    // is measurable. Cards hidden by saved author filters (saved-filters.js,
    // wshs-filtered) get the same treatment.
    var FILTER_CLASSES = ['hidden-item', 'wshs-filtered'];

    function getCardGeometry() {
        var cards = enumerateCards();
        var unhidden = [];
        for (var u = 0; u < cards.length; u++) {
            var hiddenRoot = cards[u].root;
            if (!hiddenRoot.classList) continue;
            for (var c = 0; c < FILTER_CLASSES.length; c++) {
                if (hiddenRoot.classList.contains(FILTER_CLASSES[c])) {
                    hiddenRoot.classList.remove(FILTER_CLASSES[c]);
                    unhidden.push({ root: hiddenRoot, cls: FILTER_CLASSES[c] });
                }
            }
        }
        try {
            var rects = [];
            for (var i = 0; i < cards.length; i++) {
                var box = cards[i].root.getBoundingClientRect();
                if (box.width < 60) continue;
                rects.push({ left: box.left, top: box.top, width: box.width, root: cards[i].root });
            }
            if (!rects.length) return null;
            rects.sort(function (a, b) { return a.left - b.left || a.top - b.top; });
            var columns = [];
            for (var j = 0; j < rects.length; j++) {
                var entry = rects[j];
                var column = null;
                for (var k = 0; k < columns.length; k++) {
                    if (Math.abs(columns[k].left - entry.left) < 2) {
                        column = columns[k];
                        break;
                    }
                }
                if (!column) {
                    column = { left: entry.left, widths: [] };
                    columns.push(column);
                }
                column.widths.push(entry.width);
            }
            columns.sort(function (a, b) { return a.left - b.left; });
            var widths = [];
            for (var m = 0; m < columns.length; m++) {
                widths.push(median(columns[m].widths));
            }
            var width = median(widths);
            var gaps = [];
            for (var n = 1; n < columns.length; n++) {
                gaps.push(columns[n].left - columns[n - 1].left - width);
            }
            var gap = gaps.length ? median(gaps) : 0;
            if (!(gap >= 0)) gap = 0;
            return { width: width, gap: gap, columns: columns.length, card: rects[0].root };
        } finally {
            for (var r = 0; r < unhidden.length; r++) {
                unhidden[r].root.classList.add(unhidden[r].cls);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Star rating and subscribed state
    // ---------------------------------------------------------------------

    // window.SSR is a page-world global and is undefined in this isolated world, so it
    // cannot be read directly. The same payload is emitted as inline script text
    // (`window.SSR.loaderData = [...]`, `window.SSR.renderContext = JSON.parse("...")`),
    // and script text is visible from every world, so parse those JSON islands out of
    // the DOM instead. loaderData carries the item results on some pages, renderContext
    // on others.
    function findJsonEnd(text, start) {
        var depth = 0;
        var inString = false;
        var escaped = false;
        for (var i = start; i < text.length; i++) {
            var ch = text.charAt(i);
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === '[' || ch === '{') depth += 1;
            else if (ch === ']' || ch === '}') {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function readJsStringLiteral(text, quoteIndex) {
        var raw = '';
        var i = quoteIndex + 1;
        while (i < text.length) {
            var ch = text.charAt(i);
            if (ch === '\\') {
                raw += ch + text.charAt(i + 1);
                i += 2;
                continue;
            }
            if (ch === '"') return raw;
            raw += ch;
            i += 1;
        }
        return null;
    }

    function parseAssignedJson(text, marker) {
        var at = text.indexOf(marker);
        if (at === -1) return null;
        var eq = text.indexOf('=', at + marker.length);
        if (eq === -1) return null;
        var pos = eq + 1;
        while (pos < text.length && /\s/.test(text.charAt(pos))) pos++;
        if (text.slice(pos, pos + 11) === 'JSON.parse(') {
            pos += 11;
            while (pos < text.length && /\s/.test(text.charAt(pos))) pos++;
        }
        var ch = text.charAt(pos);
        if (ch === '[' || ch === '{') {
            var end = findJsonEnd(text, pos);
            if (end === -1) return null;
            try {
                return JSON.parse(text.slice(pos, end + 1));
            } catch (error) {
                return null;
            }
        }
        if (ch === '"') {
            var raw = readJsStringLiteral(text, pos);
            if (raw === null) return null;
            try {
                return JSON.parse(JSON.parse('"' + raw + '"'));
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    function readSsrIslands() {
        var values = [];
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            var text = scripts[i].textContent || '';
            if (text.indexOf('window.SSR') === -1) continue;
            var loaderData = parseAssignedJson(text, 'window.SSR.loaderData');
            if (loaderData) values.push(loaderData);
            var renderContext = parseAssignedJson(text, 'window.SSR.renderContext');
            if (renderContext) values.push(renderContext);
        }
        return values;
    }

    function buildStarFallback() {
        var map = new Map();
        var islands = readSsrIslands();
        if (!islands.length) return map;
        var seenStrings = new Set();

        function visit(value, depth) {
            if (value == null || depth > 12) return;
            if (typeof value === 'string') {
                if (value.length < 2 || (value.charAt(0) !== '{' && value.charAt(0) !== '[') || seenStrings.has(value)) return;
                seenStrings.add(value);
                try {
                    visit(JSON.parse(value), depth + 1);
                } catch (error) {
                    // not JSON
                }
                return;
            }
            if (Array.isArray(value)) {
                for (var i = 0; i < value.length; i++) visit(value[i], depth + 1);
                return;
            }
            if (typeof value === 'object') {
                if (value.publishedfileid != null && value.star_rating != null) {
                    var stars = Number(value.star_rating);
                    if (!isNaN(stars)) {
                        map.set(String(value.publishedfileid), stars);
                    }
                }
                for (var key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        visit(value[key], depth + 1);
                    }
                }
            }
        }

        for (var i = 0; i < islands.length; i++) visit(islands[i], 0);
        return map;
    }

    function getStarRating(card, id) {
        var filled = card.querySelectorAll('svg.SVGIcon_Star_Filled').length;
        if (filled > 0) return Math.min(filled, 5);
        if (card.querySelector('svg.SVGIcon_Star_Filled, svg.SVGIcon_Star_Unfilled')) return 0;
        if (starFallback === null) starFallback = buildStarFallback();
        return starFallback.get(id) || 0;
    }

    function getSubscribedState(card, id) {
        if (statusById.has(id)) return statusById.get(id);
        // Fallback heuristic only: the card action area shows a check icon when the
        // item is subscribed and a plus icon when it is not.
        if (card.querySelector('svg.SVGIcon_Check, svg.SVGIcon_DialogCheck')) return true;
        if (card.querySelector('svg.SVGIcon_Plus')) return false;
        return undefined;
    }

    function maybeWarnUnknown(unknownCount) {
        if (warned || unknownCount <= 0) return;
        if (statusById.size === 0 && requestedIds.size === 0) {
            warned = true;
            console.warn(LOG_PREFIX + ' Subscribed state is unavailable for some items; leaving them visible.');
        }
    }

    // ---------------------------------------------------------------------
    // Public API used by content.js
    // ---------------------------------------------------------------------

    function applyFilters(state) {
        var cards = enumerateCards();
        var hideSubscribed = !!(state && state.isHidingSubscribed);
        var minStars = Number(state && state.currentStarFilter) || 0;
        var unknownCount = 0;
        var ids = [];
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            ids.push(card.id);
            var hide = false;
            if (minStars > 0 && getStarRating(card.root, card.id) < minStars) {
                hide = true;
            }
            if (hideSubscribed) {
                var subscribed = getSubscribedState(card.root, card.id);
                if (subscribed === true) {
                    hide = true;
                } else if (subscribed === undefined) {
                    unknownCount += 1;
                }
            }
            card.root.classList.toggle('hidden-item', hide);
        }
        if (hideSubscribed) {
            requestStatuses(ids);
            maybeWarnUnknown(unknownCount);
        }
    }

    function onStatusUpdate(callback) {
        if (typeof callback !== 'function') return function () {};
        listeners.push(callback);
        return function () {
            var index = listeners.indexOf(callback);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    window.WSHSDom = {
        isNewLayout: isNewLayout,
        getControlArea: getControlArea,
        getSortButton: getSortButton,
        getSortOptionLabels: getSortOptionLabels,
        getCardGeometry: getCardGeometry,
        enumerateCards: enumerateCards,
        applyFilters: applyFilters,
        onStatusUpdate: onStatusUpdate
    };
})();
