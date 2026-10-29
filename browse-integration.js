// MAIN world: guarded access to Steam's existing browse and preference callbacks.
// No bundle names, copied cards, fetch replacements or direct React state writes.
(function () {
    'use strict';
    if (!/\/workshop\/browse\/?$/.test(location.pathname)) return;
    var root = document.documentElement, frame = null, restoredUrl = '', appliedPosition = '', select = null, nativeControl = null;
    var sizes = [10, 15, 30, 50, 75, 100];
    // A reload retains Steam's client query in navigation state, while SSR
    // normalizes extended sizes to 30. Match that first render, then restore below.
    try {
        var entry = window.navigation && window.navigation.currentEntry;
        var saved = entry ? entry.getState() : history.state;
        if (saved && saved.workshopBrowseQuery && [75,100].indexOf(saved.workshopBrowseQuery.num_per_page) !== -1) {
            var initial = Object.assign({}, saved, { workshopBrowseQuery: Object.assign({}, saved.workshopBrowseQuery, { num_per_page: 30 }) });
            if (entry) window.navigation.updateCurrentEntry({ state: initial });
            else history.replaceState(initial, '');
        }
    } catch (_) {}
    function discover() {
        var controls = document.querySelectorAll('#CommunityTemplate [role="combobox"]');
        var fallback = null;
        for (var control of controls) {
            var key = Object.keys(control).find(function (key) { return key.indexOf('__reactFiber$') === 0; });
            if (!key) continue;
            var browse = null, preferences = null, pageSize = null;
            var host = control[key], top = host;
            while (top.return) top = top.return;
            if (top.stateNode && top.stateNode.current && top.stateNode.current !== top && host.alternate) host = host.alternate;
            for (var fiber = host, depth = 0; fiber && depth < 100; fiber = fiber.return, depth++) {
                if (fiber.memoizedState && (fiber.memoizedState.dehydrated || fiber.memoizedState.isDehydrated)) { pageSize = null; break; }
                var props = fiber.memoizedProps;
                if (props && Array.isArray(props.options) && [10, 15, 30, 50].every(function (n) { return props.options.indexOf(n) !== -1; }) && typeof props.onSelectionChange === 'function') pageSize = props;
                for (var dependency = fiber.dependencies && fiber.dependencies.firstContext; dependency; dependency = dependency.next) {
                    var value = dependency.memoizedValue;
                    if (!browse && value && typeof value.onBrowseHandler === 'function' && typeof value.setOnBrowseHandler === 'function') browse = value;
                    if (!preferences && value && value.preferences && typeof value.setPreferences === 'function') preferences = value;
                }
            }
            if (pageSize && browse) return { control: control, browse: browse, preferences: preferences, selected: pageSize.selectedValue };
            if (browse && preferences && !fallback) fallback = { control: null, browse: browse, preferences: preferences, selected: null };
        }
        return fallback;
    }
    function sync() {
        frame = null;
        if (root.getAttribute('data-wshs-page-hydrated') !== '1') return;
        var state = discover();
        if (!state) {
            if (select) select.remove(); select = null;
            if (nativeControl) nativeControl.classList.remove('wshs-native-page-size');
            return;
        }
        var position = root.getAttribute('data-wshs-sidebar-position');
        if (state.preferences && (position === 'left' || position === 'right') && appliedPosition !== position) {
            appliedPosition = position;
            if (state.preferences.preferences.filters_column !== position) { state.preferences.setPreferences({ filters_column: position }); return; }
        }
        var value = Number(state.selected);
        var url = new URL(location.href);
        // Steam normalizes extended sizes to 30 during SSR. Restore after hydration,
        // retaining the requested page and every native search/tag/sort field.
        var requestedSize = Number(url.searchParams.get('num_per_page'));
        if ([75,100].indexOf(requestedSize) !== -1 && value !== requestedSize && restoredUrl !== url.href) {
            restoredUrl = url.href;
            var page = Number(url.searchParams.get('p') || 1);
            state.browse.onBrowseHandler({ num_per_page: requestedSize, page: Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1 });
        }
        if (!state.control) {
            if (select) select.remove(); select = null;
            if (nativeControl) nativeControl.classList.remove('wshs-native-page-size'); nativeControl = null;
            return;
        }
        if (!select || nativeControl !== state.control || !select.isConnected) {
            if (select) select.remove();
            if (nativeControl) nativeControl.classList.remove('wshs-native-page-size');
            nativeControl = state.control;
            select = document.createElement('select'); select.className = 'wshs-page-size'; select.setAttribute('aria-label', 'Mods per page');
            sizes.forEach(function (size) { var option = document.createElement('option'); option.value = String(size); option.textContent = String(size); select.appendChild(option); });
            select.addEventListener('change', function () {
                var next = discover(), size = Number(select.value);
                if (!next || sizes.indexOf(size) === -1) return;
                // A new size starts at page one, as Steam's native selector does.
                next.browse.onBrowseHandler({ num_per_page: size, page: 1 });
            });
            nativeControl.insertAdjacentElement('afterend', select); nativeControl.classList.add('wshs-native-page-size');
        }
        if (sizes.indexOf(value) !== -1 && select.value !== String(value)) select.value = String(value);
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(sync); }
    window.addEventListener('wshs-reset-toolbar-sort', function (event) {
        var state = discover();
        if (!state) return;
        state.browse.onBrowseHandler({ browse_sort: 'trend', trend_days: 7, page: 1 });
        event.preventDefault();
    });
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-wshs-page-hydrated', 'data-wshs-sidebar-position'] });
    window.addEventListener('popstate', schedule);
    if (window.navigation) window.navigation.addEventListener('currententrychange', schedule);
    schedule();
})();
