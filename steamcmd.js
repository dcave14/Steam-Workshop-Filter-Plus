// SteamCMD download commands for owners of GOG and DRM-free copies. Off by
// default. One persistent card button and one popover serve Workshop cards,
// item pages and collections, so hovering never creates nodes.
(function () {
    'use strict';
    var PER_LINE = 100, DEPENDENCY_LIMIT = 500, SVG_NS = 'http://www.w3.org/2000/svg';
    var enabled = false, cardButton = null, itemButton = null, collectionButton = null;
    var popover = null, parts = null, state = null, anchor = null;
    var cardList = null, cardIds = new WeakMap();

    // The card glyph is cropped to fill its tile like Quick View's magnifier.
    function icon(cropped) {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', cropped ? '0.8 0.8 22.4 22.4' : '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
        ['M3.5 5.5h17v13h-17z', 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4.5'].forEach(function (d) {
            var path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d); svg.appendChild(path);
        });
        return svg;
    }

    function node(tag, className, text) {
        var n = document.createElement(tag);
        if (className) n.className = className;
        if (text) n.textContent = text;
        return n;
    }

    // ------------------------------------------------------------------
    // Commands
    // ------------------------------------------------------------------

    function commandLines(appId, ids) {
        var lines = [];
        for (var start = 0; start < ids.length; start += PER_LINE) {
            lines.push('steamcmd +login anonymous ' + ids.slice(start, start + PER_LINE).map(function (id) {
                return '+workshop_download_item ' + appId + ' ' + id;
            }).join(' ') + ' +quit');
        }
        return lines;
    }

    function batchFile(appId, ids, title) {
        return ['@echo off',
            'rem ' + title.replace(/[\r\n%^&|<>]/g, ' ') + ' - ' + ids.length + ' Workshop ' + (ids.length === 1 ? 'item' : 'items') + ' for app ' + appId,
            'rem Put this file next to steamcmd.exe, or add SteamCMD to PATH.',
            'rem SteamCMD: https://developer.valvesoftware.com/wiki/SteamCMD',
            'cd /d "%~dp0"'].concat(commandLines(appId, ids), ['pause', '']).join('\r\n');
    }

    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; }
        catch (_) {
            var area = node('textarea'); area.value = text; area.className = 'wshs-steamcmd-clip';
            popover.appendChild(area); area.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (_) {}
            area.remove();
            return ok;
        }
    }

    function saveFile(name, text) {
        var url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
        var link = node('a'); link.href = url; link.download = name; link.hidden = true;
        popover.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    // ------------------------------------------------------------------
    // Required mods: transitive, through the shared dependency cache
    // ------------------------------------------------------------------

    function dependencyClosure() {
        var deps = window.WSHSDependencies, seen = new Set(state.ids), queue = state.ids.slice();
        var extra = [], missing = [], waiting = false, failed = [];
        while (queue.length && seen.size < DEPENDENCY_LIMIT) {
            var id = queue.shift(), required = deps.get(id);
            if (required === null) {
                if (deps.pending(id)) waiting = true;
                else if (state.requested.has(id)) failed.push(id);
                else missing.push(id);
                continue;
            }
            required.forEach(function (child) {
                if (seen.has(child)) return;
                seen.add(child); extra.push(child); queue.push(child);
            });
        }
        if (missing.length) {
            missing.forEach(function (id) { state.requested.add(id); });
            deps.request(missing);
            // A rate-limit pause or recent failure skips the request without
            // notifying, so only queued items count as still checking.
            if (missing.some(deps.pending)) waiting = true;
            else failed = failed.concat(missing);
        }
        return { extra: extra, waiting: waiting, failed: failed };
    }

    // ------------------------------------------------------------------
    // Popover
    // ------------------------------------------------------------------

    function button(className, label, action) {
        var b = node('button', 'wshs-steamcmd-action ' + className, label); b.type = 'button';
        b.addEventListener('click', action);
        return b;
    }

    function flash(target, text) {
        var label = target.textContent;
        target.textContent = text;
        setTimeout(function () { if (target.textContent === text) target.textContent = label; render(); }, 1200);
    }

    function ensurePopover() {
        if (popover) return;
        popover = node('div', 'wshs-steamcmd-pop'); popover.hidden = true;
        popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Download with SteamCMD');
        parts = {
            title: node('div', 'wshs-steamcmd-title', 'Download with SteamCMD'),
            lead: node('p', 'wshs-steamcmd-lead', 'For GOG and DRM-free copies of the game. No Steam account needed.'),
            summary: node('p', 'wshs-steamcmd-summary'),
            code: node('code', 'wshs-steamcmd-code'),
            depsRow: node('label', 'wshs-steamcmd-deps'),
            deps: node('input'),
            depsText: node('span'),
            error: node('p', 'wshs-steamcmd-error'),
            buttons: node('div', 'wshs-steamcmd-buttons'),
            note: node('p', 'wshs-steamcmd-note')
        };
        parts.deps.type = 'checkbox'; parts.deps.checked = true;
        parts.deps.addEventListener('change', render);
        parts.depsRow.append(parts.deps, parts.depsText);
        // After a Steam rate limit every lookup pauses for a minute; Retry
        // asks again now for the mods that could not be checked.
        parts.retry = button('wshs-steamcmd-retry', 'Retry', function () {
            var ids = state && state.closure ? state.closure.failed : [];
            if (!ids.length) return;
            ids.forEach(function (id) { state.requested.delete(id); });
            window.WSHSDependencies.request(ids, true);
            render();
        });
        parts.depsLine = node('div', 'wshs-steamcmd-deps-line');
        parts.depsLine.append(parts.depsRow, parts.retry);
        parts.copy = button('wshs-steamcmd-primary', 'Copy command', async function () {
            var lines = currentLines();
            if (lines.length) flash(parts.copy, await copyText(lines.join('\n')) ? 'Copied' : 'Copy failed');
        });
        parts.save = button('wshs-steamcmd-secondary', 'Save .bat', function () {
            var ids = currentIds();
            if (!ids.length) return;
            saveFile('steamcmd-' + state.appId + '-' + state.id + '.bat', batchFile(state.appId, ids, state.title));
            flash(parts.save, 'Saved');
        });
        parts.buttons.append(parts.copy, parts.save);
        popover.append(parts.title, parts.lead, parts.summary, parts.code, parts.depsLine, parts.error, parts.buttons, parts.note);
        document.body.appendChild(popover);
        document.addEventListener('pointerdown', function (event) {
            if (!popover.hidden && !popover.contains(event.target) && !(anchor && anchor.contains(event.target))) close(false);
        }, true);
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !popover.hidden) close(true); });
        window.addEventListener('resize', function () { if (!popover.hidden) place(); });
        if (window.WSHSDependencies) window.WSHSDependencies.onChange(function () { if (!popover.hidden && state && state.withDeps) render(); });
    }

    function currentIds() {
        if (!state || state.error) return [];
        if (!state.withDeps || !parts.deps.checked) return state.ids;
        return state.ids.concat(state.closure ? state.closure.extra : []);
    }

    function currentLines() { var ids = currentIds(); return ids.length ? commandLines(state.appId, ids) : []; }

    function setText(target, text) { if (target.textContent !== text) target.textContent = text; }

    function render() {
        if (!state) return;
        var deps = state.withDeps && window.WSHSDependencies;
        if (deps) state.closure = dependencyClosure();
        parts.depsLine.hidden = !deps;
        if (deps) {
            var c = state.closure, count = c.extra.length;
            setText(parts.depsText, c.waiting ? 'Checking required mods…' :
                count ? 'Include ' + count + ' required ' + (count === 1 ? 'mod' : 'mods') :
                c.failed.length ? 'Required mods could not be checked' : 'No required mods');
            parts.deps.disabled = !count;
            parts.retry.hidden = c.waiting || !c.failed.length;
        }
        parts.error.hidden = !state.error;
        setText(parts.error, state.error || '');
        var ids = currentIds(), lines = currentLines();
        setText(parts.summary, state.summary || '');
        parts.summary.hidden = !state.summary;
        var shown = lines[0] || '';
        if (ids.length > 3) shown = commandLines(state.appId, ids.slice(0, 2))[0].replace(/ \+quit$/, ' … +quit');
        setText(parts.code, shown);
        parts.code.hidden = !shown;
        parts.copy.disabled = parts.save.disabled = !lines.length;
        if (parts.copy.textContent !== 'Copied' && parts.copy.textContent !== 'Copy failed') setText(parts.copy, lines.length > 1 ? 'Copy ' + lines.length + ' commands' : 'Copy command');
        setText(parts.note, (lines.length > 1 ? 'Each command downloads up to ' + PER_LINE + ' items. ' : '') +
            'Files save to steamapps/workshop/content/' + state.appId + '/ in your SteamCMD folder. Some games don’t allow anonymous downloads.');
        place();
    }

    function place() {
        if (!anchor || !anchor.getClientRects().length) { close(false); return; }
        var rect = anchor.getBoundingClientRect(), width = popover.offsetWidth, height = popover.offsetHeight;
        var left = Math.max(8, Math.min(rect.right - width, document.documentElement.clientWidth - width - 8));
        var top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8;
        var x = Math.round(left + window.scrollX) + 'px', y = Math.round(top + window.scrollY) + 'px';
        if (popover.style.left !== x) popover.style.left = x;
        if (popover.style.top !== y) popover.style.top = y;
    }

    function open(target, data) {
        ensurePopover();
        if (!popover.hidden && anchor === target) { close(true); return; }
        if (anchor) anchor.classList.remove('wshs-steamcmd-open');
        anchor = target; anchor.classList.add('wshs-steamcmd-open'); anchor.setAttribute('aria-expanded', 'true');
        state = Object.assign({ requested: new Set(), closure: null }, data);
        parts.deps.checked = true;
        popover.hidden = false;
        render();
        parts.copy.focus({ preventScroll: true });
    }

    function close(restoreFocus) {
        if (!popover || popover.hidden) return;
        popover.hidden = true; state = null;
        if (anchor) {
            anchor.classList.remove('wshs-steamcmd-open'); anchor.setAttribute('aria-expanded', 'false');
            if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
        }
        anchor = null;
    }

    // ------------------------------------------------------------------
    // Page data
    // ------------------------------------------------------------------

    function itemId(href) { var m = /[?&]id=(\d+)/.exec(href || ''); return m ? m[1] : null; }

    function browseAppId() {
        var query = new URLSearchParams(location.search).get('appid');
        if (/^\d+$/.test(query || '')) return query;
        var path = /\/app\/(\d+)\//.exec(location.pathname);
        return path ? path[1] : null;
    }

    function cardData(card) {
        var title = card.querySelector('a[href*="filedetails"]:not(:has(img))');
        return { id: card.wshsId, appId: browseAppId(), ids: [card.wshsId], title: title ? title.textContent.trim() : 'Workshop item ' + card.wshsId, withDeps: true };
    }

    function itemData() {
        var subscribe = document.getElementById('SubscribeItemBtn');
        var args = subscribe && /SubscribeItem\(\s*'(\d+)'\s*,\s*'(\d+)'/.exec(subscribe.getAttribute('onclick') || '');
        if (!args) return null;
        var title = document.querySelector('.workshopItemTitle');
        return { id: args[1], appId: args[2], ids: [args[1]], title: title ? title.textContent.trim() : 'Workshop item ' + args[1], withDeps: true };
    }

    // Collections follow Subscribe to all: mods excluded by saved filters or
    // the collection search are left out, using the plan saved-filters.js writes.
    function collectionData() {
        var subscribe = document.querySelector('.subscribeCollection [onclick*="SubscribeCollection("]');
        var args = subscribe && /SubscribeCollection\(\s*'(\d+)'\s*,\s*'(\d+)'/.exec(subscribe.getAttribute('onclick') || '');
        if (!args) return null;
        var title = document.querySelector('.workshopItemTitle');
        var data = { id: args[1], appId: args[2], ids: [], title: title ? title.textContent.trim() : 'Collection ' + args[1], withDeps: false };
        var error = subscribe.getAttribute('data-wshs-subscription-error'), plan = null;
        try { plan = JSON.parse(subscribe.getAttribute('data-wshs-subscription-plan')); } catch (_) {}
        if (plan && plan.collectionId === args[1] && Array.isArray(plan.allowed) && Array.isArray(plan.excluded)) {
            data.ids = plan.allowed;
            data.summary = plan.excluded.length ? plan.allowed.length + ' of ' + (plan.allowed.length + plan.excluded.length) + ' mods, after saved filters' : 'All ' + plan.allowed.length + ' mods';
        } else if (error) {
            data.error = error;
        } else {
            data.ids = Array.from(new Set(Array.from(document.querySelectorAll('.collectionItem .collectionItemDetails > a')).map(function (a) { return itemId(a.href); }).filter(Boolean)));
            data.summary = 'All ' + data.ids.length + ' mods';
        }
        if (!data.error && !data.ids.length) data.error = 'No mods left after saved filters.';
        return data;
    }

    // ------------------------------------------------------------------
    // Buttons
    // ------------------------------------------------------------------

    function activate(target, handler) {
        ['pointerdown', 'mousedown'].forEach(function (type) { target.addEventListener(type, function (event) { event.stopPropagation(); }); });
        target.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); handler(); });
        target.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); event.stopPropagation(); handler();
        });
    }

    function controlAttributes(target) {
        target.setAttribute('role', 'button'); target.tabIndex = 0;
        target.setAttribute('aria-haspopup', 'dialog'); target.setAttribute('aria-expanded', 'false');
        target.title = 'Download with SteamCMD';
    }

    function ensureCardButton() {
        if (cardButton) return cardButton;
        cardButton = node('div', 'wshs-steamcmd-card');
        controlAttributes(cardButton);
        cardButton.setAttribute('aria-label', 'Download with SteamCMD');
        cardButton.removeAttribute('title');
        cardButton.appendChild(icon(true));
        activate(cardButton, function () { hideTip(); if (cardButton.wshsCard) open(cardButton, cardData(cardButton.wshsCard)); });
        cardButton.addEventListener('pointerenter', showTip);
        cardButton.addEventListener('pointerleave', hideTip);
        cardButton.addEventListener('pointerdown', hideTip);
        return cardButton;
    }

    // Steam's card tooltip, as Quick View shows it: about 150ms after hover,
    // fading in over 0.25s, 8px right of the button and vertically centered.
    // One persistent node; Steam's :root:has() rules make inserts expensive.
    var tip = null, tipTimer = null;
    function showTip() {
        clearTimeout(tipTimer);
        if (anchor === cardButton) return;
        tipTimer = setTimeout(function () {
            if (!cardButton.isConnected || !cardButton.matches(':hover') || anchor === cardButton) return;
            if (!tip) {
                tip = node('div', 'wshs-steamcmd-tip', 'Download with SteamCMD');
                tip.setAttribute('aria-hidden', 'true');
                document.body.appendChild(tip);
            }
            tip.classList.remove('wshs-steamcmd-tip-visible');
            tip.classList.add('wshs-steamcmd-tip-shown');
            var rect = cardButton.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
            var left = rect.right + 8 + width <= document.documentElement.clientWidth ? rect.right + 8 : rect.left - 8 - width;
            tip.style.left = left + 'px';
            tip.style.top = rect.top + (rect.height - height) / 2 + 'px';
            requestAnimationFrame(function () { if (tip.classList.contains('wshs-steamcmd-tip-shown')) tip.classList.add('wshs-steamcmd-tip-visible'); });
        }, 150);
    }
    function hideTip() {
        clearTimeout(tipTimer);
        if (tip) tip.classList.remove('wshs-steamcmd-tip-shown', 'wshs-steamcmd-tip-visible');
    }

    // Look up the hovered card through the shared, cached card discovery.
    function cardFor(target) {
        var cards = window.WSHSDom.enumerateCards();
        if (cards !== cardList) {
            cardList = cards; cardIds = new WeakMap();
            cards.forEach(function (card) { cardIds.set(card.root, card.id); });
        }
        for (var n = target, depth = 0; n && depth < 14; n = n.parentElement, depth++) {
            if (cardIds.has(n)) return n;
        }
        return null;
    }

    function onPointerOver(event) {
        if (!enabled || !window.WSHSDom || !(event.target instanceof Element)) return;
        // Steam can replace or filter out the card under an open popover.
        if (anchor && !anchor.getClientRects().length) close(false);
        // The open popover is anchored to this button; keep it on its card.
        if (cardButton && (cardButton.contains(event.target) || anchor === cardButton)) return;
        if (document.documentElement.getAttribute('data-wshs-page-hydrated') !== '1' || new URLSearchParams(location.search).get('section') === 'collections') return;
        var root = cardFor(event.target);
        if (!root || (cardButton && cardButton.wshsCard === root && cardButton.isConnected)) return;
        // Join Steam's own hover actions row, beside Quick View.
        var quickView = root.querySelector('svg.SVGIcon_MagnifyingGlass');
        var panel = quickView && quickView.closest('.Panel');
        var row = panel && panel.parentElement;
        if (!row || !root.contains(row) || !browseAppId()) return;
        var b = ensureCardButton();
        root.wshsId = cardIds.get(root);
        b.wshsCard = root;
        // Steam's Quick View class sizes the frame and its svg tile, so both
        // buttons shrink and style identically in every grid width.
        var className = panel.className + ' wshs-steamcmd-card' + (anchor === b ? ' wshs-steamcmd-open' : '');
        if (b.className !== className) b.className = className;
        if (b.nextElementSibling !== panel) row.insertBefore(b, panel);
    }

    function ensurePageButtons() {
        if (!enabled || !document.body || !/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) return;
        if (document.querySelector('.subscribeCollection')) {
            if (collectionButton && collectionButton.isConnected) return;
            var share = document.getElementById('AddToCollectionBtn') || document.getElementById('FavoriteItemBtn');
            var host = share && share.closest('.workshopItemControlCtn');
            if (!host) return;
            if (!collectionButton) {
                collectionButton = node('div', 'workshopItemControlCtn wshs-steamcmd-ctn');
                var control = node('span', 'general_btn wshs-steamcmd-collection');
                controlAttributes(control);
                control.appendChild(node('span')).append(icon(), document.createTextNode('SteamCMD'));
                activate(control, function () { var data = collectionData(); if (data) open(control, data); });
                collectionButton.appendChild(control);
            }
            host.insertAdjacentElement('afterend', collectionButton);
            return;
        }
        var subscribe = document.getElementById('SubscribeItemBtn');
        if (!subscribe || (itemButton && itemButton.isConnected)) return;
        if (!itemButton) {
            itemButton = node('a', 'btn_darkblue_white_innerfade btn_border_2px btn_medium wshs-steamcmd-item');
            controlAttributes(itemButton);
            itemButton.appendChild(node('span')).append(icon(), document.createTextNode('SteamCMD'));
            activate(itemButton, function () { var data = itemData(); if (data) open(itemButton, data); });
        }
        subscribe.parentElement.classList.add('wshs-steamcmd-row');
        subscribe.insertAdjacentElement('beforebegin', itemButton);
    }

    // Steam can mount or rebuild item and collection controls after load.
    // One check per frame at most; each is two ID lookups when nothing changed.
    var pageFrame = null;
    var pageObserver = new MutationObserver(function () {
        if (pageFrame === null) pageFrame = requestAnimationFrame(function () { pageFrame = null; ensurePageButtons(); });
    });

    function apply(value) {
        enabled = value === true;
        if (enabled) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensurePageButtons, { once: true });
            else ensurePageButtons();
            if (/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) pageObserver.observe(document.documentElement, { childList: true, subtree: true });
            return;
        }
        pageObserver.disconnect();
        close(false); hideTip();
        [cardButton, itemButton, collectionButton].forEach(function (b) { if (b) b.remove(); });
        if (cardButton) cardButton.wshsCard = null;
    }

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    // Keyboard users reach the button by focusing Quick View or the card's links.
    document.addEventListener('focusin', onPointerOver);
    chrome.storage.local.get('steamcmdButtons').then(function (data) { apply(data.steamcmdButtons); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.steamcmdButtons) apply(changes.steamcmdButtons.newValue);
    });
})();
