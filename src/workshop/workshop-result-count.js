// Steam owns the cross-page total. Report the actual loaded-page visibility
// alongside it; subtracting page exclusions from the global total is misleading.
(function () {
    'use strict';
    if (!/\/workshop\/browse\/?$/.test(location.pathname)) return;
    var summary = null, anchor = null, frame = null, minimumRatings = 0;
    var states = new WeakMap(), reviewState = false;
    var flags = ['hidden-item', 'wshs-filtered', 'wshs-ratings-filtered', 'wshs-review-match', 'wshs-review-omit'];
    function signature(node) { return flags.map(function (name) { return node.classList.contains(name) ? '1' : '0'; }).join(''); }
    function findCount() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return null;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), text;
        while ((text = walker.nextNode())) {
            if (/^\s*[\d,.\s]+ entries matching filters\s*$/.test(text.nodeValue)) return text.parentElement;
        }
        return null;
    }
    function update() {
        frame = null;
        // The summary can arrive in streamed HTML before the sort row exists
        // and before the MAIN-world hook has written its first readiness flag.
        // An absent flag is not permission to insert into React's SSR tree.
        // The saved-filter section also proves its bounded fallback gate passed.
        if (!window.WSHSDom || (document.documentElement.getAttribute('data-wshs-page-hydrated') !== '1' && !document.querySelector('#CommunityTemplate .wshs-saved-filters'))) return;
        if (!anchor || !anchor.isConnected) anchor = findCount();
        if (!anchor) { if (summary) summary.remove(); return; }
        if (!summary) {
            summary = document.createElement('span'); summary.className = 'wshs-page-result-count';
            summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite');
            summary.title = 'Steam’s total covers all result pages. Extension filters evaluate the mods loaded on this page.';
        }
        if (summary.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', summary);
        var cards = window.WSHSDom.enumerateCards(), visible = 0, unknown = 0;
        cards.forEach(function (card) {
            states.set(card.root, signature(card.root));
            if (card.root.getClientRects().length && getComputedStyle(card.root).visibility !== 'hidden') visible++;
            var metadata = minimumRatings && window.WSHSMetadata && window.WSHSMetadata.get(card.id);
            if (minimumRatings && !(metadata && Number.isSafeInteger(metadata.ratings))) unknown++;
        });
        var inspection = document.documentElement.classList.contains('wshs-reviewing');
        reviewState = inspection;
        var message = inspection ? 'Inspecting ' + visible + ' excluded mods on this page' : visible + ' of ' + cards.length + ' shown on this page';
        if (!inspection && unknown) message += ' · ' + unknown + ' rating counts unverified';
        // Edit the text node's data: replacing it makes Chrome recheck Steam's
        // :root:has() rules across the whole page.
        if (summary.firstChild && summary.firstChild.nodeType === 3 && !summary.firstChild.nextSibling) { if (summary.firstChild.nodeValue !== message) summary.firstChild.nodeValue = message; }
        else if (summary.textContent !== message) summary.textContent = message;
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(update); }
    var resultSelector = 'a[href*="sharedfiles/filedetails/?id="],.aspectratio_16x9,.aspectratio_square,#CommunityTemplate,.wshs-saved-filters';
    function relevantNode(node) {
        if (node.nodeType === 3) return /[\d,.]+ entries matching filters/.test(node.nodeValue);
        var ignored = 'dialog,[role="dialog"],[popover],#workshop_item_hover,#global_hover,.wshs-picker,.wshs-folder-menu';
        if (node.nodeType !== 1 || node.closest(ignored)) return false;
        if (node.matches(resultSelector) || Array.from(node.querySelectorAll(resultSelector)).some(function (match) { return !match.closest(ignored); })) return true;
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), text;
        while ((text = walker.nextNode())) {
            if (!text.parentElement.closest(ignored) && /[\d,.]+ entries matching filters/.test(text.nodeValue)) return true;
        }
        return false;
    }
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i], node = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
            if (!node || node.closest('dialog,[role="dialog"],[popover],#workshop_item_hover,#global_hover,.wshs-picker,.wshs-page-result-count,.wshs-folder-menu')) continue;
            if (mutation.type === 'attributes') {
                if (node === document.documentElement && (mutation.attributeName === 'data-wshs-page-hydrated' || reviewState !== node.classList.contains('wshs-reviewing')) ||
                    states.has(node) && states.get(node) !== signature(node) || mutation.attributeName === 'href' && node.matches('a[href*="sharedfiles/filedetails/?id="]')) { schedule(); return; }
            } else if (anchor && (!anchor.isConnected || anchor.contains(node)) ||
                mutation.type === 'characterData' && /[\d,.]+ entries matching filters/.test(node.textContent) ||
                mutation.type === 'childList' && Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some(relevantNode)) { schedule(); return; }
        }
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'href', 'data-wshs-page-hydrated'] });
    chrome.storage.local.get(['minimumRatings']).then(function (data) { minimumRatings = Number(data.minimumRatings) || 0; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'local' && changes.minimumRatings) { minimumRatings = Number(changes.minimumRatings.newValue) || 0; schedule(); } });
    if (window.WSHSMetadata) window.WSHSMetadata.onChange(schedule);
    window.addEventListener('wshs-appearance-ready', schedule);
    schedule();
})();
