# Sidebar popup and 75-item page size

## Evidence, October 26, 2026

- Steam's live RimWorld browse dropdown offers 10, 15, 30 and 50. A normal
  `num_per_page=75` page renders 30 cards; changing the label alone is insufficient.
- A read-only native routeAction with `num_per_page:75` returned 75 results,
  `total_count:63735` and `total_pages:850` (the correct ceiling).
- [QueryFiles documentation](https://partner.steamgames.com/doc/webapi/IPublishedFileService#QueryFiles)
  documents `numperpage`, but does not promise that the website offers every size.
  The SDK's separate 50-result query limit does not establish a limit on this web route.
- Steam's public browse source currently merges `onBrowseHandler` changes into the
  current query and uses its existing renderer, cache and pagination. Its preference
  context exposes `setPreferences`, including native `filters_column` left/right.
  These are website implementation details, so access must be structurally guarded.
  Research snapshots: local ignored `tests/out/sidebar-probe*.json`,
  `probe75-response.json`, and the public browse modules downloaded there.

## Implementation plan

1. Add a toolbar action popup with an accessible pinned-sidebar switch and left/right
   radios, saved automatically in extension local storage. Add no appearance controls
   to the page sidebar. Existing API options remain accessible separately.
2. After hydration, identify native browse/preference contexts by their function and
   option shapes, without hardcoded bundle names or changing React state directly.
   Use native callbacks for placement and page size; keep Steam's own mod cards.
3. Pin the native filter pane with bounded, scrollable CSS. Keep the existing search
   and gear aligned and pinned using a measured placeholder; do not reparent React
   nodes. Fall back to native layout on narrow viewports or unknown structures.
4. Extend the per-page dropdown with 75 only when the native browse callback is
   available. Restore 75 after hydration on reload/direct links, preserving the page
   and all existing query fields. Keep native paging and original-size selection.
5. Verify live 75-result counts, page 2, refresh/back, search and native filters.
   Exercise popup persistence and both placements, scroll reachability, viewport
   changes, native interactions, collection isolation and existing saved-filter tests.
6. Package both browsers and refresh the owned Chrome test copy with preferences
   preserved. Do not publish a store release or change the backend/key.

## Verified result

Implemented as 1.7.0. The action popup owns appearance settings. Native callbacks
move the sidebar and select page sizes; a guarded standard select occupies the
original per-page control's position. Native Steam cards and pagination are retained.
A 75-item history entry is normalized to the server's initial 30 during document
startup and restored after hydration, preventing React #418 on reload.

Live acceptance passed 19 Chromium checks and 10 Firefox checks for the page-size
path, including 75 distinct results, nonoverlapping page two, reload, Back/Forward,
native search/category filters and return to 30. Chromium also verified the popup,
both positions, pinned search alignment, last-filter reachability, narrow viewports,
persistence and collection isolation. The existing paired exclusion suite passed 73
checks. No backend deployment or key change was required.

## 1.7.1 follow-up

Added 100 through the same guarded native browse path and verified its distinct
result count, paging, same-page reload, history, search and categories in Chromium
and Firefox. Corrected the toolbar's four-column clamp so it spans all five columns
at the reported screenshot widths, with equal controls and native card gaps. Search
and filter-pane edges align in both placements. Existing sidebar pinning is retained;
no sticky control toolbar is introduced. The sidebar uses Steam's native scrollbar
styling rather than the thin platform override. Group labels are reduced to 11px.

## 1.7.2 correction: one card per control

The 1.7.1 interpretation of filling all five columns was incorrect. The required
geometry is one card's width for each control, with that card's exact gaps and column
edges. The control block uses trailing columns with a left sidebar and leading
columns with a right sidebar. Extra columns stay empty. Narrow layouts wrap at the
same card width rather than stretching or compressing the controls. Acceptance now
compares each control directly to real card rectangles and verifies identical widths
after flipping. The incorrect full-grid-span assertions were removed. The corrected
alignment suite passed 68 checks and the existing geometry suite passed 71.
