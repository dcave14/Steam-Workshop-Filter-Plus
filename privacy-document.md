Privacy Policy - Steam Workshop Filter Plus
===================================

Last updated: October 20, 2026

Hosted version: https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html
(source: `docs/privacy-policy.html`; keep both in sync)

Data Stored
-----------
Steam Workshop Filter Plus stores these settings on your device:
- Whether "Hide Subscribed" is turned on
- The minimum star rating you picked
- The minimum number of user ratings you picked
- Saved keyword phrases and author identifiers/names, their include/exclude/off states, and the game each filter belongs to
- Whether description search is enabled for each game
- Cached Steam creator profile/vanity identifiers so author filters match across Workshop and collection pages
- Cached public Workshop item IDs, file sizes, rating counts, and cache timestamps; reused for 15 minutes and limited to 5,000 items

These are saved on your own device with Chrome's storage API, only so your choices are remembered between browser sessions.

Requests to Steam
-----------------
On Steam's newer Workshop pages, the page does not include which items you are subscribed to. To hide those items, the extension asks Steam for your subscription status of the items on the page you are viewing. This request goes from your browser to steamcommunity.com only, uses the Steam login you already have in your browser, and is only made while "Hide Subscribed" is turned on and you are signed in to Steam. The answer is kept in memory on that page and is discarded when you leave it.

Active saved keyword phrases are added to Steam's own Workshop search requests in Title Only mode by default, or title-and-description mode when you enable "Include descriptions in search". These phrases are sent only to Steam, even though they are not shown in the search box. Collection keywords are matched locally. When description search and a keyword filter are active on a collection, item IDs are sent in batches to Steam's public api.steampowered.com endpoint to read full descriptions. These API requests omit login credentials and require no API key or additional host permission. If the API omits an item's description, its steamcommunity.com detail page is read using your existing Steam session when present. Descriptions are cached in page memory, reused for 15 minutes, and discarded when you leave; saved phrases are not sent in those description lookups. Active author filters may request the creator's public Steam profile XML to match numeric and vanity profile links, caching those identifiers on your device.

After you confirm Subscribe to all on a filtered collection, the extension sends individual eligible mod subscription requests to Steam using your existing Steam session. Add Only keeps existing subscriptions. Confirming Overwrite also reads your complete current subscription list for that game and removes subscriptions outside the eligible set after additions succeed. Subscription lists and progress stay in page memory and are discarded when you leave.

Collection sizes and minimum rating counts use public item summaries requested in batches from steamcommunity.com, the same service Steam uses for Quick View. Only item IDs are sent for these lookups; the browser uses its existing Steam session when present. No API key is required. These requests do not subscribe, unsubscribe, or change an account. Available embedded Workshop metadata is reused where possible.

Data Usage and Sharing
----------------------
- All data stays on your device or goes only to Steam, as described above
- No personal information is collected by the developer
- No data is sent to the developer or shared with third parties
- No analytics are collected
- No browsing history is tracked

Contact
-------
Questions about this policy can be raised on the project's GitHub issues page:
https://github.com/dcave14/Steam-Workshop-Filter-Plus/issues
