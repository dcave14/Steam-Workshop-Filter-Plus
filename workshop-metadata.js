// Public item summaries use the same batched action as Steam's Quick View.
// Shared by collection sizes and minimum rating counts; no login/key required.
(function () {
    'use strict';
    var records = new Map(), pending = new Map(), failedUntil = new Map(), listeners = [];
    var TTL = 15 * 60 * 1000, PREFIX = 'workshopMetadata:';
    function integer(value) {
        if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
        var n = Number(value);
        return Number.isSafeInteger(n) && n >= 0 ? n : null;
    }
    function notify() { listeners.forEach(function (fn) { try { fn(); } catch (_) {} }); }
    function seed(rows, time) {
        rows.forEach(function (row) {
            var id = String(row.publishedfileid || '');
            if (!/^\d+$/.test(id)) return;
            var old = records.get(id) || {}, size = integer(row.file_size), ratings = integer(row.total_votes);
            if (size === null && ratings === null) return;
            records.set(id, { size: size === null ? old.size : size, ratings: ratings === null ? old.ratings : ratings, updated: time || Date.now() });
        });
    }
    function ready(id, fields) {
        var row = records.get(id);
        return row && Date.now() - row.updated < TTL && fields.every(function (field) { return integer(row[field]) !== null; });
    }
    async function prune() {
        try {
            var all = await chrome.storage.local.get(null);
            var keys = Object.keys(all).filter(function (k) { return k.indexOf(PREFIX) === 0; });
            keys.sort(function (a, b) { return (all[b].updated || 0) - (all[a].updated || 0); });
            var stale = keys.filter(function (k, i) { return i >= 5000 || Date.now() - all[k].updated > 86400000; });
            if (stale.length) await chrome.storage.local.remove(stale);
        } catch (_) { /* Cache maintenance never prevents reading sizes. */ }
    }
    async function load(ids, fields, force) {
        if (!force) {
            try {
                var cached = await chrome.storage.local.get(ids.map(function (id) { return PREFIX + id; }));
                ids.forEach(function (id) {
                    var row = cached[PREFIX + id];
                    if (!row || !Number.isFinite(row.updated) || row.updated > Date.now() || Date.now() - row.updated >= TTL) return;
                    seed([{ publishedfileid: id, file_size: row.size, total_votes: row.ratings }], row.updated);
                });
                notify();
            } catch (_) {}
        }
        var missing = ids.filter(function (id) { return force || !ready(id, fields); });
        for (var start = 0; start < missing.length; start += 100) {
            var batch = missing.slice(start, start + 100), rows = null;
            for (var attempt = 0; attempt < 2; attempt++) {
                try {
                    var url = new URL('/sharedfiles/actions', location.origin);
                    url.searchParams.set('q', 'GetUGCSummary');
                    url.searchParams.set('qp', JSON.stringify([batch]));
                    var fetcher = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
                    var response = await fetcher(url.href, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
                    if (!response.ok) throw Error('Metadata unavailable');
                    var json = await response.json();
                    if (!Array.isArray(json.data)) throw Error('Metadata unavailable');
                    rows = json.data.filter(function (row) { return row && batch.indexOf(String(row.publishedfileid)) !== -1; });
                    break;
                } catch (_) { if (!attempt) await new Promise(function (r) { setTimeout(r, 500); }); }
            }
            if (!rows) {
                missing.slice(start).forEach(function (id) { failedUntil.set(id, Date.now() + 60000); });
                break;
            }
            seed(rows);
            var update = {};
            batch.forEach(function (id) {
                var row = records.get(id);
                if (row) update[PREFIX + id] = row;
                if (!ready(id, fields)) failedUntil.set(id, Date.now() + 60000);
            });
            try { if (Object.keys(update).length) await chrome.storage.local.set(update); } catch (_) {}
            notify();
        }
        await prune();
    }
    function request(ids, options) {
        options = options || {};
        var fields = options.fields || ['size', 'ratings'];
        ids = Array.from(new Set(ids)).filter(function (id) { return typeof id === 'string' && /^\d+$/.test(id); });
        var missing = ids.filter(function (id) { return !pending.has(id) && (options.force || (!ready(id, fields) && !(failedUntil.get(id) > Date.now()))); });
        if (missing.length) {
            var job = load(missing, fields, !!options.force).finally(function () {
                missing.forEach(function (id) { pending.delete(id); });
                notify();
            });
            missing.forEach(function (id) { pending.set(id, job); });
        }
        return Promise.all(Array.from(new Set(ids.map(function (id) { return pending.get(id); }).filter(Boolean))));
    }
    window.WSHSMetadata = {
        get: function (id) { return records.get(String(id)); },
        seed: seed,
        request: request,
        pending: function (id) { return pending.has(String(id)); },
        onChange: function (fn) { listeners.push(fn); }
    };
})();
