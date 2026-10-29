// Run in Steam's MAIN world: preserve its native subscription choices and
// confirmations, using its authenticated per-item API for filtered collections.
(function () {
    'use strict';
    var activePlan = null;
    var busy = false;
    var attribute = 'data-wshs-subscription-plan';

    function subscribeButton() {
        return document.querySelector('.subscribeCollection [onclick*="SubscribeCollection("]');
    }

    function readPlan() {
        var button = subscribeButton();
        var data;
        try { data = JSON.parse(button && button.getAttribute(attribute)); } catch (_) { return null; }
        if (!data || !/^\d+$/.test(data.appId) || data.collectionId !== new URLSearchParams(location.search).get('id')) return null;
        if (!Array.isArray(data.allowed) || !Array.isArray(data.excluded)) return null;
        var ids = data.allowed.concat(data.excluded);
        if (!ids.every(function (id) { return typeof id === 'string' && /^\d+$/.test(id); }) || new Set(ids).size !== ids.length) return null;
        // A partial or stale page must never become an overwrite plan.
        var rows = Array.from(document.querySelectorAll('.collectionItem'));
        var actual = rows.map(function (row) {
            var link = row.querySelector('.collectionItemDetails > a');
            return link && new URL(link.href).searchParams.get('id');
        });
        if (actual.length !== ids.length || actual.some(function (id) { return ids.indexOf(id) === -1; })) return null;
        return data;
    }

    function alert(title, text) {
        if (typeof window.ShowAlertDialog === 'function') window.ShowAlertDialog(title, text);
        else window.alert(text);
    }

    function samePlan(plan) {
        var current = readPlan();
        return current && JSON.stringify(current) === JSON.stringify(plan);
    }

    // Read the complete current subscription list BEFORE any write. Replacement
    // is unavailable if Steam's list cannot be recognized or verified in full.
    async function currentSubscriptions(appId) {
        if (!/^\d{17}$/.test(String(window.g_steamID))) throw Error('Sign in to Steam before replacing subscriptions.');
        var ids = new Set(), expected = null;
        for (var page = 1; page <= 1000; page++) {
            var url = new URL('/profiles/' + window.g_steamID + '/myworkshopfiles/', location.origin);
            url.search = new URLSearchParams({ appid: appId, browsefilter: 'mysubscriptions', numperpage: '30', p: String(page), l: 'english' });
            var response = await fetch(url.href, { credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
            if (!response.ok || !response.url.includes('/myworkshopfiles')) throw Error('Steam could not load your current subscriptions. Nothing has been removed.');
            var doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            var container = doc.querySelector('.workshopBrowseItems');
            if (!container) throw Error('Steam changed its subscription list. Nothing has been removed. Use Add Only instead.');
            var info = doc.querySelector('.workshopBrowsePagingInfo');
            var count = info && /Showing\s+[\d,]+\s*-\s*[\d,]+\s+of\s+([\d,]+)/i.exec(info.textContent);
            var total = count ? Number(count[1].replace(/,/g, '')) : null;
            if (total === null && doc.querySelector('.workshopBrowseNoItems')) total = 0;
            if (total === null || (expected !== null && total !== expected)) throw Error('Could not verify the complete subscription list. Nothing has been removed. Use Add Only instead.');
            expected = total;
            var previous = ids.size;
            var rows = container.querySelectorAll('.workshopItem');
            for (var row of rows) {
                var link = row.querySelector('a[href*="sharedfiles/filedetails/"]');
                var id = link && new URL(link.getAttribute('href'), location.origin).searchParams.get('id');
                if (!id || !/^\d+$/.test(id)) throw Error('A subscription could not be identified. Nothing has been removed.');
                ids.add(id);
            }
            if (ids.size === expected) return Array.from(ids);
            if (ids.size > expected || ids.size === previous) break;
        }
        throw Error('Could not read every current subscription. Nothing has been removed. Use Add Only instead.');
    }

    function postItem(action, id, appId) {
        return new Promise(function (resolve, reject) {
            window.$J.ajax({
                url: location.origin + '/sharedfiles/' + action,
                type: 'POST', dataType: 'json', timeout: 30000,
                data: { id: id, appid: appId, include_dependencies: false, sessionid: window.g_sessionID }
            }).done(function (data) {
                if (data && Number(data.success) === 1) resolve();
                else reject(Error('Steam did not confirm ' + action + ' for mod ' + id + '.'));
            }).fail(function () { reject(Error('Steam could not complete ' + action + ' for mod ' + id + '.')); });
        });
    }

    async function applyPlan(plan, addOnly) {
        if (busy) return;
        busy = true;
        var stopped = false, added = 0, removed = 0;
        var content = document.createElement('div');
        var status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.textContent = 'Preparing filtered subscriptions…';
        var stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'btn_grey_steamui btn_medium';
        stop.textContent = 'Stop';
        stop.onclick = function () { stopped = true; stop.disabled = true; };
        content.append(status, stop);
        var progress = window.ShowBlockingWaitDialog('Subscribe to filtered collection', content);
        if (progress.fail) progress.fail(function () { stopped = true; });
        function check() {
            if (stopped) throw Error('Stopped. Completed subscription changes have been kept.');
            if (!samePlan(plan)) throw Error('Your saved filters or collection changed. Review the list before continuing.');
        }
        try {
            check();
            var previous = addOnly ? [] : await currentSubscriptions(plan.appId);
            var previouslySubscribed = new Set(previous);
            var keep = new Set(plan.allowed);
            var toRemove = previous.filter(function (id) { return !keep.has(id); });
            // Add eligible mods first. If any addition fails, no existing
            // subscriptions are removed by the replacement operation.
            for (var id of plan.allowed) {
                check();
                var button = document.getElementById('SubscribeItemBtn' + id);
                var alreadySubscribed = addOnly ? button && button.classList.contains('toggled') : previouslySubscribed.has(id);
                if (!alreadySubscribed) {
                    status.textContent = 'Subscribing: ' + (added + 1) + ' · ' + plan.excluded.length + ' excluded by saved filters';
                    await postItem('subscribe', id, plan.appId);
                    added++;
                    if (button) button.classList.add('toggled');
                    await new Promise(function (r) { setTimeout(r, 150); });
                }
            }
            for (var oldId of toRemove) {
                check();
                status.textContent = 'Replacing subscriptions: ' + (removed + 1) + ' / ' + toRemove.length;
                await postItem('unsubscribe', oldId, plan.appId);
                removed++;
                var oldButton = document.getElementById('SubscribeItemBtn' + oldId);
                if (oldButton) oldButton.classList.remove('toggled');
                await new Promise(function (r) { setTimeout(r, 150); });
            }
            alert('Subscriptions updated', added + ' mods added. ' + removed + ' subscriptions removed. ' + plan.excluded.length + ' collection mods excluded by your saved filters.' +
                (addOnly ? ' Existing subscriptions were kept.' : ' Your subscriptions now contain only the eligible collection mods.'));
        } catch (e) {
            alert('Subscription update stopped', e.message + ' ' + added + ' mods added; ' + removed + ' subscriptions removed.');
        } finally {
            progress.Dismiss();
            busy = false;
        }
    }

    function installHelper() {
        var original = window.SubscribeCollectionHelper;
        if (typeof original !== 'function' || original.wshsFiltered) return;
        function helper(id, appId, addOnly) {
            var plan = activePlan;
            activePlan = null;
            if (!plan || String(id) !== plan.collectionId || String(appId) !== plan.appId) return original.apply(this, arguments);
            if (!samePlan(plan)) { alert('Filters changed', 'Review your saved filters and click Subscribe to all again.'); return; }
            applyPlan(plan, !!addOnly);
        }
        helper.wshsFiltered = true;
        window.SubscribeCollectionHelper = helper;
    }

    document.addEventListener('click', function (e) {
        var target = e.target.closest && e.target.closest('.subscribeCollection [onclick*="SubscribeCollection("]');
        if (!target) return;
        activePlan = null;
        var plan = readPlan();
        if (plan && !plan.excluded.length && !busy) return; // Steam's unfiltered flow.
        e.preventDefault();
        e.stopImmediatePropagation();
        if (busy) { alert('Subscriptions are updating', 'Wait for the current update to finish, or stop it first.'); return; }
        if (!plan) { alert('Saved filters are loading', target.getAttribute('data-wshs-subscription-error') || 'Wait for your saved filters to load, then click Subscribe to all again.'); return; }
        if (!plan.allowed.length) { alert('No matching mods', 'Your filters exclude every mod in this collection. Change the filters before subscribing.'); return; }
        if (typeof window.ShowConfirmDialog !== 'function' || typeof window.SubscribeCollection !== 'function') return;
        var reminder = plan.excluded.length + (plan.excluded.length === 1 ? ' mod is' : ' mods are') + ' excluded by your filters and will not be added. ' + plan.allowed.length + (plan.allowed.length === 1 ? ' mod remains.' : ' mods remain.') +
            '<br><br>Add Only keeps your existing subscriptions, including any excluded mods you already have. Overwrite replaces them with only the eligible collection mods.';
        window.ShowConfirmDialog('Saved filters apply to this collection', reminder, 'Continue').done(function (action) {
            if (action !== 'OK') return;
            if (!samePlan(plan)) { alert('Filters changed', 'Review your saved filters and click Subscribe to all again.'); return; }
            installHelper();
            activePlan = plan;
            window.SubscribeCollection(plan.collectionId, plan.appId);
        });
    }, true);
})();
