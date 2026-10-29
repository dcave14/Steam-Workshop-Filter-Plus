// Freeze only Workshop preview imagery. Canvas can display a cross-origin image
// without reading/exporting its pixels, so no CDN permission or extra fetch is needed.
(function () {
    'use strict';
    var preferences = {}, frame = null, frozen = new Map(), parents = new Set();
    var selector = '#CommunityTemplate .aspectratio_16x9 img, #CommunityTemplate .aspectratio_square img, .collectionItem .workshopItemPreviewImage';
    var resize = new ResizeObserver(schedule);
    function restore(img, state) {
        state.canvas.remove(); img.classList.remove('wshs-frozen-preview');
        resize.unobserve(img); frozen.delete(img);
    }
    function sync() {
        frame = null;
        // Adding canvas nodes before React attaches can invalidate Steam's SSR.
        if (document.getElementById('CommunityTemplate') && document.documentElement.getAttribute('data-wshs-page-hydrated') !== '1' && document.documentElement.getAttribute('data-wshs-previews-ready') !== '1') return;
        var enabled = preferences.reduceMotion === true && preferences.freezeAnimatedPreviews !== false;
        var images = new Set(enabled ? document.querySelectorAll(selector) : []), desiredParents = new Set();
        frozen.forEach(function (state, img) {
            if (!images.has(img) || !state.canvas.isConnected || state.canvas.parentElement !== img.parentElement || state.source !== (img.currentSrc || img.src) || !img.complete || !img.naturalWidth) restore(img, state);
        });
        // Reads and writes run in separate passes. Interleaving them forced a
        // style recalc per preview, and each canvas insertion makes Chrome
        // recheck Steam's :root:has() rules across the whole page (~60ms on
        // large collections), so freezing 14 previews cost about a second.
        var ready = [];
        images.forEach(function (img) {
            if (!img.complete || !img.naturalWidth || !img.offsetWidth || !img.offsetHeight) return;
            var parent = img.parentElement;
            ready.push({ img: img, parent: parent, staticParent: getComputedStyle(parent).position === 'static', width: img.offsetWidth, height: img.offsetHeight });
        });
        ready = ready.filter(function (item) {
            var img = item.img, parent = item.parent, state = frozen.get(img);
            if (item.staticParent) { parent.classList.add('wshs-still-parent'); parents.add(parent); }
            desiredParents.add(parent);
            if (!state) {
                var canvas = document.createElement('canvas'); canvas.className = 'wshs-still-preview';
                canvas.setAttribute('aria-hidden', 'true');
                var bound = Math.min(1024, Math.max(item.width, item.height) * Math.min(devicePixelRatio || 1, 2));
                var scale = Math.min(1, bound / Math.max(img.naturalWidth, img.naturalHeight));
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                try { canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); }
                catch (_) { return false; } // An unavailable frame keeps the original preview visible.
                parent.appendChild(canvas);
                state = { canvas: canvas, source: img.currentSrc || img.src }; frozen.set(img, state); resize.observe(img);
            }
            if (!img.classList.contains('wshs-frozen-preview')) img.classList.add('wshs-frozen-preview');
            item.state = state;
            return true;
        });
        // Offsets are read after the parent becomes the canvas's containing block.
        ready.forEach(function (item) {
            var img = item.img, style = getComputedStyle(img);
            item.box = [img.offsetLeft + 'px', img.offsetTop + 'px', img.offsetWidth + 'px', img.offsetHeight + 'px', style.objectFit, style.objectPosition, style.borderRadius];
        });
        ready.forEach(function (item) {
            // Keep the original image in layout, and its link/alt text intact.
            var canvasStyle = item.state.canvas.style, box = item.box;
            ['left', 'top', 'width', 'height', 'objectFit', 'objectPosition', 'borderRadius'].forEach(function (key, i) {
                if (canvasStyle[key] !== box[i]) canvasStyle[key] = box[i];
            });
        });
        parents.forEach(function (parent) { if (!desiredParents.has(parent)) { parent.classList.remove('wshs-still-parent'); parents.delete(parent); } });
    }
    function schedule() { if (preferences.reduceMotion !== true && !frozen.size && !parents.size) return; if (frame === null) frame = requestAnimationFrame(sync); }
    chrome.storage.local.get(['reduceMotion', 'freezeAnimatedPreviews']).then(function (data) { preferences = data; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        ['reduceMotion', 'freezeAnimatedPreviews'].forEach(function (key) { if (changes[key]) preferences[key] = changes[key].newValue; }); schedule();
    });
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src', 'srcset', 'sizes', 'data-wshs-previews-ready', 'data-wshs-page-hydrated'] });
    document.addEventListener('load', function (event) { if (event.target.matches && event.target.matches(selector)) schedule(); }, true);
    document.addEventListener('error', schedule, true);
    window.addEventListener('resize', schedule); window.addEventListener('wshs-appearance-ready', schedule);
})();
