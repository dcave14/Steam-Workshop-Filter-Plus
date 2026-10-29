// Classic collection toolbar: native actions above three matching filters.
// CSS owns both rows, so labels and filter results cannot change their widths.
(function () {
    'use strict';
    function sync() {
        var wrapper = document.querySelector('.wshs-collection-controls');
        var bar = wrapper && wrapper.closest('.subscribeCollection');
        if (!bar || !wrapper.querySelector('.ratings-filter-button')) return;
        if (bar.classList.contains('wshs-six-controls')) return;
        bar.classList.add('wshs-six-controls');
        wrapper.classList.remove('wshs-row-aligned');
        wrapper.style.removeProperty('--wshs-row-w');
        wrapper.style.removeProperty('--wshs-seam-w');
        bar.querySelectorAll(':scope > .general_btn').forEach(function (button) {
            button.style.removeProperty('width');
            button.style.removeProperty('margin-right');
        });
    }
    new MutationObserver(sync).observe(document, { childList: true, subtree: true });
    sync();
})();
