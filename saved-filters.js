// saved-filters.js
// Shared per-game keyword, author and dependency filters for Workshop/collections.
//
// - A "Saved Filters" section in Steam's left sidebar, above Categories, built
//   from clones of Steam's own section, rows and +/- buttons. "-" hides
//   matches, "+" shows only matches, neither keeps the filter saved but off.
// - On cards: hovering an author, or clicking an opted-in title word, shows the same
//   [+][-] pair beside it, which becomes a [check] once one is picked.
//
// Saved exclusions use verified title/description text, never Steam's index or
// comments. Longer + keywords also narrow Steam's search via search-terms-hook.js.
// All filters are checked locally on loaded cards; collections contain all rows.
//
// Filters are stored per game: chrome.storage.local['savedFilters:' + appid] is a
// list of { kind: 'keyword' | 'author' | 'dependency', value, label, state: -1 | 0 | 1, groupId? }.
// Optional groups use chrome.storage.local['savedFilterGroups:' + appid].

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
    var groupsKey = 'savedFilterGroups:' + appId;
    var descriptionKey = 'savedFilterDescriptions:' + appId;
    var includeDescriptions = false;

    var filters = [];
    var groups = [];
    var knownCreators = new Map(); // creator lists already shown by Quick View, keyed by item id
    var authorAliases = new Map();
    var creatorLayouts = new WeakMap();
    var loaded = false;
    var section = null;
    var picker = null;
    var pickerTarget = null; // { kind, value, label, anchor, range? }
    var pickerPositionFrame = null;
    var pickerViewKey = null;
    var collectionPositionResize = null;
    var collectionPositionMutation = null;
    var collectionPosition = null;
    var collectionSizeDirty = true;
    var collectionMotionDirty = true;
    var collectionAnimations = [];
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
    var reviewFilter = null;
    var textMatches = new WeakMap();
    var cardFilterState = new WeakMap();
    var openChoiceMenu = null;

    // Edit the existing text node's data. Replacing it (textContent) makes
    // Chrome recheck Steam's :root:has() rules across the whole page.
    function setText(node, value) {
        if (node.textContent === value) return;
        if (node.firstChild && node.firstChild.nodeType === 3 && !node.firstChild.nextSibling) node.firstChild.nodeValue = value;
        else node.textContent = value;
    }

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

    function findGroup(id) { return groups.find(function (group) { return group.id === id; }); }
    function filterEnabled(filter) {
        var group = findGroup(filter.groupId);
        return !!filter.state && (!group || group.enabled);
    }
    function reviewMembers() {
        if (!reviewFilter) return [];
        return reviewFilter.kind === 'group' ? activeFilters().filter(function (filter) { return filter.groupId === reviewFilter.value; }) : [reviewFilter];
    }
    function syncReview() {
        if (reviewFilter && reviewFilter.kind === 'group') {
            var group = findGroup(reviewFilter.value);
            reviewFilter = group && group.enabled && activeFilters().some(function (f) { return f.groupId === group.id; }) ?
                { kind: 'group', value: group.id, label: group.name, state: -1 } : null;
        } else if (reviewFilter) {
            reviewFilter = findFilter(reviewFilter.kind, reviewFilter.value);
            if (reviewFilter && !filterEnabled(reviewFilter)) reviewFilter = null;
        }
        document.documentElement.classList.toggle('wshs-reviewing', !!reviewFilter);
    }

    function buildTerms(list) {
        if (reviewFilter) return '';
        var nativeSearch = getSearchInput();
        if ((nativeSearch ? nativeSearch.value : new URLSearchParams(location.search).get('searchtext') || '').trim()) return '';
        var terms = [];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            // Steam must never decide exclusions from its search index. Check
            // every minus locally against verified title/description text only.
            if (!filterEnabled(f) || f.kind !== 'keyword' || f.state !== 1 || window.WSHSMatching.local(f.value)) continue;
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
            var row = { kind: f.kind, value: f.value, label: f.label, state: f.state };
            if (findGroup(f.groupId)) row.groupId = f.groupId;
            return row;
        });
        var update = {};
        update[storageKey] = snapshot;
        update[groupsKey] = groups.map(function (group) { return { id: group.id, name: group.name, enabled: group.enabled, collapsed: group.collapsed }; });
        chrome.storage.local.set(update);
        renderRows(); applyAuthorFilters(); scheduleTick();
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
            return f && (f.kind === 'keyword' || f.kind === 'author' || f.kind === 'dependency') && typeof f.value === 'string' &&
                (f.kind !== 'dependency' || /^\d+$/.test(f.value));
        }).map(function (f) {
            return { kind: f.kind, value: f.value, label: f.label || f.value, state: f.state === 1 || f.state === -1 ? f.state : 0,
                groupId: findGroup(f.groupId) ? f.groupId : null };
        });
        syncReview();
        return publishTerms();
    }

    function applyGroups(list) {
        var seen = new Set();
        groups = (Array.isArray(list) ? list : []).filter(function (group) {
            if (!group || typeof group.id !== 'string' || !group.id || seen.has(group.id) || typeof group.name !== 'string' || !group.name.trim()) return false;
            seen.add(group.id); return true;
        }).map(function (group) { return { id: group.id, name: group.name.trim().slice(0, MAX_PHRASE), enabled: group.enabled !== false, collapsed: group.collapsed === true }; });
    }

    chrome.storage.local.get([storageKey, groupsKey, LEGACY_STORAGE_KEY, descriptionKey], function (data) {
        // Read old installs without rewriting the shared map. The first edit
        // writes this game's list to its independent key.
        var list = data && data[storageKey];
        if (list === undefined) list = data && data[LEGACY_STORAGE_KEY] && data[LEGACY_STORAGE_KEY][appId];
        includeDescriptions = data && data[descriptionKey] === true;
        applyGroups(data && data[groupsKey]);
        applyStored(list);
        loaded = true;
        ensureAuthorAliases();
        scheduleTick();
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || (!changes[storageKey] && !changes[groupsKey] && !changes[descriptionKey])) return;
        var descriptionChanged = !!changes[descriptionKey] && includeDescriptions !== (changes[descriptionKey].newValue === true);
        if (changes[descriptionKey]) includeDescriptions = changes[descriptionKey].newValue === true;
        if (changes[groupsKey]) applyGroups(changes[groupsKey].newValue);
        var termsChanged = changes[storageKey] || changes[groupsKey] ? applyStored(changes[storageKey] ? changes[storageKey].newValue : filters) : publishTerms();
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
        var needsAliases = collectionPage || activeFilters().some(function (f) { return f.kind === 'author' && f.value.indexOf('id/') === 0; });
        if (!needsAliases) return;
        activeFilters().filter(function (f) { return f.kind === 'author'; }).forEach(function (filter) {
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

    function activeFilters() { return filters.filter(filterEnabled); }

    function filterMatch(filter, root, id) {
        if (filter.kind === 'dependency') {
            var required = window.WSHSDependencies.get(id);
            return required === null ? null : required.indexOf(filter.value) !== -1;
        }
        if (filter.kind === 'author') {
            var keys = Array.prototype.map.call(root.querySelectorAll(collectionPage ? '.workshopItemAuthor ' + AUTHOR_LINK : AUTHOR_LINK), authorKey);
            var known = knownCreators.get(id);
            if (known) keys = keys.concat(known.keys);
            if (!keys.length) return null;
            return authorValues(filter.value).some(function (key) { return keys.indexOf(key) !== -1; });
        }
        var title = collectionPage ? root.querySelector('.workshopItemTitle') : Array.prototype.find.call(root.querySelectorAll(ITEM_LINK), function (a) { return a.textContent.trim(); });
        var titleText = title ? title.textContent : '';
        var description = includeDescriptions ? window.WSHSDescriptions.get(id) : '';
        var cached = textMatches.get(root);
        if (!cached || cached.title !== titleText || cached.description !== description) {
            cached = { title: titleText, description: description, matches: new Map() }; textMatches.set(root, cached);
        }
        if (cached.matches.has(filter.value)) return cached.matches.get(filter.value);
        var match = window.WSHSMatching.contains(titleText, filter.value) ? true : description === null ? null : window.WSHSMatching.contains(description, filter.value);
        if (cached.matches.size >= 100) cached.matches.clear();
        cached.matches.set(filter.value, match);
        return match;
    }

    function passesFilters(root, id, list) {
        // Multiple + creators include any of them, as on Steam's creator lists.
        var onlyAuthors = list.filter(function (f) { return f.kind === 'author' && f.state > 0; });
        if (onlyAuthors.length && onlyAuthors.every(function (f) { return filterMatch(f, root, id) === false; })) return false;
        return list.every(function (f) {
            if (f.kind === 'author' && f.state > 0) return true;
            var match = filterMatch(f, root, id);
            return match === null || (f.state > 0 ? match : !match);
        });
    }

    function prepareLocalData(items, list) {
        var ids = items.map(function (item) { return item.id; }).filter(Boolean);
        var descriptions = includeDescriptions && list.some(function (f) { return f.kind === 'keyword'; });
        if (descriptions) window.WSHSDescriptions.request(ids);
        var dependencies = list.some(function (f) { return f.kind === 'dependency'; });
        if (dependencies) window.WSHSDependencies.request(ids);
        var unknown = ids.filter(function (id) { return dependencies && window.WSHSDependencies.get(id) === null; });
        var loading = unknown.some(window.WSHSDependencies.pending);
        var status = section && section.querySelector('.wshs-dependency-status');
        var retry = section && section.querySelector('.wshs-dependency-retry');
        var message = unknown.length ? loading ? 'Checking required items… ' + unknown.length + ' remaining.' : unknown.length + ' required-item lists unavailable. Retry to verify.' : '';
        var apiMessage = dependencies && window.WSHSDependencies.message();
        if (apiMessage) message = (message ? message + ' ' : '') + apiMessage;
        if (status) { setText(status, message); status.hidden = !message; }
        if (retry) retry.hidden = !unknown.length || loading;
        return unknown;
    }

    function filterExclusion(filter, root, id) {
        if (filter.kind === 'author' && filter.state > 0) {
            var authors = activeFilters().filter(function (f) { return f.kind === 'author' && f.state > 0; });
            var matches = authors.map(function (f) { return filterMatch(f, root, id); });
            return matches.indexOf(true) !== -1 ? false : matches.indexOf(null) !== -1 ? null : true;
        }
        var match = filterMatch(filter, root, id);
        return match === null ? null : filter.state < 0 ? match : !match;
    }

    function reviewExclusion(root, id) {
        var matches = reviewMembers().map(function (filter) { return filterExclusion(filter, root, id); });
        return matches.indexOf(true) !== -1 ? true : matches.indexOf(null) !== -1 ? null : false;
    }

    function exclusionReason(filter) {
        if (filter.kind === 'author' && filter.state > 0) return 'Does not match any + author filter';
        var name = filter.kind === 'dependency' ? 'Requires ' + filter.label : filter.kind === 'author' ? 'By ' + filter.label : filter.label;
        return (filter.state < 0 ? 'Excluded by − ' : 'Does not match + ') + name;
    }

    function reviewItem(root, id) {
        var show = reviewFilter && reviewExclusion(root, id) === true;
        cardFilterState.set(root, {
            hidden: root.classList.contains('wshs-filtered'),
            match: !!show,
            omit: !!reviewFilter && !show
        });
        root.classList.toggle('wshs-review-match', !!show);
        root.classList.toggle('wshs-review-omit', !!reviewFilter && !show);
        var badge = root.querySelector('.wshs-review-reason');
        if (show) {
            if (!badge) { badge = document.createElement('div'); badge.className = 'wshs-review-reason'; }
            var badgeParent = collectionPage ? root.querySelector('.collectionItemDetails') || root : root;
            if (badge.parentNode !== badgeParent) badgeParent.appendChild(badge);
            var reason = reviewMembers().filter(function (filter) { return filterExclusion(filter, root, id) === true; }).map(exclusionReason).join(' · ');
            setText(badge, reason);
        } else if (badge) badge.remove();
        return show ? 1 : 0;
    }

    function updateReviewStatus(count, items) {
        var status = section && section.querySelector('.wshs-review-status');
        if (!status) return;
        var excluded = items.filter(function (item) { return item.root.classList.contains('wshs-filtered'); }).length;
        var savedCount = section.querySelector('.wshs-saved-count');
        if (savedCount) setText(savedCount, excluded + ' mods hidden');
        status.hidden = !reviewFilter;
        if (reviewFilter) {
            var unknown = items.filter(function (item) { return reviewExclusion(item.root, item.id) === null; }).length;
            var message = count + ' excluded mods' + (collectionPage ? ' in this collection.' : ' on this Workshop page. Use Steam’s paging to inspect more.') +
                (unknown ? ' ' + unknown + ' still unverified.' : '') + ' Subscribed and rating filters are ignored during inspection.';
            setText(status, message);
        } else {
            var summary = excluded + ' mods hidden by saved filters' + (collectionPage ? ' in this collection.' : ' on this page.');
            setText(status, summary);
        }
    }

    function applyAuthorFilters() {
        if (collectionPage) { applyCollectionFilters(); return; }
        if (!window.WSHSDom || !window.WSHSDom.enumerateCards) return;
        var list = activeFilters();
        var cards = window.WSHSDom.enumerateCards();
        var dataFilters = list;
        prepareLocalData(cards, dataFilters);
        var count = 0;
        cards.forEach(function (card) {
            card.root.classList.toggle('wshs-filtered', !passesFilters(card.root, card.id, list));
            count += reviewItem(card.root, card.id);
        });
        updateReviewStatus(count, cards);
        updateDescriptionStatus(cards, dataFilters);
    }

    function collectionRows() {
        return Array.prototype.slice.call(document.querySelectorAll('.collectionItem'));
    }

    function updateDescriptionStatus(items, list) {
        var needed = includeDescriptions && list.some(function (f) { return f.kind === 'keyword'; });
        var unknown = needed ? items.map(function (item) { return item.id; }).filter(function (id) { return id && window.WSHSDescriptions.get(id) === null; }) : [];
        var status = section && section.querySelector('.wshs-description-status');
        var retry = section && section.querySelector('.wshs-description-retry');
        var loading = unknown.some(window.WSHSDescriptions.pending);
        var message = unknown.length ? loading ? 'Loading full descriptions… Results will update.' : unknown.length + ' descriptions unavailable. Retry to verify.' : '';
        if (status) { setText(status, message); status.hidden = !message; }
        if (retry) retry.hidden = !unknown.length || loading;
        return unknown;
    }

    function applyCollectionFilters() {
        ensureAuthorAliases();
        var list = activeFilters();
        var items = collectionRows().map(function (row) { var link = row.querySelector('.collectionItemDetails > a'); return { root: row, id: link && itemId(link) }; });
        var unknownDependencies = prepareLocalData(items, list);
        var unknownDescriptions = updateDescriptionStatus(items, list);
        var allowed = [], excluded = [], count = 0;
        items.forEach(function (item) {
            var matches = passesFilters(item.root, item.id, list);
            item.root.classList.toggle('wshs-filtered', !matches);
            count += reviewItem(item.root, item.id);
            if (item.id) (matches && !item.root.classList.contains('wshs-design-search-hidden') ? allowed : excluded).push(item.id);
        });
        updateReviewStatus(count, items);
        var button = document.querySelector('.subscribeCollection [onclick*="SubscribeCollection("]');
        if (button && loaded) {
            if (unknownDescriptions.length || unknownDependencies.length) {
                button.removeAttribute('data-wshs-subscription-plan');
                button.setAttribute('data-wshs-subscription-error', 'Descriptions or required-item lists are still loading or unavailable. Retry or turn off the affected filter before subscribing.');
                return;
            }
            var uncertain = activeFilters().some(function (f) {
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
            head.className = 'wshs-collection-filter-heading';
            var title = document.createElement('span'); title.className = 'wshs-sf-heading'; title.textContent = 'Saved filters';
            var count = document.createElement('span'); count.className = 'wshs-saved-count'; count.textContent = '0 mods hidden';
            count.title = 'Mods hidden by saved filters in this collection'; count.setAttribute('role', 'status');
            head.append(title, count);
            var rows = document.createElement('div');
            rows.className = 'wshs-sf-list';
            section.appendChild(head);
            section.appendChild(buildInspectionTools());
            section.appendChild(rows);
            var composer = buildAddRow();
            composer.querySelector('.wshs-sf-add').appendChild(section.querySelector('.wshs-api-settings'));
            section.appendChild(composer);
            section.appendChild(buildDescriptionToggle());
            document.querySelector('.subscribeCollection').insertAdjacentElement('afterend', section);
            renderRows();
            return;
        }
        anchor = findCategoryAnchor();
        if (!anchor) return;
        section = anchor.section.cloneNode(false);
        section.removeAttribute('id');
        section.classList.add('wshs-saved-filters');
        section.classList.add('wshs-workshop-filters');
        var nativeField = getSearchInput();
        var nativeDropdown = anchor.section.parentElement.querySelector('[role="combobox"]');
        var nativeButton = anchor.section.parentElement.querySelector('button:not(.wshs-sf-save)');
        if (nativeField) section.style.setProperty('--wshs-native-input', getComputedStyle(nativeField).backgroundColor);
        if (nativeDropdown) section.style.setProperty('--wshs-native-control', getComputedStyle(nativeDropdown).backgroundColor);
        if (nativeButton) section.style.setProperty('--wshs-native-button', getComputedStyle(nativeButton).backgroundColor);
        var heading = anchor.heading.cloneNode(true);
        heading.textContent = 'Saved Filters';
        var list = document.createElement('div');
        list.className = 'wshs-sf-list';
        section.appendChild(heading);
        section.appendChild(list);
        section.appendChild(buildAddRow());
        section.appendChild(buildDescriptionToggle());
        section.appendChild(buildInspectionTools());
        section.appendChild(section.querySelector('.wshs-api-settings'));
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
        row.classList.add('wshs-sf-row');
        var scope = includeDescriptions ? 'title or description' : 'title';
        plus.title = filter.kind === 'author' ? 'Only show mods by this author' : 'Only show mods with this phrase in the ' + scope;
        minus.title = filter.kind === 'author' ? 'Hide mods by this author' : 'Hide mods with this phrase in the ' + scope;
        if (filter.kind === 'dependency') {
            plus.title = 'Only show mods that directly require this Workshop item';
            minus.title = 'Hide mods that directly require this Workshop item';
        }
        label.textContent = filter.kind === 'author' ? 'By ' + filter.label : filter.label;
        if (filter.kind === 'dependency') label.textContent = 'Requires ' + filter.label;
        label.classList.add('wshs-sf-label');
        label.removeAttribute('tabindex');
        label.removeAttribute('role');
        if (filterEnabled(filter)) {
            label.setAttribute('role', 'button'); label.tabIndex = 0;
            label.title = 'Inspect mods excluded by this filter';
            label.classList.add('wshs-sf-inspectable');
            row.appendChild(buildInspector(filter));
            function inspectClick(e) { e.stopPropagation(); setReview(filter); }
            label.addEventListener('click', inspectClick);
            label.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectClick(e); } });
        }

        if (groups.length) {
            row.appendChild(buildGroupMenu(filter, label.textContent));
        }

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
        closeChoiceMenu(false);
        var focusedFolder = document.activeElement && document.activeElement.closest('.wshs-group-select');
        var focusedFilter = focusedFolder && { kind: focusedFolder.dataset.kind, value: focusedFolder.dataset.value };
        var focusedCollapse = document.activeElement && document.activeElement.closest('.wshs-group-collapse');
        var focusedGroupId = focusedCollapse && focusedCollapse.closest('.wshs-filter-group').dataset.groupId;
        syncReview();
        var exit = section.querySelector('.wshs-review-exit');
        if (exit) { exit.hidden = !reviewFilter; exit.textContent = reviewFilter ? '← Back to filtered results (' + reviewFilter.label + ')' : ''; }
        var toggle = section.querySelector('.wshs-description-toggle');
        if (toggle) toggle.checked = includeDescriptions;
        var list = section.querySelector('.wshs-sf-list');
        while (list.firstChild) list.removeChild(list.firstChild);
        filters.filter(function (filter) { return !findGroup(filter.groupId); }).forEach(function (filter) { list.appendChild(buildRow(filter)); });
        groups.forEach(function (group, index) {
            var container = document.createElement('div'); container.className = 'wshs-filter-group'; container.dataset.groupId = group.id;
            container.classList.toggle('wshs-group-disabled', !group.enabled);
            var header = document.createElement('div'); header.className = 'wshs-group-header';
            var membersBody = document.createElement('div'); membersBody.className = 'wshs-group-members';
            membersBody.id = 'wshs-group-members-' + appId + '-' + index; membersBody.hidden = group.collapsed;
            var collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'wshs-group-collapse';
            collapse.setAttribute('aria-expanded', String(!group.collapsed)); collapse.setAttribute('aria-controls', membersBody.id);
            collapse.setAttribute('aria-label', (group.collapsed ? 'Expand group ' : 'Collapse group ') + group.name);
            collapse.title = collapse.getAttribute('aria-label');
            var chevron = svgEl('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' });
            chevron.appendChild(svgEl('path', { d: 'M6 3l5 5-5 5', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
            collapse.appendChild(chevron);
            collapse.addEventListener('click', function () { group.collapsed = !group.collapsed; save(); });
            var enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = group.enabled; enabled.className = 'wshs-group-toggle';
            enabled.setAttribute('aria-label', 'Enable group ' + group.name); enabled.title = 'Enable or disable this group; keep its +/− settings';
            enabled.addEventListener('change', function () { group.enabled = enabled.checked; save(); });
            var name = document.createElement('input'); name.type = 'text'; name.className = 'wshs-group-name'; name.value = group.name; name.maxLength = MAX_PHRASE;
            name.setAttribute('aria-label', 'Group name'); name.title = 'Rename group';
            name.addEventListener('change', function () { var value = name.value.trim(); if (!value) { name.value = group.name; return; } group.name = value; save(); });
            name.addEventListener('keydown', function (event) { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); name.blur(); } });
            header.append(collapse, enabled);
            if (collectionPage) {
                var folder = svgEl('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', 'class': 'wshs-group-folder-icon' });
                folder.appendChild(svgEl('path', { d: 'M2 4h6l2 2h8v11H2z', fill: 'currentColor' }));
                header.appendChild(folder);
            }
            header.appendChild(name);
            var members = filters.filter(function (filter) { return filter.groupId === group.id; });
            if (group.enabled && members.some(filterEnabled)) header.appendChild(buildInspector({ kind: 'group', value: group.id, label: group.name, state: -1 }));
            var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'wshs-group-remove'; remove.textContent = '×';
            remove.title = 'Remove group and keep its filters. Filters in disabled groups stay inactive.';
            remove.setAttribute('aria-label', 'Remove group ' + group.name);
            remove.addEventListener('click', function () {
                members.forEach(function (filter) { filter.groupId = null; if (!group.enabled) filter.state = 0; });
                groups = groups.filter(function (other) { return other.id !== group.id; }); save();
            });
            header.appendChild(remove); container.append(header, membersBody);
            if (!members.length) { var empty = document.createElement('div'); empty.className = 'wshs-group-empty'; empty.textContent = 'Choose this group from a filter’s group menu.'; membersBody.appendChild(empty); }
            members.forEach(function (filter) { membersBody.appendChild(buildRow(filter)); });
            list.appendChild(container);
        });
        if (focusedGroupId) {
            var focusedGroup = Array.prototype.find.call(list.querySelectorAll('.wshs-filter-group'), function (group) { return group.dataset.groupId === focusedGroupId; });
            if (focusedGroup) focusedGroup.querySelector('.wshs-group-collapse').focus({ preventScroll: true });
        }
        if (focusedFilter) {
            var replacement = Array.prototype.find.call(list.querySelectorAll('.wshs-group-select'), function (button) { return button.dataset.kind === focusedFilter.kind && button.dataset.value === focusedFilter.value; });
            if (replacement) replacement.focus({ preventScroll: true });
        }
    }

    function buildInspector(filter) {
        var inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'wshs-sf-inspect';
        inspect.title = 'Inspect mods excluded by ' + filter.label;
        inspect.setAttribute('aria-label', 'Inspect exclusions for ' + filter.label);
        inspect.setAttribute('aria-pressed', String(!!reviewFilter && sameFilter(reviewFilter, filter.kind, filter.value)));
        var glass = svgEl('svg', { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' });
        glass.appendChild(svgEl('circle', { cx: '8', cy: '8', r: '5', stroke: 'currentColor', 'stroke-width': '2' }));
        glass.appendChild(svgEl('path', { d: 'M12 12l5 5', stroke: 'currentColor', 'stroke-width': '2' }));
        inspect.appendChild(glass);
        inspect.addEventListener('click', function (event) { event.stopPropagation(); setReview(filter); });
        return inspect;
    }

    function closeChoiceMenu(focusTrigger) {
        if (!openChoiceMenu) return;
        var current = openChoiceMenu; openChoiceMenu = null;
        current.trigger.setAttribute('aria-expanded', 'false');
        if (current.menu.matches(':popover-open')) current.menu.hidePopover();
        current.menu.remove();
        if (focusTrigger && current.trigger.isConnected) current.trigger.focus({ preventScroll: true });
    }

    function buildGroupMenu(filter, label) {
        var trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'wshs-group-select';
        trigger.dataset.kind = filter.kind; trigger.dataset.value = filter.value;
        trigger.setAttribute('aria-label', 'Group for ' + label);
        trigger.title = 'Move to group (currently ' + (findGroup(filter.groupId)?.name || 'Ungrouped') + ')';
        trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
        function open(last) {
            if (openChoiceMenu && openChoiceMenu.trigger === trigger) { closeChoiceMenu(true); return; }
            closeChoiceMenu(false);
            var menu = document.createElement('div'); menu.className = 'wshs-folder-menu'; menu.popover = 'auto';
            if (!collectionPage) { menu.classList.add('wshs-workshop-folder'); menu.style.fontFamily = getComputedStyle(trigger).fontFamily; }
            menu.id = 'wshs-folder-menu-' + appId; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Move filter to group');
            trigger.setAttribute('aria-controls', menu.id);
            var choices = [{ id: '', name: 'Ungrouped' }].concat(groups);
            choices.forEach(function (group) {
                var option = document.createElement('button'); option.type = 'button'; option.className = 'wshs-folder-option';
                option.textContent = group.name; option.dataset.groupId = group.id; option.title = group.name;
                option.setAttribute('role', 'menuitemradio'); option.setAttribute('aria-checked', String(group.id === (filter.groupId || '')));
                option.tabIndex = -1;
                option.addEventListener('click', function (event) {
                    event.stopPropagation(); closeChoiceMenu(true); filter.groupId = group.id || null; save();
                });
                menu.appendChild(option);
            });
            menu.addEventListener('keydown', function (event) {
                event.stopPropagation();
                var options = Array.prototype.slice.call(menu.children), index = options.indexOf(document.activeElement);
                if (event.key === 'Escape') { event.preventDefault(); closeChoiceMenu(true); }
                else if (event.key === 'Tab') closeChoiceMenu(true);
                else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) !== -1) {
                    event.preventDefault();
                    var next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                    options[next].focus();
                }
            });
            menu.addEventListener('toggle', function (event) {
                if (event.newState === 'closed' && openChoiceMenu && openChoiceMenu.menu === menu) closeChoiceMenu(false);
            });
            document.body.appendChild(menu); openChoiceMenu = { menu: menu, trigger: trigger }; menu.showPopover();
            var rect = trigger.getBoundingClientRect(), box = menu.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(innerWidth - box.width - 8, rect.right - box.width)) + 'px';
            menu.style.top = (rect.bottom + box.height + 6 <= innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - box.height - 5)) + 'px';
            trigger.setAttribute('aria-expanded', 'true');
            (last ? menu.lastElementChild : menu.querySelector('[aria-checked="true"]') || menu.firstElementChild).focus();
        }
        trigger.addEventListener('click', function (event) { event.stopPropagation(); open(false); });
        trigger.addEventListener('keydown', function (event) {
            event.stopPropagation();
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(event.key === 'ArrowUp'); }
        });
        return trigger;
    }
    window.addEventListener('resize', function () { closeChoiceMenu(false); });
    document.addEventListener('scroll', function (event) {
        if (openChoiceMenu && !openChoiceMenu.menu.contains(event.target)) closeChoiceMenu(false);
    }, { capture: true, passive: true });

    function buildDescriptionToggle() {
        var container = document.createElement('div');
        var label = document.createElement('label');
        label.className = 'wshs-description-option';
        var input = document.createElement('input');
        input.type = 'checkbox'; input.className = 'wshs-description-toggle'; input.checked = includeDescriptions;
        var text = document.createElement('span'); text.textContent = collectionPage ? 'Search descriptions' : 'Include descriptions in search';
        label.append(input, text);
        label.title = 'Search descriptions for saved keyword filters. Steam’s search box has its own Title / Description settings.';
        input.addEventListener('change', function () {
            var update = {}; update[descriptionKey] = input.checked; chrome.storage.local.set(update);
        });
        container.appendChild(label);
        var status = document.createElement('div'); status.className = 'wshs-description-status'; status.setAttribute('role', 'status'); status.hidden = true;
        var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'wshs-description-retry'; retry.textContent = 'Retry descriptions'; retry.hidden = true;
        retry.addEventListener('click', function () {
            window.WSHSDescriptions.request(pageItemIds(), true); scheduleTick();
        });
        container.append(status, retry);
        return container;
    }

    function pageItemIds() {
        return collectionPage ? collectionRows().map(function (row) { var a = row.querySelector('.collectionItemDetails > a'); return a && itemId(a); }).filter(Boolean) : window.WSHSDom.enumerateCards().map(function (card) { return card.id; });
    }

    function setReview(filter) {
        reviewFilter = filter && (!reviewFilter || !sameFilter(reviewFilter, filter.kind, filter.value)) ? filter : null;
        document.documentElement.classList.toggle('wshs-reviewing', !!reviewFilter);
        var changed = publishTerms();
        renderRows(); applyAuthorFilters();
        if (changed) refetchResults(true);
    }

    function buildInspectionTools() {
        var container = document.createElement('div'); container.className = 'wshs-inspection-tools';
        var status = document.createElement('div'); status.className = 'wshs-dependency-status'; status.setAttribute('role', 'status'); status.hidden = true;
        var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'wshs-dependency-retry'; retry.textContent = 'Retry required items'; retry.hidden = true;
        retry.addEventListener('click', function () { window.WSHSDependencies.request(pageItemIds(), true); scheduleTick(); });
        var exit = document.createElement('button'); exit.type = 'button'; exit.className = 'wshs-review-exit'; exit.hidden = true;
        exit.addEventListener('click', function () { setReview(null); });
        var review = document.createElement('div'); review.className = 'wshs-review-status'; review.hidden = true; review.setAttribute('role', 'status');
        var settings = document.createElement('button'); settings.type = 'button'; settings.className = 'wshs-api-settings'; settings.textContent = 'Data service settings';
        if (collectionPage) {
            settings.textContent = '';
            settings.title = 'Data service settings'; settings.setAttribute('aria-label', settings.title);
            var gear = svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' });
            gear.appendChild(svgEl('path', { d: 'M9 3h6l.5 3 2 1.2 2.8-1 3 5.2-2.3 2 .1 2.3 2.2 2-3 5.2-2.8-1-2 1.1L15 26H9l-.5-3-2-1.1-2.8 1-3-5.2 2.3-2-.1-2.3-2.2-2 3-5.2 2.8 1 2-1.2z', transform: 'translate(2 0) scale(.8)', fill: 'currentColor' }));
            gear.appendChild(svgEl('circle', { cx: '11.6', cy: '11.6', r: '3', fill: '#101821' }));
            settings.appendChild(gear);
        }
        chrome.runtime.sendMessage({ type: 'wshs-api-status' }).then(function (state) {
            if (state && state.mode !== 'service') {
                if (collectionPage) { settings.title = 'API key settings'; settings.setAttribute('aria-label', settings.title); }
                else settings.textContent = 'API key settings';
            }
        }).catch(function () {});
        settings.addEventListener('click', function () { chrome.runtime.sendMessage({ type: 'wshs-open-settings' }); });
        container.append(settings, status, retry, exit, review);
        // Collapse the box when every child is hidden. A :has(> :not([hidden]))
        // rule did this, but it made every element insertion on the page
        // recheck Steam's :root:has() rules (~60ms on large collections).
        function syncEmpty() {
            var empty = !Array.prototype.some.call(container.children, function (child) { return !child.hidden; });
            if (container.classList.contains('wshs-inspection-empty') !== empty) container.classList.toggle('wshs-inspection-empty', empty);
        }
        new MutationObserver(syncEmpty).observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        syncEmpty();
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
        input.placeholder = 'Keyword or phrase…';
        input.setAttribute('aria-label', 'Keyword or phrase');
        input.maxLength = MAX_PHRASE;
        var bg = searchBoxBackground();
        if (bg) input.style.backgroundColor = bg;

        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Add';
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
        help.title = 'Filter help';
        [
            'Keywords match whole words in titles. Descriptions are optional; comments are ignored.',
            '+ Keep matches · − Hide matches · Click again to disable.',
            'Magnifying glass: inspect hidden mods. ×: delete a filter.',
            'Groups toggle filters together. Required mods check declared dependencies.'
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

        var kind = 'keyword', drafts = { keyword: '', dependency: '', group: '' };
        var types = document.createElement('div');
        types.className = 'wshs-add-kind' + (collectionPage ? ' wshs-collection-type' : '');
        types.setAttribute('aria-label', 'Add a filter or group');
        var choices = [['keyword', 'Keyword'], ['dependency', 'Required mod'], ['group', 'Group']];
        var typeMenu = null, typeLabel = null, closeTypes;
        function chooseKind(next) {
            drafts[kind] = input.value; kind = next; input.value = drafts[kind]; input.setCustomValidity('');
            input.classList.toggle('wshs-dependency-input', kind === 'dependency'); input.classList.toggle('wshs-group-input', kind === 'group');
            input.maxLength = kind === 'dependency' ? 2048 : MAX_PHRASE;
            input.placeholder = kind === 'group' ? 'Group name…' : kind === 'dependency' ? 'Workshop URL or ID…' : 'Keyword or phrase…';
            input.setAttribute('aria-label', kind === 'group' ? 'New filter group name' : kind === 'dependency' ? 'Required Workshop mod URL or ID' : 'Keyword or phrase');
            input.title = kind === 'dependency' ? 'Checks direct Required Items declared by the creator. Add a keyword filter to catch undeclared references.' : kind === 'group' ? 'Create a group, then assign filters through their folder menus.' : 'Match a literal phrase in titles, with optional descriptions. Steam’s search box handles AND / OR / NOT separately.';
            button.textContent = kind === 'group' ? 'Create' : 'Add';
            {
                typeLabel.textContent = choices.find(function (entry) { return entry[0] === kind; })[1];
                types.dataset.value = kind;
                Array.prototype.forEach.call(typeMenu.children, function (item) { item.setAttribute('aria-selected', String(item.dataset.addKind === kind)); });
            }
            input.focus();
        }
        {
            // Reuse the adjacent Steam control's presentation, including its
            // state selectors and chevron. Cloning does not copy React handlers.
            var native = !collectionPage && findCategoryAnchor().section.parentElement.querySelector('[role="combobox"]:not(.wshs-add-kind)');
            if (native) {
                types.className += ' wshs-native-type ' + native.className;
                types.style.cssText = native.style.cssText;
                Array.prototype.forEach.call(native.children, function (child) { types.appendChild(child.cloneNode(true)); });
                typeLabel = types.querySelector('span');
            }
            if (!typeLabel) { typeLabel = document.createElement('span'); types.appendChild(typeLabel); }
            typeLabel.textContent = 'Keyword'; types.dataset.value = kind;
            types.tabIndex = 0; types.setAttribute('role', 'combobox');
            types.setAttribute('aria-haspopup', 'listbox'); types.setAttribute('aria-expanded', 'false');
            typeMenu = document.createElement('div'); typeMenu.className = 'wshs-type-menu' + (collectionPage ? ' wshs-collection-type-menu' : '');
            typeMenu.id = 'wshs-type-menu-' + appId; typeMenu.setAttribute('role', 'listbox');
            typeMenu.setAttribute('aria-label', 'Filter type'); typeMenu.setAttribute('popover', 'auto');
            types.setAttribute('aria-controls', typeMenu.id);
            closeTypes = function (restore) { if (typeMenu.matches(':popover-open')) typeMenu.hidePopover(); if (restore) types.focus(); };
            function positionTypes() {
                var rect = types.getBoundingClientRect();
                if (rect.bottom <= 0 || rect.top >= innerHeight) { closeTypes(false); return; }
                typeMenu.style.width = rect.width + 'px';
                typeMenu.style.fontFamily = getComputedStyle(types).fontFamily;
                typeMenu.style.left = Math.max(4, Math.min(rect.left, innerWidth - rect.width - 4)) + 'px';
                var height = typeMenu.getBoundingClientRect().height;
                typeMenu.style.top = (rect.bottom + height <= innerHeight - 4 ? rect.bottom : Math.max(4, rect.top - height)) + 'px';
            }
            function openTypes() {
                typeMenu.showPopover(); positionTypes();
                types.setAttribute('aria-expanded', 'true');
                typeMenu.querySelector('[aria-selected="true"]').focus();
            }
            var pointerWasOpen = false;
            types.addEventListener('pointerdown', function () { pointerWasOpen = typeMenu.matches(':popover-open'); });
            types.addEventListener('click', function (e) { e.stopPropagation(); var closing = pointerWasOpen || typeMenu.matches(':popover-open'); pointerWasOpen = false; if (closing) closeTypes(true); else openTypes(); });
            types.addEventListener('keydown', function (e) {
                if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].indexOf(e.key) !== -1) { e.preventDefault(); e.stopPropagation(); openTypes(); }
            });
            typeMenu.addEventListener('toggle', function () {
                var open = typeMenu.matches(':popover-open');
                types.setAttribute('aria-expanded', String(open));
                window[open ? 'addEventListener' : 'removeEventListener']('scroll', positionTypes, true);
                window[open ? 'addEventListener' : 'removeEventListener']('resize', positionTypes);
            });
            typeMenu.addEventListener('keydown', function (e) {
                e.stopPropagation();
                var items = Array.from(typeMenu.children), index = items.indexOf(document.activeElement);
                if (e.key === 'Escape') { e.preventDefault(); closeTypes(true); }
                else if (e.key === 'Tab') closeTypes(false);
                else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(e.key) !== -1) {
                    e.preventDefault(); items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
                }
            });
        }
        choices.forEach(function (entry) {
            var item = document.createElement('button'); item.textContent = entry[1]; item.dataset.addKind = entry[0]; item.type = 'button';
            item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(kind === entry[0])); item.tabIndex = -1;
            item.addEventListener('click', function (e) { e.stopPropagation(); closeTypes(false); chooseKind(entry[0]); });
            typeMenu.appendChild(item);
        });
        function submit() {
            var value = input.value.trim();
            if (!value) return;
            if (kind === 'group') {
                if (groups.some(function (group) { return group.name.toLowerCase() === value.toLowerCase(); })) { input.setCustomValidity('A group with this name already exists.'); input.reportValidity(); return; }
                groups.push({ id: crypto.randomUUID(), name: value.slice(0, MAX_PHRASE), enabled: true, collapsed: false }); save();
            } else if (kind === 'dependency') {
                var id = /^\d+$/.test(value) ? value : null;
                if (!id) try {
                    var url = new URL(value);
                    if (/^(?:https?:)$/.test(url.protocol) && /^(?:www\.)?steamcommunity\.com$/.test(url.hostname) && /^\/(?:sharedfiles|workshop)\/filedetails(?:\/(?:\d+)?)?$/.test(url.pathname)) {
                        id = url.searchParams.get('id') || /\/(\d+)$/.exec(url.pathname)?.[1];
                    }
                } catch (_) {}
                if (!/^\d+$/.test(id || '')) { input.setCustomValidity('Enter a Steam Workshop item link or numeric ID.'); input.reportValidity(); return; }
                setFilter('dependency', id, id, -1); window.WSHSDependencies.request([id]);
            } else {
                var phrase = cleanPhrase(value); if (!phrase) return;
                setFilter('keyword', phrase, phrase, -1);
            }
            input.value = ''; drafts[kind] = ''; input.setCustomValidity('');
        }
        input.addEventListener('input', function () { input.setCustomValidity(''); });
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
        container.className = 'wshs-add-composer';
        container.append(types, row, panel);
        if (typeMenu) container.appendChild(typeMenu);
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
        if (collectionPage) return el.closest('.collectionItem, .wshs-design-author-row');
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
        pickerViewKey = null;
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
        var viewKey = [state, pendingAction ? pendingAction.state : '', titleSelectionEnabled, pickerHelpOpen, collectionPage].join('|');
        if (pickerViewKey === viewKey && picker.firstChild) return;
        pickerViewKey = viewKey;
        collectionSizeDirty = true;
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
        target.lastRect = rect;
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
        var cachedRow = collectionPosition && collectionPosition.target === target && collectionPosition.row;
        var row = cachedRow && cachedRow.isConnected && cachedRow.contains(target.anchor) ? cachedRow : target.anchor.closest('.collectionItem, .wshs-design-author-row');
        if (!row || (row.matches('.wshs-filtered, .hidden-item, .wshs-ratings-filtered') && !row.classList.contains('wshs-review-match'))) { hidePicker(); return; }
        var rebind = !collectionPosition || collectionPosition.target !== target || collectionPosition.row !== row || collectionPosition.parent !== row.parentElement;
        if (rebind) {
            collectionPosition = { target: target, row: row, parent: row.parentElement };
            collectionSizeDirty = true;
        }
        var prepared = collectionPosition;
        var bounds = row.getBoundingClientRect();
        if (collectionSizeDirty || prepared.rowWidth !== bounds.width) {
            collectionSizeDirty = false;
            prepared.rowWidth = bounds.width;
            if (!picker.classList.contains('wshs-collection-picker')) picker.classList.add('wshs-collection-picker');
            setPickerProperty(picker, '--wshs-inline-size', Math.min(14, parseFloat(getComputedStyle(target.anchor).fontSize)) + 'px');
            var title = target.kind === 'keyword' && !pendingAction;
            if (picker.classList.contains('wshs-picker-title') !== title) picker.classList.toggle('wshs-picker-title', title);
            setPickerProperty(picker, 'max-width', Math.max(0, bounds.width - 16) + 'px');
            prepared.box = picker.getBoundingClientRect();
            var authorRow = target.kind === 'author' && !pendingAction && target.anchor.parentElement;
            if (pickerAuthorRow && pickerAuthorRow !== authorRow) releasePickerRow();
            if (authorRow) {
                setPickerProperty(authorRow, '--wshs-picker-width', prepared.box.width + 'px');
                if (!authorRow.classList.contains('wshs-collection-author-active')) authorRow.classList.add('wshs-collection-author-active');
                pickerAuthorRow = authorRow;
            }
            prepared.guide = picker.querySelector('.wshs-picker-guide');
            if (prepared.guide) {
                setPickerProperty(prepared.guide, 'width', Math.min(240, bounds.width - 16) + 'px');
                setPickerProperty(prepared.guide, 'top', (prepared.box.height + 6) + 'px');
            }
        }
        var rect = target.range ? target.range.getBoundingClientRect() : target.anchor.getBoundingClientRect();
        if (!rect.width && !rect.height) { hidePicker(); return; }
        // Inside the scrolling author list, hide the controls while their row is
        // scrolled out of view. Visibility only, so a pending confirmation survives.
        if (prepared.clip === undefined) prepared.clip = target.anchor.closest('.wshs-design-author-list');
        if (prepared.clip) {
            var clip = prepared.clip.getBoundingClientRect(), middle = rect.top + rect.height / 2;
            setPickerProperty(picker, 'visibility', middle < clip.top || middle > clip.bottom ? 'hidden' : '');
        }
        var box = prepared.box;
        var left = target.kind === 'author' ? rect.right + 4 : rect.left + (rect.width - box.width) / 2;
        var top = target.kind === 'author' ? rect.top + (rect.height - box.height) / 2 : rect.top - box.height - 4;
        if (pendingAction) { left = bounds.right - box.width - 8; top = bounds.bottom - box.height - 5; }
        left = Math.max(bounds.left + 4, Math.min(left, bounds.right - box.width - 4));
        setPickerProperty(picker, 'left', (left + scrollX) + 'px');
        setPickerProperty(picker, 'top', (top + scrollY) + 'px');
        var guide = prepared.guide;
        if (guide) {
            setPickerProperty(guide, 'left', Math.max(bounds.left + 8 - left, Math.min(-80, bounds.right - 248 - left)) + 'px');
        }
        if (rebind) watchCollectionPosition();
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

    // Workshop cards animate on hover, so the picker follows every frame while
    // its anchor moves. Once the anchor and picker have held still for
    // WORKSHOP_STILL_FRAMES frames, tracking sleeps until wakeWorkshopPosition.
    var WORKSHOP_STILL_FRAMES = 20;
    var workshopStillFrames = 0, workshopPickerSignature = '';
    function workshopPickerMoving() {
        if (!pickerTarget || !picker || picker.style.display === 'none') return false;
        // Reuse positionPicker's measurement: reading geometry (or scrollX/Y)
        // after its style writes would force another layout every frame. The
        // picker's left/top already include the scroll offset.
        var rect = pickerTarget.lastRect;
        if (!rect) return true;
        var signature = [rect.left, rect.top, rect.width, rect.height, picker.style.left, picker.style.top].join('|');
        workshopStillFrames = signature === workshopPickerSignature ? workshopStillFrames + 1 : 0;
        workshopPickerSignature = signature;
        return workshopStillFrames < WORKSHOP_STILL_FRAMES;
    }

    function wakeWorkshopPosition() {
        if (collectionPage || !pickerTarget || pickerTarget.quickView || !picker || picker.style.display === 'none') return;
        workshopStillFrames = 0;
        if (pickerPositionFrame === null) pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
    }

    function trackPickerPosition() {
        pickerPositionFrame = null;
        positionPicker();
        var moving = pickerTarget?.quickView || (!collectionPage && workshopPickerMoving());
        if (collectionPage && pickerTarget && !pickerTarget.quickView) {
            if (collectionMotionDirty && collectionPosition) {
                collectionMotionDirty = false;
                var row = collectionPosition.row;
                collectionAnimations = row.getAnimations({subtree:true});
                // Ancestor transforms also move the anchor. Discover animations
                // on wakes, then inspect their cheap state while tracking frames.
                for (var ancestor = row.parentElement; ancestor; ancestor = ancestor.parentElement) {
                    collectionAnimations.push.apply(collectionAnimations, ancestor.getAnimations());
                }
            }
            moving = collectionAnimations.some(function (animation) { return animation.playState === 'running' || animation.pending; });
        }
        // Stationary collection and Workshop controls sleep. Real transitions
        // keep frame tracking; scroll/resize/motion events wake it again.
        if (pickerTarget && picker && picker.style.display !== 'none' && moving && pickerPositionFrame === null) {
            pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
        }
    }

    function wakeCollectionPosition(event) {
        if (!collectionPage || !pickerTarget || !picker || picker.style.display === 'none') return;
        if (event && (event.type === 'resize' || event.type === 'loadingdone')) collectionSizeDirty = true;
        if (event && /^(transition|animation)/.test(event.type)) {
            var row = collectionPosition && collectionPosition.row;
            if (!row || !(row.contains(event.target) || event.target.contains(row))) return;
            collectionMotionDirty = true;
        }
        // Classic collection rows are stationary between interactions. Track
        // short hover/layout transitions, then sleep until something changes.
        if (pickerPositionFrame === null) pickerPositionFrame = requestAnimationFrame(trackPickerPosition);
    }

    function watchCollectionPosition() {
        if (!collectionPage || !pickerTarget) return;
        collectionMotionDirty = true;
        if (!collectionPositionResize) collectionPositionResize = new ResizeObserver(function () { collectionSizeDirty = true; wakeCollectionPosition(); });
        collectionPositionResize.disconnect();
        [document.body, collectionPosition?.row, pickerTarget.anchor, picker].forEach(function (node) { if (node) collectionPositionResize.observe(node); });
        if (!collectionPositionMutation) collectionPositionMutation = new MutationObserver(function () {
            collectionSizeDirty = true;
            collectionMotionDirty = true;
            wakeCollectionPosition();
        });
        collectionPositionMutation.disconnect();
        var row = collectionPosition?.row;
        if (row) {
            collectionPositionMutation.observe(row, { attributes: true, attributeFilter: ['class', 'style', 'href'], childList: true, characterData: true, subtree: true });
            for (var ancestor = row.parentElement; ancestor; ancestor = ancestor.parentElement) {
                collectionPositionMutation.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style'], childList: true });
            }
        }
        wakeCollectionPosition();
    }

    function setPickerProperty(element, property, value) {
        var previous = element.style.getPropertyValue(property);
        // CSSOM rounds serialized pixel values. Comparing the raw geometry
        // string would rewrite the same fractional position on every wake.
        if (previous === value || previous.endsWith('px') && value.endsWith('px') && Math.abs(parseFloat(previous) - parseFloat(value)) < 0.01) return;
        element.style.setProperty(property, value);
    }

    function showPicker(target) {
        if (pendingAction) return;
        if (pickerTarget && pickerTarget.pinned && titleSelectionEnabled && target.kind === 'author') return;
        clearTimeout(pickerHideTimer);
        if (target.kind === 'author' && pickerTarget && pickerTarget.kind === 'author' &&
            pickerTarget.anchor === target.anchor && pickerTarget.value === target.value &&
            picker && picker.style.display !== 'none') {
            positionPicker();
            wakeWorkshopPosition();
            return;
        }
        pickerClosing = false;
        pickerHelpOpen = false;
        pickerTarget = target;
        collectionPosition = null;
        collectionSizeDirty = true;
        if (picker) picker.dataset.word = target.pinned ? target.value : '';
        target.href = target.anchor.getAttribute('href');
        target.text = target.anchor.textContent;
        if (target.quickView) target.itemHref = target.quickView.title.getAttribute('href');
        var el = ensurePicker(target.quickView ? target.quickView.dialog : document.body);
        el.dataset.word = target.pinned ? target.value : '';
        el.style.display = 'flex';
        if (el.style.visibility) el.style.removeProperty('visibility');
        highlightWord('wshs-selected-word', target.pinned ? target.range : null);
        renderPicker();
        positionPicker();
        watchCollectionPosition();
        workshopStillFrames = 0;
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
        collectionPosition = null;
        collectionAnimations = [];
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
        var renamed = false;
        filters.forEach(function (f) {
            if (f.kind !== 'dependency' || f.label !== f.value) return;
            var title = window.WSHSDependencies.title(f.value);
            if (title) { f.label = title; renamed = true; }
        });
        if (renamed) save();
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
        wakeWorkshopPosition();
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

    var filterDataSelector = ITEM_LINK + ',' + AUTHOR_LINK + ',' + PREVIEW + ',.collectionItem,.subscribeCollection,.collectionChildren';
    var nativeControlSelector = 'input,select,form,[role="combobox"],[role="button"],button,h2,h3';
    function relevantFilterNode(node) {
        if (node.nodeType !== 1) return false;
        if (node.closest('#workshop_item_hover,#global_hover,[popover],.wshs-picker,.wshs-folder-menu')) return false;
        var selector = filterDataSelector + ',' + nativeControlSelector + ',dialog';
        return node.matches(selector) || Array.from(node.querySelectorAll(selector)).some(function (match) {
            return !match.closest('#workshop_item_hover,#global_hover,[popover],.wshs-picker,.wshs-folder-menu');
        });
    }

    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var target = mutations[i].target;
            var el = target.nodeType === 1 ? target : target.parentElement;
            if (el && el.closest('#workshop_item_hover, #global_hover, [popover], .wshs-saved-filters, .wshs-folder-menu, .wshs-picker, .wshs-injected-controls, .wshs-collection-summary, .wshs-collection-sizes, .wshs-design-counts, .wshs-design-row-meta, .wshs-design-subscribe-label')) continue;
            if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
                // React owns card className and can overwrite our flags. Compare
                // the final batch state so geometry's synchronous unhide/restore
                // does not start an observer feedback loop.
                var expected = cardFilterState.get(el);
                if (expected && el.isConnected && (el.classList.contains('wshs-filtered') !== expected.hidden ||
                    el.classList.contains('wshs-review-match') !== expected.match || el.classList.contains('wshs-review-omit') !== expected.omit)) scheduleTick();
                continue;
            }
            var dataTarget = el && el.closest(ITEM_LINK + ',' + AUTHOR_LINK + ',.workshopItemTitle,.workshopItemAuthor,.workshopItemShortDesc');
            var nativeTarget = el && (el.closest('form') || anchor && anchor.section.contains(el));
            if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'open' && el.matches('dialog[open]')) { scheduleTick(); return; }
            if (mutations[i].type === 'characterData') {
                if (dataTarget || nativeTarget) { scheduleTick(); return; }
                continue;
            }
            if (mutations[i].type === 'attributes' && el && (el.matches(ITEM_LINK + ',' + AUTHOR_LINK + ',#CommunityTemplate') || el.closest('.collectionItem'))) {
                scheduleTick(); return;
            }
            if ((mutations[i].addedNodes.length || mutations[i].removedNodes.length) &&
                (dataTarget || nativeTarget || Array.from(mutations[i].addedNodes).concat(Array.from(mutations[i].removedNodes)).some(relevantFilterNode))) {
                lastPageMutationAt = Date.now();
                scheduleTick();
                return;
            }
        }
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'id', 'class', 'open'] });

    new MutationObserver(scheduleTick).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-wshs-page-hydrated']
    });
    window.addEventListener('resize', scheduleTick);
    window.addEventListener('wshs-collection-search', scheduleTick);
    window.addEventListener('wshs-appearance-ready', scheduleTick);
    if (collectionPage) {
        document.addEventListener('scroll', wakeCollectionPosition, { passive: true, capture: true });
        document.addEventListener('transitionrun', wakeCollectionPosition, true);
        document.addEventListener('transitionend', wakeCollectionPosition, true);
        document.addEventListener('transitioncancel', wakeCollectionPosition, true);
        document.addEventListener('animationstart', wakeCollectionPosition, true);
        document.addEventListener('animationend', wakeCollectionPosition, true);
        document.addEventListener('animationcancel', wakeCollectionPosition, true);
        document.addEventListener('load', wakeCollectionPosition, true);
        window.addEventListener('resize', wakeCollectionPosition);
        document.fonts.addEventListener('loadingdone', wakeCollectionPosition);
    } else {
        ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'load', 'mousemove'].forEach(function (type) {
            document.addEventListener(type, wakeWorkshopPosition, true);
        });
        document.addEventListener('scroll', wakeWorkshopPosition, { passive: true, capture: true });
        window.addEventListener('resize', wakeWorkshopPosition);
        document.fonts.addEventListener('loadingdone', wakeWorkshopPosition);
    }
    window.WSHSDescriptions.onChange(scheduleTick);
    window.WSHSDependencies.onChange(scheduleTick);
    document.fonts.addEventListener('loadingdone', scheduleTick);
    scheduleTick();
})();
