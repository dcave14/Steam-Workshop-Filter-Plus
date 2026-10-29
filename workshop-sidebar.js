(function () {
    'use strict';
    if (!/\/workshop\/browse\/?$/.test(location.pathname)) return;
    var preferences = {}, frame = null, anchors = null, placeholder = null;
    var discoveryDirty = true, toolbarDirty = true;
    var ignoredUi = 'dialog, [role="dialog"], [aria-modal="true"], [popover], #workshop_item_hover, #global_hover, .wshs-picker';
    var root = document.documentElement;
    function setStyle(node, name, value) {
        if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
    }
    function setClass(node, name, enabled) {
        if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
    }
    function unpin() {
        if (placeholder) placeholder.remove(); placeholder = null;
        if (!anchors) return;
        setClass(anchors.pane, 'wshs-sidebar-pane', false); setClass(anchors.body, 'wshs-sidebar-body', false);
        setClass(anchors.search, 'wshs-search-fixed', false);
    }
    function clear() {
        unpin();
        if (anchors) {
            anchors.search.classList.remove('wshs-sidebar-search');
            Array.prototype.forEach.call(anchors.toolbar.children, function (child) { child.classList.remove('wshs-toolbar-empty'); });
        }
        anchors = null;
    }
    function discover() {
        var section = document.querySelector('.wshs-saved-filters');
        if (!section || section.classList.contains('wshs-collection-filters')) return null;
        var pane = section.parentElement, body = pane.parentElement;
        if (!Array.prototype.some.call(body.children, function (node) { return node !== pane && node.querySelector('.aspectratio_16x9, .aspectratio_square'); })) return null;
        var input = Array.prototype.find.call(document.querySelectorAll('#CommunityTemplate form input'), function (node) { return !node.closest('.wshs-saved-filters,dialog') && node.type !== 'hidden'; });
        var sort = window.WSHSDom && window.WSHSDom.getSortButton();
        if (!input || !sort) return null;
        var toolbar = input.form.parentElement;
        while (toolbar && !toolbar.contains(sort.button)) toolbar = toolbar.parentElement;
        if (!toolbar || toolbar === document.body) return null;
        var search = input.form;
        while (search.parentElement && search.parentElement !== toolbar) search = search.parentElement;
        return { pane: pane, body: body, toolbar: toolbar, search: search, section: section, input: input, sort: sort.button };
    }
    function anchorsValid() {
        return anchors && anchors.section.isConnected && anchors.input.isConnected && anchors.sort.isConnected &&
            anchors.section.parentElement === anchors.pane && anchors.pane.parentElement === anchors.body &&
            anchors.search.parentElement === anchors.toolbar && anchors.search.contains(anchors.input) && anchors.toolbar.contains(anchors.sort);
    }
    function prepareToolbar() {
        if (!toolbarDirty) return;
        toolbarDirty = false;
        // Structural preparation belongs to discovery/resize, never scrolling.
        // Read all children before applying decoration to avoid read/write loops.
        var entries = Array.prototype.map.call(anchors.toolbar.children, function (child) {
            return { node: child, empty: child !== anchors.search && child !== placeholder &&
                !child.querySelector('.hide-subscribed-button, svg[viewBox="0 0 32 18"]') &&
                !child.textContent.trim() && child.getBoundingClientRect().width < 1 };
        });
        entries.forEach(function (entry) { setClass(entry.node, 'wshs-toolbar-empty', entry.empty); });
    }
    function sync() {
        frame = null;
        var position = preferences.sidebarPosition === 'right' ? 'right' : 'left';
        if (root.getAttribute('data-wshs-sidebar-position') !== position) root.setAttribute('data-wshs-sidebar-position', position);
        if (window.innerWidth < 1000) { clear(); discoveryDirty = true; return; }
        if (discoveryDirty || (anchors && !anchorsValid())) {
            discoveryDirty = false;
            var next = discover();
            if (!next) { clear(); return; }
            if (!anchors || anchors.pane !== next.pane || anchors.body !== next.body || anchors.search !== next.search || anchors.toolbar !== next.toolbar) {
                clear(); toolbarDirty = true;
            }
            anchors = next;
            setClass(anchors.search, 'wshs-sidebar-search', true);
        }
        if (!anchors) return;
        prepareToolbar();
        var pane = anchors.pane.getBoundingClientRect(), body = anchors.body.getBoundingClientRect();
        if (!pane.width) { unpin(); return; }
        var toolbarStyle = getComputedStyle(anchors.toolbar);
        var nativeGap = parseFloat(toolbarStyle.columnGap) || 0;
        var sidebarGap = parseFloat(getComputedStyle(anchors.body).columnGap) || 0;
        var extraGap = Math.max(0, sidebarGap - nativeGap), right = pane.left > body.left + body.width / 2;
        var unusedWidth = parseFloat(toolbarStyle.getPropertyValue('--wshs-unused-grid-width')) || 0;
        var before = right ? extraGap + unusedWidth : 0, after = right ? 0 : extraGap;
        setStyle(anchors.search, '--wshs-search-width', pane.width + 'px');
        setStyle(anchors.search, '--wshs-search-before', before + 'px');
        setStyle(anchors.search, '--wshs-search-after', after + 'px');
        if (!preferences.pinnedSidebar) { unpin(); return; }
        setClass(anchors.pane, 'wshs-sidebar-pane', true); setClass(anchors.body, 'wshs-sidebar-body', true);
        if (!placeholder) {
            placeholder = document.createElement('div'); placeholder.className = 'wshs-search-placeholder'; placeholder.setAttribute('aria-hidden', 'true'); placeholder.hidden = true;
            anchors.search.insertAdjacentElement('afterend', placeholder);
        }
        var fixed = anchors.search.classList.contains('wshs-search-fixed');
        var searchBox = anchors.search.getBoundingClientRect();
        var slot = fixed ? placeholder.getBoundingClientRect() : searchBox;
        var height = searchBox.height;
        var toolbarHeight = anchors.toolbar.classList.contains('wshs-pinned-filter-bar') ? anchors.toolbar.getBoundingClientRect().height : 0;
        var shouldFix = slot.top <= 12;
        if (shouldFix) {
            setStyle(placeholder, 'width', pane.width + 'px'); setStyle(placeholder, 'height', height + 'px');
            setStyle(placeholder, 'margin-left', before + 'px'); setStyle(placeholder, 'margin-right', after + 'px');
            setStyle(anchors.search, '--wshs-search-left', pane.left + 'px');
        }
        setClass(anchors.search, 'wshs-search-fixed', shouldFix);
        if (placeholder.hidden !== !shouldFix) placeholder.hidden = !shouldFix;
        setStyle(anchors.pane, '--wshs-sidebar-top', (Math.max(height, toolbarHeight) + 24) + 'px');
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(sync); }
    function containsAnchorNode(node, selector) {
        if (node.nodeType !== 1 || node === placeholder || node.closest(ignoredUi)) return false;
        if (node.matches(selector)) return true;
        return Array.prototype.some.call(node.querySelectorAll(selector), function (match) { return !match.closest(ignoredUi); });
    }
    chrome.storage.local.get(['pinnedSidebar', 'sidebarPosition']).then(function (data) { preferences = data; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes.pinnedSidebar) preferences.pinnedSidebar = changes.pinnedSidebar.newValue === true;
        if (changes.sidebarPosition) preferences.sidebarPosition = changes.sidebarPosition.newValue;
        if (changes.pinnedSidebar || changes.sidebarPosition) schedule();
    });
    new MutationObserver(function (changes) {
        var relevant = '.wshs-saved-filters, form, input, svg[viewBox="0 0 32 18"], .aspectratio_16x9, .aspectratio_square';
        for (var change of changes) {
            if (anchors && !anchorsValid()) { discoveryDirty = true; schedule(); return; }
            var target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
            if (target && target.closest(ignoredUi)) continue;
            if (anchors && anchors.toolbar.contains(target)) { toolbarDirty = true; schedule(); }
            for (var node of Array.from(change.addedNodes).concat(Array.from(change.removedNodes))) {
                if (containsAnchorNode(node, relevant)) { discoveryDirty = true; schedule(); }
            }
        }
    }).observe(document, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', function () { toolbarDirty = true; schedule(); });
    window.addEventListener('wshs-toolbar-geometry', schedule);
})();
