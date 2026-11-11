// sort-popover-fit.js
// Fits Steam's native sort popover (SORT ORDER / TIME FRAME) to the width of
// the native sort button on the new React browse layout.
//
// Find the sort popover when Steam mounts it, mark its
// fixed-position root with .wshs-sort-popover and give it the button's width
// as --wshs-sort-w. styles.css handles its columns or stacked layout.
//
// The popover is React-owned and uses hashed class names, so it is found
// structurally: a position:fixed ancestor of the "Sort Order" / "Time Frame"
// radiogroups. Only that one root node gets our class and custom property;
// every inner rule in styles.css is a structural child selector under it.
// Steam positions the popover with Floating UI (right-aligned to the button
// via transform), which re-measures the narrower box and re-aligns it.
//
// Narrow buttons use stacked sections at a readable font size. The popup keeps
// the same surface and native controls while its width or placement changes.

(function () {
    'use strict';
    if (!/\/workshop\/browse\/?$/.test(location.pathname)) return;

    var ROOT_CLASS = 'wshs-sort-popover';
    var frame = null, popover = null, button = null, discoveryDirty = true, buttonDirty = true;
    var buttonResize = new ResizeObserver(schedule);
    var inlineFont = '';
    var buttonFontObserver = new MutationObserver(function () {
        if (button && button.style.fontSize !== inlineFont) { inlineFont = button.style.fontSize; schedule(); }
    });

    function getSortButton() {
        return window.WSHSDom && window.WSHSDom.getSortButton ? window.WSHSDom.getSortButton() : null;
    }

    // Root = nearest position:fixed ancestor of a "sort"/"time" radiogroup.
    function findPopoverRoot() {
        var groups = document.querySelectorAll('[role="radiogroup"]');
        for (var i = 0; i < groups.length; i++) {
            var header = groups[i].previousElementSibling;
            var hint = header ? (header.textContent || '').toLowerCase() : '';
            if (hint.indexOf('sort') === -1 && hint.indexOf('time') === -1) continue;
            var node = groups[i].parentElement;
            while (node && node !== document.body) {
                if (window.getComputedStyle(node).position === 'fixed') return node;
                node = node.parentElement;
            }
        }
        return null;
    }

    function fit() {
        frame = null;
        if (discoveryDirty || (popover && !popover.isConnected)) {
            discoveryDirty = false;
            popover = findPopoverRoot();
            buttonDirty = true;
        }
        var root = popover;
        if (!root) return;
        if (buttonDirty || !button || !button.isConnected) {
            buttonDirty = false;
            var sort = getSortButton();
            var next = sort && sort.button;
            if (next !== button) {
                buttonResize.disconnect(); buttonFontObserver.disconnect();
                button = next;
                if (button) {
                    buttonResize.observe(button);
                    inlineFont = button.style.fontSize;
                    buttonFontObserver.observe(button, {attributes:true,attributeFilter:['style']});
                }
            }
        }
        var controls = document.querySelector('.wshs-new-layout-controls');
        var width = button ? Math.min(button.getBoundingClientRect().width, innerWidth - 16) : 0;
        if (!controls || width <= 0) {
            root.classList.remove(ROOT_CLASS);
            root.style.removeProperty('--wshs-sort-w');
            root.style.removeProperty('--wshs-sort-heading-size');
            root.style.removeProperty('--wshs-sort-option-size');
            root.style.removeProperty('--wshs-dropdown-button-font-size');
            root.removeAttribute('data-wshs-sort-layout');
            return;
        }
        var value = width + 'px';
        var layout = width >= 280 ? 'columns' : 'stacked';
        var headingSize = Math.min(11, parseFloat(getComputedStyle(button).fontSize) || 11);
        var optionSize = Math.min(10, headingSize - 1);
        if (root.style.getPropertyValue('--wshs-sort-w') !== value) root.style.setProperty('--wshs-sort-w', value);
        if (root.style.getPropertyValue('--wshs-sort-heading-size') !== headingSize + 'px') root.style.setProperty('--wshs-sort-heading-size', headingSize + 'px');
        if (root.style.getPropertyValue('--wshs-sort-option-size') !== optionSize + 'px') root.style.setProperty('--wshs-sort-option-size', optionSize + 'px');
        if (root.style.getPropertyValue('--wshs-dropdown-button-font-size') !== headingSize + 'px') root.style.setProperty('--wshs-dropdown-button-font-size', headingSize + 'px');
        if (root.getAttribute('data-wshs-sort-layout') !== layout) root.setAttribute('data-wshs-sort-layout', layout);
        if (!root.classList.contains(ROOT_CLASS)) root.classList.add(ROOT_CLASS);
    }

    function schedule() {
        if (frame === null) frame = requestAnimationFrame(fit);
    }

    if (typeof MutationObserver === 'function') {
        new MutationObserver(function (changes) {
            if (popover && !popover.isConnected) popover = null;
            for (var change of changes) {
                if (popover && popover.contains(change.target)) { schedule(); continue; }
                for (var node of Array.from(change.addedNodes).concat(Array.from(change.removedNodes))) {
                    if (node.nodeType !== 1 || node.closest('.wshs-injected-controls,dialog,#workshop_item_hover,#global_hover,.wshs-picker')) continue;
                    if (node.matches('[role="radiogroup"]') || node.querySelector('[role="radiogroup"]')) {
                        discoveryDirty = true; schedule();
                    }
                }
            }
        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('wshs-toolbar-geometry', schedule);
    // A result replacement can change the card columns and trigger size in the
    // same frame. Fit after the toolbar finishes rather than one paint later.
    window.addEventListener('wshs-toolbar-layout', function () {
        buttonDirty = true;
        if (!popover || !popover.isConnected) return;
        if (frame !== null) cancelAnimationFrame(frame);
        fit();
    });
})();

// Apply filters is Steam's mobile sidebar in a native popover. Fit that panel
// and its Special Filters choices without rebuilding any native controls.
(function () {
    'use strict';
    if (!/\/workshop\/browse\/?$/.test(location.pathname)) return;
    var menus = new Map(), frame = null;
    var resize = new ResizeObserver(schedule);
    var nativePositions = new WeakMap();
    function positionSignature(root) { return [root.style.transform,root.style.top,root.style.left,root.style.maxHeight].join('|'); }
    var positionChanges = new MutationObserver(function (changes) {
        for (var change of changes) {
            var signature = positionSignature(change.target);
            if (nativePositions.get(change.target) !== signature) { nativePositions.set(change.target,signature); schedule(); }
        }
    });
    function observePositions() {
        positionChanges.disconnect();
        menus.forEach(function (_,root) { nativePositions.set(root,positionSignature(root)); positionChanges.observe(root,{attributes:true,attributeFilter:['style']}); });
    }
    function fit(root, trigger) {
        if (!root.isConnected || !trigger.isConnected) { resize.unobserve(trigger); resize.unobserve(root); menus.delete(root); observePositions(); return; }
        var width = Math.min(trigger.getBoundingClientRect().width, innerWidth - 16) + 'px';
        var font = getComputedStyle(trigger).fontSize;
        if (root.style.getPropertyValue('--wshs-apply-width') !== width) root.style.setProperty('--wshs-apply-width', width);
        if (root.style.getPropertyValue('--wshs-dropdown-button-font-size') !== font) root.style.setProperty('--wshs-dropdown-button-font-size', font);
        if (root.matches(':popover-open')) {
            // Steam can retain a negative anchor after a header reflow. Keep
            // its transform and add only the bounded vertical correction.
            var previous = parseFloat(root.style.getPropertyValue('--wshs-apply-shift-y')) || 0;
            var bounds = root.getBoundingClientRect(), nativeTop = bounds.top - previous;
            var shift = Math.max(8,Math.min(nativeTop,innerHeight-bounds.height-8))-nativeTop;
            var value = Math.round(shift*64)/64+'px';
            if (root.style.getPropertyValue('--wshs-apply-shift-y') !== value) root.style.setProperty('--wshs-apply-shift-y',value);
        }
    }
    function schedule() {
        if (frame !== null) return;
        frame = requestAnimationFrame(function () { frame = null; menus.forEach(function (trigger, root) { fit(root, trigger); }); });
    }
    document.addEventListener('beforetoggle', function (event) {
        var root = event.target;
        if (!root.matches || !root.matches('[popover]')) return;
        if (event.newState !== 'open') {
            var previous = menus.get(root);
            if (previous) {
                resize.unobserve(previous); resize.unobserve(root); menus.delete(root); observePositions();
                root.classList.remove('wshs-apply-popover', 'wshs-apply-choice-popover');
                root.style.removeProperty('--wshs-apply-width'); root.style.removeProperty('--wshs-dropdown-button-font-size');
                root.style.removeProperty('--wshs-apply-shift-y');
            }
            return;
        }
        var trigger = null, className = '';
        if (root.querySelector('[role="combobox"]') && (document.activeElement?.closest('.wshs-apply-filters') || root.querySelector('svg[viewBox="0 0 14 14"]'))) {
            trigger = document.querySelector('.wshs-apply-filters'); className = 'wshs-apply-popover';
        } else if (root.matches('[role="listbox"]') || root.querySelector('[role="listbox"]')) {
            trigger = document.activeElement && document.activeElement.closest('.wshs-apply-popover [role="combobox"]');
            className = 'wshs-apply-choice-popover';
        }
        if (!trigger) return;
        root.classList.add(className); menus.set(root, trigger); resize.observe(trigger); resize.observe(root); observePositions(); fit(root, trigger); schedule();
    }, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('wshs-toolbar-layout', schedule);
})();
