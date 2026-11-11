# Project working rules

- Keep edits responsive on Workshop items, Workshop Collections browse, and collection detail pages. Collections may contain hundreds or thousands of rows.
- Avoid full-list scans or DOM decoration on scroll/pointer events. Cache stable identities with structural invalidation; batch necessary geometry work and avoid unchanged style/DOM writes.
- Preserve native Steam links, callbacks, subscription state and description content. Test subscription changes through intercepted requests, never real account mutations.
- Check all three surfaces after shared filtering/layout changes, including both sidebar sides and Comfortable/Compact. Keep test browsers bounded (the release runner uses at most two); profile sequentially with no concurrent test load.
- Extension source lives in `src/` by area (core, workshop, collections, steamcmd, page, background, popup, options); `manifest.json` stays at the root. Put a new file in the folder for its area and add it to `manifest.json` in load order. Tests find source files with `sourcePath()` in `tests/browser-helpers.js`, and the packaged file list comes from `manifestFiles()` in `build.js`.
- The last shipped release is 1.5.4. Do not bump the version for each local edit; ask before picking the next release number.
- Keep the browse search row flush with the sidebar: search / gear / reset (×) on the left, reset / gear / search on the right. Gear and reset stay paired, with reset outside and gear inside. Reset matches the gear's width and the search/gear height across widths and Comfortable/Compact layouts.
- On all three surfaces, every toolbar dropdown's text must be no larger than its own button's text. Sort section headings stay underlined, with smaller options; a lone section spans and centers across the full menu.
