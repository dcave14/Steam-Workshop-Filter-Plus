import { DurableObject } from 'cloudflare:workers';
import '../api-data.js';

// One coordination object per upstream credential, used only for cache misses.
// SQL statements run synchronously so concurrent reservations cannot overspend.
export class SteamBudget extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS calls (hour INTEGER PRIMARY KEY, count INTEGER NOT NULL)');
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
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ids)));
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    const cacheKey = new Request(new URL('/cache/v1/' + hash, url.origin));
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    if (!await env.STEAM_BUDGET.getByName('steam-upstream-credential').reserve()) return error('quota', 'The shared Steam request budget is exhausted. Retry later.', 429);
    const upstream = new URL('https://api.steampowered.com/IPublishedFileService/GetDetails/v1/');
    upstream.searchParams.set('input_json', JSON.stringify({ publishedfileids: ids, includechildren: true, includevotes: true }));
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
    const rows = globalThis.WSHSApiData.parseRows(payload, ids);
    console.log(JSON.stringify({ event: 'steam_batch', requested: ids.length, returned: rows.length }));
    const result = json({ ok: true, rows });
    if (rows.length === ids.length && rows.every(row => Array.isArray(row.ids))) {
        const cached = new Response(JSON.stringify({ ok: true, rows }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', 'X-Content-Type-Options': 'nosniff' } });
        ctx.waitUntil(cache.put(cacheKey, cached).catch(() => { console.warn(JSON.stringify({ event: 'cache_write_failed' })); }));
    }
    return result;
}
export default {
    async fetch(request, env, ctx) {
        try { return cors(await handle(request, env, ctx), request.headers.get('Origin')); }
        catch (_) { console.error(JSON.stringify({ event: 'service_request_failed' })); return cors(error('unavailable', 'The data service is temporarily unavailable.', 503), request.headers.get('Origin')); }
    }
};
