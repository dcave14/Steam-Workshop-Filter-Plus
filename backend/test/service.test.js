import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../worker.js';

afterEach(() => vi.restoreAllMocks());
const request = (body, extra = {}) => new Request('https://service.example/v1/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': expect.getState().currentTestName, ...extra }, body: JSON.stringify(body) });
async function send(req, overrides = {}) {
    const ctx = createExecutionContext();
    const budgetName = expect.getState().currentTestName;
    const isolatedBudget = { getByName: () => env.STEAM_BUDGET.getByName(budgetName) };
    const response = await worker.fetch(req, { ...env, STEAM_BUDGET: isolatedBudget, ...overrides }, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}
function upstream(id = '1', extra = {}) {
    return Response.json({ response: { publishedfiledetails: [{ publishedfileid: id, result: 1, title: 'Fixture', file_size: '2048', vote_data: { votes_up: 12, votes_down: 3 }, file_description: 'Description only', num_children: 1, children: [{ publishedfileid: '3809306528' }], comments: ['never returned'], ...extra }] } });
}
describe('public read-only service', () => {
    it('returns only approved data fields and never the key, comments or upstream headers', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream());
        const response = await send(request({ ids: ['1'] }));
        const text = await response.text(), data = JSON.parse(text);
        expect(data.rows[0]).toMatchObject({ id: '1', ids: ['3809306528'], size: 2048, ratings: 15, description: 'Description only' });
        expect(text).not.toContain('never returned'); expect(text).not.toContain('A'.repeat(32));
        const [url, options] = fetcher.mock.calls[0];
        expect(String(url)).toContain('api.steampowered.com/IPublishedFileService/GetDetails/');
        expect(String(url)).not.toContain('A'.repeat(32));
        expect(options.headers['x-webapi-key']).toBe('A'.repeat(32));
        expect(() => new Request(url, options)).not.toThrow();
        expect(response.headers.get('x-webapi-key')).toBeNull();
    });
    it('reuses canonical batch cache entries without spending upstream requests', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream('2', { num_children: 0, children: [] }));
        await send(request({ ids: ['2', '2'] })); await send(request({ ids: ['2'] }));
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('keeps incomplete dependency lists unknown rather than caching empty results', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => upstream('3', { children: [] }));
        const response = await send(request({ ids: ['3'] }));
        expect((await response.json()).rows[0].ids).toBeNull();
        await send(request({ ids: ['3'] })); expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('rejects caller keys, arbitrary URLs, malformed IDs and oversized batches', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch');
        for (const body of [{ ids: ['1'], key: 'caller-key' }, { ids: ['https://evil.example/'] }, { ids: Array(101).fill('1') }]) expect((await send(request(body))).status).toBe(400);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('blocks large and non-JSON request bodies', async () => {
        expect((await send(request({ ids: ['1'], filler: 'x'.repeat(5000) }))).status).toBe(400);
        expect((await send(new Request('https://service.example/v1/items', { method: 'POST', body: 'ids=1' }))).status).toBe(415);
    });
    it('does not provide subscription or arbitrary proxy endpoints', async () => {
        for (const path of ['/subscribe', '/unsubscribe', '/v1/proxy']) expect((await send(new Request('https://service.example' + path))).status).toBe(404);
    });
    it('fails closed when per-client or global quota is exhausted', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch');
        const denied = await send(request({ ids: ['4'] }), { CLIENT_LIMIT: { limit: async () => ({ success: false }) } });
        expect(denied.status).toBe(429);
        const quota = await send(request({ ids: ['4'] }), { STEAM_BUDGET: { getByName: () => ({ lookup: async () => ({ rows: [], reserved: false }) }) } });
        expect(quota.status).toBe(429); expect(fetcher).not.toHaveBeenCalled();
    });
    it('returns sanitized upstream errors without echoing upstream bodies', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private-key-and-upstream-details', { status: 403 }));
        const response = await send(request({ ids: ['5'] }));
        expect(response.status).toBe(503); expect(await response.text()).not.toContain('private-key');
    });
    it('does not permit ordinary website origins to read responses', async () => {
        const response = await send(new Request('https://service.example/v1/items', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});
// Answers like Steam for exactly the IDs asked, and records each asked list.
function steam(options = {}) {
    const asked = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        const ids = JSON.parse(new URL(url).searchParams.get('input_json')).publishedfileids;
        asked.push(ids);
        const details = ids.filter(id => !(options.absent || []).includes(id)).map(id => ({ publishedfileid: id, result: 1, title: 'Mod ' + id, file_size: '1', num_children: (options.incomplete || []).includes(id) ? 2 : 0, children: [] }));
        return Response.json({ response: { publishedfiledetails: details } });
    });
    return { asked, fetcher };
}
const rowIds = async response => (await response.json()).rows.map(row => row.id);
const cachedIds = () => runInDurableObject(env.STEAM_BUDGET.getByName(expect.getState().currentTestName), (_, state) => state.storage.sql.exec('SELECT id FROM items ORDER BY id').toArray().map(row => row.id));
describe('per-item answer cache', () => {
    it('answers a repeated request from storage when the edge cache never hits', async () => {
        // workers.dev behaviour: caches.default accepts writes and never matches.
        vi.spyOn(caches.default, 'match').mockResolvedValue(undefined);
        const { asked } = steam();
        const first = await send(request({ ids: ['11', '12'] })), second = await send(request({ ids: ['12', '11', '11'] }));
        expect(asked).toEqual([['11', '12']]);
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual(await first.json());
        expect(second.headers.get('Cache-Control')).toBe('no-store');
    });
    it('asks Steam only for IDs missing from an overlapping list', async () => {
        const { asked } = steam();
        await send(request({ ids: ['21', '22'] }));
        const overlap = await send(request({ ids: ['23', '22', '21', '20'] }));
        expect(asked).toEqual([['21', '22'], ['20', '23']]);
        expect(await rowIds(overlap)).toEqual(['20', '21', '22', '23']);
        await send(request({ ids: ['20'] })); await send(request({ ids: ['23', '21'] }));
        expect(asked).toHaveLength(2);
    });
    it('refetches a row only after its 15 minutes have passed', async () => {
        const { asked } = steam(), start = Date.now();
        await send(request({ ids: ['31'] }));
        const clock = vi.spyOn(Date, 'now').mockReturnValue(start + 14 * 60 * 1000);
        await send(request({ ids: ['31'] })); expect(asked).toHaveLength(1);
        clock.mockReturnValue(start + 16 * 60 * 1000);
        expect(await rowIds(await send(request({ ids: ['31'] })))).toEqual(['31']);
        expect(asked).toEqual([['31'], ['31']]);
    });
    it('refetches only the expired part of a mixed list', async () => {
        const { asked } = steam(), start = Date.now();
        await send(request({ ids: ['41'] }));
        const clock = vi.spyOn(Date, 'now').mockReturnValue(start + 10 * 60 * 1000);
        await send(request({ ids: ['42'] }));
        clock.mockReturnValue(start + 16 * 60 * 1000);
        expect(await rowIds(await send(request({ ids: ['41', '42'] })))).toEqual(['41', '42']);
        expect(asked).toEqual([['41'], ['42'], ['41']]);
    });
    it('deletes expired rows on the next write so storage stays bounded', async () => {
        steam(); const start = Date.now();
        await send(request({ ids: ['51', '52', '53'] }));
        expect(await cachedIds()).toEqual(['51', '52', '53']);
        vi.spyOn(Date, 'now').mockReturnValue(start + 16 * 60 * 1000);
        await send(request({ ids: ['54'] }));
        expect(await cachedIds()).toEqual(['54']);
    });
    it('spends no budget on full cache hits', async () => {
        vi.spyOn(caches.default, 'match').mockResolvedValue(undefined);
        const { asked } = steam();
        for (let i = 0; i < 6; i++) expect((await send(request({ ids: ['61'] }))).status).toBe(200);
        // The test budget is 3: one call is spent, so exactly two more fit.
        expect((await send(request({ ids: ['62'] }))).status).toBe(200);
        expect((await send(request({ ids: ['63'] }))).status).toBe(200);
        expect((await send(request({ ids: ['64'] }))).status).toBe(429);
        expect(asked).toHaveLength(3);
        expect((await send(request({ ids: ['61', '62', '63'] }))).status).toBe(200);
    });
    it('reports the lookup reservation only when an ID is missing', async () => {
        const budget = env.STEAM_BUDGET.getByName('lookup-reservation-test');
        expect(await budget.lookup(['71'])).toEqual({ rows: [], reserved: true });
        await budget.store([{ id: '71', title: 'Stored', ids: [] }]);
        expect(await budget.lookup(['71'])).toEqual({ rows: [{ id: '71', title: 'Stored', ids: [] }], reserved: null });
        expect((await budget.lookup(['71', '72'])).reserved).toBe(true);
        expect((await budget.lookup(['72'])).reserved).toBe(true);
        expect((await budget.lookup(['72'])).reserved).toBe(false);
        expect((await budget.lookup(['71'])).reserved).toBeNull();
    });
    it('fails closed on a partly cached list once the budget is exhausted', async () => {
        const { asked } = steam();
        for (const id of ['81', '82', '83']) await send(request({ ids: [id] }));
        const denied = await send(request({ ids: ['81', '84'] }));
        expect(denied.status).toBe(429); expect((await denied.json()).code).toBe('quota');
        expect(asked).toHaveLength(3);
    });
    it('caches complete rows and retries unknown or absent ones from the same answer', async () => {
        const { asked } = steam({ incomplete: ['92'], absent: ['93'] });
        const first = await send(request({ ids: ['91', '92', '93'] }));
        expect((await first.json()).rows.map(row => [row.id, row.ids])).toEqual([['91', []], ['92', null]]);
        expect(await cachedIds()).toEqual(['91']);
        await send(request({ ids: ['91', '92', '93'] }));
        expect(asked).toEqual([['91', '92', '93'], ['92', '93']]);
    });
    it('serves a full 100-ID list from storage', async () => {
        const { asked } = steam(), ids = Array.from({ length: 100 }, (_, i) => String(1000 + i));
        await send(request({ ids }));
        const again = await send(request({ ids: ids.slice().reverse() }));
        expect(await rowIds(again)).toEqual(ids);
        expect(asked).toHaveLength(1);
    });
    it('does not store answers after a Steam failure', async () => {
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
        expect((await send(request({ ids: ['95'] }))).status).toBe(503);
        expect(await cachedIds()).toEqual([]);
        fetcher.mockRestore(); const { asked } = steam();
        expect(await rowIds(await send(request({ ids: ['95'] })))).toEqual(['95']);
        expect(asked).toEqual([['95']]);
    });
});
describe('credential request budget', () => {
    it('atomically reserves a bounded budget across concurrent callers', async () => {
        const budget = env.STEAM_BUDGET.getByName('concurrent-budget-test');
        const results = await Promise.all(Array.from({ length: 12 }, () => budget.reserve()));
        expect(results.filter(Boolean)).toHaveLength(3);
        expect(await env.STEAM_BUDGET.getByName('concurrent-budget-test').reserve()).toBe(false);
        expect(await env.STEAM_BUDGET.getByName('different-credential-test').reserve()).toBe(true);
    });
});
