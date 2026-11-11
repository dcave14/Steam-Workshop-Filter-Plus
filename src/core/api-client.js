(function () {
    'use strict';
    window.WSHSApiClient = {
        get: async function (ids) {
            if (!chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') return { active: false };
            try {
                var state = await chrome.runtime.sendMessage({ type: 'wshs-api-status' });
                if (!state || !state.configured) return { active: false };
                if (!state.permitted) return { active: true, ok: false, message: 'Allow API access in API key settings.' };
                var result = await chrome.runtime.sendMessage({ type: 'wshs-api-details', ids: ids });
                return Object.assign({ active: true }, result || { ok: false, message: 'API unavailable. Retry to verify missing data.' });
            } catch (_) { return { active: true, ok: false, message: 'API unavailable. Retry to verify missing data.' }; }
        }
    };
})();
