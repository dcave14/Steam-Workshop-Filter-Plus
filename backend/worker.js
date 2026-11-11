import { DurableObject } from 'cloudflare:workers';
import '../src/background/api-data.js';

const ITEM_TTL_MS = 15 * 60 * 1000;
// One coordination object per upstream credential. It holds the request budget
// and the per-item answer cache: caches.default never hits on workers.dev.
// SQL statements run synchronously so concurrent reservations cannot overspend.
export class SteamBudget extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS calls (hour INTEGER PRIMARY KEY, count INTEGER NOT NULL)');
        ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, body TEXT NOT NULL, expires INTEGER NOT NULL)');
        ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS items_expires ON items (expires)');
    }
    // Returns the unexpired rows for these IDs. Budget is reserved only when at
    // least one ID is missing, because only then does the caller ask Steam.
    lookup(ids) {
        // json_each keeps this at two bound parameters; the SQL API allows 100.
        const found = this.ctx.storage.sql.exec('SELECT body FROM items WHERE id IN (SELECT value FROM json_each(?)) AND expires > ?', JSON.stringify(ids), Date.now()).toArray();
        const rows = found.map(row => JSON.parse(row.body));
        return { rows, reserved: rows.length < ids.length ? this.reserve() : null };
    }
    store(rows) {
        const now = Date.now();
        this.ctx.storage.sql.exec('DELETE FROM items WHERE expires <= ?', now);
        for (const row of rows) this.ctx.storage.sql.exec('INSERT INTO items(id,body,expires) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, expires=excluded.expires', row.id, JSON.stringify(row), now + ITEM_TTL_MS);
    }
    reserve() {
        const hour = Math.floor(Date.now() / 3600000);
        const limit = Number(this.env.MAX_UPSTREAM_PER_24H);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 90000) return false;
        this.ctx.storage.sql.exec('DELETE FROM calls WHERE hour < ?', hour - 24);
        const used = this.ctx.storage.sql.exec('SELECT COALESCE(SUM(count), 0) AS n FROM calls').one().n;
        if (used >= limit) return false;
        this.ctx.storage.sql.exec('INSERT INTO calls(hour,count) VALUES (?,1) ON CONFLICT(hour) DO UPDATE SET count=count+1', hour);
        return true;
    }
}

function json(body, status = 200) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function error(code, message, status) { return json({ ok: false, code, message }, status); }
function cors(response, origin) {
    const headers = new Headers(response.headers);
    // Origin filtering helps browsers; it is not authentication. Quota controls
    // protect this intentionally public, read-only endpoint from direct clients.
    if (/^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-f0-9-]+)$/.test(origin || '')) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    return new Response(response.body, { status: response.status, headers });
}
async function boundedJson(body, maximum) {
    if (!body) throw Error('missing_body');
    const reader = body.getReader(), chunks = []; let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maximum) { await reader.cancel(); throw Error('large_body'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
}
async function handle(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, configured: /^[a-f0-9]{32}$/i.test(env.STEAM_API_KEY || '') });
    if (url.pathname !== '/v1/items') return error('not_found', 'Unknown endpoint.', 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return error('method', 'Use POST.', 405);
    if (!env.CLIENT_LIMIT || !env.STEAM_BUDGET) return error('unavailable', 'The data service is not configured.', 503);
    const allowed = await env.CLIENT_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!allowed.success) return error('rate', 'Too many requests. Retry later.', 429);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return error('input', 'Send JSON item IDs.', 415);
    let data;
    try { data = await boundedJson(request.body, 4096); } catch (_) { return error('input', 'Invalid or oversized request.', 400); }
    if (!data || Object.keys(data).some(key => key !== 'ids') || !globalThis.WSHSApiData.validIds(data.ids)) return error('input', 'Provide between 1 and 100 numeric Workshop IDs.', 400);
    if (!/^[a-f0-9]{32}$/i.test(env.STEAM_API_KEY || '')) return error('unavailable', 'The data service is not configured.', 503);
    const ids = Array.from(new Set(data.ids)).sort();
    const store = env.STEAM_BUDGET.getByName('steam-upstream-credential');
    const cached = await store.lookup(ids);
    const have = new Set(cached.rows.map(row => row.id));
    const missing = ids.filter(id => !have.has(id));
    if (!missing.length) return json({ ok: true, rows: cached.rows });
    if (!cached.reserved) return error('quota', 'The shared Steam request budget is exhausted. Retry later.', 429);
    const upstream = new URL('https://api.steampowered.com/IPublishedFileService/GetDetails/v1/');
    upstream.searchParams.set('input_json', JSON.stringify({ publishedfileids: missing, includechildren: true, includevotes: true }));
    let response, payload, stage = 'fetch';
    try {
        // Workers has no browser cookie jar; its Request API rejects credentials.
        response = await fetch(upstream, { headers: { 'x-webapi-key': env.STEAM_API_KEY }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
        if (response.status === 429) return error('rate', 'Steam is limiting API requests. Retry later.', 429);
        if (!response.ok) {
            console.warn(JSON.stringify({ event: 'steam_upstream_rejected', status: response.status }));
            return error('upstream_' + response.status, 'Steam data is unavailable. Retry later.', 503);
        }
        stage = 'json';
        payload = await boundedJson(response.body, 4 * 1024 * 1024);
    } catch (_) { console.warn(JSON.stringify({ event: 'steam_upstream_unreadable', stage })); return error('upstream_' + stage + '_unreadable', 'Steam data is unavailable. Retry later.', 503); }
    const fresh = globalThis.WSHSApiData.parseRows(payload, missing);
    console.log(JSON.stringify({ event: 'steam_batch', requested: ids.length, cached: cached.rows.length, asked: missing.length, returned: fresh.length }));
    // Rows with an unknown dependency list stay uncached so they are retried.
    const complete = fresh.filter(row => Array.isArray(row.ids));
    if (complete.length) ctx.waitUntil(store.store(complete).catch(() => { console.warn(JSON.stringify({ event: 'cache_write_failed' })); }));
    const rows = cached.rows.concat(fresh).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return json({ ok: true, rows });
}
export default {
    async fetch(request, env, ctx) {
        try { return cors(await handle(request, env, ctx), request.headers.get('Origin')); }
        catch (_) { console.error(JSON.stringify({ event: 'service_request_failed' })); return cors(error('unavailable', 'The data service is temporarily unavailable.', 503), request.headers.get('Origin')); }
    }
};
