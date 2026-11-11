// Runs in the extension background context. The key never enters Steam's page world.
if (typeof importScripts === 'function') importScripts('api-config.js', 'api-data.js');
(function () {
    'use strict';
    var ORIGIN = 'https://api.steampowered.com/*';
    var KEY = 'steamWebApiKey';
    var pendingDetails = new Map();
    var messages = {
        auth: 'Steam rejected the API key. Check the saved key or its access permissions.',
        permission: 'Allow access to api.steampowered.com in the extension settings.',
        missing: 'No Steam Web API key is saved.',
        rate: 'Steam is limiting API requests. Try again later.',
        unavailable: 'Steam data could not be verified. Retry to verify missing items.'
    };
    async function status() {
        if (globalThis.WSHS_API_CONFIG && globalThis.WSHS_API_CONFIG.serviceUrl) return { configured: true, permitted: true, mode: 'service' };
        var stored = await chrome.storage.local.get(KEY);
        return { configured: typeof stored[KEY] === 'string' && /^[a-f0-9]{32}$/i.test(stored[KEY]),
            permitted: await chrome.permissions.contains({ origins: [ORIGIN] }) };
    }
    function failure(code) { return { ok: false, code: code, message: messages[code] }; }
    async function fetchDetails(ids) {
        if (!globalThis.WSHSApiData.validIds(ids)) return failure('unavailable');
        var state = await status();
        if (!state.configured) return failure('missing');
        if (!state.permitted) return failure('permission');
        try {
            if (state.mode === 'service') {
                var service = new URL('/v1/items', globalThis.WSHS_API_CONFIG.serviceUrl);
                var answer = await fetch(service.href, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }), signal: AbortSignal.timeout(25000) });
                if (!answer.ok) return failure(answer.status === 429 ? 'rate' : 'unavailable');
                var result = await answer.json();
                return result && result.ok && Array.isArray(result.rows) ? result : failure('unavailable');
            }
            var stored = await chrome.storage.local.get(KEY);
            var url = new URL('https://api.steampowered.com/IPublishedFileService/GetDetails/v1/');
            url.searchParams.set('input_json', JSON.stringify({ publishedfileids: ids, includechildren: true, includevotes: true }));
            var response = await fetch(url.href, { credentials: 'omit', headers: { 'x-webapi-key': stored[KEY] }, signal: AbortSignal.timeout(20000) });
            if (response.status === 401 || response.status === 403) return failure('auth');
            if (response.status === 429) return failure('rate');
            if (!response.ok) return failure('unavailable');
            var rows = globalThis.WSHSApiData.parseRows(await response.json(), ids);
            return rows.length ? { ok: true, rows: rows } : failure('unavailable');
        } catch (_) { return failure('unavailable'); } // Never return network exceptions containing credentials.
    }
    function details(ids) {
        if (!globalThis.WSHSApiData.validIds(ids)) return Promise.resolve(failure('unavailable'));
        var unique = Array.from(new Set(ids)).sort(), key = unique.join(',');
        if (pendingDetails.has(key)) return pendingDetails.get(key);
        var job = fetchDetails(unique).finally(function () { pendingDetails.delete(key); });
        pendingDetails.set(key, job);
        return job;
    }
    chrome.runtime.onMessage.addListener(function (message, sender, respond) {
        if (sender.id !== chrome.runtime.id || !message) return;
        var action;
        if (message.type === 'wshs-api-status') action = status();
        else if (message.type === 'wshs-api-required-items' || message.type === 'wshs-api-details') action = details(message.ids);
        else if (message.type === 'wshs-open-settings') action = chrome.runtime.openOptionsPage().then(function () { return { ok: true }; });
        else return;
        action.then(respond, function () { respond(failure('unavailable')); });
        return true;
    });
})();
