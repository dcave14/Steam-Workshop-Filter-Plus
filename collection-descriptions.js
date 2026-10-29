// Full public descriptions, fetched only for an opted-in active collection search.
// Steam allows CORS from steamcommunity.com; no host permission or API key needed.
(function () {
    'use strict';
    var records = new Map(), pending = new Map(), failures = new Map(), listeners = [];
    var TTL = 15 * 60 * 1000;
    function notify() { listeners.forEach(function (fn) { fn(); }); }
    function get(id) {
        var row = records.get(id);
        return row && Date.now() - row.updated < TTL ? row.text : null;
    }
    async function readDetailPage(id) {
        try {
            var fetcher = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
            var response = await fetcher('/sharedfiles/filedetails/?id=' + id, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
            if (!response.ok) return;
            var doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            var description = doc.querySelector('.workshopItemDescription');
            if (description) records.set(id, { text: description.textContent, updated: Date.now() });
        } catch (_) { /* Inaccessible details remain unknown and offer Retry. */ }
    }
    async function load(ids) {
        for (var offset = 0; offset < ids.length; offset += 100) {
            var batch = ids.slice(offset, offset + 100), rows = null;
            var api = window.WSHSApiClient ? await window.WSHSApiClient.get(batch) : { active: false };
            if (api.active) {
                if (api.ok) rows = api.rows.filter(function (row) { return typeof row.description === 'string'; }).map(function (row) { return { publishedfileid: row.id, result: 1, description: row.description }; });
            }
            for (var attempt = 0; !api.active && attempt < 2; attempt++) {
                try {
                    // Literal brackets are accepted by Steam's public form endpoint.
                    var body = 'itemcount=' + batch.length + batch.map(function (id, i) { return '&publishedfileids[' + i + ']=' + id; }).join('');
                    var fetcher = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
                    var response = await fetcher('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
                        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, signal: AbortSignal.timeout(20000)
                    });
                    if (!response.ok) throw Error('Descriptions unavailable');
                    var json = await response.json();
                    rows = json.response && json.response.publishedfiledetails;
                    if (!Array.isArray(rows)) throw Error('Descriptions unavailable');
                    break;
                } catch (_) { if (!attempt) await new Promise(function (resolve) { setTimeout(resolve, 500); }); }
            }
            if (!rows) {
                ids.slice(offset).forEach(function (id) { failures.set(id, Date.now() + 60000); });
                break;
            }
            rows.forEach(function (row) {
                var id = String(row.publishedfileid);
                if (batch.indexOf(id) === -1 || row.result !== 1 || typeof row.description !== 'string') return;
                records.set(id, { text: row.description, updated: Date.now() });
            });
            // Some accessible Workshop pages are omitted by the public API.
            // Read only those pages, at most four at a time.
            var incomplete = batch.filter(function (id) { return get(id) === null; });
            if (!api.active) for (var i = 0; i < incomplete.length; i += 4) await Promise.all(incomplete.slice(i, i + 4).map(readDetailPage));
            batch.forEach(function (id) { if (get(id) === null) failures.set(id, Date.now() + 60000); });
            notify();
        }
        // In-memory only: descriptions never use the extension's storage quota.
        while (records.size > 5000) records.delete(records.keys().next().value);
    }
    function request(ids, force) {
        ids = Array.from(new Set(ids)).filter(function (id) { return typeof id === 'string' && /^\d+$/.test(id); });
        var missing = ids.filter(function (id) { return get(id) === null && !pending.has(id) && (force || !(failures.get(id) > Date.now())); });
        if (missing.length) {
            var job = load(missing).finally(function () {
                missing.forEach(function (id) { pending.delete(id); });
                notify();
            });
            missing.forEach(function (id) { pending.set(id, job); });
        }
        return Promise.all(Array.from(new Set(ids.map(function (id) { return pending.get(id); }).filter(Boolean))));
    }
    window.WSHSDescriptions = { get: get, request: request, pending: function (id) { return pending.has(id); }, onChange: function (fn) { listeners.push(fn); } };
})();
