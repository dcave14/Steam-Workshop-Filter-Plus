// Prefer optional keyed batch lookups; public Required Items pages remain a fallback.
(function () {
    'use strict';
    var cache = new Map(), pending = new Set(), failures = new Map(), queue = [], listeners = [];
    var active = 0, TTL = 15 * 60 * 1000, PREFIX = 'workshopDependencies:', pausedUntil = 0, pruneTimer = null, apiNote = '', generation = 0;
    async function apiRows(ids, version) {
        if (!chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') return;
        try {
            var state = await chrome.runtime.sendMessage({ type: 'wshs-api-status' });
            if (!state || !state.configured) { apiNote = ''; return false; }
            if (!state.permitted) { apiNote = 'Allow API access in API key settings.'; return true; }
            for (var start = 0; start < ids.length && version === generation; start += 100) {
                var batch = ids.slice(start, start + 100);
                var result = await chrome.runtime.sendMessage({ type: 'wshs-api-required-items', ids: batch });
                if (version !== generation) return;
                if (!result || !result.ok) { apiNote = (result && result.message || 'API unavailable.') + ' Retry to verify missing items.'; return true; }
                apiNote = '';
                var update = {};
                result.rows.forEach(function (row) {
                    if (batch.indexOf(row.id) === -1 || !Array.isArray(row.ids) || !row.ids.every(function (id) { return typeof id === 'string' && /^\d+$/.test(id); })) return;
                    var record = { ids: row.ids, title: row.title, updated: row.updated };
                    cache.set(row.id, record); pending.delete(row.id); failures.delete(row.id); update[PREFIX + row.id] = record;
                });
                if (Object.keys(update).length) await chrome.storage.local.set(update);
                notify();
            }
            return true;
        } catch (_) { apiNote = 'API unavailable. Retry to verify missing items.'; return true; }
    }
    function schedulePrune() {
        if (pruneTimer !== null) clearTimeout(pruneTimer);
        pruneTimer = setTimeout(async function () {
            pruneTimer = null;
            try {
                var all = await chrome.storage.local.get(null);
                var keys = Object.keys(all).filter(function (key) { return key.indexOf(PREFIX) === 0; });
                keys.sort(function (a, b) { return (all[b].updated || 0) - (all[a].updated || 0); });
                var stale = keys.filter(function (key, i) { return i >= 5000 || !all[key].updated || Date.now() - all[key].updated >= TTL; });
                if (stale.length) await chrome.storage.local.remove(stale);
            } catch (_) {}
        }, 2000);
    }
    function get(id) { var row = cache.get(String(id)); return row && Date.now() - row.updated < TTL ? row.ids : null; }
    function notify() { listeners.forEach(function (fn) { fn(); }); }
    async function read(id) {
        try {
            var fetcher = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
            var response = await fetcher('/sharedfiles/filedetails/?id=' + id, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
            var html = await response.text();
            if (response.status === 429 || /too many requests recently/i.test(html)) {
                pausedUntil = Date.now() + 60000;
                queue.splice(0).forEach(function (queued) { pending.delete(queued); failures.set(queued, pausedUntil); });
            }
            if (!response.ok || pausedUntil > Date.now()) throw Error('Required items unavailable');
            var doc = new DOMParser().parseFromString(html, 'text/html');
            // Error/login/rate-limit pages must never become a verified empty list.
            if (!doc.querySelector('.workshopItemTitle') || !doc.querySelector('.workshopItemDescription')) throw Error('Item unavailable');
            var ids = Array.from(doc.querySelectorAll('#RequiredItems a[href]')).map(function (a) {
                var url = new URL(a.getAttribute('href'), location.origin);
                return url.hostname === 'steamcommunity.com' && /\/(?:sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname) ? url.searchParams.get('id') : null;
            }).filter(function (value) { return /^\d+$/.test(value || ''); });
            cache.set(id, { ids: Array.from(new Set(ids)), title: doc.querySelector('.workshopItemTitle').textContent.trim(), updated: Date.now() });
            var update = {}; update[PREFIX + id] = cache.get(id);
            try { await chrome.storage.local.set(update); } catch (_) {}
            failures.delete(id);
            while (cache.size > 5000) cache.delete(cache.keys().next().value);
        } catch (_) { failures.set(id, Date.now() + 60000); }
        finally { pending.delete(id); active--; pump(); notify(); if (!active && !queue.length) schedulePrune(); }
    }
    function pump() { while (active < 2 && queue.length) { active++; read(queue.shift()); } }
    function request(ids, force) {
        var missing = Array.from(new Set(ids)).filter(function (id) {
            return /^\d+$/.test(id || '') && !pending.has(id) && get(id) === null && (force || !(failures.get(id) > Date.now()));
        });
        if (!missing.length || (!force && pausedUntil > Date.now())) return;
        if (force) pausedUntil = 0;
        var version = generation;
        missing.forEach(function (id) { pending.add(id); });
        (async function () {
            var stored = {};
            try { stored = await chrome.storage.local.get(missing.map(function (id) { return PREFIX + id; })); } catch (_) {}
            if (version !== generation) return;
            var incomplete = [];
            missing.forEach(function (id) {
                var row = stored[PREFIX + id];
                if (row && Number.isFinite(row.updated) && row.updated <= Date.now() && Date.now() - row.updated < TTL &&
                    typeof row.title === 'string' && Array.isArray(row.ids) && row.ids.every(function (value) { return typeof value === 'string' && /^\d+$/.test(value); })) {
                    cache.set(id, row); pending.delete(id);
                } else if (pausedUntil > Date.now()) { pending.delete(id); failures.set(id, pausedUntil); }
                else incomplete.push(id);
            });
            var apiMode = await apiRows(incomplete, version);
            if (version !== generation) return;
            incomplete.forEach(function (id) {
                if (get(id) !== null) return;
                if (apiMode) { pending.delete(id); failures.set(id, Date.now() + 60000); }
                else queue.push(id);
            });
            pump(); notify();
            if (!active && !queue.length) schedulePrune();
        })();
    }
    if (chrome.storage.onChanged) chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes.steamWebApiRevision) return;
        generation++; apiNote = ''; failures.clear(); pausedUntil = 0;
        queue.splice(0).forEach(function (id) { pending.delete(id); });
        pending.clear(); notify();
    });
    window.WSHSDependencies = { get: get, title: function (id) { var row = cache.get(id); return row && row.title; }, message: function () { return apiNote; }, request: request, pending: function (id) { return pending.has(String(id)); }, onChange: function (fn) { listeners.push(fn); } };
})();
