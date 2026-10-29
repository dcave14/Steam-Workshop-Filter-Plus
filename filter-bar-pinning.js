// Keep the original controls and handlers; a placeholder preserves the page flow.
(function () {
    'use strict';
    var preferences = {}, frame = null, target = null, placeholder = null, sortWrapper = null;
    var collection = /\/sharedfiles\/filedetails\/?$/.test(location.pathname);
    var browse = /\/workshop\/browse\/?$/.test(location.pathname);
    if (!collection && !browse) return;
    var resize = new ResizeObserver(schedule);
    function enabled() { return collection ? preferences.pinnedCollections === true : preferences.pinnedWorkshopBar === true; }
    function clear() {
        if (target) {
            if (target.classList.contains('wshs-pinned-filter-bar')) target.classList.remove('wshs-pinned-filter-bar');
            target.style.removeProperty('--wshs-bar-left'); target.style.removeProperty('--wshs-bar-width');
            resize.unobserve(target);
        }
        if (placeholder) placeholder.remove();
        placeholder = null; target = null; sortWrapper = null;
    }
    function insertPlaceholder() {
        placeholder = document.createElement('div'); placeholder.className = 'wshs-filter-bar-placeholder'; placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.display = 'none';
        target.insertAdjacentElement('beforebegin', placeholder);
    }
    function sync() {
        frame = null;
        if (!enabled()) { clear(); return; }
        if (placeholder && target && placeholder.parentElement !== target.parentElement) clear();
        var next = target && target.isConnected && (collection ? target.querySelector('.wshs-collection-controls') : sortWrapper && sortWrapper.parentElement === target) ? target : null;
        var wrapper = sortWrapper;
        if (!next) {
            var sort = browse && window.WSHSDom && window.WSHSDom.getSortButton();
            wrapper = sort && sort.wrapper;
            next = collection ? document.querySelector('.subscribeCollection:has(.wshs-collection-controls)') : sort && sort.wrapper.parentElement;
        }
        if (!next) { clear(); return; }
        if (target !== next) { clear(); target = next; resize.observe(target); }
        sortWrapper = wrapper;
        // Steam's :root:has() accent rules rescan the whole document whenever
        // an element is inserted or removed (~60ms on large collections), so
        // the placeholder is inserted once, collapsed, and only toggled here.
        // Browse pages wait for hydration: a node inside React's tree before
        // then makes React report a hydration mismatch (#418).
        if (!placeholder && (collection || document.documentElement.getAttribute('data-wshs-page-hydrated') === '1')) insertPlaceholder();
        var pinned = target.classList.contains('wshs-pinned-filter-bar');
        var slot = pinned && placeholder && placeholder.style.display !== 'none' ? placeholder.getBoundingClientRect() : target.getBoundingClientRect();
        if (slot.top > 12) {
            if (pinned) target.classList.remove('wshs-pinned-filter-bar');
            if (placeholder && placeholder.style.display !== 'none') placeholder.style.display = 'none';
            return;
        }
        if (!placeholder) insertPlaceholder();
        if (placeholder.style.display === 'none') {
            var style = getComputedStyle(target);
            placeholder.style.margin = style.margin; placeholder.style.height = target.getBoundingClientRect().height + 'px';
            placeholder.style.display = '';
        }
        var rect = placeholder.getBoundingClientRect();
        var left = rect.left + 'px', width = rect.width + 'px';
        if (target.style.getPropertyValue('--wshs-bar-left') !== left) target.style.setProperty('--wshs-bar-left', left);
        if (target.style.getPropertyValue('--wshs-bar-width') !== width) target.style.setProperty('--wshs-bar-width', width);
        if (!pinned) target.classList.add('wshs-pinned-filter-bar');
        var height = target.getBoundingClientRect().height + 'px';
        if (placeholder.style.height !== height) placeholder.style.height = height;
    }
    function schedule() { if (enabled() && frame === null) frame = requestAnimationFrame(sync); }
    chrome.storage.local.get(['pinnedWorkshopBar','pinnedCollections']).then(function (data) { preferences=data; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var key = collection ? 'pinnedCollections' : 'pinnedWorkshopBar';
        if (!changes[key]) return;
        preferences[key] = changes[key].newValue;
        if (!enabled()) { if (frame !== null) cancelAnimationFrame(frame); frame = null; clear(); }
        else schedule();
    });
    new MutationObserver(function (changes) {
        if (!enabled()) return;
        if (target && !target.isConnected) { clear(); schedule(); return; }
        // Real in-flow siblings can move the slot without resizing the bar.
        // Ignore portal/UI churn, retaining a cached target for other changes.
        if (changes.some(function (change) {
            var ignored = 'dialog,[role="dialog"],[popover],#workshop_item_hover,#global_hover,.wshs-picker,.wshs-folder-menu,.wshs-filter-bar-placeholder';
            if (change.target.nodeType === 1 && change.target.closest(ignored)) return false;
            if (target) return Array.from(change.addedNodes).concat(Array.from(change.removedNodes)).some(function (node) {
                if (node.nodeType !== 1) return !!node.nodeValue.trim();
                if (node.matches(ignored)) return false;
                return !node.querySelector(ignored) || Array.from(node.querySelectorAll('*')).some(function (child) { return !child.closest(ignored); });
            });
            return Array.from(change.addedNodes).some(function (node) {
                return node.nodeType === 1 && !node.closest('dialog, #workshop_item_hover, #global_hover, .wshs-picker') &&
                    (node.matches('.subscribeCollection, .wshs-collection-controls, [role="button"], button') || node.querySelector('.subscribeCollection, .wshs-collection-controls, [role="button"], button'));
            });
        })) schedule();
    }).observe(document, {childList:true,subtree:true});
    window.addEventListener('scroll',schedule,{passive:true}); window.addEventListener('resize',schedule);
    window.addEventListener('wshs-toolbar-geometry',schedule);
})();
