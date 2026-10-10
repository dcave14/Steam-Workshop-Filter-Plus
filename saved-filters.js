// saved-filters.js
// Saved keyword and author filters for Steam's new Workshop browse page.
//
// - A "Saved Filters" section in Steam's left sidebar, above Categories, built
//   from clones of Steam's own section, rows and +/- buttons. "-" hides
//   matches, "+" shows only matches, neither keeps the filter saved but off.
// - On cards: hovering an author, or selecting text in a title, shows the same
//   [+][-] pair beside it, which becomes a [check] once one is picked.
//
// Keyword filters are applied by Steam's server: search-terms-hook.js (MAIN
// world) appends them to the search text of Steam's own browse requests, so
// they match titles, descriptions and tags while the search box keeps showing
// only what the user typed. Steam's text search does not match the author
// field, so author filters hide cards on the page by the author link instead
// (wshs-filtered), like the star and subscribed filters do.
//
// Filters are stored per game: chrome.storage.local.savedFilters[appid] is a
// list of { kind: 'keyword' | 'author', value, label, state: -1 | 0 | 1 }.

(function () {
    'use strict';

    if (!/\/workshop\/browse\/?$/.test(window.location.pathname)) return;

    var STORAGE_KEY = 'savedFilters';
    var TERMS_ATTR = 'data-wshs-terms';
    var ITEM_LINK = 'a[href*="sharedfiles/filedetails/?id="]';
    var AUTHOR_LINK = 'a[href*="/myworkshopfiles"]';
    var PREVIEW = '.aspectratio_16x9, .aspectratio_square';
    var MAX_PHRASE = 80;
    var PICKER_HIDE_MS = 300;
    var PICKER_CONFIRM_MS = 900;

    // Steam's active +/- colors (fill and stroke, then the symbol), read from
    // the native Categories buttons. Set inline because the class that
    // carries them is a hashed CSS-module name.
    var ACTIVE = {
        '1': { fill: '#5db7c7', symbol: '#000' },
        '-1': { fill: '#d3ac42', symbol: '#000' }
    };

    var appId = readAppId();
    if (!appId) return;

    var filters = [];
    var loaded = false;
    var section = null;
    var picker = null;
    var pickerTarget = null; // { kind, value, label, anchor }
    var pickerHideTimer = null;
    var pickerClosing = false; // confirm close in progress; hovering keeps it
    var initialRefetchDone = false;
    var hiddenChip = null;
    var tickFrame = null;
    var retryTimer = null;

    function readAppId() {
        var fromQuery = new URLSearchParams(window.location.search).get('appid');
        return fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : null;
    }

    // ---------------------------------------------------------------------
    // Filter state and storage
    // ---------------------------------------------------------------------

    function sameFilter(a, kind, value) {
        return a.kind === kind && a.value.toLowerCase() === value.toLowerCase();
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

    function publishTerms() {
        var terms = buildTerms(filters);
        if (terms) document.documentElement.setAttribute(TERMS_ATTR, terms);
        else document.documentElement.removeAttribute(TERMS_ATTR);
        var changed = terms !== publishedTerms;
        publishedTerms = terms;
        return changed;
    }

    // Read-modify-write of this game's list only, so another tab's edits to
    // a different game are not overwritten. The onChanged listener below is
    // the single path that applies a change, for this tab and every other.
    function save() {
        var snapshot = filters.map(function (f) {
            return { kind: f.kind, value: f.value, label: f.label, state: f.state };
        });
        chrome.storage.local.get([STORAGE_KEY], function (data) {
            var all = (data && data[STORAGE_KEY]) || {};
            if (snapshot.length) all[appId] = snapshot;
            else delete all[appId];
            var update = {};
            update[STORAGE_KEY] = all;
            chrome.storage.local.set(update);
        });
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

    function applyStored(all) {
        var list = (all && all[appId]) || [];
        filters = list.filter(function (f) {
            return f && (f.kind === 'keyword' || f.kind === 'author') && typeof f.value === 'string';
        }).map(function (f) {
            return { kind: f.kind, value: f.value, label: f.label || f.value, state: f.state === 1 || f.state === -1 ? f.state : 0 };
        });
        return publishTerms();
    }

    chrome.storage.local.get([STORAGE_KEY], function (data) {
        applyStored(data && data[STORAGE_KEY]);
        loaded = true;
        scheduleTick();
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        var termsChanged = applyStored(changes[STORAGE_KEY].newValue);
        renderRows();
        renderPicker();
        applyAuthorFilters();
        if (termsChanged && initialRefetchDone) refetchResults();
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
    function whitespaceKey(terms) {
        if (!terms) return ' ';
        var hash = 2166136261;
        for (var i = 0; i < terms.length; i++) {
            hash ^= terms.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        var key = ' ';
        for (var bit = 0; bit < 11; bit++) key += (hash >>> bit) & 1 ? '\t' : ' ';
        return key;
    }

    function refetchResults() {
        var input = getSearchInput();
        if (!input || !input.form || typeof input.form.requestSubmit !== 'function') return false;
        var next = input.value.replace(/\s+$/, '') + whitespaceKey(publishedTerms);
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.form.requestSubmit();
        return true;
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

    function applyAuthorFilters() {
        if (!window.WSHSDom || !window.WSHSDom.enumerateCards) return;
        var hidden = new Set();
        var only = new Set();
        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            if (f.kind !== 'author' || !f.state) continue;
            (f.state < 0 ? hidden : only).add(f.value);
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
            var hide = !!key && (hidden.has(key) || (only.size > 0 && !only.has(key)));
            cards[c].root.classList.toggle('wshs-filtered', hide);
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
        anchor.section.parentElement.insertBefore(section, anchor.section);
        renderRows();
    }

    function buildRow(filter) {
        var row = anchor.row.cloneNode(true);
        while (row.children.length > 3) row.removeChild(row.lastElementChild);
        var plus = row.children[0];
        var minus = row.children[1];
        var label = row.children[2];
        plus.className = anchor.plusClass;
        minus.className = anchor.minusClass;
        paintActive(plus, filter.state === 1 ? 1 : 0);
        paintActive(minus, filter.state === -1 ? -1 : 0);
        plus.title = filter.kind === 'author' ? 'Only show mods by this author' : 'Only show mods mentioning this';
        minus.title = filter.kind === 'author' ? 'Hide mods by this author' : 'Hide mods mentioning this';
        label.textContent = filter.kind === 'author' ? 'By ' + filter.label : filter.label;
        label.classList.add('wshs-sf-label');
        label.removeAttribute('tabindex');
        label.removeAttribute('role');

        var remove = document.createElement('span');
        remove.className = 'wshs-sf-delete';
        remove.textContent = '×';
        remove.title = 'Delete this filter';
        row.appendChild(remove);

        plus.addEventListener('click', function (e) { e.stopPropagation(); toggleState(filter, 1); });
        minus.addEventListener('click', function (e) { e.stopPropagation(); toggleState(filter, -1); });
        remove.addEventListener('click', function (e) { e.stopPropagation(); removeFilter(filter); });
        return row;
    }

    function renderRows() {
        if (!section || !anchor) return;
        var list = section.querySelector('.wshs-sf-list');
        while (list.firstChild) list.removeChild(list.firstChild);
        for (var i = 0; i < filters.length; i++) list.appendChild(buildRow(filters[i]));
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

        var native = document.querySelector('#CommunityTemplate button[data-accent-color]');
        var button = native ? native.cloneNode(false) : document.createElement('button');
        button.type = 'button';
        button.textContent = 'Save';
        button.classList.add('wshs-sf-save');

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
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
        row.appendChild(input);
        row.appendChild(button);
        return row;
    }

    function cleanPhrase(text) {
        return (text || '').replace(/"/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE);
    }

    // ---------------------------------------------------------------------
    // Card picker: [+][-] beside a hovered author or selected title text
    // ---------------------------------------------------------------------

    function cardOf(el) {
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

    function ensurePicker() {
        if (picker && picker.isConnected) return picker;
        picker = document.createElement('div');
        picker.className = 'wshs-picker';
        // Keeps a title selection alive while its picker is clicked.
        picker.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        picker.addEventListener('click', onPickerClick);
        document.body.appendChild(picker);
        return picker;
    }

    function pickerButton(kind, action, state) {
        var button = document.createElement('span');
        button.className = 'wshs-sq';
        button.dataset.action = action;
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
        if (state) {
            picker.appendChild(pickerButton('check', 'undo', state));
            hint.textContent = state < 0 ? 'Hidden, click to undo' : 'Showing only, click to undo';
        } else {
            picker.appendChild(pickerButton('plus', 'only'));
            picker.appendChild(pickerButton('minus', 'hide'));
            hint.textContent = 'Show only / hide';
        }
        picker.appendChild(hint);
    }

    function onPickerClick(e) {
        e.preventDefault();
        e.stopPropagation();
        var button = e.target.closest('.wshs-sq');
        if (!button || !pickerTarget) return;
        var t = pickerTarget;
        var action = button.dataset.action;
        if (action === 'undo') {
            var existing = findFilter(t.kind, t.value);
            if (existing) {
                existing.state = 0;
                save();
            }
        } else {
            setFilter(t.kind, t.value, t.label, action === 'hide' ? -1 : 1);
        }
        renderPicker();
        // Hiding an author removes the card under the picker; the check stays
        // up briefly, then the picker closes instead of floating over the
        // card that moved into its place.
        if (t.kind === 'author' && action === 'hide') {
            clearTimeout(pickerHideTimer);
            pickerClosing = true;
            pickerHideTimer = setTimeout(hidePicker, PICKER_CONFIRM_MS);
        }
    }

    // Author pickers sit right of the name, vertically centered on it; title
    // pickers float above the selection, since titles are ellipsis-clipped.
    function showPicker(target, rect, placement) {
        clearTimeout(pickerHideTimer);
        pickerClosing = false;
        pickerTarget = target;
        var el = ensurePicker();
        el.style.display = 'flex';
        renderPicker();
        var box = el.getBoundingClientRect();
        var left = placement === 'right' ? rect.right + 8 : rect.left + rect.width / 2 - 20;
        var top = placement === 'right' ? rect.top + (rect.height - box.height) / 2 : rect.top - box.height - 6;
        el.style.left = (left + window.scrollX) + 'px';
        el.style.top = (top + window.scrollY) + 'px';
    }

    function hidePicker() {
        clearTimeout(pickerHideTimer);
        pickerClosing = false;
        pickerTarget = null;
        if (picker) picker.style.display = 'none';
    }

    function scheduleHidePicker() {
        if (pickerClosing) return;
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
        if (link && cardOf(link)) {
            var key = authorKey(link);
            if (key) {
                showPicker({ kind: 'author', value: key, label: authorName(link) }, link.getBoundingClientRect(), 'right');
                return;
            }
        }
        if (pickerTarget && pickerTarget.kind === 'author') scheduleHidePicker();
    }, true);

    function selectionTitleLink(selection) {
        if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
        var node = selection.getRangeAt(0).commonAncestorContainer;
        var el = node.nodeType === 1 ? node : node.parentElement;
        var link = el && el.closest(ITEM_LINK);
        if (!link || link.querySelector('img') || !cardOf(link)) return null;
        return link;
    }

    document.addEventListener('mouseup', function () {
        setTimeout(function () {
            var selection = window.getSelection();
            if (!selectionTitleLink(selection)) return;
            var phrase = cleanPhrase(selection.toString());
            if (!phrase) return;
            showPicker({ kind: 'keyword', value: phrase, label: phrase }, selection.getRangeAt(0).getBoundingClientRect(), 'above');
        }, 0);
    }, true);

    document.addEventListener('selectionchange', function () {
        if (!pickerTarget || pickerTarget.kind !== 'keyword') return;
        var selection = window.getSelection();
        if (!selection || selection.isCollapsed) hidePicker();
    });

    // Drag-selecting inside a title link ends in a click on that link; it
    // must not open the item.
    document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest && e.target.closest(ITEM_LINK);
        if (!link) return;
        var selection = window.getSelection();
        if (selectionTitleLink(selection) === link && selection.toString().trim()) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Title links are made non-draggable so a drag selects text instead.
    // Chrome uses -webkit-user-drag (styles.css); Firefox needs the attribute.
    function prepareTitleLinks() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return;
        var links = root.querySelectorAll(ITEM_LINK + ':not([draggable="false"])');
        for (var i = 0; i < links.length; i++) {
            if (!links[i].querySelector('img')) links[i].setAttribute('draggable', 'false');
        }
    }

    // ---------------------------------------------------------------------
    // Page sync
    // ---------------------------------------------------------------------

    function isSettled() {
        if (typeof isHydrationSettled === 'function') return isHydrationSettled();
        return document.readyState === 'complete';
    }

    function tick() {
        tickFrame = null;
        if (!loaded || !window.WSHSDom || !window.WSHSDom.isNewLayout()) return;
        // Same hydration gate as content.js: touching React's tree before it
        // hydrates causes a hydration mismatch.
        if (!isSettled()) {
            if (retryTimer === null) {
                retryTimer = setTimeout(function () { retryTimer = null; scheduleTick(); }, 300);
            }
            return;
        }
        ensureSection();
        applyAuthorFilters();
        prepareTitleLinks();
        syncWhitespaceChip();
        if (!initialRefetchDone && getSearchInput()) {
            initialRefetchDone = true;
            // The first page is server-rendered without the keyword terms.
            if (buildTerms(filters)) refetchResults();
        }
    }

    function scheduleTick() {
        if (tickFrame === null) tickFrame = requestAnimationFrame(tick);
    }

    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var target = mutations[i].target;
            var el = target.nodeType === 1 ? target : target.parentElement;
            if (el && (el.closest('.wshs-saved-filters') || el.closest('.wshs-picker'))) continue;
            if (mutations[i].addedNodes.length || mutations[i].removedNodes.length) {
                scheduleTick();
                return;
            }
        }
    }).observe(document, { childList: true, subtree: true });

    new MutationObserver(scheduleTick).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-wshs-hydrated']
    });
})();
