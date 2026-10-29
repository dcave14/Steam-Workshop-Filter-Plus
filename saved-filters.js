// saved-filters.js
// Shared per-game keyword and author filters for Workshop and collection pages.
//
// - A "Saved Filters" section in Steam's left sidebar, above Categories, built
//   from clones of Steam's own section, rows and +/- buttons. "-" hides
//   matches, "+" shows only matches, neither keeps the filter saved but off.
// - On cards: hovering an author, or clicking an opted-in title word, shows the same
//   [+][-] pair beside it, which becomes a [check] once one is picked.
//
// Keyword filters are applied by Steam's server: search-terms-hook.js (MAIN
// world) appends them to the search text of Steam's own browse requests, so
// they match titles (and optionally descriptions) while the search box keeps showing
// only what the user typed. Steam's text search does not match the author
// field, so author filters hide cards on the page by the author link instead
// (wshs-filtered), like the star and subscribed filters do.
//
// Filters are stored per game: chrome.storage.local['savedFilters:' + appid] is a
// list of { kind: 'keyword' | 'author', value, label, state: -1 | 0 | 1 }.

(function initSavedFilters() {
    'use strict';

    var browsePage = /\/workshop\/browse\/?$/.test(window.location.pathname);
    var detailsPage = /\/sharedfiles\/filedetails\/?$/.test(window.location.pathname);
    if (detailsPage && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSavedFilters, { once: true });
        return;
    }
    var collectionPage = detailsPage && !!document.querySelector('.subscribeCollection');
    if (!browsePage && !collectionPage) return;
    if (collectionPage) document.documentElement.classList.add('wshs-collection-page');

    var LEGACY_STORAGE_KEY = 'savedFilters';
    var TERMS_ATTR = 'data-wshs-terms';
    var REQUESTED_TERMS_ATTR = 'data-wshs-requested-terms';
    var ITEM_LINK = 'a[href*="sharedfiles/filedetails/?id="]';
    var AUTHOR_LINK = 'a[href*="/myworkshopfiles"]';
    var PREVIEW = '.aspectratio_16x9, .aspectratio_square';
    var MAX_PHRASE = 80;
    var PICKER_HIDE_MS = 300;
    var PICKER_CONFIRM_MS = 2500;

    // Steam's active +/- colors (fill and stroke, then the symbol), read from
    // the native Categories buttons. Set inline because the class that
    // carries them is a hashed CSS-module name.
    var ACTIVE = {
        '1': { fill: '#5db7c7', symbol: '#000' },
        '-1': { fill: '#d3ac42', symbol: '#000' }
    };

    var appId = readAppId();
    if (!appId) return;
    var storageKey = LEGACY_STORAGE_KEY + ':' + appId;
    var descriptionKey = 'savedFilterDescriptions:' + appId;
    var includeDescriptions = false;

    var filters = [];
    var knownCreators = new Map(); // creator lists already shown by Quick View, keyed by item id
    var authorAliases = new Map();
    var creatorLayouts = new WeakMap();
    var loaded = false;
    var section = null;
    var picker = null;
    var pickerTarget = null; // { kind, value, label, anchor, range? }
    var pickerPositionFrame = null;
    var collectionPositionUntil = 0;
    var collectionPositionResize = null;
    var collectionPositionMutation = null;
    var pickerHideTimer = null;
    var pickerClosing = false; // confirmation runs independently of hovering
    var pickerAuthorRow = null;
    var pickerHelpOpen = false;
    var pendingAction = null;
    var titleSelectionEnabled = false;
    var titleDragAttributes = new Map();
    var initialRefetchDone = false;
    var initialRefetchTimer = null;
    var initialRefetchAttempts = 0;
    var hiddenChip = null;
    var tickFrame = null;
    var retryTimer = null;
    var lastPageMutationAt = Date.now();
    var hoverWordKey = null;

    function highlightWord(name, range) {
        if (!window.CSS || !CSS.highlights || typeof Highlight !== 'function') return;
        if (range) CSS.highlights.set(name, new Highlight(range));
        else CSS.highlights.delete(name);
    }

    function readAppId() {
        var fromQuery = new URLSearchParams(window.location.search).get('appid');
        if (collectionPage) {
            var button = document.querySelector('.subscribeCollection [onclick*="SubscribeCollection("]');
            var args = button && /SubscribeCollection\(\s*['"]\d+['"]\s*,\s*['"](\d+)['"]/.exec(button.getAttribute('onclick'));
            if (args) return args[1];
            var game = document.querySelector('a[href*="store.steampowered.com/app/"]');
            var match = game && /\/app\/(\d+)/.exec(game.href);
            if (match) return match[1];
        }
        return fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : null;
    }

    // ---------------------------------------------------------------------
    // Filter state and storage
    // ---------------------------------------------------------------------

    function sameFilter(a, kind, value) {
        if (a.kind !== kind) return false;
        if (a.value.toLowerCase() === value.toLowerCase()) return true;
        return kind === 'author' && authorValues(a.value).some(function (key) { return authorValues(value).indexOf(key) !== -1; });
    }

    function findFilter(kind, value) {
        for (var i = 0; i < filters.length; i++) {
            if (sameFilter(filters[i], kind, value)) return filters[i];
        }
        return null;
    }

    function buildTerms(list) {
        var terms = [];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            if (f.kind !== 'keyword' || !f.state) continue;
            terms.push((f.state < 0 ? '-' : '') + '"' + f.value + '"');
        }
        return terms.join(' ');
    }

    // Returns true when the published terms changed. Compared with what was
    // last published, not with `filters`, which save() edits ahead of the
    // storage round trip.
    var publishedTerms = '';
    var publishedDescriptions = false;

    function publishTerms() {
        if (collectionPage) return false;
        // Steam uses routeData while hydrating its server-rendered page.
        // Rewriting that initial loader with saved keywords would make its
        // data disagree with the existing HTML (React #418). Publish only
        // after hydration, then explicitly refetch the filtered results.
        if (!isSettled()) return false;
        var terms = buildTerms(filters);
        document.documentElement.setAttribute('data-wshs-description-search', includeDescriptions ? '1' : '0');
        if (terms) document.documentElement.setAttribute(TERMS_ATTR, terms);
        else document.documentElement.removeAttribute(TERMS_ATTR);
        var changed = terms !== publishedTerms || includeDescriptions !== publishedDescriptions;
        publishedTerms = terms;
        publishedDescriptions = includeDescriptions;
        return changed;
    }

    // Each game has its own storage key, so concurrent tabs cannot replace
    // another game's list. Keep an empty list as a tombstone: deleting the key
    // would make the old shared-map filters reappear on the next load.
    function save() {
        var snapshot = filters.map(function (f) {
            return { kind: f.kind, value: f.value, label: f.label, state: f.state };
        });
        var update = {};
        update[storageKey] = snapshot;
        chrome.storage.local.set(update);
        if (collectionPage) { renderRows(); applyAuthorFilters(); }
    }

    function setFilter(kind, value, label, state) {
        var existing = findFilter(kind, value);
        if (existing) existing.state = state;
        else filters.push({ kind: kind, value: value, label: label, state: state });
        save();
    }

    function toggleState(filter, state) {
        filter.state = filter.state === state ? 0 : state;
        save();
    }

    function removeFilter(filter) {
        var index = filters.indexOf(filter);
        if (index !== -1) filters.splice(index, 1);
        save();
    }

    function applyStored(list) {
        if (!Array.isArray(list)) list = [];
        filters = list.filter(function (f) {
            return f && (f.kind === 'keyword' || f.kind === 'author') && typeof f.value === 'string';
        }).map(function (f) {
            return { kind: f.kind, value: f.value, label: f.label || f.value, state: f.state === 1 || f.state === -1 ? f.state : 0 };
        });
        return publishTerms();
    }

    chrome.storage.local.get([storageKey, LEGACY_STORAGE_KEY, descriptionKey], function (data) {
        // Read old installs without rewriting the shared map. The first edit
        // writes this game's list to its independent key.
        var list = data && data[storageKey];
        if (list === undefined) list = data && data[LEGACY_STORAGE_KEY] && data[LEGACY_STORAGE_KEY][appId];
        includeDescriptions = data && data[descriptionKey] === true;
        applyStored(list);
        loaded = true;
        ensureAuthorAliases();
        scheduleTick();
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || (!changes[storageKey] && !changes[descriptionKey])) return;
        var descriptionChanged = !!changes[descriptionKey] && includeDescriptions !== (changes[descriptionKey].newValue === true);
        if (changes[descriptionKey]) includeDescriptions = changes[descriptionKey].newValue === true;
        var termsChanged = changes[storageKey] ? applyStored(changes[storageKey].newValue) : publishTerms();
        ensureAuthorAliases();
        renderRows();
        renderPicker();
        applyAuthorFilters();
        if (termsChanged) {
            if (section && section.isConnected && isSettled()) refetchResults(descriptionChanged);
        }
        scheduleTick();
    });

    // ---------------------------------------------------------------------
    // Refetching Steam's results
    // ---------------------------------------------------------------------

    function getSearchInput() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return null;
        var inputs = root.querySelectorAll('form input');
        for (var i = 0; i < inputs.length; i++) {
            var type = (inputs[i].getAttribute('type') || 'text').toLowerCase();
            if ((type === 'text' || type === 'search') && !inputs[i].closest('.wshs-saved-filters')) return inputs[i];
        }
        return null;
    }

    // Steam only re-runs its Browse request for a search text it has not
    // submitted before: an empty submit is ignored and a repeated one is
    // answered from its client cache. So the box's text is resubmitted with a
    // whitespace suffix derived from the active terms: a new filter set gets
    // a new suffix (a fresh request), and a repeat reuses results for the
    // same filter set. The hook trims it away before the server sees it, and
    // the address bar is not given a searchtext for it.
    var termKeys = new Map([['', ' ']]);
    var nextTermKey = 1;
    function whitespaceKey(terms, fresh) {
        if (fresh || !termKeys.has(terms)) {
            // Allocate a unique suffix within this page's client cache.
            // Truncated hashes collide (e.g. -"armor" and "mechs").
            var bits = (nextTermKey++).toString(2);
            termKeys.set(terms, ' ' + bits.replace(/0/g, ' ').replace(/1/g, '\t'));
        }
        return termKeys.get(terms);
    }

    var submitTimer = null;
    function refetchResults(fresh) {
        var input = getSearchInput();
        if (!input || !input.form || typeof input.form.requestSubmit !== 'function') return false;
        var next = input.value.replace(/\s+$/, '') + whitespaceKey(publishedTerms + '|descriptions:' + includeDescriptions, fresh);
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Let React commit the controlled input before its submit handler
        // reads it. In Firefox an initial submit from the animation-frame
        // callback otherwise sees the old empty value and ignores the query.
        clearTimeout(submitTimer);
        submitTimer = setTimeout(function () {
            submitTimer = null;
            var current = getSearchInput();
            if (current && current.form) current.form.requestSubmit();
        }, 0);
        return true;
    }

    function refetchInitialResults() {
        if (!publishedTerms || (document.documentElement.getAttribute(REQUESTED_TERMS_ATTR) === publishedTerms &&
            document.documentElement.getAttribute('data-wshs-requested-description-search') === (includeDescriptions ? '1' : '0'))) {
            initialRefetchDone = true;
            return;
        }
        if (initialRefetchTimer !== null) return;
        // Steam can still replace the controlled input after reporting its
        // root hydrated. Confirm the MAIN-world hook actually saw our query;
        // a submit call alone is not proof. Retry with a fresh cache suffix
        // so an ignored first submit cannot leave an unfiltered cache entry.
        if (initialRefetchAttempts >= 6) {
            initialRefetchDone = true;
            console.warn('[WSHS] Saved keyword filters could not refresh Steam results.');
            return;
        }
        refetchResults(true);
        var delay = Math.min(1500, 250 * Math.pow(2, initialRefetchAttempts++));
        initialRefetchTimer = setTimeout(function () {
            initialRefetchTimer = null;
            scheduleTick();
        }, delay);
    }

    // A whitespace-only resubmit makes Steam show a `Results for: " "` chip;
    // it is hidden while its quoted text is blank and restored otherwise.
    function syncWhitespaceChip() {
        if (hiddenChip) {
            if (hiddenChip.isConnected && /"\s*"$/.test(hiddenChip.textContent.trim())) return;
            hiddenChip.style.display = '';
            hiddenChip = null;
        }
        var input = getSearchInput();
        if (!input || input.value === '' || input.value.trim() !== '') return;
        var root = document.getElementById('CommunityTemplate');
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.indexOf('"') === -1) continue;
            var el = node.parentElement;
            var text = el.textContent.trim();
            if (text.length > 60 || !/"\s*"$/.test(text) || el.closest('.wshs-saved-filters')) continue;
            while (el.parentElement && el.parentElement !== root && el.parentElement.textContent.trim() === text) {
                el = el.parentElement;
            }
            el.style.display = 'none';
            hiddenChip = el;
            return;
        }
    }

    // ---------------------------------------------------------------------
    // Author filters (on the page)
    // ---------------------------------------------------------------------

    function authorKey(link) {
        var match = /\/(id|profiles)\/([^/?#]+)/.exec(link.getAttribute('href') || '');
        return match ? (match[1] + '/' + match[2]).toLowerCase() : null;
    }

    function authorName(link) {
        return (link.textContent || '').trim().replace(/^By\s+/i, '');
    }

    function authorValues(value) {
        var alias = authorAliases.get(value.toLowerCase());
        return alias && alias.keys || [value.toLowerCase()];
    }

    function ensureAuthorAliases() {
        var needsAliases = collectionPage || filters.some(function (f) { return f.kind === 'author' && f.state && f.value.indexOf('id/') === 0; });
        if (!needsAliases) return;
        filters.filter(function (f) { return f.kind === 'author' && f.state; }).forEach(function (filter) {
            var value = filter.value.toLowerCase();
            if (authorAliases.has(value)) return;
            if (!/^(id|profiles)\/[^/?#]+$/.test(value)) return;
            var state = { keys: [value], pending: true, failed: false };
            authorAliases.set(value, state);
            (async function () {
                var key = 'savedFilterAuthorAlias:' + value;
                var cached = (await chrome.storage.local.get(key))[key];
                if (cached && /^\d{17}$/.test(cached.steamId) && typeof cached.vanity === 'string') return cached;
                var response = await fetch('/' + value + '/?xml=1', { signal: AbortSignal.timeout(12000) });
                if (!response.ok) throw Error('Creator profile unavailable');
                var doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
                var id = doc.querySelector('steamID64');
                var vanity = doc.querySelector('customURL');
                if (!id || !/^\d{17}$/.test(id.textContent.trim())) throw Error('Creator identity unavailable');
                var result = { steamId: id.textContent.trim(), vanity: vanity ? vanity.textContent.trim().toLowerCase() : '' };
                var update = {}; update[key] = result; await chrome.storage.local.set(update);
                return result;
            })().then(function (result) {
                state.keys.push('profiles/' + result.steamId);
                if (result.vanity) state.keys.push('id/' + result.vanity);
            }).catch(function () { state.failed = true; }).finally(function () {
                state.pending = false;
                applyAuthorFilters();
            });
        });
    }

    function itemId(link) {
        var match = /[?&]id=(\d+)/.exec(link.getAttribute('href') || '');
        return match ? match[1] : null;
    }

    function applyAuthorFilters() {
        if (collectionPage) { applyCollectionFilters(); return; }
        if (!window.WSHSDom || !window.WSHSDom.enumerateCards) return;
        var hidden = new Set();
        var only = new Set();
        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            if (f.kind !== 'author' || !f.state) continue;
            authorValues(f.value).forEach(function (value) { (f.state < 0 ? hidden : only).add(value); });
        }
        if (!hidden.size && !only.size) {
            var stale = document.querySelectorAll('.wshs-filtered');
            for (var s = 0; s < stale.length; s++) stale[s].classList.remove('wshs-filtered');
            return;
        }
        var cards = window.WSHSDom.enumerateCards();
        for (var c = 0; c < cards.length; c++) {
            var link = cards[c].root.querySelector(AUTHOR_LINK);
            var key = link && authorKey(link);
            var item = cards[c].root.querySelector(ITEM_LINK);
            var known = item && knownCreators.get(itemId(item));
            var keys = known ? new Set(known.keys) : new Set();
            if (key) keys.add(key);
            var isHidden = false, isIncluded = false;
            keys.forEach(function (value) {
                if (hidden.has(value)) isHidden = true;
                if (only.has(value)) isIncluded = true;
            });
            var hide = keys.size > 0 && (isHidden || (only.size > 0 && !isIncluded));
            cards[c].root.classList.toggle('wshs-filtered', hide);
        }
    }

    function collectionRows() {
        return Array.prototype.slice.call(document.querySelectorAll('.collectionItem'));
    }

    function collectionMatch(row, keywords, authors) {
        if (!keywords.length && !authors.length) return true;
        if (authors.length) {
            var keys = Array.prototype.map.call(row.querySelectorAll('.workshopItemAuthor ' + AUTHOR_LINK), authorKey);
            function matchesAuthor(f) { return f.keys.some(function (value) { return keys.indexOf(value) !== -1; }); }
            var includes = authors.filter(function (f) { return f.state === 1; });
            if (includes.length && !includes.some(matchesAuthor)) return false;
            if (authors.some(function (f) { return f.state < 0 && matchesAuthor(f); })) return false;
        }
        if (!keywords.length) return true;
        var title = row.querySelector('.workshopItemTitle');
        var link = row.querySelector('.collectionItemDetails > a');
        var description = includeDescriptions && link ? window.WSHSDescriptions.get(itemId(link)) : '';
        var text = ((title ? title.textContent : '') + '\n' + (description || '')).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
        return keywords.every(function (f) {
            var match = text.indexOf(f.value) !== -1;
            // Unknown descriptions keep potential matches visible until verified.
            return f.state > 0 ? match || description === null : !match;
        });
    }

    function applyCollectionFilters() {
        ensureAuthorAliases();
        var rows = collectionRows(), keywords = [], authors = [];
        filters.forEach(function (f) {
            if (!f.state) return;
            if (f.kind === 'keyword') keywords.push({ state: f.state, value: f.value.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() });
            else authors.push({ state: f.state, keys: authorValues(f.value) });
        });
        var searchDescriptions = includeDescriptions && keywords.length > 0;
        var unknownDescriptions = [];
        if (searchDescriptions) {
            rows.forEach(function (row) {
                var link = row.querySelector('.collectionItemDetails > a'), id = link && itemId(link);
                if (id && window.WSHSDescriptions.get(id) === null) unknownDescriptions.push(id);
            });
            if (unknownDescriptions.length) window.WSHSDescriptions.request(unknownDescriptions);
        }
        var status = section && section.querySelector('.wshs-description-status');
        var retry = section && section.querySelector('.wshs-description-retry');
        var loading = unknownDescriptions.some(window.WSHSDescriptions.pending);
        if (status) {
            var message = unknownDescriptions.length ? loading ? 'Loading full descriptions… Results will update.' : unknownDescriptions.length + ' descriptions unavailable. Retry before subscribing.' : '';
            if (status.textContent !== message) status.textContent = message;
            status.hidden = !message;
        }
        if (retry) retry.hidden = !unknownDescriptions.length || loading;
        var allowed = [], excluded = [];
        rows.forEach(function (row) {
            var link = row.querySelector('.collectionItemDetails > a');
            var id = link && itemId(link);
            var matches = collectionMatch(row, keywords, authors);
            row.classList.toggle('wshs-filtered', !matches);
            if (id) (matches ? allowed : excluded).push(id);
        });
        var button = document.querySelector('.subscribeCollection [onclick*="SubscribeCollection("]');
        if (button && loaded) {
            if (unknownDescriptions.length) {
                button.removeAttribute('data-wshs-subscription-plan');
                button.setAttribute('data-wshs-subscription-error', 'Full descriptions are still loading or unavailable. Retry or turn off description search before subscribing.');
                return;
            }
            var uncertain = filters.some(function (f) {
                var alias = f.kind === 'author' && f.state && authorAliases.get(f.value.toLowerCase());
                return alias && (alias.pending || alias.failed);
            });
            if (uncertain) {
                button.removeAttribute('data-wshs-subscription-plan');
                button.setAttribute('data-wshs-subscription-error', 'Creator identities are still loading or could not be verified. Reload to retry before subscribing.');
                return;
            }
            button.removeAttribute('data-wshs-subscription-error');
            var plan = JSON.stringify({ appId: appId, collectionId: new URLSearchParams(location.search).get('id'), allowed: allowed, excluded: excluded });
            if (button.getAttribute('data-wshs-subscription-plan') !== plan) button.setAttribute('data-wshs-subscription-plan', plan);
        }
    }

    // ---------------------------------------------------------------------
    // Shared +/- and check icons (Steam's own 14x14 button artwork)
    // ---------------------------------------------------------------------

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function svgEl(tag, attrs) {
        var el = document.createElementNS(SVG_NS, tag);
        for (var key in attrs) el.setAttribute(key, attrs[key]);
        return el;
    }

    function squareIcon(kind) {
        var svg = svgEl('svg', { viewBox: '0 0 14 14', fill: 'none' });
        svg.appendChild(svgEl('rect', {
            x: '0.5', y: '0.5', width: '13', height: '13', rx: '1.5',
            stroke: 'var(--button-stroke, #444E57)', fill: 'var(--button-fill, currentColor)'
        }));
        if (kind === 'plus') {
            svg.appendChild(svgEl('rect', { x: '6.5', y: '4', width: '1', height: '6', fill: 'var(--button-symbol, #D9D9D9)' }));
        }
        if (kind === 'plus' || kind === 'minus') {
            svg.appendChild(svgEl('rect', { x: '4', y: '7.5', width: '1', height: '6', transform: 'rotate(-90 4 7.5)', fill: 'var(--button-symbol, #D9D9D9)' }));
        }
        if (kind === 'check') {
            svg.appendChild(svgEl('path', {
                d: 'M3.5 7.2l2.3 2.3 4.7-4.9', stroke: 'var(--button-symbol, #000)', 'stroke-width': '1.6',
                'stroke-linecap': 'round', 'stroke-linejoin': 'round'
            }));
        }
        return svg;
    }

    function paintActive(button, state) {
        var colors = ACTIVE[String(state)];
        if (!colors) {
            button.style.removeProperty('--button-fill');
            button.style.removeProperty('--button-stroke');
            button.style.removeProperty('--button-symbol');
            return;
        }
        button.style.setProperty('--button-fill', colors.fill);
        button.style.setProperty('--button-stroke', colors.fill);
        button.style.setProperty('--button-symbol', colors.symbol);
    }

    // ---------------------------------------------------------------------
    // Sidebar section
    // ---------------------------------------------------------------------

    function isNativeFilterRow(el) {
        var kids = el.children;
        return kids.length >= 3 &&
            kids[0].matches('[role="button"]') && kids[0].querySelector('svg[viewBox="0 0 14 14"]') &&
            kids[1].matches('[role="button"]') && kids[1].querySelector('svg[viewBox="0 0 14 14"]');
    }

    // The first native +/- row (Categories), its section and heading, and the
    // classes every row's buttons share (so an active native row cannot leak
    // its hashed active class into our clones).
    function findCategoryAnchor() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return null;
        var svgs = root.querySelectorAll('[role="button"] > svg[viewBox="0 0 14 14"]');
        var rows = [];
        for (var i = 0; i < svgs.length; i++) {
            var row = svgs[i].parentElement.parentElement;
            if (row && rows.indexOf(row) === -1 && isNativeFilterRow(row) && !row.closest('.wshs-saved-filters')) rows.push(row);
        }
        if (!rows.length) return null;
        var first = rows[0];
        var node = first;
        while (node.parentElement && node.parentElement !== root) {
            var parent = node.parentElement;
            var head = parent.firstElementChild;
            if (head !== node && !head.querySelector('[role="button"]') && !head.matches('[role="button"]') && head.textContent.trim()) {
                return {
                    section: parent,
                    heading: head,
                    row: first,
                    plusClass: sharedClasses(rows, 0),
                    minusClass: sharedClasses(rows, 1)
                };
            }
            node = parent;
        }
        return null;
    }

    function sharedClasses(rows, index) {
        var shared = null;
        for (var i = 0; i < rows.length; i++) {
            var list = Array.prototype.slice.call(rows[i].children[index].classList);
            shared = shared === null ? list : shared.filter(function (c) { return list.indexOf(c) !== -1; });
        }
        return (shared || []).join(' ');
    }

    var anchor = null;

    function ensureSection() {
        if (section && section.isConnected) return;
        if (collectionPage) {
            section = document.createElement('section');
            section.className = 'wshs-saved-filters wshs-collection-filters';
            var head = document.createElement('div');
            head.className = 'wshs-sf-heading';
            head.textContent = 'Saved Filters';
            var rows = document.createElement('div');
            rows.className = 'wshs-sf-list';
            section.appendChild(head);
            section.appendChild(buildAddRow());
            section.appendChild(buildDescriptionToggle());
            section.appendChild(rows);
            document.querySelector('.subscribeCollection').insertAdjacentElement('afterend', section);
            renderRows();
            return;
        }
        anchor = findCategoryAnchor();
        if (!anchor) return;
        section = anchor.section.cloneNode(false);
        section.removeAttribute('id');
        section.classList.add('wshs-saved-filters');
        var heading = anchor.heading.cloneNode(true);
        heading.textContent = 'Saved Filters';
        var list = document.createElement('div');
        list.className = 'wshs-sf-list';
        section.appendChild(heading);
        section.appendChild(list);
        section.appendChild(buildAddRow());
        section.appendChild(buildDescriptionToggle());
        anchor.section.parentElement.insertBefore(section, anchor.section);
        renderRows();
    }

    function buildRow(filter) {
        var row;
        if (collectionPage) {
            row = document.createElement('div');
            row.className = 'wshs-sf-chip';
            row.appendChild(pickerButton('plus', 'only', 0));
            row.appendChild(pickerButton('minus', 'hide', 0));
            row.appendChild(document.createElement('span'));
        } else row = anchor.row.cloneNode(true);
        while (row.children.length > 3) row.removeChild(row.lastElementChild);
        var plus = row.children[0];
        var minus = row.children[1];
        var label = row.children[2];
        if (!collectionPage) {
            plus.className = anchor.plusClass;
            minus.className = anchor.minusClass;
        }
        paintActive(plus, filter.state === 1 ? 1 : 0);
        paintActive(minus, filter.state === -1 ? -1 : 0);
        var scope = includeDescriptions ? 'title or description' : 'title';
        plus.title = filter.kind === 'author' ? 'Only show mods by this author' : 'Only show mods with this phrase in the ' + scope;
        minus.title = filter.kind === 'author' ? 'Hide mods by this author' : 'Hide mods with this phrase in the ' + scope;
        label.textContent = filter.kind === 'author' ? 'By ' + filter.label : filter.label;
        label.classList.add('wshs-sf-label');
        label.removeAttribute('tabindex');
        label.removeAttribute('role');

        var remove = document.createElement('span');
        remove.className = 'wshs-sf-delete';
        remove.textContent = '×';
        remove.title = 'Delete this filter';
        remove.setAttribute('role', 'button');
        remove.tabIndex = 0;
        remove.setAttribute('aria-label', 'Delete ' + filter.label + ' filter');
        remove.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeFilter(filter); } });
        row.appendChild(remove);

        plus.addEventListener('click', function (e) { e.stopPropagation(); toggleState(filter, 1); });
        minus.addEventListener('click', function (e) { e.stopPropagation(); toggleState(filter, -1); });
        remove.addEventListener('click', function (e) { e.stopPropagation(); removeFilter(filter); });
        return row;
    }

    function renderRows() {
        if (!section || (!collectionPage && !anchor)) return;
        var toggle = section.querySelector('.wshs-description-toggle');
        if (toggle) toggle.checked = includeDescriptions;
        var list = section.querySelector('.wshs-sf-list');
        while (list.firstChild) list.removeChild(list.firstChild);
        for (var i = 0; i < filters.length; i++) list.appendChild(buildRow(filters[i]));
    }

    function buildDescriptionToggle() {
        var container = document.createElement('div');
        var label = document.createElement('label');
        label.className = 'wshs-description-option';
        var input = document.createElement('input');
        input.type = 'checkbox'; input.className = 'wshs-description-toggle'; input.checked = includeDescriptions;
        var text = document.createElement('span'); text.textContent = 'Include descriptions in search';
        label.append(input, text);
        label.title = 'Apply saved + and − phrases to titles and descriptions. Creator filters still match creator names.';
        input.addEventListener('change', function () {
            var update = {}; update[descriptionKey] = input.checked; chrome.storage.local.set(update);
        });
        container.appendChild(label);
        if (collectionPage) {
            var status = document.createElement('div'); status.className = 'wshs-description-status'; status.setAttribute('role', 'status'); status.hidden = true;
            var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'wshs-description-retry'; retry.textContent = 'Retry descriptions'; retry.hidden = true;
            retry.addEventListener('click', function () {
                var ids = collectionRows().map(function (row) { var a = row.querySelector('.collectionItemDetails > a'); return a && itemId(a); }).filter(Boolean);
                window.WSHSDescriptions.request(ids, true); scheduleTick();
            });
            container.append(status, retry);
        }
        return container;
    }

    // Steam's search box background, so the phrase box reads as the same
    // kind of field. Falls back to the stylesheet's color.
    function searchBoxBackground() {
        var input = getSearchInput();
        var node = input;
        while (node && node !== document.body) {
            var bg = getComputedStyle(node).backgroundColor;
            if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
            node = node.parentElement;
        }
        return '';
    }

    function buildAddRow() {
        var row = document.createElement('div');
        row.className = 'wshs-sf-add';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'wshs-sf-input';
        input.placeholder = 'Add a phrase...';
        input.maxLength = MAX_PHRASE;
        var bg = searchBoxBackground();
        if (bg) input.style.backgroundColor = bg;

        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Save';
        button.classList.add('wshs-sf-save');

        var help = document.createElement('button');
        help.type = 'button';
        help.className = 'wshs-sf-help';
        help.textContent = '?';
        help.setAttribute('aria-label', 'How to use saved filters');
        help.setAttribute('aria-expanded', 'false');
        var panel = document.createElement('div');
        panel.id = 'wshs-sf-help-' + appId;
        panel.className = 'wshs-sf-help-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'note');
        help.setAttribute('aria-controls', panel.id);
        help.title = '+ shows only matches, − hides matches. Enable description search to check descriptions too. Click for help.';
        [
            'Phrases match mod titles only by default. Enable “Include descriptions in search” to check descriptions too. This applies to both + and −, and is shared with this game’s Workshop and collection pages.',
            '+ shows only matches. − hides matches. Click an active + or − again to turn that filter off. × deletes it.',
            'Hover an author for quick + / − filters. The confirmation stays on that mod for 2.5 seconds; click it to undo before the filter takes effect.',
            'The checkbox beside − lets you click title words. Hovered and chosen words are yellow and underlined. Plurals use their singular form, such as workbenches → workbench. Uncheck to restore normal links. Your filters are saved separately for each game.'
        ].forEach(function (text) {
            var paragraph = document.createElement('p');
            paragraph.textContent = text;
            panel.appendChild(paragraph);
        });
        function setHelpOpen(open) {
            panel.hidden = !open;
            help.setAttribute('aria-expanded', String(open));
        }
        help.addEventListener('click', function (e) {
            e.stopPropagation();
            setHelpOpen(panel.hidden);
        });
        row.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !panel.hidden) {
                e.stopPropagation();
                setHelpOpen(false);
            }
        });

        function submit() {
            var phrase = cleanPhrase(input.value);
            if (!phrase) return;
            setFilter('keyword', phrase, phrase, -1);
            input.value = '';
        }
        button.addEventListener('click', function (e) { e.stopPropagation(); submit(); });
        input.addEventListener('keydown', function (e) {
            // Steam's page-level keyboard navigation must not see our typing.
            e.stopPropagation();
            if (e.key === 'Escape') setHelpOpen(false);
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
        row.appendChild(input);
        row.appendChild(button);
        row.appendChild(help);
        var container = document.createElement('div');
        container.appendChild(row);
        container.appendChild(panel);
        return container;
    }

    function cleanPhrase(text) {
        return (text || '').replace(/"/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE);
    }

    function setTitleSelectionEnabled(enabled) {
        titleSelectionEnabled = enabled;
        document.documentElement.classList.toggle('wshs-title-selection', enabled);
        document.querySelectorAll('.wshs-picker-word-toggle').forEach(function (input) { input.setAttribute('aria-checked', String(enabled)); });
        prepareTitleLinks();
        if (!enabled) {
            hoverWordKey = null;
            highlightWord('wshs-hover-word', null);
            if (pendingAction && pendingAction.target.kind === 'keyword') {
                clearTimeout(pendingAction.timer);
                pendingAction = null;
            }
            if (pickerTarget && pickerTarget.kind === 'keyword') hidePicker();
        }
    }

    // Only the primary Quick View heading and its creator row are targets.
    // Dependency thumbnails and description links remain outside this scope.
    function quickViewInfo(el) {
        var dialog = el.closest('dialog[open]');
        if (!dialog) return null;
        var title = dialog.querySelector('h1 > ' + ITEM_LINK + ', h2 > ' + ITEM_LINK);
        if (!title) return null;
        var heading = title.parentElement.parentElement;
        var creators = heading.nextElementSibling;
        return { dialog: dialog, title: title, creators: creators, column: heading.parentElement };
    }

    function rememberQuickViewCreators(info) {
        var id = itemId(info.title);
        if (!id || !info.creators) return;
        var primary = null;
        if (window.WSHSDom) window.WSHSDom.enumerateCards().some(function (card) {
            var item = card.root.querySelector(ITEM_LINK);
            if (!item || itemId(item) !== id) return false;
            primary = card.root.querySelector(AUTHOR_LINK);
            return true;
        });
        var links = Array.prototype.slice.call(info.creators.querySelectorAll(AUTHOR_LINK));
        var primaryMatches = primary && links.filter(function (link) {
            return authorName(link) === authorName(primary);
        });
        var previous = knownCreators.get(id);
        var record = { keys: new Set(), aliases: new Map() };
        links.forEach(function (link) {
            // The same primary author may use /profiles/<id> on the card and
            // /id/<vanity> in Quick View. Reuse the card's key when the dialog
            // identifies that primary author unambiguously.
            var key = primaryMatches && primaryMatches.length === 1 && primaryMatches[0] === link
                ? authorKey(primary) : (previous && previous.aliases.get(link.getAttribute('href'))) || authorKey(link);
            if (!key) return;
            record.keys.add(key);
            record.aliases.set(link.getAttribute('href'), key);
        });
        knownCreators.set(id, record);
    }

    function ensureQuickViewTools() {
        document.querySelectorAll('dialog[open]').forEach(function (dialog) {
            var info = quickViewInfo(dialog);
            if (!info || !info.creators) return;
            info.title.classList.add('wshs-qv-title');
            var firstCreator = info.creators.querySelector(AUTHOR_LINK);
            var creatorRow = firstCreator && firstCreator.parentElement.parentElement.parentElement;
            if (creatorRow && info.creators.contains(creatorRow)) {
                creatorRow.classList.add('wshs-qv-creators');
                reserveCreatorWrapRoom(creatorRow);
            }
            rememberQuickViewCreators(info);
        });
    }

    function reserveCreatorWrapRoom(row) {
        var links = Array.prototype.slice.call(row.querySelectorAll(AUTHOR_LINK));
        var style = getComputedStyle(row);
        var signature = row.clientWidth + '|' + style.font + '|' + links.map(function (link) {
            return link.getAttribute('href') + ':' + link.textContent;
        }).join('|');
        if (creatorLayouts.get(row) === signature) return;
        var active = row.querySelector('.wshs-qv-author-active');
        if (active) active.classList.remove('wshs-qv-author-active');
        row.style.minHeight = '0px';
        var natural = row.getBoundingClientRect().height;
        var line = links[0] ? links[0].getBoundingClientRect().height : 0;
        var gap = parseFloat(style.rowGap) || 0;
        // Keep names compact at rest. One spare line absorbs the extra width
        // of the hovered author's controls without moving the content below.
        row.style.minHeight = (natural + (links.length > 1 ? line + gap : 0)) + 'px';
        if (active) active.classList.add('wshs-qv-author-active');
        creatorLayouts.set(row, signature);
    }

    // ---------------------------------------------------------------------
    // Card picker: [+][-] beside a hovered author or a pinned title word
    // ---------------------------------------------------------------------

    function cardOf(el) {
        if (collectionPage) return el.closest('.collectionItem');
        if (el.closest('dialog, [role="dialog"], [aria-modal="true"]')) return null;
        var node = el;
        for (var i = 0; i < 5 && node; i++) {
            node = node.parentElement;
            if (!node || node.id === 'CommunityTemplate') return null;
            if (node.querySelector(PREVIEW)) {
                var ids = new Set();
                var links = node.querySelectorAll(ITEM_LINK);
                for (var j = 0; j < links.length; j++) ids.add(links[j].href);
                return ids.size === 1 ? node : null;
            }
        }
        return null;
    }

    function ensurePicker(host) {
        if (picker && picker.isConnected) {
            if (picker.parentElement !== host) host.appendChild(picker);
            return picker;
        }
        picker = document.createElement('div');
        picker.className = 'wshs-picker';
        // Keep focus on the chosen title word while using its controls.
        picker.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        picker.addEventListener('click', onPickerClick);
        picker.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !pendingAction) {
                e.stopPropagation();
                hidePicker();
            }
        });
        host.appendChild(picker);
        return picker;
    }

    function pickerButton(kind, action, state) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'wshs-sq';
        button.dataset.action = action;
        button.title = action === 'only' ? 'Show only matches' : action === 'hide' ? 'Hide matches' : 'Undo filter';
        button.setAttribute('aria-label', button.title);
        button.appendChild(squareIcon(kind));
        if (state) paintActive(button, state);
        return button;
    }

    function renderPicker() {
        if (!picker || !pickerTarget || picker.style.display === 'none') return;
        var current = findFilter(pickerTarget.kind, pickerTarget.value);
        var state = current ? current.state : 0;
        while (picker.firstChild) picker.removeChild(picker.firstChild);
        var hint = document.createElement('span');
        hint.className = 'wshs-picker-hint';
        picker.classList.toggle('wshs-picker-confirmation', !!pendingAction);
        if (pendingAction) {
            picker.appendChild(pickerButton('check', 'undo', pendingAction.state));
            hint.textContent = pendingAction.state < 0 ? 'Hiding… click to undo' : 'Showing only… click to undo';
            hint.dataset.action = 'undo';
        } else {
            picker.appendChild(pickerButton('plus', 'only', state === 1 ? 1 : 0));
            picker.appendChild(pickerButton('minus', 'hide', state === -1 ? -1 : 0));
        }
        if (pendingAction) picker.appendChild(hint);
        else {
            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'wshs-picker-word-toggle';
            toggle.setAttribute('role', 'checkbox');
            toggle.setAttribute('aria-checked', String(titleSelectionEnabled));
            toggle.dataset.action = 'words';
            toggle.title = 'Enable clickable title words';
            toggle.setAttribute('aria-label', 'Enable clickable title words');
            toggle.appendChild(squareIcon(titleSelectionEnabled ? 'check' : 'empty'));
            picker.appendChild(toggle);
            var help = document.createElement('button');
            help.type = 'button';
            help.className = 'wshs-picker-help';
            help.dataset.action = 'help';
            var question = svgEl('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' });
            question.appendChild(svgEl('path', { d: 'M4.5 4.5a2.5 2.5 0 0 1 5 0C9.5 6.3 7 6.3 7 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round' }));
            question.appendChild(svgEl('circle', { cx: '7', cy: '10.5', r: '.8', fill: 'currentColor' }));
            help.appendChild(question);
            help.title = '+ shows only matches. − hides matches. Click for help.';
            help.setAttribute('aria-label', 'Explain card filters');
            help.setAttribute('aria-expanded', String(pickerHelpOpen));
            picker.appendChild(help);
            if (pickerHelpOpen) {
                var guide = document.createElement('span');
                guide.className = 'wshs-picker-guide';
                guide.setAttribute('role', 'note');
                guide.textContent = '+ Shows only matches\n− Hides matches\n☑ Enables clickable title words\n' + (collectionPage ? 'Saved filters are shared with Workshop' : 'The saved filter appears in sidebar');
                picker.appendChild(guide);
            }
        }
    }

    function onPickerClick(e) {
        e.preventDefault();
        e.stopPropagation();
        var button = e.target.closest('[data-action]');
        if (!button || !pickerTarget) return;
        var t = pickerTarget;
        var action = button.dataset.action;
        if (action === 'words') {
            setTitleSelectionEnabled(!titleSelectionEnabled);
            renderPicker();
            positionPicker();
            return;
        }
        if (action === 'help') {
            pickerHelpOpen = !pickerHelpOpen;
            renderPicker();
            positionPicker();
            return;
        }
        if (action === 'undo') {
            if (pendingAction) {
                clearTimeout(pendingAction.timer);
                pendingAction = null;
                if (t.pinned && titleSelectionEnabled) showPicker(t);
                else hidePicker();
                return;
            }
            var existing = findFilter(t.kind, t.value);
            if (existing) {
                existing.state = 0;
                save();
            }
        } else {
            var chosenState = action === 'hide' ? -1 : 1;
            var active = findFilter(t.kind, t.value);
            if (active && active.state === chosenState) {
                active.state = 0;
                save();
                renderPicker();
                return;
            }
            // Keep the original card in place until its confirmation expires.
            // Saving now would hide/reuse that React card and put the message
            // on whichever mod fills its slot.
            if (pendingAction) return;
            clearTimeout(pickerHideTimer);
            pickerClosing = true;
            pendingAction = { target: t, state: chosenState };
            pickerHelpOpen = false;
            pendingAction.timer = setTimeout(function () {
                var pending = pendingAction;
                pendingAction = null;
                var keepWord = pending.target.pinned && titleSelectionEnabled && pending.target.anchor.isConnected;
                if (!keepWord) hidePicker();
                else pickerClosing = false;
                setFilter(pending.target.kind, pending.target.value, pending.target.label, pending.state);
                if (keepWord) { renderPicker(); positionPicker(); }
            }, PICKER_CONFIRM_MS);
        }
        renderPicker();
        positionPicker();
    }

    // Reserve space before Quick View for author controls. Title controls sit
    // over the preview's bottom edge, clear of the rating and selected title.
    function positionPicker() {
        if (!pickerTarget || !picker || picker.style.display === 'none') return;
        var target = pickerTarget;
        if (!target.anchor.isConnected || target.anchor.getAttribute('href') !== target.href ||
            target.anchor.textContent !== target.text) {
            hidePicker();
            return;
        }
        if (target.quickView) {
            positionQuickViewPicker(target);
            return;
        }
        if (collectionPage) { positionCollectionPicker(target); return; }
        var card = target.card;
        if (!card || !card.isConnected || !card.contains(target.anchor)) card = target.card = cardOf(target.anchor);
        if (!card) { hidePicker(); return; }
        var author = target.kind === 'author';
        var row = author && target.anchor.parentElement;
        if (pickerAuthorRow && (pickerAuthorRow !== row || pendingAction)) {
            pickerAuthorRow.classList.remove('wshs-picker-author-active');
            pickerAuthorRow = null;
        }
        picker.classList.toggle('wshs-picker-title', !author && !pendingAction);
        if (row && !pendingAction) {
            var width = picker.getBoundingClientRect().width + 'px';
            if (row.style.getPropertyValue('--wshs-picker-width') !== width) row.style.setProperty('--wshs-picker-width', width);
            if (!row.classList.contains('wshs-picker-author-active')) row.classList.add('wshs-picker-author-active');
            pickerAuthorRow = row;
        }
        var rect = target.range ? target.range.getBoundingClientRect() : target.anchor.getBoundingClientRect();
        if (!rect.width && !rect.height) {
            hidePicker();
            return;
        }
        var box = picker.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();
        var previewRect = card.querySelector(PREVIEW).getBoundingClientRect();
        var left = author ? rect.right + 8 : Math.max(cardRect.left + 8, Math.min(rect.left + rect.width / 2 - box.width / 2, cardRect.right - box.width - 8));
        var top = author ? rect.top + (rect.height - box.height) / 2 : previewRect.bottom - box.height - 6;
        left += window.scrollX;
        top += window.scrollY;
        if (pendingAction) {
            setPickerProperty(picker, 'max-width', Math.max(0, Math.min(cardRect.width - 16, window.innerWidth - 16)) + 'px');
            box = picker.getBoundingClientRect();
            left = Math.max(8, Math.min(cardRect.right - box.width - 8, window.innerWidth - box.width - 8)) + window.scrollX;
            top = cardRect.bottom - box.height - 6 + window.scrollY;
        } else {
            if (picker.style.maxWidth) picker.style.removeProperty('max-width');
        }
        var x = left + 'px';
        var y = top + 'px';
        if (picker.style.left !== x) picker.style.left = x;
        if (picker.style.top !== y) picker.style.top = y;
        var guide = picker.querySelector('.wshs-picker-guide');
        if (guide) {
            var guideWidth = Math.min(240, cardRect.width - 16, window.innerWidth - 16);
            setPickerProperty(guide, 'width', guideWidth + 'px');
            setPickerProperty(guide, 'left', (cardRect.left + (cardRect.width - guideWidth) / 2 + window.scrollX - left) + 'px');
            setPickerProperty(guide, 'top', (Math.min(previewRect.bottom - 6, author ? previewRect.bottom : top - window.scrollY - 8) - guide.getBoundingClientRect().height + window.scrollY - top) + 'px');
        }
    }

    function releasePickerRow() {
        if (pickerAuthorRow) pickerAuthorRow.classList.remove('wshs-picker-author-active', 'wshs-qv-author-active', 'wshs-collection-author-active');
        pickerAuthorRow = null;
    }

    function positionCollectionPicker(target) {
        var row = target.anchor.closest('.collectionItem');
        if (!row || row.matches('.wshs-filtered, .hidden-item, .wshs-ratings-filtered')) { hidePicker(); return; }
        if (!picker.classList.contains('wshs-collection-picker')) picker.classList.add('wshs-collection-picker');
        setPickerProperty(picker, '--wshs-inline-size', Math.min(14, parseFloat(getComputedStyle(target.anchor).fontSize)) + 'px');
        var authorRow = target.kind === 'author' && !pendingAction && target.anchor.parentElement;
        if (pickerAuthorRow && pickerAuthorRow !== authorRow) releasePickerRow();
        if (authorRow) {
            setPickerProperty(authorRow, '--wshs-picker-width', picker.getBoundingClientRect().width + 'px');
            if (!authorRow.classList.contains('wshs-collection-author-active')) authorRow.classList.add('wshs-collection-author-active');
            pickerAuthorRow = authorRow;
        }
        picker.classList.toggle('wshs-picker-title', target.kind === 'keyword' && !pendingAction);
        var rect = target.range ? target.range.getBoundingClientRect() : target.anchor.getBoundingClientRect();
        var bounds = row.getBoundingClientRect();
        setPickerProperty(picker, 'max-width', Math.max(0, bounds.width - 16) + 'px');
        var box = picker.getBoundingClientRect();
        var left = target.kind === 'author' ? rect.right + 4 : rect.left + (rect.width - box.width) / 2;
        var top = target.kind === 'author' ? rect.top + (rect.height - box.height) / 2 : rect.top - box.height - 4;
        if (pendingAction) { left = bounds.right - box.width - 8; top = bounds.bottom - box.height - 5; }
        left = Math.max(bounds.left + 4, Math.min(left, bounds.right - box.width - 4));
        setPickerProperty(picker, 'left', (left + scrollX) + 'px');
        setPickerProperty(picker, 'top', (top + scrollY) + 'px');
        var guide = picker.querySelector('.wshs-picker-guide');
        if (guide) {
            setPickerProperty(guide, 'width', Math.min(240, bounds.width - 16) + 'px');
            setPickerProperty(guide, 'left', Math.max(bounds.left + 8 - left, Math.min(-80, bounds.right - 248 - left)) + 'px');
            setPickerProperty(guide, 'top', (box.height + 6) + 'px');
        }
    }

    function positionQuickViewPicker(target) {
        var info = target.quickView;
        if (!info.dialog.open || !info.title.isConnected || info.title.getAttribute('href') !== target.itemHref) {
            hidePicker();
            return;
        }
        var author = target.kind === 'author';
        var row = author && !pendingAction && target.anchor.parentElement;
        if (pickerAuthorRow && pickerAuthorRow !== row) releasePickerRow();
        picker.classList.toggle('wshs-picker-title', !author && !pendingAction);
        var bounds = info.column.getBoundingClientRect();
        setPickerProperty(picker, 'max-width', Math.max(0, Math.min(240, bounds.width - 16)) + 'px');
        if (row) {
            setPickerProperty(row, '--wshs-picker-width', picker.getBoundingClientRect().width + 'px');
            if (!row.classList.contains('wshs-qv-author-active')) row.classList.add('wshs-qv-author-active');
            pickerAuthorRow = row;
        }
        var rect = target.range ? target.range.getBoundingClientRect() : target.anchor.getBoundingClientRect();
        if (!rect.width || !rect.height) { hidePicker(); return; }
        var box = picker.getBoundingClientRect();
        var left = author ? rect.right + 8 : rect.left + rect.width / 2 - box.width / 2;
        var top = author ? rect.top + (rect.height - box.height) / 2 : info.title.getBoundingClientRect().top - box.height - 6;
        left = Math.max(bounds.left + 8, Math.min(left, bounds.right - box.width - 8));
        if (pendingAction) {
            var image = info.dialog.querySelector('img');
            var imageRect = image && image.getBoundingClientRect();
            if (imageRect && imageRect.width) {
                left = imageRect.left + (imageRect.width - box.width) / 2;
                top = imageRect.bottom - box.height - 12;
            }
        }
        // A modal dialog is in the browser's top layer; its picker must be a
        // child of that dialog, using its local (possibly scrolled) coordinates.
        var container = info.dialog.getBoundingClientRect();
        var scaleX = container.width / info.dialog.offsetWidth || 1;
        var scaleY = container.height / info.dialog.offsetHeight || 1;
        setPickerProperty(picker, 'left', ((left - container.left) / scaleX - info.dialog.clientLeft + info.dialog.scrollLeft) + 'px');
        setPickerProperty(picker, 'top', ((top - container.top) / scaleY - info.dialog.clientTop + info.dialog.scrollTop) + 'px');
        var guide = picker.querySelector('.wshs-picker-guide');
        if (guide) {
            var width = Math.min(240, bounds.width - 16);
            setPickerProperty(guide, 'width', width + 'px');
            setPickerProperty(guide, 'left', ((bounds.left + (bounds.width - width) / 2 - left) / scaleX) + 'px');
            setPickerProperty(guide, 'top', (box.height + 8) + 'px');
        }
    }

    function trackPickerPosition() {
        pickerPositionFrame = null;
        positionPicker();
        if (collectionPage && pickerTarget && performance.now() >= collectionPositionUntil) {
            var row = pickerTarget.anchor.closest('.collectionItem');
            if (row && row.getAnimations().some(function (animation) { return animation.playState === 'running'; })) collectionPositionUntil = performance.now() + 400;
        }
        // Card hover transforms do not trigger ResizeObserver. Measure each
        // painted frame, including the leave transition during the hide delay.
        if (pickerTarget && picker && picker.style.display !== 'none' &&
            (!collectionPage || pickerTarget.quickView || performance.now() < collectionPositionUntil)) {
            pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
        }
    }

    function wakeCollectionPosition() {
        if (!collectionPage || !pickerTarget || !picker || picker.style.display === 'none') return;
        // Classic collection rows are stationary between interactions. Track
        // short hover/layout transitions, then sleep until something changes.
        collectionPositionUntil = performance.now() + 400;
        if (pickerPositionFrame === null) pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
    }

    function watchCollectionPosition() {
        if (!collectionPage || !pickerTarget) return;
        if (!collectionPositionResize) collectionPositionResize = new ResizeObserver(wakeCollectionPosition);
        collectionPositionResize.disconnect();
        [document.body, pickerTarget.anchor, picker].forEach(function (node) { collectionPositionResize.observe(node); });
        if (!collectionPositionMutation) collectionPositionMutation = new MutationObserver(wakeCollectionPosition);
        collectionPositionMutation.disconnect();
        var row = pickerTarget.anchor.closest('.collectionItem');
        if (row) collectionPositionMutation.observe(row, { attributes: true, attributeFilter: ['class', 'style'] });
        wakeCollectionPosition();
    }

    function setPickerProperty(element, property, value) {
        if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
    }

    function showPicker(target) {
        if (pendingAction) return;
        if (pickerTarget && pickerTarget.pinned && titleSelectionEnabled && target.kind === 'author') return;
        clearTimeout(pickerHideTimer);
        if (target.kind === 'author' && pickerTarget && pickerTarget.kind === 'author' &&
            pickerTarget.anchor === target.anchor && pickerTarget.value === target.value &&
            picker && picker.style.display !== 'none') {
            positionPicker();
            return;
        }
        pickerClosing = false;
        pickerHelpOpen = false;
        pickerTarget = target;
        if (picker) picker.dataset.word = target.pinned ? target.value : '';
        target.href = target.anchor.getAttribute('href');
        target.text = target.anchor.textContent;
        if (target.quickView) target.itemHref = target.quickView.title.getAttribute('href');
        var el = ensurePicker(target.quickView ? target.quickView.dialog : document.body);
        el.dataset.word = target.pinned ? target.value : '';
        el.style.display = 'flex';
        highlightWord('wshs-selected-word', target.pinned ? target.range : null);
        renderPicker();
        positionPicker();
        watchCollectionPosition();
        if (pickerTarget && pickerPositionFrame === null) {
            pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
        }
    }

    function hidePicker() {
        clearTimeout(pickerHideTimer);
        if (pickerPositionFrame !== null) cancelAnimationFrame(pickerPositionFrame);
        pickerPositionFrame = null;
        if (collectionPositionResize) collectionPositionResize.disconnect();
        if (collectionPositionMutation) collectionPositionMutation.disconnect();
        pickerClosing = false;
        pickerHelpOpen = false;
        releasePickerRow();
        pickerTarget = null;
        highlightWord('wshs-selected-word', null);
        if (hoverWordKey && (!hoverWordKey.link.isConnected || hoverWordKey.link.textContent !== hoverWordKey.text)) {
            hoverWordKey = null;
            highlightWord('wshs-hover-word', null);
        }
        if (picker) picker.style.display = 'none';
    }

    function scheduleHidePicker() {
        if (pickerClosing || (pickerTarget && pickerTarget.pinned)) return;
        clearTimeout(pickerHideTimer);
        pickerHideTimer = setTimeout(hidePicker, PICKER_HIDE_MS);
    }

    document.addEventListener('mouseover', function (e) {
        var target = e.target;
        if (!target || !target.closest) return;
        if (picker && picker.contains(target)) {
            if (!pickerClosing) clearTimeout(pickerHideTimer);
            return;
        }
        var link = target.closest(AUTHOR_LINK);
        var info = link && quickViewInfo(link);
        if (link && (cardOf(link) || (info && info.creators && info.creators.contains(link)))) {
            if (info) rememberQuickViewCreators(info);
            var known = info && knownCreators.get(itemId(info.title));
            var key = (known && known.aliases.get(link.getAttribute('href'))) || authorKey(link);
            if (key) {
                showPicker({ kind: 'author', value: key, label: authorName(link), anchor: link, quickView: info });
                return;
            }
        }
        if (pickerTarget && pickerTarget.kind === 'author') scheduleHidePicker();
    }, true);

    function titleLinkAt(el) {
        var link = el && el.closest && el.closest(ITEM_LINK);
        if (!link || link.querySelector('img')) return null;
        var info = quickViewInfo(link);
        if (!cardOf(link) && !(info && info.title === link)) return null;
        return link;
    }

    // Hit-test word ranges without inserting spans into React-owned titles.
    // Unicode segmentation also handles non-Latin names and apostrophes.
    function wordAt(link, x, y) {
        var nodes = [], offset = 0;
        var walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            var node = walker.currentNode;
            nodes.push({ node: node, start: offset, end: offset + node.length });
            offset += node.length;
        }
        var segments = new Intl.Segmenter(document.documentElement.lang || undefined, { granularity: 'word' }).segment(link.textContent);
        for (var segment of segments) {
            if (!segment.isWordLike) continue;
            var start = segment.index, end = start + segment.segment.length;
            var first = nodes.find(function (n) { return n.start <= start && n.end > start; });
            var last = nodes.find(function (n) { return n.start < end && n.end >= end; });
            if (!first || !last) continue;
            var range = document.createRange();
            range.setStart(first.node, start - first.start);
            range.setEnd(last.node, end - last.start);
            var rects = range.getClientRects();
            for (var r = 0; r < rects.length; r++) {
                var rect = rects[r];
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    var value = cleanPhrase(segment.segment);
                    if (window.WSHSWordForms) value = window.WSHSWordForms.normalize(value);
                    // Show the actual stem when it is a prefix (workbench/es).
                    // Irregular forms (mice/mouse) keep the visible source word.
                    if (value.length < segment.segment.length && segment.segment.toLowerCase().indexOf(value.toLowerCase()) === 0) {
                        var stemEnd = start + value.length;
                        var stemLast = nodes.find(function (n) { return n.start < stemEnd && n.end >= stemEnd; });
                        range.setEnd(stemLast.node, stemEnd - stemLast.start);
                    }
                    return { value: value, range: range, index: start };
                }
            }
        }
        return null;
    }

    document.addEventListener('mousemove', function (e) {
        if (!titleSelectionEnabled) return;
        var link = titleLinkAt(e.target);
        var word = link && wordAt(link, e.clientX, e.clientY);
        if (!word) {
            if (hoverWordKey) highlightWord('wshs-hover-word', null);
            hoverWordKey = null;
            return;
        }
        if (!hoverWordKey || hoverWordKey.link !== link || hoverWordKey.index !== word.index || hoverWordKey.text !== link.textContent) {
            hoverWordKey = { link: link, index: word.index, text: link.textContent };
            highlightWord('wshs-hover-word', word.range);
        }
    }, true);

    document.addEventListener('click', function (e) {
        if (!titleSelectionEnabled) return;
        var link = titleLinkAt(e.target);
        if (!link) {
            if (!insideModArea(e.target)) setTitleSelectionEnabled(false);
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        var word = wordAt(link, e.clientX, e.clientY);
        if (!word || !word.value) return;
        if (pendingAction && pendingAction.target.pinned) {
            clearTimeout(pendingAction.timer);
            pendingAction = null;
        }
        showPicker({ kind: 'keyword', value: word.value, label: word.value, anchor: link,
            range: word.range, quickView: quickViewInfo(link), pinned: true });
    }, true);

    function insideModArea(target) {
        if (!target || !target.closest) return false;
        if (picker && picker.contains(target)) return true;
        if (collectionPage) return !!target.closest('.collectionItem');
        var info = quickViewInfo(target);
        if (info) {
            var button = target.closest('button, [role="button"]');
            if (button && button.querySelector('.SVGIcon_X')) return false;
            // The dialog also contains a full-screen backdrop. Only the mod's
            // content panel counts as inside, including its preview and footer.
            var panel = info.column.parentElement.parentElement;
            return panel.contains(target);
        }
        return !!(window.WSHSDom && window.WSHSDom.enumerateCards().some(function (card) {
            return card.root.contains(target);
        }));
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && titleSelectionEnabled) setTitleSelectionEnabled(false);
        // Leave Escape available to Steam's native Quick View close handler.
    }, true);

    document.addEventListener('auxclick', function (e) {
        if (titleSelectionEnabled && titleLinkAt(e.target)) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // Suppress native link dragging only while click-to-filter is enabled.
    function prepareTitleLinks() {
        if (!titleSelectionEnabled) {
            titleDragAttributes.forEach(function (original, link) {
                if (original === null) link.removeAttribute('draggable');
                else link.setAttribute('draggable', original);
            });
            titleDragAttributes.clear();
            return;
        }
        var root = collectionPage ? document.querySelector('.collectionChildren') : document.getElementById('CommunityTemplate');
        if (collectionPage && !root) root = document.querySelector('.collectionItem') && document.querySelector('.collectionItem').parentElement;
        if (!root) return;
        var links = Array.prototype.slice.call(root.querySelectorAll(ITEM_LINK + ':not([draggable="false"])'));
        document.querySelectorAll('dialog[open] .wshs-qv-title:not([draggable="false"])').forEach(function (link) {
            if (links.indexOf(link) === -1) links.push(link);
        });
        for (var i = 0; i < links.length; i++) {
            if (!links[i].querySelector('img') && (!collectionPage || links[i].querySelector('.workshopItemTitle'))) {
                titleDragAttributes.set(links[i], links[i].getAttribute('draggable'));
                links[i].setAttribute('draggable', 'false');
            }
        }
    }

    function alignCardActions() {
        if (!window.WSHSDom || !window.WSHSDom.enumerateCards) return;
        window.WSHSDom.enumerateCards().forEach(function (card) {
            var author = card.root.querySelector(AUTHOR_LINK);
            var glass = card.root.querySelector('.SVGIcon_MagnifyingGlass');
            var quick = glass && glass.closest('[role="button"], button');
            if (!author || !quick) return;
            var row = author.parentElement;
            var meta = row.parentElement;
            var actions = quick.parentElement;
            if (actions.parentElement !== meta) return;
            row.classList.add('wshs-card-author');
            actions.classList.add('wshs-card-actions');
            var width = actions.getBoundingClientRect().width + 'px';
            if (row.style.getPropertyValue('--wshs-actions-width') !== width) row.style.setProperty('--wshs-actions-width', width);
            var bottom = meta.getBoundingClientRect().bottom - (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
            var center = bottom + 'px';
            if (actions.style.getPropertyValue('--wshs-author-center') !== center) actions.style.setProperty('--wshs-author-center', center);
        });
    }

    // ---------------------------------------------------------------------
    // Page sync
    // ---------------------------------------------------------------------

    function isSettled() {
        if (collectionPage) return true;
        var signal = document.documentElement.getAttribute('data-wshs-page-hydrated');
        if (signal === '1') return true;
        if (signal === '0') return false;
        // The sort row can hydrate before the sidebar. If Steam's full-page
        // signal is unavailable, wait for load plus a quiet DOM instead.
        return document.readyState === 'complete' && Date.now() - lastPageMutationAt >= 1500;
    }

    function tick() {
        tickFrame = null;
        if (!loaded || !window.WSHSDom || (!collectionPage && !window.WSHSDom.isNewLayout())) return;
        // The sidebar needs the full-page hydration gate, not only the sort
        // row's earlier readiness signal used by content.js.
        if (!isSettled()) {
            if (retryTimer === null) {
                retryTimer = setTimeout(function () { retryTimer = null; scheduleTick(); }, 300);
            }
            return;
        }
        var termsChanged = publishTerms();
        ensureSection();
        reverseVersionRows();
        if (collectionPage) { applyCollectionFilters(); prepareTitleLinks(); positionPicker(); return; }
        ensureQuickViewTools();
        alignCardActions();
        applyAuthorFilters();
        prepareTitleLinks();
        syncWhitespaceChip();
        if (termsChanged && initialRefetchDone && getSearchInput()) refetchResults(true);
        if (!initialRefetchDone && getSearchInput()) {
            // The first page is server-rendered without the keyword terms.
            refetchInitialResults();
        }
    }

    // Use flex order after hydration: retain React's nodes and click handlers.
    function reverseVersionRows() {
        if (collectionPage || !anchor || !anchor.section.isConnected) return;
        var seen = new Set();
        Array.prototype.forEach.call(anchor.section.querySelectorAll('div'), function (row) {
            if (!isNativeFilterRow(row)) return;
            var label = row.children[2].textContent.trim();
            if (!/^\d+\.\d+(?:\.\d+)*$/.test(label)) return;
            if (seen.has(row.parentElement)) return;
            seen.add(row.parentElement);
            var siblings = Array.prototype.filter.call(row.parentElement.children, isNativeFilterRow);
            var versions = siblings.filter(function (el) { return /^\d+\.\d+(?:\.\d+)*$/.test(el.children[2].textContent.trim()); });
            versions.sort(function (a, b) {
                var av = a.children[2].textContent.trim().split('.').map(Number), bv = b.children[2].textContent.trim().split('.').map(Number);
                for (var i = 0; i < Math.max(av.length, bv.length); i++) { var difference = (bv[i] || 0) - (av[i] || 0); if (difference) return difference; }
                return 0;
            });
            versions.forEach(function (el, index) {
                var order = String(index - versions.length);
                if (el.style.order !== order) el.style.order = order;
            });
        });
    }

    function scheduleTick() {
        if (tickFrame === null) tickFrame = requestAnimationFrame(tick);
    }

    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var target = mutations[i].target;
            var el = target.nodeType === 1 ? target : target.parentElement;
            if (el && el.closest('.wshs-saved-filters, .wshs-picker, .wshs-injected-controls, .wshs-collection-summary')) continue;
            if (mutations[i].addedNodes.length || mutations[i].removedNodes.length) {
                lastPageMutationAt = Date.now();
                scheduleTick();
                return;
            }
        }
    }).observe(document, { childList: true, subtree: true });

    new MutationObserver(scheduleTick).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-wshs-page-hydrated']
    });
    window.addEventListener('resize', scheduleTick);
    if (collectionPage) {
        document.addEventListener('scroll', wakeCollectionPosition, { passive: true, capture: true });
        document.addEventListener('mouseover', wakeCollectionPosition, { passive: true, capture: true });
        document.addEventListener('mouseout', wakeCollectionPosition, { passive: true, capture: true });
        document.addEventListener('transitionrun', wakeCollectionPosition, true);
        document.addEventListener('transitionend', wakeCollectionPosition, true);
        document.addEventListener('load', wakeCollectionPosition, true);
        window.addEventListener('resize', wakeCollectionPosition);
    }
    if (collectionPage) window.WSHSDescriptions.onChange(scheduleTick);
    document.fonts.addEventListener('loadingdone', scheduleTick);
    scheduleTick();
})();
