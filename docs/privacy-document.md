Privacy Policy - Steam Workshop Filter Plus
===================================

Last updated: October 26, 2026

Hosted version: https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html
(source: `docs/privacy-policy.html`; keep both in sync)

Data Stored
-----------
Steam Workshop Filter Plus stores these settings on your device:
- Whether "Hide Subscribed" is turned on
- The minimum star rating you picked
- The minimum number of user ratings you picked
- Saved keyword phrases, required Workshop item IDs, and author identifiers/names, their include/exclude/off states, and the game each filter belongs to
- Filter group names, group membership, enabled states and collapsed states, stored on your device for each game
- Independent Workshop sidebar, Workshop filter-bar and collection filter-bar pinning, plus left/right sidebar placement, stored locally
- Comfortable/Compact card layout and the optional motion master switch, hover-animation, homepage-carousel and animated-preview preferences, stored locally
- Whether description search is enabled for each game
- Development builds only: an optional personal Steam Web API key, stored locally, never synced. Public service builds do not ask users for a key.
- Cached declared Workshop dependency IDs, item titles, and timestamps; reused for 15 minutes and limited to 5,000 items
- Cached Steam creator profile/vanity identifiers so author filters match across Workshop and collection pages
- Cached public Workshop item IDs, file sizes, rating counts, and cache timestamps; reused for 15 minutes and limited to 5,000 items

These are saved on your own device with Chrome's storage API, only so your choices are remembered between browser sessions.

Requests to Steam
-----------------
Sidebar placement uses Steam's native preferences and may update its Workshop
preferences cookie. The 75-item choice uses Steam's normal browse query, URL and
browser history. These controls do not send group names or extension settings to the
shared metadata service.

On Steam's newer Workshop pages, the page does not include which items you are subscribed to. To hide those items, the extension asks Steam for your subscription status of the items on the page you are viewing. This request goes from your browser to steamcommunity.com only, uses the Steam login you already have in your browser, and is only made while "Hide Subscribed" is turned on and you are signed in to Steam. The answer is kept in memory on that page and is discarded when you leave it.

When Steam's native search box is empty, longer positive saved keyword phrases are added to its Workshop search requests in Title Only mode by default, or title-and-description mode when you enable "Include descriptions in search". Nonempty native searches retain their original text and field scope; saved filters then apply locally to the returned items. Saved negative phrases and short terms are matched locally against titles and opted-in descriptions, never comments. Negative phrases are not sent to Steam's search index. When description search and a keyword filter are active on either Workshop or collection pages, item IDs are sent in batches to Steam's public api.steampowered.com endpoint to read full descriptions. These API requests omit login credentials and require no API key or additional host permission. If the API omits an item's description, its steamcommunity.com detail page is read using your existing Steam session when present. Descriptions are cached in page memory, reused for 15 minutes, and discarded when you leave; saved phrases are not sent in those description lookups. Active author filters may request the creator's public Steam profile XML to match numeric and vanity profile links, caching those identifiers on your device.

Version 1.5.0 uses the shared service at https://steam-workshop-data.prodbycave.workers.dev for declared dependencies, full descriptions, file sizes and rating counts. The extension sends only public Workshop item IDs, without Steam login cookies, subscription lists, or comment text. The service calls Steam's fixed read-only GetDetails endpoint. The developer's Steam key is kept as a Cloudflare Worker secret and is never included in extension packages, client requests, public responses or request URLs. Users do not supply a key for this service. Successful complete batches may be cached for 15 minutes on Cloudflare's network, and item data is also cached on the user's device. Failed or incomplete API data remains unverified; API mode does not scrape individual Workshop pages as a fallback.

Cloudflare processes connections to this service, including ordinary connection information such as IP addresses. Operational logs contain request counts and sanitized errors; application code does not log Steam keys, cookies, comment text or subscription lists. Cloudflare processing is subject to its privacy policy: https://www.cloudflare.com/privacypolicy/. The service is read-only and does not change subscriptions.

A development build without a shared service may use a personal key stored in chrome.storage.local, not encrypted by the extension or synced. Its background context sends that key only to Steam's API using the x-webapi-key header. Development settings can remove the key and optional API host access. Unconfigured keyless development builds retain public metadata/description endpoints and page fallbacks described above. No shared developer key is bundled in any build.

After you confirm Subscribe to all on a filtered collection, the extension sends individual eligible mod subscription requests to Steam using your existing Steam session. Add Only keeps existing subscriptions. Confirming Overwrite also reads your complete current subscription list for that game and removes subscriptions outside the eligible set after additions succeed. Subscription lists and progress stay in page memory and are discarded when you leave.

Collection sizes and minimum rating counts use public item summaries requested in batches from steamcommunity.com, the same service Steam uses for Quick View. Only item IDs are sent for these lookups; the browser uses its existing Steam session when present. No API key is required. These requests do not subscribe, unsubscribe, or change an account. Available embedded Workshop metadata is reused where possible.

Data Usage and Sharing
----------------------
- Data stays on your device or is processed by the shared Cloudflare service and Steam, as described above
- No personal information is collected by the developer
- No Steam account credentials or subscription lists are sent to the developer’s data service; public item IDs and connection information reach Cloudflare as described above
- No analytics are collected
- No browsing history is tracked

Contact
-------
Questions about this policy can be raised on the project's GitHub issues page:
https://github.com/dcave14/Steam-Workshop-Filter-Plus/issues
