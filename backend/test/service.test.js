import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../worker.js';

afterEach(() => vi.restoreAllMocks());
const request = (body, extra = {}) => new Request('https://service.example/v1/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...extra }, body: JSON.stringify(body) });
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
        const quota = await send(request({ ids: ['4'] }), { STEAM_BUDGET: { getByName: () => ({ reserve: async () => false }) } });
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
describe('credential request budget', () => {
    it('atomically reserves a bounded budget across concurrent callers', async () => {
        const budget = env.STEAM_BUDGET.getByName('concurrent-budget-test');
        const results = await Promise.all(Array.from({ length: 12 }, () => budget.reserve()));
        expect(results.filter(Boolean)).toHaveLength(3);
        expect(await env.STEAM_BUDGET.getByName('concurrent-budget-test').reserve()).toBe(false);
        expect(await env.STEAM_BUDGET.getByName('different-credential-test').reserve()).toBe(true);
    });
});
