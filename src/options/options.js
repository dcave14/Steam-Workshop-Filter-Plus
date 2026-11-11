(function () {
    'use strict';
    var KEY = 'steamWebApiKey', ORIGIN = 'https://api.steampowered.com/*';
    var input = document.getElementById('api-key'), output = document.getElementById('status');
    var buttons = Array.from(document.querySelectorAll('button'));
    function busy(value) { buttons.forEach(function (button) { button.disabled = value; }); }
    async function test() {
        busy(true); output.textContent = 'Testing dependency lookup with Steam…';
        try {
            var result = await chrome.runtime.sendMessage({ type: 'wshs-api-required-items', ids: ['3812510377'] });
            output.textContent = result && result.ok && result.rows.some(function (row) { return Array.isArray(row.ids); }) ? 'API verified. Steam returned a complete required-item list. Filters will use the API for dependencies, descriptions, sizes, and ratings.' : result && result.message || 'The lookup could not be verified.';
        } catch (_) { output.textContent = 'The extension could not complete the test. Reload this settings page and try again.'; }
        finally { busy(false); }
    }
    document.getElementById('key-form').addEventListener('submit', async function (event) {
        event.preventDefault();
        var key = input.value.trim();
        if (key && !/^[a-f0-9]{32}$/i.test(key)) { output.textContent = 'Enter the 32 hexadecimal characters shown on Steam’s API key page.'; return; }
        busy(true);
        try {
            // Request only this optional host, directly from the user's Save click.
            var granted = await chrome.permissions.request({ origins: [ORIGIN] });
            if (!granted) { output.textContent = 'API access was not granted. The key was not changed.'; return; }
            if (key) {
                await chrome.storage.local.set({ steamWebApiKey: key, steamWebApiRevision: Date.now() });
                input.value = '';
            }
            await test();
        } catch (_) { output.textContent = 'Settings could not be saved. Reload this page and try again.'; }
        finally { busy(false); }
    });
    document.getElementById('test').addEventListener('click', test);
    document.getElementById('service-test').addEventListener('click', test);
    document.getElementById('remove').addEventListener('click', async function () {
        busy(true);
        try {
            await chrome.storage.local.remove(KEY);
            await chrome.storage.local.set({ steamWebApiRevision: Date.now() });
            input.value = '';
            await chrome.permissions.remove({ origins: [ORIGIN] });
            output.textContent = 'Key removed. Dependency filters will use public Workshop pages.';
        } catch (_) { output.textContent = 'The key could not be removed. Try again.'; }
        finally { busy(false); }
    });
    chrome.runtime.sendMessage({ type: 'wshs-api-status' }).then(function (state) {
        if (state.mode === 'service') {
            document.getElementById('personal-settings').hidden = true;
            document.getElementById('service-settings').hidden = false;
            output.textContent = 'The shared data service is configured. Use Test connection to verify access.';
            return;
        }
        output.textContent = state.configured ? state.permitted ? 'A key is saved in this browser. Use Test saved key to verify dependency access.' : 'A key is saved, but API access is not granted. Use Save and test to allow access.' : 'No key is saved. Paste your key above to enable API dependency lookups.';
    }).catch(function () { output.textContent = 'Settings could not be read. Reload this page.'; });
})();
