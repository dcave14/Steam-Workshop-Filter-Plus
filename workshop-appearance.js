// Presentation only: native cards, links, filtering and browse callbacks stay intact.
(function () {
    'use strict';
    var browse = /\/workshop\/browse\/?$/.test(location.pathname);
    var home = /^\/app\/\d+\/workshop\/?$/.test(location.pathname) || /^\/workshop\/?$/.test(location.pathname);
    if (!browse && !home) return;
    var preferences = {}, frame = null, compactNodes = new Set(), grids = new Set(), motionCards = new Set(), carousels = new Map(), paused = new Map(), previousCollectionBrowse = null, previousCompact = null;
    var keys = ['layoutDensity', 'reduceMotion', 'disableCardHover', 'pauseHomepageCarousels'];
    var gridWidths = new WeakMap();
    var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(function (entries) {
        entries.forEach(function (entry) { if (gridWidths.get(entry.target) !== entry.contentRect.width) { gridWidths.set(entry.target, entry.contentRect.width); schedule(); } });
    }) : null;
    function mark(node, name) { if (!node.classList.contains(name)) node.classList.add(name); }
    function clearCompact(node) { node.classList.remove('wshs-compact-card', 'wshs-compact-title', 'wshs-compact-title-wrap', 'wshs-compact-details', 'wshs-compact-collection', 'wshs-collection-browse-card', 'wshs-collection-browse-title', 'wshs-collection-browse-title-wrap', 'wshs-collection-browse-details', 'wshs-collection-browse-heading', 'wshs-collection-browse-title-group', 'wshs-collection-browse-actions'); }
    function pauseAnimations(node, desired, tracksOnly) {
        if (typeof node.getAnimations !== 'function') return;
        node.getAnimations({ subtree: true }).forEach(function (animation) {
            var target = animation.effect && animation.effect.target;
            if (!target || !target.isConnected) return;
            if (tracksOnly && target !== node && target.querySelectorAll('a[href*="filedetails"]').length < 2) return;
            if (animation.playState !== 'running' && !paused.has(animation)) return;
            desired.add(animation);
            if (!paused.has(animation)) { paused.set(animation, target); animation.pause(); }
        });
    }
    function stopCarousel(node) {
        if (carousels.has(node)) return;
        var state = { left: node.scrollLeft, allowedUntil: 0 };
        var scope = node.parentElement;
        // Include the native previous/next buttons outside the scrolling track.
        for (var depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
            if (Array.prototype.some.call(scope.querySelectorAll('button,[role="button"]'), function (button) { return !node.contains(button) && ((!button.textContent.trim() && button.querySelector('svg')) || /next|previous/i.test(button.getAttribute('aria-label') || '')); })) break;
        }
        scope = scope || node;
        state.allow = function () { state.allowedUntil = performance.now() + 1000; };
        state.scroll = function () {
            if (performance.now() <= state.allowedUntil) state.left = node.scrollLeft;
            else if (Math.abs(node.scrollLeft - state.left) > .5) node.scrollLeft = state.left;
        };
        ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart'].forEach(function (event) { scope.addEventListener(event, state.allow, { capture: true, passive: true }); });
        node.addEventListener('scroll', state.scroll, { passive: true });
        node.classList.add('wshs-paused-carousel'); state.scope = scope; carousels.set(node, state);
    }
    function restoreCarousel(node, state) {
        ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart'].forEach(function (event) { state.scope.removeEventListener(event, state.allow, true); });
        node.removeEventListener('scroll', state.scroll); node.classList.remove('wshs-paused-carousel'); carousels.delete(node);
    }
    function sync() {
        frame = null;
        var cards = window.WSHSDom ? window.WSHSDom.enumerateCards() : [];
        var compact = browse && preferences.layoutDensity === 'compact';
        var collectionBrowse = browse && new URLSearchParams(location.search).get('section') === 'collections';
        if (previousCollectionBrowse !== collectionBrowse || previousCompact !== compact) {
            compactNodes.forEach(clearCompact); compactNodes.clear();
            grids.forEach(function (grid) { grid.classList.remove('wshs-compact-grid', 'wshs-collection-browse-grid'); });
        }
        previousCollectionBrowse = collectionBrowse; previousCompact = compact;
        var desiredCompact = new Set(), desiredGrids = new Set(), desiredCards = new Set(), desiredCarousels = new Set(), desiredAnimations = new Set();
        // Read each grid's display once, before any class writes; reading it
        // per card after the previous card's writes forced a style recalc each.
        var gridDisplay = new Map();
        if (compact || collectionBrowse) cards.forEach(function (card) {
            var grid = card.root.parentElement;
            if (grid && !gridDisplay.has(grid)) gridDisplay.set(grid, getComputedStyle(grid).display === 'grid');
        });
        if (compact || collectionBrowse) cards.forEach(function (card) {
            var grid = card.root.parentElement;
            if (!gridDisplay.get(grid)) return;
            if (!desiredGrids.has(grid)) {
                desiredGrids.add(grid);
                if (compact) mark(grid, 'wshs-compact-grid');
                if (collectionBrowse) mark(grid, 'wshs-collection-browse-grid');
                var gap = collectionBrowse && !compact ? 12 : 8;
                var maximum = collectionBrowse && !compact ? 5 : 6;
                var minimum = collectionBrowse ? (compact ? 216 : 260) + gap : 168;
                var columns = Math.max(1, Math.min(maximum, Math.floor((grid.getBoundingClientRect().width + gap) / minimum)));
                var value = String(columns);
                if (grid.style.getPropertyValue('--wshs-compact-columns') !== value) grid.style.setProperty('--wshs-compact-columns', value);
                if (!grids.has(grid) && resize) resize.observe(grid);
            }
            if (compact) mark(card.root, 'wshs-compact-card');
            desiredCompact.add(card.root);
            if (collectionBrowse) mark(card.root, 'wshs-collection-browse-card');
            var title = Array.prototype.find.call(card.root.querySelectorAll('a[href*="filedetails"]'), function (link) { return link.textContent.trim(); });
            if (title) {
                if (compact) mark(title, 'wshs-compact-title');
                desiredCompact.add(title);
                if (collectionBrowse) {
                    mark(title, 'wshs-collection-browse-title');
                    var preview = card.root.querySelector('.aspectratio_square,.aspectratio_16x9');
                    var details = preview && Array.prototype.find.call(card.root.children, function (child) { return child !== preview && child.contains(title); });
                    if (details) { mark(details, 'wshs-collection-browse-details'); desiredCompact.add(details); }
                    var glass = card.root.querySelector('.SVGIcon_MagnifyingGlass');
                    var quick = glass && glass.closest('[role="button"],button');
                    var actions = quick && quick.parentElement;
                    if (actions && actions.parentElement === details) { mark(actions, 'wshs-collection-browse-actions'); desiredCompact.add(actions); }
                    var group = title.parentElement.parentElement, heading = group.parentElement;
                    if (heading !== details && details && details.contains(heading)) {
                        mark(heading, 'wshs-collection-browse-heading'); desiredCompact.add(heading);
                        mark(group, 'wshs-collection-browse-title-group'); desiredCompact.add(group);
                    }
                    mark(title.parentElement, 'wshs-collection-browse-title-wrap'); desiredCompact.add(title.parentElement);
                } else if (title.parentElement !== card.root) {
                    mark(title.parentElement, 'wshs-compact-title-wrap'); desiredCompact.add(title.parentElement);
                    if (title.parentElement.parentElement !== card.root) { mark(title.parentElement.parentElement, 'wshs-compact-details'); desiredCompact.add(title.parentElement.parentElement); }
                }
            }
        });
        compactNodes.forEach(function (node) { if (!desiredCompact.has(node)) clearCompact(node); });
        grids.forEach(function (grid) { if (!desiredGrids.has(grid)) { grid.classList.remove('wshs-compact-grid', 'wshs-collection-browse-grid'); grid.style.removeProperty('--wshs-compact-columns'); if (resize) resize.unobserve(grid); } });
        compactNodes = desiredCompact; grids = desiredGrids;
        if (preferences.reduceMotion === true && preferences.disableCardHover !== false) cards.forEach(function (card) {
            desiredCards.add(card.root); mark(card.root, 'wshs-no-hover-motion'); pauseAnimations(card.root, desiredAnimations, false);
        });
        motionCards.forEach(function (node) { if (!desiredCards.has(node)) node.classList.remove('wshs-no-hover-motion'); }); motionCards = desiredCards;
        if (home && preferences.reduceMotion === true && preferences.pauseHomepageCarousels !== false) {
            var candidates = new Set(document.querySelectorAll('[data-wshs-home-carousel]'));
            cards.forEach(function (card) { for (var node = card.root.parentElement; node && node !== document.body; node = node.parentElement) candidates.add(node); });
            candidates.forEach(function (node) {
                if (node.closest('dialog,[role="dialog"]') || node.scrollWidth <= node.clientWidth + 1 || node.clientWidth < 100) return;
                var style = getComputedStyle(node);
                if (!['auto', 'scroll', 'hidden'].includes(style.overflowX) || node.querySelectorAll('a[href*="filedetails"]').length < 2) return;
                desiredCarousels.add(node); stopCarousel(node); pauseAnimations(node, desiredAnimations, true);
            });
        }
        carousels.forEach(function (state, node) { if (!desiredCarousels.has(node)) restoreCarousel(node, state); });
        paused.forEach(function (target, animation) {
            if (desiredAnimations.has(animation)) return;
            if (target.isConnected && animation.playState === 'paused') animation.play();
            paused.delete(animation);
        });
        window.dispatchEvent(new Event('wshs-appearance-ready'));
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(sync); }
    var ignoredUi = '.wshs-picker,.wshs-folder-menu,.wshs-saved-filters,[popover],#workshop_item_hover,#global_hover,dialog,[role="dialog"],[aria-modal="true"]';
    var resultSelector = 'a[href*="sharedfiles/filedetails/?id="],.aspectratio_16x9,.aspectratio_square';
    function changesBrowseResults(change) {
        var target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
        if (target && target.closest(ignoredUi)) return false;
        if (target && target.closest('a[href*="sharedfiles/filedetails/?id="]')) return true;
        for (var node of Array.from(change.addedNodes).concat(Array.from(change.removedNodes))) {
            if (node.nodeType !== 1 || node.closest(ignoredUi)) continue;
            if (node.matches(resultSelector)) return true;
            for (var match of node.querySelectorAll(resultSelector)) {
                if (!match.closest(ignoredUi)) return true;
            }
        }
        return false;
    }
    chrome.storage.local.get(keys).then(function (data) { preferences = data; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (!keys.some(function (key) { return !!changes[key]; })) return;
        keys.forEach(function (key) { if (changes[key]) preferences[key] = changes[key].newValue; }); schedule();
    });
    new MutationObserver(function (changes) {
        // On browse pages only result structure affects presentation. An author
        // picker or native hover must not walk all cards and publish a geometry
        // refresh through wshs-appearance-ready. Homepage carousel discovery keeps
        // its broader native-shell observation below.
        if (browse) { if (changes.some(changesBrowseResults)) schedule(); return; }
        if (changes.some(function (m) { return !m.target.parentElement?.closest('.wshs-picker,.wshs-folder-menu,.wshs-saved-filters,#workshop_item_hover,#global_hover') && !m.target.closest?.('.wshs-picker,.wshs-folder-menu,.wshs-saved-filters,#workshop_item_hover,#global_hover'); })) schedule();
    }).observe(document, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('animationstart', function () { if (preferences.reduceMotion === true) schedule(); }, true);
    document.addEventListener('pointerover', function () { if (home && preferences.reduceMotion === true && preferences.pauseHomepageCarousels !== false) schedule(); }, true);
    schedule();
})();
