(function () {
    'use strict';
    var pin = document.getElementById('pinned-sidebar');
    var collectionPin = document.getElementById('pinned-collections');
    var workshopPin = document.getElementById('pinned-workshop-bar');
    var positions = document.querySelectorAll('input[name="position"]');
    var motion = document.getElementById('reduce-motion');
    var hover = document.getElementById('disable-card-hover');
    var carousels = document.getElementById('pause-home-carousels');
    var previews = document.getElementById('freeze-animated-previews');
    var overhaul = document.getElementById('collection-overhaul');
    var keys = ['pinnedSidebar', 'pinnedWorkshopBar', 'pinnedCollections', 'sidebarPosition', 'layoutDensity', 'reduceMotion', 'disableCardHover', 'pauseHomepageCarousels', 'freezeAnimatedPreviews', 'collectionOverhaul'];
    var preferences = {};
    function render(data) {
        pin.checked = data.pinnedSidebar === true;
        collectionPin.checked = data.pinnedCollections === true;
        workshopPin.checked = data.pinnedWorkshopBar === true;
        document.getElementById(data.sidebarPosition === 'right' ? 'position-right' : 'position-left').checked = true;
        document.getElementById(data.layoutDensity === 'compact' ? 'density-compact' : 'density-comfortable').checked = true;
        motion.checked = data.reduceMotion === true;
        hover.checked = data.disableCardHover !== false;
        carousels.checked = data.pauseHomepageCarousels !== false;
        previews.checked = data.freezeAnimatedPreviews !== false;
        overhaul.checked = data.collectionOverhaul !== false;
        document.getElementById('motion-settings').disabled = !motion.checked;
    }
    async function save(update) {
        try { await chrome.storage.local.set(update); document.getElementById('status').textContent = 'Preferences save automatically.'; }
        catch (_) { document.getElementById('status').textContent = 'Could not save preferences. Try again.'; }
    }
    chrome.storage.local.get(keys).then(function (data) {
        preferences = data; render(data); pin.disabled = false; collectionPin.disabled = false; workshopPin.disabled = false; motion.disabled = false; overhaul.disabled = false;
        document.getElementById('position-settings').disabled = false; document.getElementById('density-settings').disabled = false;
    });
    pin.addEventListener('change', function () { save({ pinnedSidebar: pin.checked }); });
    collectionPin.addEventListener('change', function () { save({ pinnedCollections: collectionPin.checked }); });
    workshopPin.addEventListener('change', function () { save({ pinnedWorkshopBar: workshopPin.checked }); });
    positions.forEach(function (position) { position.addEventListener('change', function () { if (position.checked) save({ sidebarPosition: position.value }); }); });
    document.querySelectorAll('input[name="density"]').forEach(function (input) { input.addEventListener('change', function () { if (input.checked) save({ layoutDensity: input.value }); }); });
    motion.addEventListener('change', function () { document.getElementById('motion-settings').disabled = !motion.checked; save({ reduceMotion: motion.checked }); });
    hover.addEventListener('change', function () { save({ disableCardHover: hover.checked }); });
    carousels.addEventListener('change', function () { save({ pauseHomepageCarousels: carousels.checked }); });
    previews.addEventListener('change', function () { save({ freezeAnimatedPreviews: previews.checked }); });
    overhaul.addEventListener('change', function () { save({ collectionOverhaul: overhaul.checked }); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        keys.forEach(function (key) { if (changes[key]) preferences[key] = changes[key].newValue; });
        render(preferences);
    });
})();
