# Steam Workshop data service

Production: https://steam-workshop-data.prodbycave.workers.dev

This Worker keeps the developer's Steam key in the `STEAM_API_KEY` secret. The
extension ships only `api-config.js` with the public service URL. There is no
shared client token and no key obfuscation. Browser extension code and network
requests are inspectable, so a client-held secret would not protect the key.

`POST /v1/items` accepts only JSON `{ "ids": ["3812510377"] }`, with 1–100 numeric
Workshop IDs. It returns title, declared direct requirements, description, file
size, rating count and timestamps. Comments, account data and upstream headers
are excluded. It cannot proxy arbitrary URLs or perform subscription mutations.

Controls:

- 4 KiB request limit, 4 MiB upstream response limit and bounded timeout.
- Exact normalized batches cached for 15 minutes in Cloudflare's regional cache.
- 30 requests/minute per client IP per Cloudflare location; this limiter is
  approximate. Origin/CORS checks are not authentication.
- A persistent SQLite Durable Object reserves each upstream cache miss against
  a shared 50,000-request budget. It uses conservative hourly buckets covering
  the preceding 24 hours plus the current bucket. It fails closed when exhausted.
  Calls made with this key outside this backend are not counted by this budget.
- Redirects are returned as failures, so the key is never forwarded to another
  upstream host. Only the fixed Steam endpoint receives the key header.
- No caller headers, cookies, credentials, or arbitrary fields reach Steam.
- Logs contain operational events/counts/statuses, never keys or upstream bodies.

The public endpoint may be called outside the extension. Its quota controls
limit abuse; the URL and CORS rules do not prove a caller is an official user.

## Operations

From this folder, use `npm ci`, `npm test` and `npm run check` before deployment.
`npm run deploy` targets the account and Worker in `wrangler.jsonc`. This service
does not change the main Idyllium.dev website or its DNS.

Set or rotate the key using `npx wrangler secret put STEAM_API_KEY` and the
protected interactive input. Never put its value in a command argument, source,
Wrangler vars, GitHub Pages, release files, a shared extension token or chat.
This command creates a deployment; changes require appropriate authorization.
Local `.dev.vars*`, `.env*` and `.wrangler/` files are ignored by Git.

`GET /health` returns only service readiness. After deployment, verify the
reference mod returns the direct dependency `3809306528` with no key in the
client request, then build the extension with `node ../build.js`.

Chrome's background uses `api-config.js` and the narrow production host permission.
Firefox loads the same parser/config in its background scripts. Public release
settings hide personal-key entry. Fixture browser tests override the service URL
to avoid consuming production requests; live service checks are separate.
