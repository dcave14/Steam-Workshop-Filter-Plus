// content.js
let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let minimumRatings = 0;
let renderRatingsPreference = null;
let widthSync = null;
let widthSyncCleanup = null;
let fontsReadyHooked = false;
window.addEventListener('wshs-appearance-ready', () => { if (widthSync) widthSync(); });

// One uniform font F on all three controls (star, hide and the native sort
// label). 13px keeps the widest known label on one line at the logged-in card
// width W=262.5 with the 8px internal-gap floor (Iworst + 78 <= W).
const BUTTON_FONT_SIZE = '13px';

// Frozen fallback ink for the worst known label ("Most Popular (Three Months)"
// measures ~177.2px at F). Used only when the measuring probe fails entirely
// (Iworst==0), so geometry never falls back to live label text.
const IWORST_FALLBACK_ESTIMATE = 180;

// Frozen worst-case label set (Iworst is the max ink over this set at F, plus
// any sort options enumerated from the live dropdown). Known native options.
const SORT_OPTION_LABELS = [
    'Most Popular (Today)',
    'Most Popular (One Week)',
    'Most Popular (Three Months)',
    'Most Popular (Six Months)',
    'Most Popular (One Year)',
    'Most Popular (All Time)',
    'Most Subscribed (All Time)',
    'Top Rated All Time',
    'Most Recent',
    'Last Updated',
    'Total Unique Subscribers'
];

// Our own label states: star filter (default + 1+..5+) and hide toggle.
const OWN_LABEL_STATES = [
    'Star Rating',
    '1+ Stars',
    '2+ Stars',
    '3+ Stars',
    '4+ Stars',
    '5+ Stars',
    'Hide Subscribed',
    'Showing New Items'
];

// Iworst is frozen per page load (re-measured only when font metrics change),
// never from live label text.
let worstCaseInk = null;
let worstCaseOwnInk = 0;
let worstCaseInkLabel = '';

// Steam's new layout is server-rendered and hydrated by React after the page
// scripts run. Inserting our controls before hydration makes React report an
// uncaught hydration mismatch (#418), so on the new layout the injection waits
// for the page load plus a short DOM-quiet period. Legacy pages are not
// React-owned and keep the immediate injection.
const HYDRATION_SETTLE_MS = 1500;
let lastDomMutationAt = Date.now();
let createButtonsRetryTimer = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

function getControlArea() {
    // .subscribeCollection is the classic collection page's native 3-button
    // row (sharedfiles/filedetails/?id=<collectionid>), which is legacy DOM.
    // It is resolved on its own BEFORE the legacy selector list: a collection
    // page also contains .collectionControls > .workshopItemControls (the top
    // review bar) earlier in document order, which a single combined
    // querySelector would return first.
    const collectionArea = document.querySelector('.subscribeCollection');
    // A streamed collection's review bar can arrive before its action row.
    // Wait for the intended row rather than injecting into that earlier bar.
    if (collectionArea || /\/sharedfiles\/filedetails\/?$/.test(location.pathname)) return collectionArea;
    // Discussions and About also live under /workshop/ and reuse the legacy
    // menu classes; the toolbar belongs on browse pages only.
    if (!onBrowseRoute()) return null;
    const legacyArea = document.querySelector('.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls');
    if (legacyArea) return legacyArea;
    if (window.WSHSDom && window.WSHSDom.isNewLayout()) {
        return window.WSHSDom.getControlArea();
    }
    return null;
}

function createSvgIcon(className, viewBox) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return svg;
}

function createSvgPath(d, fillRule, strokeWidth) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    if (fillRule) path.setAttribute('fill-rule', fillRule);
    if (strokeWidth) {
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', strokeWidth);
        path.setAttribute('stroke-linecap', 'round');
    }
    return path;
}

function createStarIcon() {
    const svg = createSvgIcon('wshs-left-icon', '0 0 24 24');
    svg.appendChild(createSvgPath('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'));
    return svg;
}

function createHideIcon() {
    const svg = createSvgIcon('wshs-left-icon', '0 0 24 24');
    svg.appendChild(createSvgPath(
        'M12 4.5C6.9 4.5 3 8.53 1.8 12c1.2 3.47 5.1 7.5 10.2 7.5s9-4.03 10.2-7.5C21 8.53 17.1 4.5 12 4.5zm0 12a4.5 4.5 0 110-9 4.5 4.5 0 010 9z',
        'evenodd'
    ));
    svg.appendChild(createSvgPath('M4.2 2.5l17.3 19', null, '2'));
    return svg;
}

function createChevronIcon() {
    const svg = createSvgIcon('wshs-chevron', '0 0 12 8');
    svg.appendChild(createSvgPath('M5.62915 7.5L-1.40071e-05 1.06691e-07L11.2583 -8.77544e-07L5.62915 7.5Z'));
    return svg;
}

function createCheckIcon() {
    const svg = createSvgIcon('wshs-check-icon', '0 0 24 24');
    svg.appendChild(createSvgPath('M9.55 17.6L3.4 11.45l2.12-2.12 4.03 4.03 8.93-8.93 2.12 2.12L9.55 17.6z'));
    return svg;
}

// Label updates edit the existing text node instead of assigning textContent.
// textContent swaps in a new child node, and on large Steam pages (collection
// pages with hundreds of items) every node insertion costs ~40ms of style and
// layout, with or without this extension. A nodeValue edit costs ~0.5ms.
function setText(element, text) {
    const node = element.firstChild;
    if (node && node.nodeType === 3 && !node.nextSibling) {
        if (node.nodeValue !== text) node.nodeValue = text;
    } else {
        element.textContent = text;
    }
}

function getRowColumnGap(sortButton) {
    let node = sortButton.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
        const style = window.getComputedStyle(node);
        if (style.display === 'flex' || style.display === 'inline-flex') {
            const gap = parseFloat(style.columnGap);
            return !isNaN(gap) && gap > 0 ? gap : 0;
        }
        node = node.parentElement;
    }
    return 0;
}

// hydration-signal.js (MAIN world) sets data-wshs-hydrated on <html> as soon
// as React has hydrated the sort row, which is usually well before the load
// event. The load-plus-quiet-period check stays as the fallback for pages
// where that signal never arrives.
function isHydrationSettled() {
    if (document.documentElement.hasAttribute('data-wshs-hydrated')) return true;
    return document.readyState === 'complete' &&
        Date.now() - lastDomMutationAt >= HYDRATION_SETTLE_MS;
}

// The gate below needs a callback after the DOM goes quiet, which the global
// MutationObserver cannot guarantee on its own.
function scheduleCreateButtonsRetry() {
    if (createButtonsRetryTimer !== null) return;
    const quietFor = Date.now() - lastDomMutationAt;
    createButtonsRetryTimer = setTimeout(() => {
        createButtonsRetryTimer = null;
        createButtons();
    }, Math.max(250, HYDRATION_SETTLE_MS - quietFor));
}

function onBrowseRoute() {
    return /\/workshop\/browse\/?$/.test(location.pathname);
}

// Steam navigates Browse -> About without a reload. Remove the toolbar and
// return Steam's controls to their own styles when the route changes.
function leaveBrowseRoute() {
    if (widthSyncCleanup) { widthSyncCleanup(); widthSyncCleanup = null; }
    widthSync = null;
    for (const node of document.querySelectorAll('.wshs-injected-controls, .wshs-toolbar-reset-slot')) node.remove();
}

function createButtons() {
    const controlArea = getControlArea();
    if (!controlArea || document.querySelector('.hide-subscribed-button')) return;

    if (widthSyncCleanup) {
        widthSyncCleanup();
        widthSyncCleanup = null;
    }

    const isNewLayout = !!(window.WSHSDom && window.WSHSDom.isNewLayout && window.WSHSDom.isNewLayout());

    // Classic collection pages: our controls join the native .subscribeCollection
    // button row and keep its .general_btn skin, so the browse-page shared
    // geometry (frozen width, sort-button coupling) does not run there.
    const isCollectionArea = controlArea.classList.contains('subscribeCollection');

    // Hydration gate for the new layout (see the note at the top of the file).
    // The observer keeps calling createButtons() while the page mutates; the
    // retry timer covers the quiet case.
    if (isNewLayout && !isHydrationSettled()) {
        scheduleCreateButtonsRetry();
        return;
    }

    let sortInfo = isNewLayout && window.WSHSDom.getSortButton ? window.WSHSDom.getSortButton() : null;

    // Star filter button: [star icon][label][chevron]. The chevron toggles the
    // existing star dropdown.
    const starFilterContainer = document.createElement('div');
    starFilterContainer.style.display = 'inline-block';
    starFilterContainer.style.position = 'relative';

    const starButton = document.createElement('button');
    starButton.type = 'button';
    starButton.className = 'hide-subscribed-button star-filter-button';
    const starLabel = document.createElement('span');
    starLabel.className = 'wshs-button-label';
    starLabel.textContent = 'Star Rating';
    starButton.appendChild(createStarIcon());
    starButton.appendChild(starLabel);
    starButton.appendChild(createChevronIcon());

    // Hide subscribed toggle: [eye-off icon][label][reserved 17px slot]. The
    // slot stays in the layout when inactive so the geometry does not jump.
    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'hide-subscribed-button';
    hideButton.setAttribute('aria-pressed', 'false');
    const hideLabel = document.createElement('span');
    hideLabel.className = 'wshs-button-label';
    hideLabel.textContent = 'Hide Subscribed';
    const toggleSlot = document.createElement('span');
    toggleSlot.className = 'wshs-toggle-slot';
    toggleSlot.appendChild(createCheckIcon());
    hideButton.appendChild(createHideIcon());
    hideButton.appendChild(hideLabel);
    hideButton.appendChild(toggleSlot);
    const ratingsContainer = document.createElement('div');
    ratingsContainer.className = 'wshs-ratings-control';
    ratingsContainer.style.position = 'relative';
    const ratingsButton = document.createElement('button');
    ratingsButton.type = 'button';
    ratingsButton.className = 'hide-subscribed-button ratings-filter-button';
    ratingsButton.setAttribute('aria-haspopup', 'true');
    ratingsButton.setAttribute('aria-expanded', 'false');
    ratingsButton.title = 'Minimum number of user ratings. Filters items on this page.';
    const ratingsIcon = createSvgIcon('wshs-left-icon', '0 0 24 24');
    ratingsIcon.appendChild(createSvgPath('M4 3h16v14H9l-5 4V3zm3 4v2h10V7H7zm0 4v2h7v-2H7z'));
    const ratingsLabel = document.createElement('span'); ratingsLabel.className = 'wshs-button-label';
    const ratingsMenu = document.createElement('div'); ratingsMenu.className = 'star-dropdown-content wshs-ratings-menu';
    ratingsMenu.setAttribute('role', 'radiogroup'); ratingsMenu.setAttribute('aria-label', 'Minimum number of ratings');
    const ratingsOptions = [0,10,25,50,100,250,500,1000,5000];
    for (const count of ratingsOptions) {
        const option = document.createElement('div'); option.className = 'star-option';
        option.dataset.ratings = String(count); option.setAttribute('role', 'radio'); option.tabIndex = 0;
        option.textContent = count ? count.toLocaleString('en-US') + '+ Ratings' : 'Any number';
        ratingsMenu.appendChild(option);
    }
    const ratingsStatus = document.createElement('div'); ratingsStatus.className = 'wshs-ratings-status'; ratingsStatus.setAttribute('role', 'status');
    ratingsMenu.appendChild(ratingsStatus);
    const ratingsRetry = document.createElement('button'); ratingsRetry.type = 'button'; ratingsRetry.className = 'wshs-ratings-retry'; ratingsRetry.textContent = 'Retry unavailable counts'; ratingsRetry.hidden = true;
    ratingsRetry.addEventListener('click', e => {
        e.stopPropagation();
        const ids = (window.WSHSDom && window.WSHSDom.isNewLayout() ? window.WSHSDom.enumerateCards() : Array.from(document.querySelectorAll('.collectionItem')).map(root=>({id:root.id.replace('sharedfile_','')}))).map(item=>item.id);
        window.WSHSMetadata.request(ids.filter(id=>!Number.isSafeInteger(window.WSHSMetadata.get(id)?.ratings)),{fields:['ratings'],force:true});
    });
    ratingsMenu.appendChild(ratingsRetry);
    function renderRatings() {
        setText(ratingsLabel, minimumRatings ? minimumRatings.toLocaleString('en-US') + '+ Ratings' : 'Ratings');
        ratingsButton.classList.toggle('active', minimumRatings > 0);
        for (const option of ratingsMenu.querySelectorAll('[data-ratings]')) option.setAttribute('aria-checked', String(Number(option.dataset.ratings) === minimumRatings));
    }
    renderRatingsPreference = renderRatings;
    renderRatings();
    function closeRatings() { ratingsMenu.classList.remove('show'); ratingsButton.setAttribute('aria-expanded', 'false'); }
    ratingsButton.addEventListener('click', e => {
        syncDropdownFonts();
        e.stopPropagation(); dropdownContent.classList.remove('show');
        const open = !ratingsMenu.classList.contains('show'); ratingsMenu.classList.toggle('show', open); ratingsButton.setAttribute('aria-expanded', String(open));
    });
    function chooseRatings(e) {
        const option = e.target.closest('[data-ratings]'); if (!option) return;
        e.stopPropagation(); minimumRatings = Number(option.dataset.ratings); renderRatings(); closeRatings();
        chrome.storage.local.set({ minimumRatings }); applyFilters(); if (widthSync) widthSync();
    }
    ratingsMenu.addEventListener('click', chooseRatings);
    ratingsMenu.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseRatings(e); }
        if (e.key === 'Escape') { e.stopPropagation(); closeRatings(); ratingsButton.focus(); }
    });
    document.addEventListener('click', closeRatings);
    ratingsButton.addEventListener('keydown', e => { if (e.key === 'Escape') closeRatings(); });
    ratingsButton.append(ratingsIcon, ratingsLabel, createChevronIcon());
    ratingsContainer.append(ratingsButton, ratingsMenu);
    // Our clicks stop at our controls: Steam's document-level click handler
    // (fnCancelHover in shared_global.js) reads computed styles across the
    // whole item list and cost ~45ms per click on large collection pages.
    hideButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent.classList.remove('show');
        toggleSubscribedItems();
    });

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'star-dropdown-content';
    dropdownContent.innerHTML = `
        <div class="wshs-star-options" role="radiogroup">
            <div class="star-option" role="radio" data-stars="0">Show All</div>
            <div class="star-option" role="radio" data-stars="5">5 Stars Only</div>
            <div class="star-option" role="radio" data-stars="4">4+ Stars</div>
            <div class="star-option" role="radio" data-stars="3">3+ Stars</div>
            <div class="star-option" role="radio" data-stars="2">2+ Stars</div>
            <div class="star-option" role="radio" data-stars="1">1+ Stars</div>
        </div>
    `;

    function renderStarLabel() {
        setText(starLabel, currentStarFilter === 0 ? 'Star Rating' : currentStarFilter + '+ Stars');
        for (const option of dropdownContent.querySelectorAll('.star-option')) {
            const checked = Number(option.dataset.stars) === currentStarFilter;
            if (option.getAttribute('aria-checked') !== String(checked)) {
                option.setAttribute('aria-checked', String(checked));
            }
        }
    }
    renderStarLabel();

    function renderHideState() {
        hideButton.classList.toggle('active', isHidingSubscribed);
        hideButton.setAttribute('aria-pressed', isHidingSubscribed ? 'true' : 'false');
        setText(hideLabel, isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed');
    }

    // Add event listeners for star filter
    starButton.addEventListener('click', (e) => {
        syncDropdownFonts();
        e.stopPropagation();
        closeRatings();
        dropdownContent.classList.toggle('show');
    });

    // Handle star filter selection
    dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
        const option = e.target.closest('.star-option');
        if (option) {
            currentStarFilter = parseInt(option.dataset.stars);
            renderStarLabel();
            dropdownContent.classList.remove('show');

            // Save star filter preference
            chrome.storage.local.set({ starFilter: currentStarFilter });

            applyFilters();
            if (widthSync) widthSync();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdownContent.classList.remove('show');
    });

    // Load saved states
    chrome.storage.local.get(['hideSubscribed', 'starFilter', 'minimumRatings'], (data) => {
        minimumRatings = ratingsOptions.includes(data.minimumRatings) ? data.minimumRatings : 0;
        renderRatings();
        if (data.hideSubscribed) {
            isHidingSubscribed = true;
        }
        if (data.starFilter) {
            currentStarFilter = data.starFilter;
        }
        renderHideState();
        renderStarLabel();

        // Apply both filters if either is active
        if (data.hideSubscribed || data.starFilter > 0 || minimumRatings > 0) {
            applyFilters();
        }
        if (widthSync) widthSync();
    });

    starFilterContainer.appendChild(starButton);
    starFilterContainer.appendChild(dropdownContent);

    const injectedControls = document.createElement('div');
    injectedControls.className = 'wshs-injected-controls';
    if (isNewLayout) {
        injectedControls.className += ' wshs-new-layout-controls';
    }
    if (isCollectionArea) {
        injectedControls.className += ' wshs-collection-controls';
    }
    injectedControls.appendChild(hideButton);
    injectedControls.appendChild(ratingsContainer);
    injectedControls.appendChild(starFilterContainer);

    // The sort button is re-resolved on every sync because React can replace
    // the node during hydration, which would otherwise freeze the width sync.
    function getLiveSortInfo() {
        if (sortInfo && sortInfo.button && sortInfo.button.isConnected) return sortInfo;
        if (isNewLayout && window.WSHSDom && window.WSHSDom.getSortButton) {
            const fresh = window.WSHSDom.getSortButton();
            if (fresh && fresh.button) {
                sortInfo = fresh;
                return fresh;
            }
        }
        return null;
    }

    // Frozen worst-case ink Iworst: the max text width over the fixed label
    // set (plus any sort options Steam has mounted), measured once at F with a
    // hidden fixed-position span - no layout side effects, no reading of the
    // live button labels. Cached per page load; only a font-metrics change
    // (document.fonts.ready) re-measures it.
    function getWorstCaseInk(sortButton) {
        if (worstCaseInk !== null) return worstCaseInk;
        if (!document.body) return 0;

        const labels = SORT_OPTION_LABELS.slice();
        if (window.WSHSDom && window.WSHSDom.getSortOptionLabels) {
            const mounted = window.WSHSDom.getSortOptionLabels();
            for (const text of mounted) {
                if (text && labels.indexOf(text) === -1) labels.push(text);
            }
        }

        const probe = document.createElement('span');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.position = 'fixed';
        probe.style.left = '-99999px';
        probe.style.top = '0';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.whiteSpace = 'nowrap';
        probe.style.display = 'inline-block';
        document.body.appendChild(probe);

        function maxInk(stateLabels, source) {
            let worst = 0;
            let worstLabel = '';
            const style = window.getComputedStyle(source);
            for (const text of stateLabels) {
                const label = (text || '').trim();
                if (!label) continue;
                probe.style.fontFamily = style.fontFamily;
                probe.style.fontWeight = style.fontWeight;
                probe.style.fontStyle = style.fontStyle;
                probe.style.letterSpacing = style.letterSpacing;
                probe.style.fontSize = BUTTON_FONT_SIZE;
                setText(probe, label);
                const ink = probe.getBoundingClientRect().width;
                if (ink > worst) {
                    worst = ink;
                    worstLabel = label;
                }
            }
            return { ink: worst, label: worstLabel };
        }

        let measured;
        try {
            const own = maxInk(OWN_LABEL_STATES, starButton);
            worstCaseOwnInk = Math.max(own.ink, maxInk(['Ratings', '5,000+ Ratings'], ratingsButton).ink);
            const sortSource = sortButton && sortButton.isConnected ? sortButton : starButton;
            const native = maxInk(labels, sortSource);
            measured = native.ink >= own.ink ? native : own;
        } finally {
            probe.remove();
        }

        if (measured.ink > 0) {
            worstCaseInk = measured.ink;
            worstCaseInkLabel = measured.label;
            console.debug('[WSHS] frozen worst-case label ink ' +
                Math.round(worstCaseInk * 100) / 100 + 'px ("' + worstCaseInkLabel +
                '") at ' + BUTTON_FONT_SIZE);
        }
        return worstCaseInk || 0;
    }

    // F is forced on the native sort label itself too (inline, because the page
    // stylesheet sets 15px and React can replace the node).
    function applyUniformFont(button, size) {
        if (!button) return;
        const value = size || BUTTON_FONT_SIZE;
        button.style.fontSize = value;
        const textSpans = button.querySelectorAll('span');
        for (const span of textSpans) {
            if (!span.children.length && span.textContent.trim()) {
                span.style.fontSize = value;
            }
        }
    }

    // Keep Steam's original label node and callbacks. Match the other controls'
    // icon widths and reserve space on either side so wrapped text stays clear
    // of the icons. The frozen label measurements below reserve a stable height.
    function applyNativeSortAnatomy(button) {
        if (!button) return;
        button.style.position = 'relative';
        button.style.justifyContent = 'center';
        button.style.paddingLeft = '30px';
        button.style.paddingRight = '30px';
        button.style.textAlign = 'center';
        button.style.whiteSpace = 'normal';
        const icons = button.querySelectorAll('svg');
        for (let i=0;i<icons.length;i++) {
            icons[i].style.position='absolute'; icons[i].style.top='50%'; icons[i].style.transform='translateY(-50%)';
            icons[i].style.left=i===0?'8px':'auto'; icons[i].style.right=i===0?'auto':'8px';
            icons[i].style.width=i===0?'20px':'12px'; icons[i].style.height='auto';
        }
        for (const span of button.querySelectorAll('span')) if (!span.children.length && span.textContent.trim()) {
            span.style.textAlign='center';span.style.flex='1 1 auto';span.style.minWidth='0';
        }
        // Same drop shadow as the injected buttons and the dropdowns
        // (styles.css).
        button.style.boxShadow = '1px 1px 10px 0 rgba(0, 0, 0, 0.6)';
    }

    function setButtonWidth(button, width, gap) {
        button.style.boxSizing = 'border-box';
        button.style.width = width + 'px';
        button.style.minWidth = width + 'px';
        button.style.gap = gap + 'px';
        button.style.height = '';
    }

    // Geometry observers: the sort button and its wrapper (React can clobber
    // their style), a representative card (grid reflow) and the native sort
    // button (a relabel re-applies styles; the frozen ink keeps it idempotent).
    let sortResizeObserver = null;
    let cardResizeObserver = null;
    let sortLabelObserver = null;
    let observedSortNodes = [];
    let observedCard = null;
    let observedLabelNode = null;

    function sameNodes(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    function observeGeometry(liveSort, geometry) {
        const sortNodes = [];
        if (liveSort && liveSort.button) sortNodes.push(liveSort.button);
        if (liveSort && liveSort.wrapper) sortNodes.push(liveSort.wrapper);
        if (typeof ResizeObserver === 'function') {
            if (!sortResizeObserver) sortResizeObserver = new ResizeObserver(scheduleGeometry);
            if (!sameNodes(sortNodes, observedSortNodes)) {
                sortResizeObserver.disconnect();
                for (const node of sortNodes) sortResizeObserver.observe(node);
                observedSortNodes = sortNodes;
            }
            const card = geometry && geometry.card ? geometry.card : null;
            if (!cardResizeObserver) cardResizeObserver = new ResizeObserver(scheduleGeometry);
            if (card && card !== observedCard) {
                cardResizeObserver.disconnect();
                cardResizeObserver.observe(card);
                observedCard = card;
            } else if (!card && observedCard && !observedCard.isConnected) {
                // Fallback is active: keep observing the last live card (the
                // observer stays attached instead of disconnecting) so a grid
                // reflow can leave the fallback without a window resize; drop
                // the reference only for genuinely detached nodes.
                observedCard = null;
            }
        }
        const labelNode = liveSort && liveSort.button ? liveSort.button : null;
        if (labelNode !== observedLabelNode) {
            if (sortLabelObserver) sortLabelObserver.disconnect();
            if (labelNode && typeof MutationObserver === 'function') {
                if (!sortLabelObserver) sortLabelObserver = new MutationObserver(scheduleGeometry);
                sortLabelObserver.observe(labelNode, { childList: true, characterData: true, subtree: true });
            }
            observedLabelNode = labelNode;
        }
    }

    // Four full-card controls; browse reset mirrors with the search group.
    const resetSlot = document.createElement('div');
    resetSlot.className = 'wshs-toolbar-reset-slot';
    const resetButton = document.createElement('button');
    resetButton.type = 'button'; resetButton.className = 'wshs-toolbar-reset';
    resetButton.textContent = '×';
    resetButton.setAttribute('aria-label', 'Reset toolbar filters');
    resetButton.title = 'Reset subscribed, ratings and stars; sort by Most Popular (One Week)';
    if (isCollectionArea) {
        resetButton.classList.add('wshs-collection-reset');
        resetButton.textContent = '↻ Reset';
        resetButton.title = 'Reset subscription and rating filters';
        resetButton.setAttribute('aria-label', 'Reset collection filters');
        // collection-row-align moves this existing handler into the header
        // once saved-filters has mounted, regardless of script timing.
        injectedControls.appendChild(resetButton);
    }
    else resetSlot.appendChild(resetButton);
    resetButton.addEventListener('click', async e => {
        e.stopPropagation();
        isHidingSubscribed = false; currentStarFilter = 0; minimumRatings = 0;
        renderHideState(); renderStarLabel(); renderRatings(); closeRatings();
        dropdownContent.classList.remove('show'); applyFilters();
        await chrome.storage.local.set({ hideSubscribed: false, starFilter: 0, minimumRatings: 0 });
        if (isCollectionArea) return;
        const handled = !window.dispatchEvent(new Event('wshs-reset-toolbar-sort', { cancelable: true }));
        if (!handled) {
            // Preserve the rest of the user's query if Steam's native bridge is unavailable.
            const url = new URL(location.href);
            url.searchParams.set('browsesort', 'trend'); url.searchParams.set('days', '7'); url.searchParams.set('p', '1');
            location.assign(url.href);
        }
    });
    let toolbarLayout = null;
    // Inline styles of Steam's sort button (and its icons and label) before
    // the first resize, restored when the toolbar is removed.
    const nativeSortStyles = new Map();
    function rememberNativeStyles(button) {
        if (!button) return;
        for (const node of [button, ...button.querySelectorAll('svg, span')]) {
            if (!nativeSortStyles.has(node)) nativeSortStyles.set(node, node.getAttribute('style'));
        }
    }
    function restoreNativeStyles() {
        nativeSortStyles.forEach((style, node) => {
            if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
        });
        nativeSortStyles.clear();
    }
    let geometryFrame = null;
    let lastToolbarMetrics = null;
    let resetSearchRow = null;
    let resetSearchSlot = null;
    let searchGear = null;
    let applyLayout = null;
    function restoreApplyLayout() {
        if (!applyLayout) return;
        applyLayout.button.classList.remove('wshs-apply-filters');
        applyLayout.wrapper.classList.remove('wshs-apply-filters-slot');
        for (const [node,style] of applyLayout.styles) {
            if (style === null) node.removeAttribute('style'); else node.setAttribute('style',style);
        }
        applyLayout = null;
    }
    function fitApplyButton(parent, width, font) {
        if (!applyLayout || !applyLayout.button.isConnected || !parent.contains(applyLayout.button) || applyLayout.wrapper.parentElement !== parent) {
            restoreApplyLayout();
            const icon = parent.querySelector('svg[viewBox="0 0 25 24"]');
            const button = icon && icon.closest('button,[role="button"]');
            if (!button) return;
            let wrapper = button;
            while (wrapper.parentElement && wrapper.parentElement !== parent) wrapper = wrapper.parentElement;
            const nodes = [button,wrapper,...button.querySelectorAll('svg,span')];
            applyLayout = {button,wrapper,styles:new Map(nodes.map(node=>[node,node.getAttribute('style')])),metrics:null};
            button.classList.add('wshs-apply-filters');
            wrapper.classList.add('wshs-apply-filters-slot');
        }
        const headerWidth = parent.getBoundingClientRect().width;
        const searchWidth = Math.floor(Math.min(250,Math.max(160,headerWidth-width-4))*64)/64+'px';
        if (parent.style.getPropertyValue('--wshs-mobile-search-width') !== searchWidth) parent.style.setProperty('--wshs-mobile-search-width', searchWidth);
        const height = resetSearchRow ? resetSearchRow.getBoundingClientRect().height : 42;
        const metrics = [width,font,height,searchWidth].join('|');
        if (applyLayout.metrics === metrics) return;
        applyLayout.metrics = metrics;
        const set = (node,styles) => { for (const [key,value] of Object.entries(styles)) if (node.style[key] !== value) node.style[key] = value; };
        set(applyLayout.wrapper,{width:width+'px',height:height+'px',flexShrink:'0',alignSelf:'flex-start'});
        set(applyLayout.button,{width:width+'px',minWidth:width+'px',height:height+'px',boxSizing:'border-box',fontSize:font,lineHeight:'normal',position:'relative',justifyContent:'center',textAlign:'center',whiteSpace:'nowrap',paddingLeft:'30px',paddingRight:'30px',gap:'6px',boxShadow:'rgba(0, 0, 0, 0.6) 1px 1px 10px 0px'});
        for (const span of applyLayout.button.querySelectorAll('span')) if (!span.children.length && span.textContent.trim()) set(span,{fontSize:font});
        [...applyLayout.button.querySelectorAll('svg')].forEach((icon,index)=>set(icon,{position:'absolute',top:'50%',transform:'translateY(-50%)',left:index===0?'8px':'auto',right:index===0?'auto':'8px',width:index===0?'20px':'12px',height:'auto'}));
    }
    function mountBrowseReset(parent, sidebarRight) {
        if (!searchGear || !searchGear.isConnected || !parent.contains(searchGear) || searchGear.parentElement !== resetSearchRow) {
            if (resetSearchRow) resetSearchRow.classList.remove('wshs-search-controls');
            if (resetSearchSlot) resetSearchSlot.classList.remove('wshs-search-slot');
            const icon = parent.querySelector('.SVGIcon_Settings');
            searchGear = icon && icon.closest('button,[role="button"]');
            resetSearchRow = searchGear && searchGear.parentElement;
            resetSearchSlot = resetSearchRow;
            while (resetSearchSlot && resetSearchSlot.parentElement !== parent) resetSearchSlot = resetSearchSlot.parentElement;
        }
        const searchReady = !isNewLayout || document.documentElement.getAttribute('data-wshs-search-hydrated') === '1' || document.documentElement.getAttribute('data-wshs-page-hydrated') === '1' || !!document.querySelector('#CommunityTemplate .wshs-saved-filters');
        if (resetSearchRow && searchReady) {
            if (!resetSearchRow.classList.contains('wshs-search-controls')) resetSearchRow.classList.add('wshs-search-controls');
            if (resetSearchSlot && !resetSearchSlot.classList.contains('wshs-search-slot')) resetSearchSlot.classList.add('wshs-search-slot');
            const form = resetSearchRow.querySelector('form');
            if (sidebarRight && form) {
                if (form.previousElementSibling !== searchGear) resetSearchRow.insertBefore(searchGear, form);
                if (searchGear.previousElementSibling !== resetSlot) resetSearchRow.insertBefore(resetSlot, searchGear);
            } else {
                if (form && form.nextElementSibling !== searchGear) form.insertAdjacentElement('afterend', searchGear);
                if (searchGear.nextElementSibling !== resetSlot) searchGear.insertAdjacentElement('afterend', resetSlot);
            }
            const gearWidth = searchGear.getBoundingClientRect().width;
            if (gearWidth > 0 && resetSearchRow.style.getPropertyValue('--wshs-search-action-width') !== gearWidth + 'px') resetSearchRow.style.setProperty('--wshs-search-action-width', gearWidth + 'px');
        } else if (resetSlot.parentElement !== parent) {
            // Keep reset reachable on older/nonstandard markup without a gear.
            parent.insertBefore(resetSlot, injectedControls);
        }
    }
    function scheduleGeometry() {
        if (geometryFrame === null) geometryFrame = requestAnimationFrame(() => { geometryFrame = null; resync(); });
    }
    function restoreToolbarLayout() {
        if (!toolbarLayout) return;
        const saved = toolbarLayout;
        restoreApplyLayout();
        resetSlot.remove();
        if (resetSearchRow) resetSearchRow.classList.remove('wshs-search-controls');
        if (resetSearchSlot) resetSearchSlot.classList.remove('wshs-search-slot');
        resetSearchRow = null;
        resetSearchSlot = null;
        searchGear = null;
        saved.parent.style.removeProperty('--wshs-unused-grid-width');
        saved.parent.style.removeProperty('--wshs-mobile-search-width');
        saved.parent.removeAttribute('data-wshs-toolbar-layout');
        for (const [key,value] of Object.entries(saved.parentStyle)) saved.parent.style[key] = value;
        for (const [key,value] of Object.entries(saved.wrapperStyle)) saved.wrapper.style[key] = value;
        toolbarLayout = null;
    }
    function resync() {
        if (isCollectionArea) { syncDropdownFonts(); return; }
        const liveSort = getLiveSortInfo();
        const sort = liveSort && liveSort.button;
        const geometry = isNewLayout && window.WSHSDom ? window.WSHSDom.getCardGeometry() : null;
        observeGeometry(liveSort, geometry);
        const buttons = [hideButton, ratingsButton, starButton];
        if (!sort || !liveSort.wrapper.parentElement) {
            const width = 230;
            for (const button of buttons) setButtonWidth(button, width, 4);
            injectedControls.style.flexWrap = 'wrap';
            return;
        }
        const parent = liveSort.wrapper.parentElement;
        const pane = document.querySelector('.wshs-saved-filters');
        const sidebarPosition = document.documentElement.getAttribute('data-wshs-sidebar-position');
        const sidebarRight = sidebarPosition ? sidebarPosition === 'right' : geometry && pane ? pane.getBoundingClientRect().left > geometry.left : false;
        if (!toolbarLayout || toolbarLayout.parent !== parent || toolbarLayout.wrapper !== liveSort.wrapper) {
            restoreToolbarLayout();
            const parentStyle = {}, wrapperStyle = {};
            for (const key of ['position','minHeight','alignItems']) parentStyle[key] = parent.style[key];
            for (const key of ['position','right','left','top','bottom','width']) wrapperStyle[key] = liveSort.wrapper.style[key];
            toolbarLayout = {parent, wrapper:liveSort.wrapper, parentStyle, wrapperStyle};
        }
        const gap = geometry && geometry.gap > 0 ? geometry.gap : 10;
        const columns = geometry ? geometry.columns : 1;
        const wide = columns >= 4 && window.innerWidth >= 1000;
        // Use balanced rows below four card columns or on mobile. Keep at
        // least 160px per control rather than leaving a lone full-width sort.
        // Use the actual grid bounds: extrapolating rounded card widths can
        // exceed the row by a fraction of a pixel and wrap below the search.
        const grid = geometry && geometry.card && geometry.card.parentElement;
        const available = Math.max(1, Math.min(grid ? grid.getBoundingClientRect().width : geometry ? geometry.right - geometry.left : parent.clientWidth, parent.clientWidth));
        const controlColumns = wide ? 4 : available >= 640 + gap * 3 ? 4 : available >= 320 + gap ? 2 : 1;
        function slot(index) {
            const row = Math.floor(index / controlColumns), count = Math.min(controlColumns, 4 - row * controlColumns);
            const width = Math.max(1, (available - gap * (count - 1)) / count);
            return { row, count, column: index % controlColumns, width };
        }
        const buttonSlots = buttons.map((button, index) => slot(index));
        const sortSlot = slot(3);
        const cell = wide ? Math.floor(Math.min(geometry.width, (available - gap * (columns - 1)) / columns) * 64) / 64 : slot(0).width;
        const span = wide ? cell * 4 + gap * 3 : available;
        const sortWidth = wide ? cell : sortSlot.width;
        const unusedWidth = geometry ? Math.max(0,available-span) : 0;
        const unusedValue = unusedWidth+'px';
        if(parent.style.getPropertyValue('--wshs-unused-grid-width')!==unusedValue){
            parent.style.setProperty('--wshs-unused-grid-width',unusedValue);
            window.dispatchEvent(new Event('wshs-toolbar-geometry'));
        }
        const worstSort = getWorstCaseInk(sort) || IWORST_FALLBACK_ESTIMATE;
        const ownInk = worstCaseOwnInk || 120;
        const scale = Math.min(1,(Math.min(cell,...buttonSlots.map(s=>s.width))-56)/ownInk,(sortWidth-68)/worstSort);
        const font = Math.max(10,Math.floor(13*scale*10)/10)+'px';
        for (const [index, button] of buttons.entries()) {
            applyUniformFont(button,font);
            setButtonWidth(button,wide?cell:buttonSlots[index].width,4);
            button.style.height = '';
        }
        rememberNativeStyles(sort);
        applyUniformFont(sort,font);setButtonWidth(sort,sortWidth,6);sort.style.height = '';
        applyNativeSortAnatomy(sort);
        const sortLineHeight = Math.ceil(parseFloat(font) * 1.2);
        sort.style.lineHeight = sortLineHeight + 'px';
        const sortStyle = getComputedStyle(sort);
        const sortPadding = parseFloat(sortStyle.paddingTop) + parseFloat(sortStyle.paddingBottom);
        const sortLines = worstSort * parseFloat(font) / parseFloat(BUTTON_FONT_SIZE) > sortWidth - 60 ? 2 : 1;
        const height = Math.max(38, sortLines * sortLineHeight + sortPadding, ...buttons.map(b=>b.getBoundingClientRect().height),sort.getBoundingClientRect().height);
        for (const button of [...buttons,sort]) button.style.height=height+'px';
        injectedControls.classList.add('wshs-four-filter-controls');
        const layoutMode = wide ? 'cards' : 'compact';
        if (parent.getAttribute('data-wshs-toolbar-layout') !== layoutMode) parent.setAttribute('data-wshs-toolbar-layout', layoutMode);
        injectedControls.style.marginLeft=sidebarRight?'0px':'auto';
        injectedControls.style.gap=gap+'px';
        injectedControls.style.flexWrap='nowrap';
        mountBrowseReset(parent, sidebarRight);
        fitApplyButton(parent, cell, font);
        liveSort.wrapper.style.width=cell+'px';
        if (wide) {
            injectedControls.style.minHeight='';
            injectedControls.style.gridTemplateRows='';
            for (const [key,value] of Object.entries(toolbarLayout.parentStyle)) parent.style[key]=value;
            for (const key of ['position','right','left','top','bottom']) liveSort.wrapper.style[key]=toolbarLayout.wrapperStyle[key];
            injectedControls.style.display='flex';
            for (const child of injectedControls.children) { child.style.removeProperty('grid-column'); child.style.removeProperty('grid-row'); }
            injectedControls.style.width=(3*cell+2*gap)+'px';
            injectedControls.style.marginRight=Math.max(0,gap-getRowColumnGap(sort))+'px';
        } else {
            if (getComputedStyle(parent).position==='static') parent.style.position='relative';
            parent.style.alignItems='flex-start';
            parent.style.minHeight=toolbarLayout.parentStyle.minHeight;
            const rows = Math.ceil(4/controlColumns);
            injectedControls.style.display='grid';
            injectedControls.style.minHeight=(rows*height+(rows-1)*gap)+'px';
            const tracks=controlColumns;
            injectedControls.style.gridTemplateColumns='repeat('+tracks+',minmax(0,1fr))';
            injectedControls.style.gridTemplateRows='repeat('+rows+','+height+'px)';
            Array.from(injectedControls.children).forEach((child,index) => {
                const s=buttonSlots[index], span=tracks/s.count;
                child.style.gridColumn=(s.column*span+1)+' / span '+span;
                child.style.gridRow=String(s.row+1);
            });
            injectedControls.style.width=available+'px';
            injectedControls.style.marginLeft=sidebarRight?'0px':'auto';
            injectedControls.style.marginRight=sidebarRight?'auto':'0px';
            liveSort.wrapper.style.position='absolute';
            // Use the actual flow position: on small screens Steam wraps the
            // search onto its own row, and pinned bars have a different origin.
            const parentBox=parent.getBoundingClientRect(), controlsBox=injectedControls.getBoundingClientRect();
            const controlsLeft=controlsBox.left-parentBox.left, controlsTop=controlsBox.top-parentBox.top;
            liveSort.wrapper.style.right='auto';liveSort.wrapper.style.bottom='auto';
            liveSort.wrapper.style.width=sortWidth+'px';
            liveSort.wrapper.style.left=(controlsLeft+sortSlot.column*(sortWidth+gap))+'px';
            liveSort.wrapper.style.top=(controlsTop+sortSlot.row*(height+gap))+'px';
        }
        syncDropdownFonts();
        const metrics = [font, sortWidth, height, layoutMode].join('|');
        if (!lastToolbarMetrics || lastToolbarMetrics.button !== sort || lastToolbarMetrics.value !== metrics) {
            lastToolbarMetrics = {button:sort,value:metrics};
            window.dispatchEvent(new Event('wshs-toolbar-layout'));
        }
    }

    widthSync = scheduleGeometry;

    // New layout: immediately left of the native sort button's wrapper. Legacy
    // pages keep today's injection point.
    if (sortInfo && sortInfo.wrapper && sortInfo.wrapper.parentElement) {
        sortInfo.wrapper.parentElement.insertBefore(injectedControls, sortInfo.wrapper);
    } else {
        controlArea.appendChild(injectedControls);
    }

    // Keep the width sync from being defeated by flex-shrink inside the wrapper.
    starFilterContainer.style.flex = 'none';
    hideButton.style.flex = 'none';

    // Read actual trigger labels on every surface, including the fixed-height
    // collection toolbar. Batch the reads and avoid unchanged menu writes.
    const dropdownFonts = [[ratingsLabel, ratingsMenu], [starLabel, dropdownContent]];
    let dropdownFontFrame = null;
    function syncDropdownFonts() {
        const sizes = dropdownFonts.map(([label]) => getComputedStyle(label).fontSize);
        dropdownFonts.forEach(([,menu], index) => {
            if (menu.style.getPropertyValue('--wshs-dropdown-button-font-size') !== sizes[index]) menu.style.setProperty('--wshs-dropdown-button-font-size', sizes[index]);
        });
    }
    function scheduleDropdownFonts() {
        if (dropdownFontFrame === null) dropdownFontFrame = requestAnimationFrame(() => { dropdownFontFrame = null; syncDropdownFonts(); });
    }
    const dropdownFontResize = new ResizeObserver(scheduleDropdownFonts);
    const dropdownFontObserver = new MutationObserver(scheduleDropdownFonts);
    for (const button of [ratingsButton, starButton]) {
        dropdownFontResize.observe(button);
        dropdownFontObserver.observe(button, {attributes:true,subtree:true,attributeFilter:['style','class']});
    }
    window.addEventListener('resize', scheduleDropdownFonts);
    scheduleDropdownFonts();

    window.addEventListener('resize', scheduleGeometry);
    widthSyncCleanup = () => {
        restoreToolbarLayout();
        restoreNativeStyles();
        window.removeEventListener('resize', scheduleGeometry);
        if (geometryFrame !== null) cancelAnimationFrame(geometryFrame);
        if (sortResizeObserver) sortResizeObserver.disconnect();
        if (cardResizeObserver) cardResizeObserver.disconnect();
        if (sortLabelObserver) sortLabelObserver.disconnect();
        window.removeEventListener('resize', scheduleDropdownFonts);
        dropdownFontResize.disconnect(); dropdownFontObserver.disconnect();
        if (dropdownFontFrame !== null) cancelAnimationFrame(dropdownFontFrame);
    };

    // The frozen ink measured before the webfont is ready would be wrong; drop
    // the cache once fonts have loaded and re-run the (now final) measurement.
    if (!fontsReadyHooked && document.fonts && document.fonts.ready && document.fonts.ready.then) {
        fontsReadyHooked = true;
        document.fonts.ready.then(() => {
            worstCaseInk = null;
            if (widthSync && document.querySelector('.hide-subscribed-button')) widthSync();
        }).catch(() => {});
    }

    resync();
}

function getStarRating(item) {
    const ratingImg = item.querySelector('.fileRating');
    if (!ratingImg) return 0;
    
    // Extract star rating from image source
    const src = ratingImg.src;
    if (src.includes('5-star')) return 5;
    if (src.includes('4-star')) return 4;
    if (src.includes('3-star')) return 3;
    if (src.includes('2-star')) return 2;
    if (src.includes('1-star')) return 1;
    
    // Alternative method using data attribute if available
    if (ratingImg.dataset.rating) {
        return parseInt(ratingImg.dataset.rating);
    }
    
    return 0;
}

function isSubscribed(item) {
    const subscriptionIcon = item.querySelector('.user_action_history_icon.subscribed');
    if (subscriptionIcon && subscriptionIcon.style.display !== 'none') {
        return true;
    }

    const subscribeBtn = item.querySelector('.general_btn.subscribe');
    if (subscribeBtn && subscribeBtn.classList.contains('toggled')) {
        return true;
    }

    return false;
}

function applyFilters() {
    if (window.WSHSDom && window.WSHSDom.isNewLayout()) {
        window.WSHSDom.applyFilters({
            isHidingSubscribed: isHidingSubscribed,
            currentStarFilter: currentStarFilter
        });
        applyRatingCountFilter();
        return;
    }

    const selectors = [
        '.collectionItem',
        '.workshopItemCollection', 
        '.workshopItem'
    ];

    const itemsToFilter = selectors
        .map(selector => document.querySelectorAll(selector))
        .find(elements => elements.length > 0) || document.querySelectorAll(selectors[2]);

    Array.from(itemsToFilter).forEach(item => {
        const isStarFilterPassed = currentStarFilter === 0 || getStarRating(item) >= currentStarFilter;
        const isSubscriptionFilterPassed = !isHidingSubscribed || !isSubscribed(item);
        const shouldHideItem = !isStarFilterPassed || !isSubscriptionFilterPassed;

        item.classList.toggle('hidden-item', shouldHideItem);
    });
    applyRatingCountFilter();
}

function applyRatingCountFilter() {
    if (!window.WSHSMetadata) return;
    if (!minimumRatings) {
        document.querySelectorAll('.wshs-ratings-filtered').forEach(item => item.classList.remove('wshs-ratings-filtered'));
        const status = document.querySelector('.wshs-ratings-status');
        if (status) setText(status, 'Minimum number of user ratings.');
        const retry = document.querySelector('.wshs-ratings-retry'); if (retry) retry.hidden = true;
        return;
    }
    const modern = window.WSHSDom && window.WSHSDom.isNewLayout();
    if (modern) window.WSHSDom.primeMetadata();
    const items = modern ? window.WSHSDom.enumerateCards() : Array.from(document.querySelectorAll('.collectionItem')).map(root => {
        const link = root.querySelector('.collectionItemDetails > a');
        const match = link && /[?&]id=(\d+)/.exec(link.href); return {root,id:match&&match[1]};
    });
    let unknown = 0, loading = false;
    for (const item of items) {
        const data = window.WSHSMetadata.get(item.id);
        const known = data && Number.isSafeInteger(data.ratings);
        item.root.classList.toggle('wshs-ratings-filtered', !!(minimumRatings && known && data.ratings < minimumRatings));
        if (minimumRatings && !known) { unknown++; if (window.WSHSMetadata.pending(item.id)) loading = true; }
    }
    const status = document.querySelector('.wshs-ratings-status');
    if (status) setText(status, loading ? 'Loading rating counts…' : unknown ? unknown + ' counts unavailable; these mods stay visible.' : 'Minimum number of user ratings.');
    const retry = document.querySelector('.wshs-ratings-retry'); if (retry) retry.hidden = !unknown || loading;
    if (minimumRatings && unknown) window.WSHSMetadata.request(items.map(item=>item.id).filter(Boolean),{fields:['ratings']});
}

if (window.WSHSMetadata) window.WSHSMetadata.onChange(() => { if (minimumRatings) applyRatingCountFilter(); });

function toggleSubscribedItems() {
    const button = document.querySelector('.hide-subscribed-button:not(.star-filter-button)');
    isHidingSubscribed = !isHidingSubscribed;
    
    chrome.storage.local.set({ hideSubscribed: isHidingSubscribed });
    
    if (button) {
        button.classList.toggle('active', isHidingSubscribed);
        button.setAttribute('aria-pressed', isHidingSubscribed ? 'true' : 'false');
        const label = button.querySelector('.wshs-button-label');
        if (label) {
            setText(label, isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed');
        }
    }
    
    applyFilters();
    if (widthSync) widthSync();
}

function applyFiltersIfNeeded() {
    createButtons();
    if (isHidingSubscribed || currentStarFilter > 0 || minimumRatings > 0) {
        applyFilters();
    }
    // Result/control changes re-evaluate the geometry from the
    // unfiltered grid structure, so a filter can never leave the controls in
    // the fallback layout and a React-replaced sort button is re-resolved.
    if (widthSync) widthSync();
}

function loadFilters() {
    chrome.storage.local.get(['hideSubscribed', 'starFilter', 'minimumRatings'], (data) => {
        minimumRatings = [0,10,25,50,100,250,500,1000,5000].includes(data.minimumRatings) ? data.minimumRatings : 0;
        isHidingSubscribed = data.hideSubscribed || false;
        currentStarFilter = data.starFilter || 0;
        applyFiltersIfNeeded();
    });
}

chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'local' || !changes.minimumRatings) return;
    const value = changes.minimumRatings.newValue;
    minimumRatings = [0,10,25,50,100,250,500,1000,5000].includes(value) ? value : 0;
    if (renderRatingsPreference) renderRatingsPreference();
    applyFilters(); if (widthSync) widthSync();
});

function init() {
    if (window.WSHSDom && window.WSHSDom.onStatusUpdate) {
        window.WSHSDom.onStatusUpdate(() => {
            if (isHidingSubscribed || currentStarFilter > 0) {
                applyFilters();
            }
            if (widthSync) widthSync();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFilters);
    } else {
        loadFilters();
    }
}

// True when a removed node was (or contained) the native sort button, so the
// geometry sync can re-resolve the replacement instead of freezing.
function nodeContainsSortButton(node) {
    return containsRelevantDom(node, 'div[role="button"][tabindex] svg[viewBox="0 0 12 8"]');
}

// DOM changes are batched to one pass per animation frame. While a big page
// is still parsing, the observer fires once per parser chunk; running the
// filter and geometry pass (which forces layout) on each one is what made the
// large collection pages slow. requestAnimationFrame runs before paint, so new
// items are still filtered before they are ever drawn.
let pendingDomWork = 0; // 0 none, 1 width sync only, 2 full pass
let domWorkFrame = null;

function flushDomWork() {
    domWorkFrame = null;
    const work = pendingDomWork;
    pendingDomWork = 0;
    if (!onBrowseRoute() && !/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) {
        if (widthSync || document.querySelector('.wshs-injected-controls')) leaveBrowseRoute();
        return;
    }
    if (work === 2) {
        applyFiltersIfNeeded();
    } else if (work === 1 && widthSync) {
        widthSync();
    }
}

function scheduleDomWork(level) {
    if (level > pendingDomWork) pendingDomWork = level;
    if (domWorkFrame === null) domWorkFrame = requestAnimationFrame(flushDomWork);
}

const DOM_DIALOG_SELECTOR = 'dialog, [role="dialog"], [aria-modal="true"]';
const DOM_IGNORED_SELECTOR = DOM_DIALOG_SELECTOR + ', [popover], #workshop_item_hover, #global_hover, .wshs-picker';
const DOM_RESULT_SELECTOR = 'a[href*="sharedfiles/filedetails/?id="], .aspectratio_16x9, .aspectratio_square, .collectionItem, .workshopItemCollection, .workshopItem';
const DOM_CONTROL_SELECTOR = '.subscribeCollection, .workshop_browse_menu_area, .workshop_browse_options, .collectionControls > .workshopItemControls, [role="combobox"], button[data-accent-color], .hide-subscribed-button, .wshs-injected-controls';

function containsRelevantDom(node, selector) {
    if (!node || node.nodeType !== 1 || node.closest(DOM_IGNORED_SELECTOR)) return false;
    if (node.matches(selector)) return true;
    // Check only the changed subtree. Dialog dependencies can be nested in a
    // portal wrapper, so excluding just a dialog at the mutation root is unsafe.
    for (const match of node.querySelectorAll(selector)) {
        if (!match.closest(DOM_IGNORED_SELECTOR)) return true;
    }
    return false;
}

// Set up mutation observer to handle dynamically loaded content
const observer = new MutationObserver((mutations) => {
    lastDomMutationAt = Date.now();
    for (const mutation of mutations) {
        // Our own label/state changes (star or hide click) already ran the
        // filters synchronously; re-running them here doubled the click cost.
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target && target.closest('.wshs-injected-controls, .wshs-saved-filters, .wshs-collection-summary, ' + DOM_IGNORED_SELECTOR)) continue;
        // Text/title replacement inside a native result link is relevant; a
        // tooltip or author picker added elsewhere inside a card is not.
        if (target && target.closest('a[href*="sharedfiles/filedetails/?id="], .workshopItemTitle, .fileRating')) {
            scheduleDomWork(2);
            return;
        }
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
            if (containsRelevantDom(node, DOM_RESULT_SELECTOR) || containsRelevantDom(node, DOM_CONTROL_SELECTOR)) {
                scheduleDomWork(2);
                return;
            }
            if (widthSync && nodeContainsSortButton(node)) {
                // React replaced the native sort node; re-resolve and re-apply.
                scheduleDomWork(1);
            }
        }
    }
});

observer.observe(document, {
    childList: true,
    subtree: true
});

// The only attribute this script needs is the hydration signal on <html>
// (see hydration-signal.js); watching every attribute in the document made
// the observer fire on Steam's constant hover and animation churn.
new MutationObserver(changes => scheduleDomWork(changes.some(change => change.attributeName !== 'data-wshs-sidebar-position') ? 2 : 1)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-wshs-hydrated','data-wshs-search-hydrated','data-wshs-sidebar-position']
});

init();
