// sort-popover-fit.js
// Fits Steam's native sort popover (SORT ORDER / TIME FRAME) to the width of
// the native sort button on the new React browse layout.
//
// Single responsibility: find the popover when Steam mounts it, mark its
// fixed-position root with .wshs-sort-popover and give it the button's width
// as --wshs-sort-w. styles.css does the rest (compact two-column layout).
//
// The popover is React-owned and uses hashed class names, so it is found
// structurally: a position:fixed ancestor of the "Sort Order" / "Time Frame"
// radiogroups. Only that one root node gets our class and custom property;
// every inner rule in styles.css is a structural child selector under it.
// Steam positions the popover with Floating UI (right-aligned to the button
// via transform), which re-measures the narrower box and re-aligns it.
//
// Runs only while our injected controls are on the page, i.e. when the sort
// button has been resized by content.js. The labels are 11px when the button
// is wide enough; on narrower card columns they scale down (--wshs-sort-fs)
// so both columns still fit on one line. Below MIN_FONT_PX Steam's own layout
// is kept.

(function () {
    'use strict';

    var ROOT_CLASS = 'wshs-sort-popover';
    // Fixed horizontal cost of the compact layout: 2 x 9px padding, 6px column
    // gap, 2 x (10px dot + 4px gap). The widest label pair ("Total Unique
    // Subscribers" + "Three Months") measures TEXT_AT_11 px at 11px.
    var FIXED_PX = 52;
    var TEXT_AT_11 = 198;
    var BASE_FONT_PX = 11;
    var MIN_FONT_PX = 9;

    var frame = null;

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
        var root = findPopoverRoot();
        if (!root) return;
        var sort = getSortButton();
        var controls = document.querySelector('.wshs-new-layout-controls');
        var width = sort && sort.button ? sort.button.getBoundingClientRect().width : 0;
        var fontPx = Math.min(BASE_FONT_PX,
            Math.floor(BASE_FONT_PX * (width - FIXED_PX) / TEXT_AT_11 * 10) / 10);
        if (!controls || !(fontPx >= MIN_FONT_PX)) {
            root.classList.remove(ROOT_CLASS);
            root.style.removeProperty('--wshs-sort-w');
            root.style.removeProperty('--wshs-sort-fs');
            return;
        }
        var value = width + 'px';
        var font = fontPx + 'px';
        if (root.classList.contains(ROOT_CLASS) && root.style.getPropertyValue('--wshs-sort-w') === value &&
            root.style.getPropertyValue('--wshs-sort-fs') === font) return;
        root.style.setProperty('--wshs-sort-w', value);
        root.style.setProperty('--wshs-sort-fs', font);
        root.classList.add(ROOT_CLASS);
    }

    function schedule() {
        if (frame === null) frame = requestAnimationFrame(fit);
    }

    if (typeof MutationObserver === 'function') {
        new MutationObserver(schedule).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
    window.addEventListener('resize', schedule);
})();
