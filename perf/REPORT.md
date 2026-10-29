# Performance audits

## October 29, 2026 — dropdowns, settings and collection surfaces — pending 1.5.0

Profiled and implemented with Claude Opus 5.5, after the `:root:has()` pass
below. `perf/dropdown-probe.js` clicks each filter dropdown action and writes
each popup setting the way `popup.js` saves it. For each action it records
Event Timing click-to-paint, main-thread work over the following 700–1000 ms,
and the write behind each style recalc over 8 ms. Surfaces: the 861-row
collection and Collections browse (50 cards), Chrome 1780 × 1050.

Findings:

- **Steam row tooltip loop (collection detail).** After a star pick, the menu
  closes and the pointer rests over a row. `constrainNativeHover` keeps
  `#workshop_item_hover` inside the results column, which can put it under the
  pointer. The tooltip took the pointer (`pointer-events: auto`), so the row got
  a mouseout, the tooltip hid, the row got a mouseover, and the tooltip showed
  again. `hover-loop-probe.js` counted 116 show/hide cycles per 2 seconds,
  indefinitely, with a still pointer. Each cycle re-rendered the tooltip and
  paid Steam's ~60 ms `:root:has()` rescan. The star filter itself is one
  ~29 ms restyle of 346 rows.
- **Reduce motion freeze (collection detail).** `preview-motion.js` appended a
  canvas per preview and then read that preview's layout, so each of the 861
  previews forced its own recalc and rescan. `freeze-probe.js`, same page, old
  file loaded as an overlay: one 24,576 ms long task (24.8 s to settle).
- **Density change (Collections browse).** `workshop-appearance.js` read each
  grid's `display` once per card, after the previous card's class writes,
  forcing 100 style recalcs.
- **Hydration regression from the `:root:has()` pass below.** The pin
  placeholder was inserted as soon as the bar was found. On browse pages that
  can be before React hydrates. With `pinnedWorkshopBar` saved, Collections
  browse threw React #418 on every reload (2/2), and the release suites did not
  catch it. The pre-pass `filter-bar-pinning.js` gave 0/2. No other saved
  preference reproduced it (`react418-bisect.js`), and the native page showed
  no #418 in 3 loads.

Implemented:

- `collection-layout.css`:
  `html.wshs-collection-design #workshop_item_hover{pointer-events:none}`.
  The tooltip is display-only; it still shows and follows rows. Result: one
  show, then no further mouseover, style or child-list churn over 2 s.
- `preview-motion.js` splits each sync into passes: eligibility and parent
  reads; class writes, canvas creation and insertion; offset and computed-style
  reads (after parents become containing blocks); then guarded canvas style
  writes. Result: one 413 ms long task, 841 ms to settle, all 861 previews
  frozen.
- `workshop-appearance.js` reads each grid's `display` once, before writes.
  Density changes now force 4 appearance recalcs instead of 102. Total layout
  barely changed (165.8 → 155.5 ms), because the grid relayout itself is the
  real cost.
- `filter-bar-pinning.js` inserts the placeholder ahead of time only on
  classic collection pages, or on browse pages after `data-wshs-page-hydrated`.
  Otherwise it is created at the first pin, as before the `:root:has()` pass.
  Result: 0/2 reloads with #418, both for `pinnedWorkshopBar` alone and with
  every preference set to non-default.

Collection detail, before → after (`dd1` → `dd2`, two runs about 30 minutes
apart; the tooltip and freeze counts above are the deterministic evidence):

| Action | Click to paint | Style work | Main-thread work |
| --- | ---: | ---: | ---: |
| Choose 5 Stars Only | 176 → 168 ms | 583 → 89 ms | 821 → 175 ms |
| Choose 3+ Stars | 232 → 264 ms | 613 → 117 ms | 934 → 269 ms |
| Choose Show All | 136 → 152 ms | 514 → 78 ms | 802 → 212 ms |
| Next dropdown open after a pick | 40–112 → 24–48 ms | 437–450 → ≤1 ms | 500–669 → 26–45 ms |
| Reduce motion on (settle) | — | 872 → 138 ms | 24.6 s → 0.41 s long task |

Click-to-paint for picks hardly moved, because the loop ran after the first
paint. The gain is the work that followed, which delayed the next interaction.
Unchanged and already acceptable: Ratings picks (130–150 ms of work), Hide
Subscribed (40–75 ms), sidebar side and pinning (50–90 ms), and density
(240–300 ms; one legitimate restyle of about 4,300 elements, forced by
`collection-layout.js:204`). On Collections browse every click-to-paint was
≤ 80 ms; most of its task time is the React page's own background work.

Validation: all 29 `tests/release-regression.js` suites passed. Separately:
filter-bar pinning 17, picker layout 30, saved filters 57, filter inspection 73
(run on Chrome; the test hardcodes Edge, which fails to launch on this
machine). No real subscription writes, version change, commit or publication.

Evidence: `tests/out/performance/dropdowns-2026-10-29/` (`dd1-collection` is
before, `dd2-collection` after; `dd2`/`dd3-browseCollections` before/after the
density fix). The probe scripts are there too. `before-source/` holds the old
`preview-motion.js` and the pre-pass `filter-bar-pinning.js` as overlays.
Reproduce:

```powershell
node perf/dropdown-probe.js --page collection --tag dropdowns
node perf/dropdown-probe.js --page browseCollections --tag dropdowns
```

Release suites do not detect React #418 from saved preferences. After changing
DOM timing on browse pages, save non-default preferences and reload
(`react418-bisect.js`).

## October 29, 2026 — Steam `:root:has()` rescans — pending 1.5.0

Profiled and implemented with Claude Opus 5.5. Earlier passes reduced
extension JavaScript, but collection interactions stayed dominated by style
recalculation that operation counts could not explain. Extension scripting is
now small (7–150 ms per interaction); the remaining cost was style work.

Root cause, measured on the live 861-row collection with a forced style flush
after single writes:

- Steam's community `main.css` contains about 60
  `:root:has(.KWtRH19ERaI- > div[data-accent-color=…])` / `data-dull-color`
  accent rules. When Chrome must recheck them, it rescans the whole document:
  about 55–65 ms per occurrence on the collection page, about 8 ms on Workshop
  browse. Inserting or removing a `div`, or replacing a text node through
  `textContent`, triggers it. A class toggle costs 0.2 ms and editing a text
  node's data costs 0.1 ms. Disabling only `main.css` dropped insertion cost
  from 52 ms to 0.
- This happens without the extension. Steam's own classic hover
  (`prototype.js` `viewportOffset`/`update`) pays it on row hover, so
  collection hover cost is mostly native.
- The extension rule
  `.wshs-collection-filters .wshs-inspection-tools:not(:has(> :not([hidden])))`
  widened the trigger to every element insertion, `span` included. With it
  injected alone into the native page, inserting a `span` inside a row went
  from 0.5 to 50.9 ms. The other extension `:has()` rules measured 0.4–0.5 ms.

Chrome invalidation tracking (`perf/attribution-probe.js`) named the extension
writes behind each recalc over 8 ms. Those recalcs touched only 7–23 elements
and still took 65–108 ms:

- `filter-bar-pinning.js` inserted the placeholder on pin and removed it on
  unpin: about 145 ms of 149 ms scroll style work.
- `collection-sizes.js` `filtered.textContent = …` cost about 100 ms on each
  filter click.
- `saved-filters.js` `positionPicker` forced layout 187 times during four
  Workshop hovers because tracking ran every frame while the picker was still.

Implemented:

- `filter-bar-pinning.js` inserts the placeholder once, collapsed, and toggles
  its display, margin and height. Disabling still removes it.
- `collection-sizes.js`, `workshop-result-count.js` and `saved-filters.js`
  (`setText`) edit the existing text node's data for per-pass status, count and
  size text.
- The inspection-box rule became `.wshs-inspection-empty`, toggled by a small
  observer on that box's children and their `hidden` attributes.
- The Workshop picker sleeps after 20 still frames (anchor rect and picker
  position unchanged), reusing `positionPicker`'s measurement so the check
  forces no layout. Transitions, animations, scroll, resize, mouse movement,
  image loads and result ticks wake it. Quick View keeps per-frame tracking;
  classic collections keep their existing sleep.

Native timings varied about 2x across this session (machine load), so
before/after ran back to back. The "before" build reverses only these edits and
loads as a source overlay. Chrome, 1780 × 1050, right sidebar, Comfortable,
pinning enabled, one sample each, main-thread task time:

| Surface / interaction | Before | After | Native |
| --- | ---: | ---: | ---: |
| Collection scroll | 98.1 ms | 50.1 ms | 64.6 ms |
| Collection scroll style recalculation | 55.5 ms | 2.0 ms | 0 ms |
| Collection hover (4 creators) | 268.6 ms | 261.4 ms | 404.6 ms |
| Collection 40-step mouse sweep | 486.5 ms | 527.5 ms | 1626.8 ms |
| Collection filter/reset | 239.0 ms | 227.8 ms | — |
| Collection filter/reset style recalculation | 142.4 ms | 94.1 ms | — |
| Workshop scroll | 88.5 ms | 73.0 ms | — |
| Workshop hover (4 creators) | 338.1 ms | 222.7 ms | — |
| Workshop filter/reset | 138.6 ms | 96.1 ms | — |

Collection scroll's longest task fell from 40.3 to 14.5 ms, but the after
sample's largest frame gap was 85.5 ms with no matching long task (raster or
decode, not script); one sample cannot separate that from noise. Collection
hover and sweep are unchanged because Steam's own hover code triggers the
rescan. The extension page sweeps faster than native because its row layout
differs. Remaining collection filter style work is the real restyle of 346
hidden/shown rows (about 7,500 elements). Not pursued: removing Steam's rules
would mean refetching and re-injecting `main.css`, which is fragile.

Validation: all 29 `tests/release-regression.js` suites passed. Separately:
filter-bar pinning 17, picker layout 30, saved filters 57 (Workshop author and
title pickers follow every sampled leave frame; maximum error 0.13 px and
0.016 px), filter inspection 73. `filter-inspection-test.js` hardcodes Edge,
which failed to launch on this machine before any assertion. The unchanged
test passed when its launcher was pointed at Chrome without editing the file.
No real subscription writes, version change, commit or publication occurred.

Evidence: `tests/out/performance/has-scan-2026-10-29/` (`pairB-*` before,
`pairA-*` after, `pairN-*` native, `before-source/` overlay). Reproduce
sequentially:

```powershell
node perf/attribution-probe.js --page collection --mode ext --tag after
node perf/attribution-probe.js --page collection --mode native --tag native
node perf/attribution-probe.js --page workshop --mode ext --tag before --overlay tests\out\performance\has-scan-2026-10-29\before-source
```

Rule for future work: on collection pages, avoid inserting/removing elements or
setting `textContent` in scroll, hover and filter paths. Keep nodes and toggle
class or inline style; write `firstChild.data`. Avoid `:not(...)` inside
`:has()` arguments.

## Observer-work audit follow-up — pending 1.5.0

Plan and implementation completed with GPT-6.1 Sol at high reasoning. Priority
went to the remaining full-list observer work and fallback-cache invalidation,
then disabled toolbar pinning and unnecessary collection-size rendering.

- Saved-filter and result-count observers now distinguish native result/control
  changes from tooltip/picker activity, including wrapped overlays. Native title,
  author, row, sidebar and count-anchor replacement still updates. Reused Quick
  View dialogs retain tools and creator/vanity-alias filtering.
- Fallback geometry ignores transient overlay insertion/removal while preserving
  real sibling/layout/stylesheet invalidation. Removed wrappers lose computed style
  in Chromium, so a WeakMap retains a connected neutral-wrapper classification
  while its class/style/hidden identity agrees, with an inline-style fallback.
  Changing a wrapper into an in-flow element still invalidates geometry.
- Disabled toolbar pinning schedules no work and performs no discovery. Enabled
  scrolling reuses its target; replacements/reparenting and disabling clean up
  the placeholder and positioning. Unchanged writes are guarded.
- Collection sizes compare effective row visibility, so unrelated class changes
  no longer recompute totals. Identity, structural, metadata and actual visibility
  changes still update, including an exact zero for all-hidden results.

Deterministic before/after counts (same fixture actions):

| Action / measured work | Before | After |
| --- | ---: | ---: |
| Four tooltip text changes + removal: saved-filter passes, each surface | 5 | 0 |
| Same tooltip actions: browse count passes / eight-card visibility reads | 5 / 40 | 0 / 0 |
| Eight scroll wakes, pinning disabled: sync / browse sort discovery | 8 / 8 | 0 / 0 |
| Four unrelated collection row class toggles: size renders | 4 | 0 |
| Hidden tooltip insertion/removal: fallback card reads per action | 400 | 0 |

The expanded `observer-work-regression-test.js` passes 108 checks across all three
surfaces in left/Comfortable and right/Compact. Inline and class-styled nested
portal insertion/removal require zero card reads; a real in-flow sibling or a
portal changed to static positioning still causes the expected 400-card refresh.
Instrumentation exists only in disposable extension copies, not production hooks.

All 29 release-runner suites are validated. The initial run passed 27; sidebar
alignment and a Chrome picker replacement assertion failed. The unchanged picker
suite passed all 30 checks in isolation. Sidebar diagnostics showed the requested
left layout had applied; Steam briefly removed the sidebar, making the original
readiness predicate throw on its first sample and leaving Puppeteer's interval
poller pending. A null guard now waits for replacement without changing the 10s
deadline or any geometry assertion; all 78 alignment checks pass. After the late
detached-wrapper fix, the expanded observer suite (108) and existing fallback
suite (24) were rerun successfully. Dedicated pinning checks passed Chrome 17 and
Firefox 12; Firefox needed one retry for live collection readiness. Native Quick
View passed 35. No subscription writes reached a real account.

Evidence: `tests/out/performance/observer-work-regression.json`, baseline audit
and source snapshots in `tests/out/performance/oversight-baseline-preserved/`, and
`tests/out/release-1.5.0/oversight-validation.json`. The initial full-run failures
remain in raw results; the validation file records their final disposition.
These are operation-count improvements, not a claim about end-to-end live latency;
another noisy live timing sweep was deliberately unnecessary. Version remains
1.5.0; changes remain local, uncommitted and unpublished.

## October 27, 2026 — collection picker and fallback geometry

Plan: separate collection picker size preparation from movement, reuse animation
discovery until relevant changes, and reuse conservative fallback browse geometry
without repeatedly unhiding/measuring the whole result list. GPT-6.1 Sol at high
reasoning implemented and tested the plan. `getCardGeometry` is a browse-layout
helper, not the collection-detail row layout; the picker is the detail-page change.

Implemented:

- `saved-filters.js` caches the active row, picker dimensions and help references.
  Content, row/ancestor changes, resize and font changes invalidate preparation;
  connected reparenting rebinds observation and detached/reused identities dismiss
  the picker. Movement reads the current row/anchor, then writes only changed
  positions. Pixel comparisons tolerate CSSOM serialization rounding below 0.01px.
- Row and ancestor animations are discovered on relevant invalidations instead of
  every tracked frame. Delayed transitions remain tracked and stationary pickers
  sleep. Help, undo and pinned title words retain their behavior.
- `steam-dom.js` caches common parent identity and reuses fallback geometry for
  supported same-parent layouts. Structure, layout styles, stylesheet changes,
  viewport/parent width and scroll offsets are checked. An O(1) representative
  style signature detects common CSSOM width/gap changes. Mixed-parent and
  shrinking-flex layouts keep full measurement. Invalidated measurements still
  restore every filter class in `finally`. The extra mutation observer starts only
  when fallback geometry is used, not on collection detail or grid-only pages.

Deterministic evidence:

- Across 20 stationary collection positioning wakes: **zero picker box reads,
  anchor font reads, animation-discovery calls or style writes**. Current row/anchor
  positions are still read so scrolling and motion remain accurate.
- The 400-card fallback fixture makes 30 unchanged calls with **zero card box
  reads or filter-class writes**, including partial/all-hidden filters. Width,
  stylesheet/CSSOM changes, replacements, reparenting, horizontal scrolling and
  exception restoration are covered.
- New tests pass: Chrome picker 30 checks, Firefox Compact/right picker 16,
  fallback 24. Existing live picker motion passes 6 checks per browser. Chrome's
  new fixture tracks row/ancestor transitions within 0.04px in the release run;
  existing live checks retain their 0.5px tolerance.

Validation: 27 of 28 release-runner entries passed initially. Firefox Comfortable
Collections browse timed out during browser session creation, before assertions,
and its first isolated retry did likewise. The unchanged test passed all 28 checks
with a 90-second protocol startup allowance. All 28 suites are therefore validated;
the initial failure remains in the raw results, with final disposition recorded in
`tests/out/release-1.5.0/collection3-validation.json`. No real subscription writes,
version change, commit or publication occurred.

**Live latency is inconclusive; no end-to-end speedup is claimed.** Profiles were
sequential with no concurrent test browsers. The first before/after collection
hover sample was 828.2 → 1317.0ms task time, despite the picker hotspot falling
from 54 samples to 1. A repeat and diagnostic comparison were run to investigate:

| Collection implementation | Hover task | Hover style recalculation |
| --- | ---: | ---: |
| Original, initial baseline | 828.2 ms | 486.9 ms |
| Current, first final sample | 1317.0 ms | 933.8 ms |
| Current, confirmation | 1235.1 ms | 910.0 ms |
| Current, fresh diagnostic | 762.6 ms | 421.4 ms |
| Diagnostic only: ancestor animation reads disabled | 1336.4 ms | 1017.1 ms |
| Original source snapshot, fresh diagnostic | 2011.0 ms | 1510.3 ms |

Current scroll task time also ranged from 289.3 to 680.6ms while the picker was
absent. The diagnostic variant did not improve latency; ancestor support was
retained and no production change was made based on this noisy comparison. Steam
style work, metadata completion and system activity vary substantially. Reduced
operation counts and preserved behavior are established; total interaction
latency requires more controlled measurement. All final profiles had no page errors.

Evidence is under `tests/out/performance/`: `collection3-before.json`,
`collection3-after.json`, `collection3-confirm.json`, `collection3-debug-*.json`,
their CPU profiles and `collection3-before-source/`. The profiler now accepts
`--source-overlay <snapshot-directory>`: matching files are copied only into the
disposable test extension, leaving working sources intact. Use this with
`--page collection --tag <unique-tag>` for sequential historical comparisons.
The no-ancestor variant is diagnostic only and is not in production.

## October 27, 2026 — second 1.5.0 performance pass

Plan: reduce unrelated mutation-triggered filtering/geometry work, make card
discovery rebuilds scale linearly in link/ancestor visits, and reuse Workshop
sidebar structure during scrolling. A GPT-6 Luna review identified the first two
paths; GPT-6.1 Sol at high reasoning implemented the changes and targeted checks.

Implemented:

- `content.js` ignores transient hover/dialog content and unrelated UI additions,
  while result insertion/removal/replacement and native controls still refresh.
- `steam-dom.js` builds pass-local ancestor identity summaries instead of repeatedly
  scanning the shared grid per card. Hover/Quick View content is excluded.
- `workshop-sidebar.js` caches structurally validated anchors, separates toolbar
  decoration from scroll geometry, and skips unchanged style/class writes.
- `workshop-appearance.js` limits browse mutation refreshes to result changes;
  otherwise its appearance-ready event bypassed the content observer optimization.

One before/after sample per surface, using the same bounded interaction harness,
1780 × 1050, Comfortable, right sidebar, both applicable pinning settings enabled.
Profiles ran sequentially, separately from functional tests. These are main-thread
task times, not page-load or whole-machine CPU measurements.

| Surface / interaction | Before | After |
| --- | ---: | ---: |
| Workshop scrolling | 275.0 ms | 148.2 ms |
| Workshop creator hover | 838.3 ms | 641.0 ms |
| Workshop filter/reset | 247.5 ms | 198.4 ms |
| Collections browse scrolling | 80.3 ms | 52.9 ms |
| Collections browse creator hover | 1018.4 ms | 453.0 ms |
| Collections browse filter/reset | 165.7 ms | 104.4 ms |
| Collection detail scrolling | 296.6 ms | 321.9 ms |
| Collection detail creator hover | 850.6 ms | 642.7 ms |
| Collection detail filter/reset | 536.0 ms | 377.1 ms |

Workshop scroll scripting fell from 111.6 to 32.0 ms; Collections browse scroll
scripting fell from 16.9 to 7.0 ms. The former repeated identity-scan hotspot
(26 samples) became one ancestor-summary sample. Live Steam rendering and machine
load also varied: even browse idle task times changed substantially despite nearly
zero scripting. Do not attribute every timing reduction to these changes or treat
this as a statistical benchmark. Collection detail scroll scripting stayed similar
(46.2 versus 49.5 ms), with worse total task time in this sample; no collection
scroll improvement is claimed. All three final profiles recorded no page errors.

Stronger deterministic evidence: 16 discovery checks include 200/1,200 nested-card
fixtures with bounded link visits, duplicate IDs, href changes and replacements.
The 24 DOM-work checks verify transient hover/portal churn triggers no full filter
or geometry pass on all three surfaces, while actual result changes still do;
sidebar scrolls do no rediscovery, toolbar decoration or unchanged search writes.
All 25 release regression suites passed, including Chrome/Firefox, both sidebar
sides, Comfortable/Compact, native behavior, Quick View and intercepted subscription
requests. No real account subscription writes were performed.

Remaining candidates: full-list fallback grid measurement (`getCardGeometry`),
collection picker style/geometry work (`positionCollectionPicker`), and native-sort
rediscovery in `filter-bar-pinning.js`. Geometry caching and picker changes were
deferred to avoid responsive-layout and animation regressions without focused
measurement. Collection detail hover style recalculation remains substantial.

Raw evidence: `tests/out/performance/audit2-before.json`, `audit2-after.json`, their
CPU profiles, and the `audit2-before-source/` snapshot. Reproduce with
`node perf/interaction-perf.js --tag <unique-tag>`. Functional results are in
`tests/out/release-1.5.0/`; the release runner includes `dom-work-regression-test.js`.
Version remains 1.5.0; changes are local and unpublished.

## October 27, 2026 — pending 1.5.0

One bounded before/after interaction sample per surface, Chrome at 1780 × 1050,
with the actual extension and public Steam pages. Each run samples 1.5 seconds of
idle time, 16 scrolling frames, four creator hovers, and a 5-star filter/reset.
These are **main-thread task times**, not network load times or whole-PC CPU use.
Timings vary with Steam content and machine activity; the comparison is directional,
not a statistical benchmark. Collection content contained 861 mods.

| Surface / interaction | Before | Final 1.5.0 | Reduction |
| --- | ---: | ---: | ---: |
| Collection scrolling | 599.5 ms | 152.8 ms | 75% |
| Collection creator hover | 974.8 ms | 362.8 ms | 63% |
| Collection filter/reset | 427.2 ms | 197.7 ms | 54% |
| Workshop scrolling | 405.5 ms | 145.5 ms | 64% |
| Workshop filter/reset | 665.4 ms | 166.1 ms | 75% |
| Collections browse scrolling | 114.4 ms | 38.6 ms | 66% |
| Collections browse filter/reset | 307.8 ms | 74.9 ms | 76% |

Collection scroll's longest sampled frame fell from 158.7 ms to 45.7 ms. Final
collection idle scripting and style recalculation were zero. Steam's native
Workshop rendering/animation work remains; this does not claim to remove it.
All final profiles recorded no page errors.

Changes: cache result identities with structural invalidation; reuse collection
row references and number formatting; avoid unchanged root/style writes; limit
observer reactions to relevant mutations; sleep stationary creator pickers;
reuse unchanged picker controls; reserve inline creator-control space; and avoid
filter geometry passes caused only by grid height changes. Full-list filter work
still runs when a filter actually changes. Offscreen content containment was
tested and rejected because it increased scroll and hover cost on this page.

The sidebar now pins at 12px without reserving the height of the separate toolbar.
Result-count insertion waits for React hydration, including the initial streamed
HTML interval before the readiness hook has written its first attribute.

Validation: all 22 suites in `tests/release-regression.js` pass, covering Workshop,
Collections browse and collection detail, Chrome/Firefox, both sidebar sides,
densities, native 75/100 paging, groups, picker motion, Quick View, GIF preferences,
metadata, replacement DOM and intercepted subscription requests. The geometry
test now accounts for the approved fifth reset slot wrapping on narrower layouts;
the popup test targets all three current pinning settings instead of an obsolete
label. No account subscriptions changed. Raw logs are in
`tests/out/release-1.5.0/`.

Reproduce with `node perf/interaction-perf.js --tag audit`, or add
`--page collection`, `--page workshop` or `--page browseCollections`.
Profiles run sequentially with no concurrent functional tests. Baselines:
`release-15-before.json`, `release-15-before-workshop.json`, and
`release-15-before-browse-hover.json`; final: `release-15-final.json` and its three
CPU profiles, all under ignored `tests/out/performance/`.

## October 20, 2026

Reduced repeated CPU work without changing the extension's CSS, labels, toolbar layout,
filter results, confirmation delays, or per-frame Workshop hover tracking.

## Measured results

Live 862-item Progression collection, Chrome, 1600 × 1000 viewport. These are averages of
two short samples before and two after, using the original source snapshot for confirmation.
Measurements are browser main-thread CPU time, not elapsed network time or whole-PC CPU use.

| Measured work | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Scripting during 1.5 seconds of stationary creator hover | 55.65 ms | 3.25 ms | 94% |
| Scripting for 5-star filtering and reset | 213.92 ms | 38.73 ms | 82% |
| Total main-thread work for that filter/reset sequence | 467.14 ms | 334.97 ms | 28% |

Both versions used nine batched summary requests for the collection. Idle collection scripting
was effectively zero. Workshop's continuing idle activity was also present without the extension;
the comparable native and original-extension samples used about 567–568 ms of task time over
2.5 seconds. The audit therefore targeted measurable extension work rather than changing Steam's
animations or appearance. Results vary with machine and page activity; no page-load score is claimed.

## Changes

- Compile active collection filter terms once per pass; skip title/creator scans when unused.
- Reuse collection row identities and one number formatter for size updates; invalidate cached
  identities when rows, IDs, or mod links change.
- Ignore extension-only UI mutations that cannot change the mod list.
- Skip rating-count scans when that filter is off, and star reads when stars are unrestricted.
- Avoid redundant picker style/class writes and repeated card discovery.
- Let stationary collection controls sleep after a short tracking window. Scrolling, resizing,
  content changes, row visibility, image loads, and hover events wake them. Active row animations
  continue tracking. Workshop and Quick View retain continuous tracking for their transforms.

## Resource limits and verification

Tests ran sequentially with one test browser at a time and below-normal-priority settings.
The benchmark defaults to one run per page, caps the run count at two per page, checks free
memory and page heap, and skips additional interaction sampling if idle load exceeds its budget.
No stress loops, CPU throttling, heap snapshots, or dependency installs were used.

A Chrome DevTools MCP trace lasted 2.5 seconds (about 78 KB compressed). Ten live MCP checks
also verified full-description filtering, subscription eligibility, size changes, and the toolbar.
The trace captures post-load activity; navigation-based Core Web Vitals are outside this comparison.

Functional checks include collection alignment, scrolling, a 650 ms transform after resting,
cached-ID invalidation, filter/retry behavior, Workshop geometry, and pixel-level hover following.
Chrome checks passed: collection 29, size/ratings 25, Workshop ratings 21, geometry 70,
saved filters 57, Quick View 35. Firefox's six collection motion checks also passed, with
a maximum sampled transition offset of 0.067 px. Workshop hover-following error stayed
below 0.02 px in Chrome.
No real subscriptions were changed.

Run the modest default audit from the project root:

```powershell
node perf/runtime-perf.js --tag audit --runs 1
```

Use `--page collection` to sample only that page, or `--native` for a no-extension comparison.
Raw measurements, CPU profiles, screenshots, source snapshots, and the DevTools trace are under
`tests/out/performance/`. The old `perf-test.js` is historical; `npm --prefix perf run perf` now
uses the bounded current-manifest harness.
