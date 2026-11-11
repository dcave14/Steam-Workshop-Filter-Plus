// Collection Design C. Move original Steam nodes; all account actions and filters
// continue using their existing handlers, IDs, storage and metadata providers.
(function () {
    'use strict';
    if (!/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) return;
    var root = document.documentElement, layout = null, frame = null, preferences = {}, preferencesReady = false;
    var prepared = new WeakSet(), rows = [], rowInfo = new WeakMap(), rowFlags = new WeakMap(), rowsDirty = true, heroDirty = true, awards = null, description = null, sidebar = null, sidebarSlot = null, presentationFrame = null, observedHover = null;
    var sizeFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits:1});
    function node(tag, name, text) { var n = document.createElement(tag); n.className = name; if (text) n.textContent = text; return n; }
    function text(n, value) { if (n.textContent === value) return; if (n.firstChild?.nodeType === 3 && !n.firstChild.nextSibling) n.firstChild.nodeValue = value; else n.textContent = value; }
    function property(n, key, value) { if (n.style.getPropertyValue(key) !== value) n.style.setProperty(key, value); }
    function flag(n, name, value) { if (n.classList.contains(name) !== value) n.classList.toggle(name, value); }
    function visibility(row) { return ['wshs-filtered','hidden-item','wshs-ratings-filtered','wshs-design-search-hidden'].map(function (c) { return row.classList.contains(c) ? '1' : '0'; }).join(''); }
    function mark(n, name) { if (n) n.classList.add(name); return n; }
    function move(n, host) { if (n && n.parentElement !== host) host.appendChild(n); }
    function button(label, action) { var n = node('button', 'wshs-design-text-button', label); n.type = 'button'; n.addEventListener('click', action); return n; }
    // Collapsed preview: a text-only copy of the formatted description. Media,
    // image-only links and the line breaks they leave are dropped; CSS clips it.
    function preview(source) {
        var copy = source.cloneNode(true), blank = function (n) { return n && (n.nodeName === 'BR' || n.nodeType === Node.TEXT_NODE && !n.textContent.trim()); };
        copy.removeAttribute('id'); copy.hidden = false; copy.className = 'wshs-design-description-preview';
        copy.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
        copy.querySelectorAll('img,iframe,video,script,style').forEach(function (media) {
            var link = media.closest('a'), box = link && copy.contains(link) && !link.textContent.trim() ? link : media;
            if (box.nextElementSibling?.matches('.bb_link_host')) box.nextElementSibling.remove();
            if (box.nextSibling?.nodeName === 'BR') box.nextSibling.remove();
            box.remove();
        });
        while (blank(copy.firstChild)) copy.firstChild.remove();
        // Block elements carry their own spacing; breaks around them become gaps.
        copy.querySelectorAll('.bb_h1,.bb_h2,.bb_h3,.bb_code,.bb_ul,.bb_ol,ul,ol').forEach(function (block) {
            ['previousSibling', 'nextSibling'].forEach(function (side) { var n = block[side]; while (blank(n)) { var next = n[side]; n.remove(); n = next; } });
        });
        if (!copy.textContent.trim()) copy.textContent = 'No description provided.';
        copy.inert = true; copy.setAttribute('aria-hidden', 'true');
        return copy;
    }
    function moveRelatedCollections(host) {
        var original = document.querySelector('.collection'); if (!original) return;
        var related = node('section', 'wshs-design-related');
        original.querySelectorAll('.childrenTitle').forEach(function (heading) {
            var grid = heading.nextElementSibling?.querySelector('.collections'); if (!grid) return;
            mark(heading, 'wshs-design-related-heading'); mark(grid, 'wshs-design-linked-grid'); related.append(heading, grid);
        });
        original.querySelectorAll('.parentCollections').forEach(function (parents) {
            var heading = parents.parentElement.querySelector('.parentCollectionsTitle');
            if (heading) { mark(heading, 'wshs-design-related-heading'); related.appendChild(heading); }
            mark(parents, 'wshs-design-parent-list'); related.appendChild(parents);
        });
        if (related.children.length) host.appendChild(related);
        original.querySelectorAll('.detailBox').forEach(function (box) {
            var visible = Array.from(box.children).some(function (n) { return !n.hidden && !n.matches('script,style') && (n.textContent.trim() || n.querySelector('a,img,input,button')); });
            if (!visible) box.hidden = true;
        });
        var remaining = Array.from(original.children).some(function (n) { return !n.hidden && !n.matches('script,style') && n.textContent.trim(); });
        if (!remaining) { mark(original, 'wshs-design-empty-source'); original.hidden = true; }
    }
    function moveCollectionDetails() {
        var source = document.querySelector('.sidebar.responsive_local_menu'); if (!source) return;
        var details = node('section', 'wshs-design-sidebar-details');
        Array.from(source.children).filter(function (n) { return n.matches('.panel'); }).forEach(function (panel) {
            panel.querySelectorAll('.rightSectionHolder').forEach(function (holder) {
                var block = holder.querySelector('.rightDetailsBlock');
                if (block && !block.textContent.trim() && !block.querySelector('a,img,input,button')) holder.hidden = true;
            });
            var meaningful = Array.from(panel.children).some(function (n) { return !n.hidden && (n.textContent.trim() || n.querySelector('a,img')); });
            if (meaningful) { mark(panel, 'wshs-design-detail-panel'); details.appendChild(panel); }
        });
        if (details.children.length) sidebar.appendChild(details);
        mark(source, 'wshs-design-source-sidebar'); source.hidden = true;
    }
    function initialize() {
        var children = document.querySelector('.collectionChildren'), subscribe = document.querySelector('.subscribeCollection');
        var top = document.querySelector('.collectionTop, .collectionTopNoBackgroundImage'), title = document.querySelector('.collectionHeader .workshopItemTitle');
        var filters = document.querySelector('.wshs-collection-filters');
        // Do not redesign mod details, comments/discussion routes, or an incomplete page.
        if (!children || !subscribe || !top || !title || !filters) return false;
        var sourceDescription = document.querySelector('.workshopItemDescriptionForCollection .workshopItemDescription');
        var nativeHeader = children.previousElementSibling;
        layout = node('div', 'wshs-design-collection'); top.before(layout);
        var tabs = document.querySelector('.sharedfiles_tabs_ctn'); move(tabs, layout);
        var hero = node('header', 'wshs-design-hero'), cover = node('div', 'wshs-design-cover');
        var nativeBanner = top.querySelector('img.collectionBackgroundImage');
        if (nativeBanner?.getAttribute('src')) {
            var banner = node('img', 'wshs-design-banner-art');
            banner.alt = ''; banner.setAttribute('aria-hidden', 'true'); banner.draggable = false; banner.decoding = 'async';
            banner.addEventListener('error', function () { hero.classList.remove('wshs-has-banner-art'); banner.remove(); });
            banner.src = nativeBanner.currentSrc || nativeBanner.src;
            hero.classList.add('wshs-has-banner-art'); hero.appendChild(banner);
        }
        var coverImage = node('img', ''); coverImage.src = document.querySelector('meta[property="og:image"]')?.content || top.querySelector('.collectionBackgroundImage')?.src || '';
        coverImage.alt = title.textContent.trim(); move(coverImage, cover);
        var info = node('div', 'wshs-design-info'); move(title, info);
        var creator = document.querySelector('.creatorsBlock .friendBlockLinkOverlay');
        if (creator) { var by = node('div', 'wshs-design-byline', 'By '), link = node('a', '', creator.parentElement.querySelector('.friendBlockContent')?.childNodes[0]?.textContent.trim() || creator.href.split('/').filter(Boolean).pop()); link.href = creator.href; by.appendChild(link); info.appendChild(by); }
        var rating = mark(document.querySelector('.ratingSection'), 'wshs-design-rating');
        hero.append(cover, info); move(rating, hero);
        awards = mark(document.querySelector('.review_award_ctn'), 'wshs-design-awards'); move(awards, hero);
        var stats = node('div', 'wshs-design-stats');
        var statRights = Array.from(document.querySelectorAll('.detailsStatRight'));
        document.querySelectorAll('.detailsStatLeft').forEach(function (left, i) {
            var right = statRights[i]; if (!right) return;
            var stat = node('span', 'wshs-design-stat'); if (/^(Posted|Updated)$/i.test(left.textContent.trim())) stat.append(left, right); else stat.append(right, left); stats.appendChild(stat);
        });
        // Account actions (rate, award, favorite, share) sit under the byline.
        var controls = mark(document.querySelector('#ItemControls'), 'wshs-design-native-actions'); move(controls, info);
        layout.append(hero, stats);
        if (sourceDescription) {
            description = node('section', 'wshs-design-description');
            var main = node('div', 'wshs-design-description-main'), head = node('header', 'wshs-design-description-header');
            var toggle = button('Collapse description ↑', function () { setExpanded(!description.classList.contains('wshs-description-expanded')); });
            toggle.classList.add('wshs-design-description-toggle'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'highlightContent'); toggle.hidden = true;
            head.append(node('h2', '', 'About this collection'), toggle);
            var more = button('Read full description ↓', function () { setExpanded(true); });
            more.classList.add('wshs-design-description-more'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'highlightContent');
            main.append(head, preview(sourceDescription), sourceDescription, more); description.appendChild(main);
            sourceDescription.hidden = true;
            sourceDescription.querySelectorAll('img').forEach(function (img) { img.loading = 'lazy'; img.decoding = 'async'; });
            var bottom = button('Show less ↑', function () { setExpanded(false); }); bottom.classList.add('wshs-design-description-bottom'); main.appendChild(bottom); bottom.hidden = true;
            var authorPane = node('aside', 'wshs-design-authors'), authors = node('div', 'wshs-design-author-list');
            authors.tabIndex = 0; authors.setAttribute('aria-label', 'Mod authors');
            var authorNodes = document.querySelectorAll('.collectionItemAuthor');
            authorPane.append(node('h2', '', 'Mod authors (' + authorNodes.length + ')'), authors);
            authorNodes.forEach(function (author) { author.classList.add('wshs-design-author-row'); authors.appendChild(author); });
            description.appendChild(authorPane); layout.appendChild(description);
        }
        var heading = node('div', 'wshs-design-browsing');
        heading.append(node('span', '', 'Browsing: Collection items'), node('span', 'wshs-design-counts'));
        layout.appendChild(heading);
        var workspace = node('div', 'wshs-design-workspace'), results = node('main', 'wshs-design-results');
        sidebar = node('aside', 'wshs-design-sidebar');
        var search = node('input', 'wshs-design-search'); search.type = 'search'; search.placeholder = 'Search within this collection…'; search.setAttribute('aria-label', 'Search collection titles');
        search.addEventListener('input', function () { sync(); window.dispatchEvent(new Event('wshs-collection-search')); }); sidebar.append(search, filters);
        var settings = filters.querySelector('.wshs-api-settings');
        if (settings) { settings.textContent = settings.getAttribute('aria-label') || 'Data service settings'; filters.appendChild(settings); }
        sidebarSlot = node('div', 'wshs-design-sidebar-slot'); sidebarSlot.appendChild(sidebar);
        // Floats over the mod list (sticky, CSS) and hides near the page top.
        // Smooth unless the extension's or the system's reduce-motion setting is on.
        var backToTop = node('button', 'wshs-design-back-to-top wshs-back-to-top-hidden', 'Back to top ↑'); backToTop.type = 'button'; backToTopButton = backToTop;
        backToTop.addEventListener('click', function () {
            chrome.storage.local.get('reduceMotion').then(function (data) {
                var still = data.reduceMotion === true || matchMedia('(prefers-reduced-motion: reduce)').matches;
                scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
            });
        });
        results.append(subscribe, children, backToTop); workspace.append(results, sidebarSlot); layout.appendChild(workspace);
        mark(children, 'wshs-design-items');
        // The original summary is live metadata UI, not a captured total.
        var sizes = nativeHeader?.querySelector('.wshs-collection-sizes'); move(sizes, stats);
        if (nativeHeader?.matches('.workshopItemDescriptionTitle')) nativeHeader.hidden = true;
        top.hidden = true;
        var oldDescription = document.querySelector('.workshopItemDescriptionForCollection'); if (oldDescription?.parentElement.matches('.workshopItemDetails')) oldDescription.parentElement.hidden = true;
        // Popular discussions follow the mod list, at its width.
        move(mark(document.querySelector('.collection .detailBox.trendingdiscussions'), 'wshs-design-discussions'), results);
        // Linked and parent collections sit at the end of the sidebar.
        moveCollectionDetails(); moveRelatedCollections(sidebar);
        root.classList.add('wshs-collection-design');
        observeNativeHover();
        new ResizeObserver(function () { heroDirty = true; schedulePresentation(); }).observe(hero);
        document.fonts.ready.then(function () { heroDirty = true; schedulePresentation(); });
        if (awards) new ResizeObserver(sizeAwards).observe(awards);
        window.WSHSMetadata?.onChange(schedule);
        return true;
    }
    function setExpanded(expanded) {
        if (!description) return;
        description.classList.toggle('wshs-description-expanded', expanded);
        description.querySelector('.workshopItemDescription').hidden = !expanded;
        description.querySelector('.wshs-design-description-preview').hidden = expanded;
        description.querySelector('.wshs-design-description-bottom').hidden = !expanded;
        // Collapsed, the full-width "Read full description" button replaces the header toggle.
        var more = description.querySelector('.wshs-design-description-more'); more.hidden = expanded; more.setAttribute('aria-expanded', String(expanded));
        var toggle = description.querySelector('.wshs-design-description-toggle'); toggle.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded)); toggle.textContent = 'Collapse description ↑';
        if (!expanded) { description.scrollIntoView({block:'start'}); more.focus({preventScroll:true}); }
    }
    function sizeAwards() {
        if (!awards) return;
        var icons = awards.querySelectorAll('.review_award:has(img)'); if (!icons.length) return;
        var dense = icons.length * 64 >= awards.clientWidth;
        awards.classList.toggle('wshs-awards-dense', dense);
        awards.classList.remove('wshs-award-icons-only');
        var fixed = Array.from(awards.querySelectorAll('.review_award_count')).reduce(function (sum, n) { return sum + n.getBoundingClientRect().width + 2; }, 0) + icons.length * (dense ? 4 : 8);
        var size = (awards.clientWidth - fixed) / icons.length, counts = size >= 12;
        awards.classList.toggle('wshs-award-icons-only', !counts);
        awards.style.setProperty('--wshs-award-size', Math.max(4, Math.min(24, counts ? size : awards.clientWidth / icons.length - 4)) + 'px');
    }
    function prepareRows() {
        if (!rowsDirty) return; rowsDirty = false;
        rows = Array.from(layout.querySelectorAll('.collectionItem'));
        property(layout.querySelector('.wshs-design-items') || layout, '--wshs-row-number-digits', String(String(rows.length).length));
        rows.forEach(function (row, index) {
            if (!prepared.has(row)) { prepared.add(row); row.prepend(node('span', 'wshs-design-row-number', String(index + 1))); }
            var details = row.querySelector('.collectionItemDetails'), rating = details?.querySelector('.fileRating');
            if (details && !details.querySelector('.wshs-design-row-meta')) { var meta = node('div', 'wshs-design-row-meta'); move(rating, meta); meta.appendChild(node('span', 'wshs-design-row-size')); details.appendChild(meta); }
            var subscribe = row.querySelector('.subscriptionControls .general_btn');
            if (subscribe && !subscribe.querySelector('.wshs-design-subscribe-label')) subscribe.appendChild(node('span', 'wshs-design-subscribe-label'));
            var previous = rowInfo.get(row), size = row.querySelector('.wshs-design-row-size');
            rowInfo.set(row, {title:row.querySelector('.workshopItemTitle'),subscribe:subscribe,label:subscribe?.querySelector('.wshs-design-subscribe-label'),size:size,lastSize:previous?.size===size?previous.lastSize:undefined});
        });
    }
    function sync() {
        frame = null; if (!preferencesReady || preferences.collectionOverhaul === false) return;
        if (!layout && !initialize()) return;
        prepareRows();
        var shown = 0, hiddenSaved = 0, query = sidebar.querySelector('input').value.toLocaleLowerCase().trim();
        rows.forEach(function (row) {
            var info = rowInfo.get(row), title = info.title.textContent;
            var searchHidden = !!query && !title.toLocaleLowerCase().includes(query);
            flag(row, 'wshs-design-search-hidden', searchHidden);
            if (row.classList.contains('wshs-filtered')) hiddenSaved++;
            if (!row.matches('.wshs-filtered,.hidden-item,.wshs-ratings-filtered,.wshs-design-search-hidden')) shown++;
            var sub = info.subscribe;
            if (sub) { var subscribed = sub.classList.contains('toggled'); text(info.label, subscribed ? 'Subscribed' : 'Subscribe'); var name = (subscribed ? 'Unsubscribe from ' : 'Subscribe to ') + title; if (sub.getAttribute('aria-label') !== name) sub.setAttribute('aria-label', name); }
            var id = row.id.replace('sharedfile_', ''), data = window.WSHSMetadata?.get(id), bytes = Number.isSafeInteger(data?.size) ? data.size : null;
            if (info.size && info.lastSize !== bytes) { info.lastSize = bytes; text(info.size, bytes === null ? 'Size unavailable' : sizeFormat.format(bytes / 1e6) + ' MB'); }
            rowFlags.set(row, visibility(row));
        });
        text(layout.querySelector('.wshs-design-counts'), rows.length + ' items · ' + shown + ' shown · ' + hiddenSaved + ' hidden by saved filters');
        updatePresentation();
    }
    function updatePresentation() {
        presentationFrame = null; if (!layout) return;
        var side = preferences.sidebarPosition === 'right' ? 'right' : 'left';
        if (root.dataset.wshsCollectionSide !== side) root.dataset.wshsCollectionSide = side;
        flag(root, 'wshs-collection-compact', preferences.layoutDensity === 'compact');
        flag(root, 'wshs-collection-sidebar-pinned', preferences.pinnedSidebar === true);
        // Pinning is native position:sticky (CSS): the browser keeps it in step
        // with scrolling and stops it at the end of the collection grid.
        // Script-driven fixed positioning lagged a frame and bounced.
        flag(sidebar, 'wshs-design-sidebar-fixed', preferences.pinnedSidebar === true && innerWidth > 760);
        if (backToTopButton) flag(backToTopButton, 'wshs-back-to-top-hidden', scrollY < 400);
        if (heroDirty) {
            heroDirty = false;
            var title = layout.querySelector('.wshs-design-info>.workshopItemTitle'), rating = layout.querySelector('.wshs-design-rating');
            if (title && rating) property(rating, '--wshs-rating-top', (title.getBoundingClientRect().top - layout.querySelector('.wshs-design-hero').getBoundingClientRect().top) + 'px');
            sizeAwards();
        }
        constrainNativeHover();
    }
    function schedulePresentation() { if (presentationFrame === null) presentationFrame = requestAnimationFrame(updatePresentation); }
    var hoveredRow = null, backToTopButton = null;
    document.addEventListener('mouseover', function (e) { var row = e.target.closest?.('.collectionItem'); if (row && layout?.contains(row)) hoveredRow = row; }, { capture: true, passive: true });
    function observeNativeHover() {
        var hover = document.getElementById('workshop_item_hover'); if (!hover || hover === observedHover) return;
        observedHover = hover;
        var hoverPosition = '';
        new MutationObserver(function (changes) {
            var position = [hover.style.left,hover.style.top,hover.style.display,hover.style.width,hover.style.height].join('|');
            if (position !== hoverPosition || changes.some(function (m) { return m.type === 'childList'; })) { hoverPosition = position; schedulePresentation(); }
        }).observe(hover, {attributes:true,attributeFilter:['style'],childList:true,subtree:true});
        new ResizeObserver(schedulePresentation).observe(hover);
    }
    // Steam's row tooltip must not cover the hovered row (its subscribe button)
    // or the sidebar. Place it beside the row (right, then left) within the
    // results column, else below or above the row.
    function constrainNativeHover() {
        if (innerWidth <= 760 || !observedHover || !hoveredRow?.isConnected) return;
        var r = observedHover.getBoundingClientRect(); if (!r.width || !r.height) return;
        var row = hoveredRow.getBoundingClientRect(), pane = sidebar.getBoundingClientRect(), results = layout.querySelector('.wshs-design-results').getBoundingClientRect();
        var overlaps = function (a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; };
        if (!overlaps(r, row) && !overlaps(r, pane)) return;
        var left, top = r.top, gap = 8;
        if (row.right + gap + r.width <= results.right) left = row.right + gap;
        else if (row.left - gap - r.width >= results.left) left = row.left - gap - r.width;
        else {
            left = Math.max(results.left, Math.min(row.left, results.right - r.width));
            top = row.bottom + gap + r.height <= innerHeight || row.top - gap - r.height < 0 ? row.bottom + gap : row.top - gap - r.height;
        }
        if (Math.abs(left - r.left) > .5) observedHover.style.left = left + scrollX + 'px';
        if (Math.abs(top - r.top) > .5) observedHover.style.top = top + scrollY + 'px';
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(sync); }
    chrome.storage.local.get(['sidebarPosition','pinnedSidebar','layoutDensity','collectionOverhaul']).then(function (data) { preferences = data; preferencesReady = true; schedule(); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var overhaulChanged = changes.collectionOverhaul && (changes.collectionOverhaul.newValue !== false) !== (preferences.collectionOverhaul !== false);
        ['sidebarPosition','pinnedSidebar','layoutDensity','collectionOverhaul'].forEach(function (key) { if (changes[key]) preferences[key] = changes[key].newValue; });
        // Rebuild from Steam's original DOM instead of reversing moved native
        // nodes and potentially invalidating their account-action handlers.
        if (preferencesReady && overhaulChanged && (layout || document.querySelector('.collectionChildren'))) { location.reload(); return; }
        schedule();
    });
    // Observe input changes from existing filter/subscription code, not our own
    // count labels or metadata decorations (which otherwise loop indefinitely).
    new MutationObserver(function (changes) {
        if (preferencesReady && preferences.collectionOverhaul === false) return;
        if (!layout) { schedule(); return; }
        observeNativeHover();
        var dirty = false;
        changes.forEach(function (m) {
            var row = m.target.closest?.('.collectionItem'), info = row && rowInfo.get(row);
            if (info && (!info.title.isConnected || info.subscribe && (!info.subscribe.isConnected || !info.label.isConnected) || info.size && !info.size.isConnected)) { rowsDirty = true; dirty = true; }
            if (m.type === 'attributes') {
                if (m.target.matches('.subscribeCollection')) { schedulePresentation(); return; }
                if (m.attributeName !== 'class' && row) { rowsDirty = true; dirty = true; }
                if (m.target.matches('.collectionItem') ? rowFlags.get(m.target) !== visibility(m.target) : m.target.matches('.subscriptionControls .general_btn')) dirty = true;
                return;
            }
            if (info && (m.target === info.title || info.title.contains(m.target))) dirty = true;
            Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).forEach(function (n) {
                if (n.nodeType !== 1) return;
                if (n.matches('.collectionItem') || n.querySelector('.collectionItem')) { rowsDirty = true; dirty = true; }
                if (n.matches('.review_award')) { heroDirty = true; dirty = true; }
                if (n.matches('.wshs-collection-filters')) dirty = true;
            });
        });
        if (dirty) schedule();
    }).observe(document, {childList:true,subtree:true,attributes:true,attributeFilter:['class','id','href']});
    window.addEventListener('resize', function () { heroDirty = true; schedulePresentation(); }); window.addEventListener('scroll', schedulePresentation, {passive:true});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule); else schedule();
})();
