(function initCollectionSizes() {
    'use strict';
    if (!/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) return;
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initCollectionSizes, { once: true }); return; }
    var children = document.querySelector('.collectionChildren');
    var header = children && children.previousElementSibling;
    if (!header || !header.matches('.workshopItemDescriptionTitle') || !window.WSHSMetadata) return;
    var native = document.createElement('span'); native.className = 'wshs-collection-count';
    while (header.firstChild) native.appendChild(header.firstChild);
    header.appendChild(native);
    header.classList.add('wshs-collection-summary');
    var summary = document.createElement('div'); summary.className = 'wshs-collection-sizes';
    summary.setAttribute('role', 'status');
    summary.title = 'Steam-reported file sizes; installed disk usage may differ. MB = 1,000,000 bytes; GB = 1,000,000,000 bytes. After filters includes saved filters, star rating and Hide Subscribed.';
    var total = document.createElement('div'), filtered = document.createElement('div');
    total.className = 'wshs-size-total'; filtered.className = 'wshs-size-filtered';
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'wshs-size-retry'; retry.textContent = 'Retry'; retry.hidden = true;
    summary.append(total, filtered, retry); header.appendChild(summary);
    var frame = null, loading = false, refreshAgain = false;
    var cachedRows = null, visibility = new WeakMap();
    function visible(row) {
        return !row.classList.contains('wshs-filtered') && !row.classList.contains('hidden-item') && !row.classList.contains('wshs-ratings-filtered');
    }
    var sizeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    function items() {
        var result = new Map();
        if (!cachedRows) cachedRows = Array.from(children.querySelectorAll('.collectionItem')).map(function (row, i) {
            var link = row.querySelector('.collectionItemDetails > a');
            var match = link && /[?&]id=(\d+)/.exec(link.href);
            var id = match ? match[1] : 'unknown:' + i;
            return { row: row, id: id };
        });
        cachedRows.forEach(function (item) {
            var row = item.row, id = item.id;
            if (!row.isConnected) return;
            var eligible = visible(row);
            visibility.set(row, eligible);
            result.set(id, eligible || result.get(id) || false);
        });
        return result;
    }
    function format(bytes) {
        return sizeFormat.format(bytes / 1e6) + ' MB (' + sizeFormat.format(bytes / 1e9) + ' GB)';
    }
    function value(ids) {
        var bytes = 0, missing = 0, pending = false;
        ids.forEach(function (id) {
            var row = WSHSMetadata.get(id);
            if (row && Number.isSafeInteger(row.size) && row.size >= 0) bytes += row.size;
            else { missing++; if (WSHSMetadata.pending(id)) pending = true; }
        });
        if (missing && (loading || pending)) return { text: 'Loading…', missing: missing };
        if (missing === ids.length && missing) return { text: 'Unavailable (' + missing + ' mods)', missing: missing };
        return { text: (missing ? '≥ ' : '') + format(bytes) + (missing ? ' · ' + missing + ' unavailable' : ''), missing: missing, bytes: bytes };
    }
    // Replacing a text node (textContent) makes Chrome recheck Steam's
    // :root:has() rules across the whole page; editing the node's data does not.
    function text(n, value) { if (n.textContent === value) return; if (n.firstChild?.nodeType === 3 && !n.firstChild.nextSibling) n.firstChild.nodeValue = value; else n.textContent = value; }
    function render() {
        frame = null;
        var rows = items(), full = Array.from(rows.keys()), eligible = full.filter(function (id) { return rows.get(id); });
        var all = value(full), selected = value(eligible);
        text(total, 'Total: ' + all.text);
        text(filtered, 'After filters: ' + selected.text);
        summary.dataset.totalBytes = all.bytes === undefined ? '' : String(all.bytes);
        summary.dataset.filteredBytes = selected.bytes === undefined ? '' : String(selected.bytes);
        summary.dataset.totalMissing = String(all.missing);
        summary.dataset.filteredMissing = String(selected.missing);
        summary.setAttribute('aria-busy', String(loading));
        retry.hidden = loading || !all.missing;
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(render); }
    async function refresh(force) {
        if (loading) { refreshAgain = true; return; }
        loading = true; render();
        var ids = Array.from(items().keys());
        if (force) ids = ids.filter(function (id) { var row = WSHSMetadata.get(id); return !row || !Number.isSafeInteger(row.size); });
        try { await WSHSMetadata.request(ids, { fields: ['size'], force: !!force }); }
        finally { loading = false; schedule(); if (refreshAgain) { refreshAgain = false; refresh(); } }
    }
    retry.addEventListener('click', function (e) { e.stopPropagation(); refresh(true); });
    WSHSMetadata.onChange(schedule);
    new MutationObserver(function (changes) {
        var identityChanged = changes.some(function (m) { return m.type === 'attributes' && (m.attributeName === 'href' || m.attributeName === 'id'); });
        var rowsChanged = changes.some(function (m) { return m.type === 'childList' && Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).some(function (n) { return n.nodeType === 1 && (n.matches('.collectionItem') || n.querySelector('.collectionItem')); }); });
        if (identityChanged || rowsChanged) cachedRows = null;
        if (identityChanged) { schedule(); refresh(); }
        if (changes.some(function (m) { return m.type === 'attributes' && m.target.matches('.collectionItem') && visibility.get(m.target) !== visible(m.target); })) schedule();
        if (rowsChanged) { schedule(); refresh(); }
    }).observe(children, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'href', 'id'] });
    refresh();
})();
