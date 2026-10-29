# Project working rules

- Keep edits responsive on Workshop items, Workshop Collections browse, and collection detail pages. Collections may contain hundreds or thousands of rows.
- Avoid full-list scans or DOM decoration on scroll/pointer events. Cache stable identities with structural invalidation; batch necessary geometry work and avoid unchanged style/DOM writes.
- Preserve native Steam links, callbacks, subscription state and description content. Test subscription changes through intercepted requests, never real account mutations.
- Check all three surfaces after shared filtering/layout changes, including both sidebar sides and Comfortable/Compact. Keep test browsers bounded (the release runner uses at most two); profile sequentially with no concurrent test load.
- The last shipped release is 1.4.0. Current work targets 1.5.0; do not bump the version for each local edit.
