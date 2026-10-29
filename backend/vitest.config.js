import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { STEAM_API_KEY: 'A'.repeat(32), MAX_UPSTREAM_PER_24H: '3' } } })],
    test: { include: ['test/**/*.test.js'] }
});
