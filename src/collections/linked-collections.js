// Mods in a collection's linked collections, followed through their own links
// (Ferny's Progression Modpack links its Content and Cosmetics parts, which
// link back). Public collection pages are read on demand, two at a time,
// pausing for a minute after a Steam rate limit. Loops are visited once.
(function () {
    'use strict';
    if (!/\/sharedfiles\/filedetails\/?$/.test(location.pathname)) return;
    var MAX_COLLECTIONS = 50;
    var pages = new Map(), queue = [], active = 0, pausedUntil = 0, listeners = [];

    function idOf(href) { var m = /[?&]id=(\d+)/.exec(href || ''); return m ? m[1] : null; }

    // Linked (child) collections listed under a page's "Linked collections"
    // heading. Parent collections ("Collections that include this") are not
    // followed. The Workshop-style layout moves heading and grid together.
    function linkedIds(doc) {
        var ids = [];
        doc.querySelectorAll('.childrenTitle').forEach(function (heading) {
            var next = heading.nextElementSibling;
            var grid = next && (next.matches('.collections') ? next : next.querySelector('.collections'));
            if (!grid) return;
            grid.querySelectorAll('.workshopItem a[href*="filedetails/?id="]').forEach(function (a) {
                var id = idOf(a.getAttribute('href'));
                if (id && ids.indexOf(id) === -1) ids.push(id);
            });
        });
        return ids;
    }

    function notify() { listeners.forEach(function (fn) { try { fn(); } catch (_) {} }); }

    async function read(id) {
        var page = pages.get(id);
        try {
            var fetcher = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
            var response = await fetcher('/sharedfiles/filedetails/?id=' + id, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
            var html = await response.text();
            if (response.status === 429 || /too many requests recently/i.test(html)) {
                pausedUntil = Date.now() + 60000;
                queue.splice(0).forEach(function (queued) { pages.get(queued).status = 'failed'; });
                throw Error('Rate limited');
            }
            var doc = new DOMParser().parseFromString(html, 'text/html');
            // Error, login and removed pages have no item list; never read them as empty.
            if (!response.ok || !doc.querySelector('.collectionChildren')) throw Error('Collection unavailable');
            var title = doc.querySelector('.workshopItemTitle');
            page.title = title ? title.textContent.trim() : 'Collection ' + id;
            page.rows = Array.from(doc.querySelectorAll('.collectionChildren .collectionItem')).map(function (row) {
                var link = row.querySelector('.collectionItemDetails > a');
                return { id: link && idOf(link.getAttribute('href')), root: row };
            }).filter(function (row) { return row.id; });
            page.links = linkedIds(doc);
            page.status = 'ok';
        } catch (_) { if (page.status === 'pending') page.status = 'failed'; }
        finally { active--; pump(); notify(); }
    }

    function pump() {
        while (active < 2 && queue.length && pausedUntil <= Date.now()) { active++; read(queue.shift()); }
    }

    function request(ids, force) {
        if (force) pausedUntil = 0;
        var refused = false;
        ids.forEach(function (id) {
            var page = pages.get(id);
            if (page && (page.status === 'ok' || page.status === 'pending' || !force)) return;
            pages.set(id, { status: 'pending', rows: [], links: [] });
            if (pausedUntil > Date.now()) { pages.get(id).status = 'failed'; refused = true; }
            else queue.push(id);
        });
        // A paused request finishes without a fetch; still tell the popover.
        if (refused) setTimeout(notify, 0);
        pump();
    }

    // Breadth-first from the current collection; requests what is missing.
    // Returns the collections in visit order and what is still loading.
    function tree(rootId, force) {
        var seen = new Set([rootId]), order = [], waiting = 0, failed = [], frontier = linkedIds(document);
        var missing = [];
        while (frontier.length && order.length + failed.length + waiting < MAX_COLLECTIONS) {
            var id = frontier.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            var page = pages.get(id);
            if (!page || (force && page.status === 'failed')) { missing.push(id); waiting++; continue; }
            if (page.status === 'pending') { waiting++; continue; }
            if (page.status === 'failed') { failed.push(id); continue; }
            order.push({ id: id, title: page.title, rows: page.rows });
            frontier = frontier.concat(page.links);
        }
        if (missing.length) request(missing, force);
        return { linked: linkedIds(document).filter(function (id) { return id !== rootId; }), collections: order, waiting: waiting, failed: failed };
    }

    window.WSHSLinkedCollections = {
        ids: function () { return linkedIds(document); },
        tree: tree,
        onChange: function (fn) { listeners.push(fn); }
    };
})();
