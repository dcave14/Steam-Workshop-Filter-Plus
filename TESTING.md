# TESTING

How this project is tested.

Performance follow-up (October 20): bounded, sequential samples in
`perf/runtime-perf.js` and the before-source snapshot show collection hover scripting
55.65 → 3.25 ms (94% less), star-filter scripting 213.92 → 38.73 ms (82% less), and
filter/reset total main-thread work 467.14 → 334.97 ms (28% less). These are averages
of two short samples each, not whole-PC CPU or network speed claims. See `perf/REPORT.md`.
The harness defaults to one run per page, caps repeats at two, lowers browser priority,
checks free memory/page heap, and skips further interactions if idle load exceeds budget.
No CPU throttling, stress loops, or heap snapshots. A 2.5-second DevTools MCP idle trace
and ten live full-description/filter/size checks were recorded. Styling is unchanged.
Regression follow-up: collection filters 29, size/ratings 25 (including cached ID changes),
Workshop ratings 21, geometry 70, saved filters 57, and Quick View 35 passed in Chrome.
Six UI-only collection motion checks passed in Firefox, including sleeping controls waking
for scroll/resize, a 650ms transform (maximum sampled offset 0.067px), and target filtering.
Quick View navigation waits for the new item and parks the pointer away from creators so
a legitimate new hover does not get mistaken for stale controls.

1.4.0 verification: Chrome 57/57 and Firefox 57/57 saved-filter checks (including three
consecutive reloads each); 35 Quick View filter checks in each browser; 78 inflection
checks; 7 live plural/highlight checks; 13 word-mode dismissal checks; 30 picker layout
checks; 54 geometry checks; 7 migration/concurrency/cache/search
regressions. Final runs passed without extension or hydration errors. Both release ZIPs
were checked against the current manifest and all referenced source bytes.
Collection follow-up: 27 live collection checks, 21 intercepted subscription checks in
each of Chrome and Firefox, and 8 Chrome DevTools MCP checks passed. Workshop 57/57,
Quick View 35/35, and geometry 54/54 were rerun successfully. Both final ZIPs contain
14 files matching current source. No real subscription changes were made during tests.
Size/ratings follow-up: 24 collection byte/units/filter/cache/retry/layout checks and
21 Workshop rating-count/responsive/unknown-count checks passed in both Chrome and
Firefox. The expanded four-control geometry matrix has 70 checks. Nine DevTools MCP
checks validate live Steam sizes, their change after exclusions, rating thresholds,
and the two-by-three toolbar with centered labels and left-pinned icons in both rows.
Release packages now contain 16 files. Historical three-control measurements below
describe earlier versions, not the current layout.

Search-scope/order follow-up: `node tests/filter-search-scope-test.js` (also `--firefox`)
covers exact button order/centering, newest-first versions, the separate description toggle,
both keyword modes, full descriptions beyond row previews, tab synchronization, reloads,
missing descriptions, retry, and subscription-plan verification. Ten live DevTools MCP checks
also read real descriptions for the 862-item collection, including detail-page fallback for
six descriptions omitted by Steam's public API. Packages now contain 17 files.
Chrome's native whitespace-search reload warning (React #418) was reproduced with no
extension using `tests/steam-whitespace-reload-baseline.js`; the test separately verifies recovery,
the saved preference, and the correct scope afterward. Only that reload warning and the
previously reproduced Firefox native WASM CSP warning are separated from extension errors.

## Saved filters and Quick View regressions

Install Puppeteer with `cd perf; npm install`, then run from the repository root:

```
node tests/saved-filters-test.js
node tests/saved-filters-regression-test.js
node tests/workshop-geometry-test.js
node tests/picker-layout-test.js
node tests/quick-view-filters-test.js
node tests/title-word-inflection-test.js
node tests/title-word-ui-test.js
node tests/word-mode-dismiss-test.js
node tests/collection-filters-test.js
node tests/collection-subscriptions-test.js
node tests/collection-subscriptions-test.js --firefox
node tests/collection-size-ratings-test.js
node tests/collection-picker-motion-test.js
node tests/collection-picker-motion-test.js --firefox
node tests/workshop-ratings-test.js
node tests/filter-search-scope-test.js
node tests/filter-search-scope-test.js --firefox
node build.js
node tests/collection-size-ratings-test.js --firefox
node tests/workshop-ratings-test.js --firefox
node tests/saved-filters-test.js --firefox
node tests/quick-view-filters-test.js --firefox
```

The first test covers the live keyword/author controls, persistence, and clickable title words.
Collection checks cover the native-style panel, text-sized inline creator controls, title-word
selection, unchanged row/star geometry, title-only local matches, deferred undo, shared storage
and live synchronization with Workshop, reloads, and numeric/vanity creator identities.
Subscription tests intercept every mutation request before it reaches Steam. They exercise
the exclusion warning, native Add/Overwrite choices, second overwrite confirmation, eligible
IDs only, existing subscriptions, complete paginated list verification, add-before-remove
ordering, all-excluded collections, changing filters, failed additions, and unreadable lists.
The test browser remains logged out: actual signed-in subscription mutations are not claimed
as verified. Steam's public `sharedfiles_functions_logged_in.js` was inspected to retain the
native choice/helper contract and per-item POST parameters.
The picker layout test covers 1600/1280/1024px with short, long, and 200-character creator
names. It checks the compact +/−/? controls leave Quick View clear, all author-row controls
share a vertical center, the help fits inside the card, and title controls avoid the stars.
The main test also checks equal input/Save/help heights and the card question mark's guide.
Quick View tests use real top-layer dialogs in Chrome and Firefox. They cover each creator's
controls, co-creator matching, primary-author vanity/profile aliases across reloads, clicked
title words and title-only requests, help, deferred application/undo, closing while pending,
and next-mod navigation. The compact word checkbox sits immediately after minus, with its
explanation in ?. There is no separate sidebar/dialog checkbox row. Tests check yellow
underlined titles, persistent word targets, switching words, and restoring links on disable.
Only the hovered creator reserves inline control space; one extra wrap line is reserved
below the compact names to keep subsequent content steady. The test waits for fonts and the primary preview
before comparing content positions. Only hovered/selected word ranges use the CSS Highlight
API; titles are never wrapped or rewritten. Tests inspect range contents and styles, including
the absence of full-title underlining. English inflection tests cover -s/-es/-ies, irregulars,
mass nouns, proper-name exceptions, case, possessives, and non-English text. A live Steam
Workbench/Workbenches test checks the singular saved term still returns plural title matches.
The dismissal test checks outside-card clicks and Escape clear both word highlights,
uncheck the toggle, hide pinned controls, and cancel an unconfirmed word filter without
changing saved filters. It also checks clicks inside mods/help retain the mode and Quick
View's cross, backdrop, and native Escape close exit it.
The ? is an SVG icon whose center is compared with
the +/- SVGs through hover changes. The
picker lives inside the dialog so it can be clicked above the modal backdrop. Quick View
dependency images remain excluded from browse-card enumeration. Chrome DevTools MCP
also checked modal hit testing, the shared word mode, the compact guide, and title undo.
Card +/− actions wait 2.5 seconds before saving/applying; checks verify the original card
stays visible past two seconds, confirmation fits inside it, undo cancels the action,
and the message never transfers to the replacement card. Both author actions and title
undo are covered. Word mode starts off, uses the checkbox beside minus, and restores
normal link behavior when disabled. Chrome DevTools MCP also verified the delay and
containment with an intentionally long title in a real unpacked extension at 1280px.
Keyword references use Steam's native Title Only scope (`search_text_target=1`); checks
also inspect visible titles and the help button's placement, explanation, and Escape close.
The regression test checks that both URL and request-body searches keep saved keywords
in the title-only scope instead of matching descriptions or tags.
It samples author and title pickers on every animation frame while the card returns from
hover, checking that they follow the live link/range within 0.75px through the hide delay.
The regression test checks migration from `savedFilters[appid]` to independent
`savedFilters:<appid>` storage keys, empty-list tombstones, simultaneous saves in different
games, same-game tab synchronization, multiple author includes, and the old `-"armor"` /
`"mechs"` cache collision. Keyword cache suffixes are now allocated uniquely per page.
It also checks that multiple saved keywords combine with a typed search. Initial form
submission waits one task for React's controlled input to commit; the Firefox test covers
the saved-keyword reload case that previously submitted the old empty value.
Both browsers repeat that reload three times. The sidebar waits for
`data-wshs-page-hydrated` (Steam's `SSR.hydrated` flag plus hydrated native sidebar
click handlers, with no dehydrated ancestor boundary, checked in the MAIN world);
the sort row's earlier `data-wshs-hydrated` signal is insufficient for sidebar writes.
Saved terms are also withheld from the fetch hook until this gate passes: changing
Steam's initial `routeData` during hydration makes the loader disagree with the SSR HTML.
A load-plus-quiet-DOM fallback handles pages where the full signal is unavailable.
The initial saved query is acknowledged by the MAIN-world hook through
`data-wshs-requested-terms`. A bounded retry with a fresh cache suffix handles
Steam resetting the controlled input after its root reports hydration complete.

The geometry test opens Quick View (including dependency thumbnails), closes it three times
with the cross or Escape, and compares all control rects and gaps without hovering a card.
It also sweeps star/hide/sort states at 1600/1280 and the two-button fallback at 640/520,
and checks an all-hidden grid. Dialog content (`dialog`, `role=dialog`, `aria-modal=true`)
is excluded from browse-card enumeration and grid-author filtering. Modal picker targets
are explicitly limited to Quick View's main heading and its creator row, excluding dependencies.
These tests use real unpacked extensions in temporary browser profiles. Screenshots go to
`tests/out/`. Chromium executables can be overridden (`--chrome` on the first test, the
first positional argument on the regression/matrix tests). The Firefox test uses the built
Firefox manifest; rebuild before running it.

Steam sometimes responds HTTP 200 with `eresult:10` and an overloaded query queue. That
is a service failure, not a valid empty result. Reference queries retry briefly and then fail
explicitly; do not claim acceptance from those error pages. Logged-in subscription checks
still require a Steam login; logged-out hide toggles cannot verify subscription lookup.
The Firefox test also loads Steam once without any extension. Its own WebAssembly CSP
errors are excluded only when reproduced in that baseline; other page/hydration errors fail.

## Performance testing

`perf/perf-test.js` loads live Steam pages in headless Chrome (Puppeteer, system Chrome) and
compares them with no extension, with the extension, and (browse page) with the old
load-plus-quiet-period injection gate. It reports the median of N runs for: time until the
buttons appear, DOMContentLoaded/load, script and main-thread task time, layout and style
recalc counts, JS heap, long tasks, idle cost over 5s, React hydration errors, and the cost of
the star/hide clicks.

```
cd perf
npm install
node perf-test.js --runs 5            # both scenarios
node perf-test.js --runs 5 --only collection
```

Scenarios: the RimWorld browse page (new layout) and a ~860-item RimWorld collection (classic
layout). Raw numbers go to `perf/results.json`. Runs that receive a different page (Steam's
"too many requests" page after roughly 100 loads, or a changed collection) are dropped from the
medians and their HTML is saved as `perf/off-target-*.html`. Leave a few minutes between full
runs so Steam's rate limit resets.

Reference medians (2026-10-02, 5 runs): buttons visible ~1.4s on the browse page (old gate
~3.2s); on the large collection the extension adds no DOMContentLoaded delay, ~20 layouts and
~20 style recalcs; star/hide clicks cost under ~25ms.

## Runtime testing (required)

User requirement (2026-10-01): "make sure to use the proper chrome dev tools mcp and what not to
test!!!". Runtime/UI acceptance must be verified in a real Chromium-family browser through the
chrome-devtools MCP server, not through jsdom mockups. jsdom is fine only for cheap static/smoke
checks; it is not acceptance.

- MCP server name: `chrome-devtools` (npm package `chrome-devtools-mcp`). It is registered in the
  opencode global config `C:\Users\prodb\.config\opencode\opencode.jsonc` as a top-level `mcp` entry
  (type local, command `npx -y chrome-devtools-mcp@latest`, enabled true).
- opencode config is NOT hot-reloaded: after any config change, quit and restart opencode before
  expecting the chrome-devtools MCP tools to appear.
- Page under test: https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&days=90
  (RimWorld workshop browse). Logged-out for console-clean checks; logged-in for hide/star
  filtering and card subscription state.
- The extension must be loaded unpacked in the browser the MCP drives. Gotcha (2026-10-01):
  Chrome 154.0.8037.92 (branded) ignored `--load-extension` even with
  `--enable-unsafe-extension-debugging` (0 extensions loaded); Edge 154.0.4258.37 loaded it fine.
  If the MCP's browser will not load the extension (Chrome 154 branded sets
  DisableLoadExtensionCommandLineSwitch and ignores `--load-extension`), drive Edge yourself and
  point a second MCP instance at it (verified 2026-10-01, Edge 154 headless):
  - Edge launch (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`):
    `--headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-sync
    --disable-features=Translate,DisableLoadExtensionCommandLineSwitch
    --enable-unsafe-extension-debugging --window-size=1576,935 --user-data-dir=<temp profile>
    --remote-debugging-port=9225 --load-extension=<repo>
    --disable-extensions-except=<repo> about:blank`
  - Second MCP instance (`--browserUrl` is camelCase; `--workspace` is repeatable):
    `npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9225 --workspace <repo>
    --workspace <os temp dir>`
- MCP tool gotchas (2026-10-01): `evaluate_script` wraps its `function` argument as `(<fn>)` and
  invokes it - pass a function expression; an IIFE string throws "fn is not a function".
  `take_screenshot` to a filePath outside the OS temp dir requires the `--workspace` flag above.
- Edge recipe pitfalls (round 5): literal quotes inside `--load-extension` /
  `--disable-extensions-except` values are unreliable through this shell - use a space-free
  junction path (e.g. `C:\junc\wshs`) pointing at the repo; and the profile `Preferences` file
  existing is NOT proof the extension loaded - verify in-page before trusting a session.
  Harness note: `matrix-lib.js` `gaps.*` is always null (labelInfo.rect lacks `right`); take
  inter-button gaps from the run-line output instead.
- Captured DOM snapshots for offline reference go to the system temp dir, e.g.
  `C:\Users\prodb\AppData\Local\Temp\opencode\ws-rim-browse.html`. Never commit captures.

## Filter variation matrix (standing runtime check)

Current toolbar: four controls, including minimum rating count. The updated matrix samples
all four, includes rating thresholds 0/100/1000/5000, and verifies 1600/1280/640/520px.
Wide four-column grids align one dropdown with each card; narrower grids use equal columns.
The native sort remains the last control. Collection pages use a CSS grid with two rows of
three equal controls. The older three-control/fallback measurements below are historical;
their card-width and cleared-sort-width details are superseded by this four-control layout.

Every runtime round must re-run the filter variation matrix: capture all three control rects
(x/y/w/h), the two gaps and the computed font-size as a baseline, then sweep every sort option,
every star state (default, 1+..5+), the hide toggle off/on/off, and at least 3 mixed combos,
asserting every capture matches the baseline (<=0.5px) with no ellipsis on known labels at 1576.
Also repeat two different sort options at 1280 (main path; their rects must match each other).
On the fallback path (640/520) the native sort's forced width is CLEARED - it sits at its
natural width and may wrap to a second row - so there compare only our two buttons' equal
widths and label independence. Exact steps
and screenshots: acceptance items 8-17 of
`.opencode/tasks/2026-10-01-stable-geometry-across-filters.md`.

Heavy-filter case (round 3): the matrix must also include a star filter that leaves FEWER THAN
3 visible cards and one that leaves only 1-2 rows. Every button rect, both gaps and the computed
font must still match the unfiltered baseline: the scan derives W/columns from the unfiltered
grid structure, so filtering cannot move anything. Fallback-latch recovery: if the fallback
layout ever appears (see the row-wrap signature in the round-3 notes), any filter change, DOM
mutation or window resize must restore the grid placement with the native sort at the shared
width - the fallback must never stick. Canonical <3-visible repro: `browsesort=mostrecent` plus
the "5 Stars Only" star option hides all 30 sample rows (30/30 hidden, 0 visible) - the exact
pre-fix fallback trigger. Measurement-side note: the geometry probe temporarily un-hides our
`hidden-item` cards in a synchronous batch and re-hides them; expect remove+add mutation pairs
during probes, and after any measurement-triggering action verify filtered rows are STILL
hidden (leak count must be zero) with no visible flicker.
- Helper reference: `WSHSDom.getSortOptionLabels` (steam-dom.js) returns the native sort
  dropdown's option label list used to seed the frozen worst-case ink constant.

### Round-2 runtime notes (native sort anatomy and login-gated checks)

- Native sort anatomy expectation (acceptance item 13): the left sort glyph sits 10px from the
  button's left edge, the right chevron 10px from the right edge, and the label ink is centered
  between them with equal icon-to-ink gaps (difference <=1px) for every label length
  ("Most Recent" through "Most Popular (Three Months)" and "Total Unique Subscribers").
  "Whitespace" means the icon-to-ink gap on each side, not raw edge distance: raw edge
  whitespace is structurally ~8px asymmetric on all three buttons (25px left icon vs 17px
  chevron) and that asymmetry is expected.
- Fallback width note: at 520px the two injected buttons are equal and label-stable, and the
  star button's left edge can sit 4px left of the viewport (known 4px overflow, no breakage).
- Native sort dropdown behavior (Steam's, not the extension's): the TIME FRAME radio group is
  hidden for time-independent sorts (Most Recent, Last Updated, Total Unique Subscribers) and
  the "All Time" choice maps to `browsesort=toprated` with no `days` parameter. A sweep can
  therefore see fewer than the full 12 native radios.
- Sort popover close: Steam's popover ignores synthetic outside-clicks in automation; close it
  by re-clicking the sort button or pressing Escape.
- Login-required checks: the logged-in card width W=262.5 and the hide row-count change
  (`.user_action_history_icon.subscribed` rows disappear) need an authenticated Steam session;
  without a login, mark them login-required instead of claiming a pass.
- Console budget: the "at most one [WSHS] warn" allowance is per page load (one page
  lifecycle), not per state; sweeps and resizes must not add a second warning. The budget
  counts only [warn] lines (the error budget is zero; other console levels are unrestricted).

### Round-3 runtime notes (heavy filters, fallback signature, screenshot measurement)

- Star dropdown label mapping: the option text for the top state is "5 Stars Only" (options:
  "Show All", "5 Stars Only", "4+ Stars", "3+ Stars", "2+ Stars", "1+ Stars"), while the button
  label it produces is "5+ Stars". A naive snapshot-regex harness that clicks the option text
  and then asserts the same text on the button breaks; select the option by its `data-stars`
  value or position and assert the button label separately.
- Fallback signature in a screenshot: our two buttons (star, hide) are right-anchored in the
  injected wrapper at the ~4px wrapper gap and the native sort button wraps to a SECOND row
  below them (the wrapper is `margin-left:auto` inside Steam's flex-wrap row). The shared width
  is then the frozen Iworst+78 fallback constant (~255.2px), not the card width. The second-row
  sort is the quickest way to identify the fallback path in a screenshot.
- Pixel-measuring user screenshots: run a local System.Drawing script (PowerShell
  `Add-Type -AssemblyName System.Drawing`, load the PNG, scan a horizontal pixel line for the
  dark button-background runs) and report button edges and gaps in pixels; user screenshots are
  1:1. Sanity anchors at 13px: label ink ~67.1px for "Star Rating" and ~50.2px for "5+ Stars".

### Collection-page checklist (classic layout, 2026-10-01)

Page: `https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585` - legacy layout, no
`#CommunityTemplate`, no `window.SSR`, all 865 rows in the DOM, anchor is the native
`.subscribeCollection` 3-button row. The controls get a collection-scoped `.general_btn` skin
there, and the row wraps our wrapper onto a second line (the row is too narrow for two more
buttons); the three native buttons keep their look (only their width stretches and their
content centres - see the geometry line below).

- Controls render inside/next to the `.subscribeCollection` row, 30px tall, dark chip,
  icon + label centered in the control like the solo item subscribe button (the star
  chip's icon + label + chevron is one centered cluster; the hide chip keeps its
  reserved check slot in flow and balances it so the active state cannot shift the
  cluster), unchanged on hover except the native blue `#97C0E3` hover.
- "Hide Subscribed" on hides only rows whose `.general_btn.subscribe` has `toggled`
  (add/remove `toggled` live on rows to simulate); off restores all rows, no holes.
- Star filter narrows rows by `img.fileRating` (`N-star.png`); clearing it restores all.
- State survives a reload through the existing `hideSubscribed` / `starFilter` storage keys.
- A row with no rating or unknown subscribed state is never hidden by hide-subscribed.
- Zero console errors.
- Bar geometry (two-row aligned layout): the `.subscribeCollection` bar must stay within its container
  at any viewport (bar right edge = container content right edge, no overhang). Row 1 = the 3 native
  buttons, row 2 = the 2 injected chips; both rows end on the SAME line - the right edge of the
  rightmost visible green per-row subscribe button (fallback: the bar's content right edge), so
  button 3's right edge = chip 2's right edge. `collection-row-align.js` aligns them: chip 1's left
  edge = native button 1's left edge, the native buttons stretch proportionally to their natural
  widths (inline `width` only, 5px gaps kept unchanged, look otherwise untouched), and the 5px gap
  between the chips stays centred on native button 2's live (stretched) midpoint. The gap between
  the rows is 5px. In the aligned state every control's inner content is centered in its content box
  (the native buttons' icon + label become one flex cluster with the natural 4px icon-label gap
  preserved; the chips likewise, the star chip's chevron included); when the script cannot measure,
  or the 3 native buttons are not on one line (top deltas > 1px), the inline widths are cleared and
  the natives + wrapper fall back to Steam's natural layout with the natural (left-anchored) content
  alignment.

### No-extension injection harness (classic pages, CSP-safe)

The legacy collection page's CSP blocks localhost fetch/script (connect-src/script-src), so runtime
checks cannot load repo files from a server and the automation browser cannot install the unpacked
extension. Established harness (rounds 2b-5): after a clean reload, inject the current repo files
with a hidden file input + FileReader (steam-dom.js, content.js, collection-row-align.js in that
order, plus styles.css injected as a `<style>` tag), under a localStorage-backed `chrome.storage` shim so `hideSubscribed` / `starFilter`
persistence can be exercised. Hash-match the injected bytes against the repo files before asserting.
Harness detail: `upload_file` needs a snapshot input uid - hide the ~864 `.collectionItem` rows
before snapshotting so the snapshot stays small enough to enumerate the hidden file input.

## Screenshots

- Tester screenshots: `.opencode/tasks/temp-screenshots/<task>-<n>.png`. The orchestrator opens
  them to judge the overall look; pixel measurements (edges, gaps, sizes) come from the tester's
  report, not from ad-hoc image scripts.
- User screenshots: `C:\Users\prodb\Pictures\Screenshots\` (read-only; never move/rename/delete).
  When a user screenshot is referenced in a task, the task file lists the exact filenames.

## Tester reports

Every tester report ends with a **Doc gaps** line (docs that failed to mention something the change
introduced, or docs that are missing). Fix each gap before closing the task: TESTING.md is edited
by the orchestrator; anything else goes into the next coder round.

## Acceptance

Acceptance criteria live in the task file (`.opencode/tasks/<task>.md`). A task is done only when
all acceptance commands pass AND the reviewer returns no blocking findings AND the docs listed in
the task mention every new public name.
