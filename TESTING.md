# TESTING

How this project is tested.

## Pending 1.5.0 release

Observer-work follow-up: all 29 release suites are validated. New
`observer-work-regression-test.js` passes 108 checks using disposable instrumented
sources across all three surfaces, left/Comfortable and right/Compact. Tooltip
and wrapped-overlay churn triggers no saved-filter/count/list work; disabled
pinning does no scroll work; unrelated row classes do not rerender sizes; hidden
and nested portal insertion/removal preserves fallback geometry. Positive checks
cover real title/author/result/sidebar/count changes, reused Quick View, toolbar
replacement/reparenting, enabling/disabling, actual visibility and layout changes.
Sidebar readiness now returns false while Steam temporarily replaces its section,
preserving the same 10s deadline and all 78 geometry assertions. Initial full-run
sidebar/picker failures and successful affected reruns are recorded in
`tests/out/release-1.5.0/oversight-validation.json`; see `perf/REPORT.md` for the
diagnosis and before/after operation counts. No version bump or real subscription
writes were performed.

Collection picker/fallback follow-up: the release runner now has 28 suites, all
validated (one Firefox browser-session startup timeout required an isolated retry
with a longer protocol timeout; unchanged assertions passed). New
`collection-picker-work-test.js` checks cached preparation, both sides/densities
in Chrome, seeded Compact/right in Firefox, help/undo/title words, row/ancestor and
delayed transitions, reparented/reused/detached targets and hidden rows. It passes
30 Chrome and 16 Firefox checks; existing live motion checks also pass.
`geometry-fallback-work-test.js` passes 24 checks over 400 cards: repeated calls
avoid card reads/filter writes, while hidden-list resizing, stylesheet/CSSOM edits,
reparenting, horizontal scroll and exception restoration remain correct.
Live timings varied substantially even when rerunning the original source; no
total-latency speedup is claimed. See `perf/REPORT.md` for measurements and the
profiler's disposable `--source-overlay` comparison option. Version stays 1.5.0.

Second October 27 performance pass: all 25 release suites pass. Discovery now
summarizes ancestor identities per rebuild; the 16 discovery checks include
200/1,200 nested-card fixtures with bounded link visits. The new
`node tests/dom-work-regression-test.js` adds 24 checks across all three surfaces:
hover/Quick View churn skips filtering and geometry, real result mutations still
refresh, sidebar scrolling reuses structure and avoids unchanged writes, and native
sort/sidebar replacements recover. Browse appearance observation is also scoped
to relevant results. Sequential before/after results and remaining hotspots are
recorded in `perf/REPORT.md`; collection-detail scrolling did not improve in this
sample. Subscription writes remain intercepted, and the version remains 1.5.0.

The default-on **Collections overhaul** popup setting switches collection detail
pages between Design C and Steam's native layout. Collection tabs reload on a
change so original nodes/handlers are rebuilt cleanly. Saved filters and core
rating/subscription controls remain active in either layout. The toggle suite
checks default-on, off persistence, restored native controls, saved exclusions,
re-enabling, and unaffected Workshop/browse tabs; Firefox also checks saved-off
startup. The layout script waits for storage before moving any Steam nodes.
The release regression set now has 24 passing suites including these toggle checks.

1.4.0 is the last shipped version. Labels such as 1.9.x and 1.10.x below
identify earlier local iterations, not published store releases.

October 27 performance and sidebar correction: collection sidebars pin at 12px
independently of the toolbar in the results column. Both sides, toolbar on/off,
deep/end scrolling and mobile restoration are covered in `collection-details-test.js`.
Cached row references update when Steam replaces subscription controls; creator
pickers sleep while stationary but still follow scrolling and native animations.
`card-discovery-test.js` checks unchanged reads avoid subtree walks, same-ID React
replacement, ID changes, removal/reinsertion, whole-scope replacement, Quick View
exclusion, and deferred result counts before hydration.

Run `node tests/release-regression.js` for the three-surface regression set, capped
at two test browsers. Logs/results go to `tests/out/release-1.5.0/`. Recheck selected
areas with `--only=collection-details` (a regular expression is supported; quote it
when it contains shell characters). Profile separately using
`node perf/interaction-perf.js --tag audit`; see `perf/REPORT.md` for results.
Subscription tests intercept outgoing writes; no real subscriptions are changed.

Final run: all 22 suites passed on October 27, including 139 Chrome Collections
browse checks, both Firefox densities, 71 Workshop geometry checks, 78 sidebar
alignment checks, 27 native paging/popup checks, and collection detail/picker,
filter/group, metadata, motion and intercepted subscription suites. The initial
run exposed a stale popup label assertion and the result-count hydration race;
the affected suites passed after correction. Final sequential performance samples
recorded no page errors and 75% less collection scroll task time; see the report
for the other interactions and measurement limits.

## Earlier development checks

October 27 collection footer, sidebar and global header (1.10.8): native linked
and parent collections move into styled results sections; creator/version panels
move into the filter sidebar and empty original boxes are hidden. Sidebar pinning
uses a reserved grid slot and viewport positioning so it remains visible through
the entire page. Native hover cards are constrained clear of the visible sidebar.
`collection-details-test.js` checks original links/handlers, both sidebar sides,
toolbar on/off, deep/end scrolling, hover overlap and mobile restoration. Header
comparisons now include the top-right Steam controls and native responsive gutters.

October 27 native collection banner art (1.10.7): the redesigned hero reuses
Steam's declared collection background image at low opacity under a dark overlay.
Content remains fully opaque and interactive. Collections without art, or with an
unavailable image, retain the neutral header. `collection-banner-test.js` checks
the linked art-heavy collection on desktop and mobile, while the design fixture
suite covers missing/failed art and functional preservation.

October 27 shorter browse summaries and transparent pinning (1.10.6): collection
item/link counts are hidden and no longer add card height. Desktop checks cap
Compact at 100px and Comfortable at 124px, retaining six/five columns. The native
Quick View button sits in the thumbnail corner; bounds are checked across widths,
with hit testing alongside the author picker and real open/close checks in both
densities. Pinned toolbar wrappers have no background or shadow. Chrome and
Firefox pinning tests check transparency alongside geometry, menus and restoration.

October 27 collection density and reset mirroring (1.10.5): Browse Collections
uses six desktop columns in Compact and five in Comfortable. Comfortable
retains larger previews/type and two description lines; Compact has smaller
previews and a one-line snippet. Cards keep equal row heights without extra native
author/count gaps. Desktop height checks cap Compact at 132px and Comfortable at
156px, with text/link containment and native item counts preserved. The reset
column stays on the sidebar side, with the square hugging the edge nearest the
four controls: right edge for a left sidebar, left edge for a right sidebar.
The Chrome browse suite switches densities in both directions on both sidebar
sides. Firefox runs both `--firefox` and `--firefox --comfortable` separately;
toolbar reset behavior and ordinary Workshop appearance retain their own suites.

October 27 reset square correction (1.10.4): the reset's card column remains on
the sidebar side of the four controls, but the square is always aligned to that
card's left edge. Reset regression checks now require this exact left edge for
both sidebar placements and densities, including narrow wrapped toolbars and
Workshop Browse Collections.

October 27 Browse Collections rows (1.10.3): Compact fits five collection cards
across the desktop results area, matching the five toolbar slots without wrapping
the native sort control. Collection cards stretch to equal heights within each
row. Smaller windows retain responsive columns and Comfortable retains Steam's
native sizing. The browse-collections suite checks text bounds, equal row heights,
desktop five-column/one-row toolbar geometry, reset placement, both sidebar sides,
density switching and native identities. Ordinary mod density remains unchanged.

October 27 header and reset alignment (1.10.2): collection headers and content
share Workshop's centered 1700px maximum width, desktop title/navigation spacing
and Store Page styling. `node tests/collection-header-test.js` (also `--firefox`)
compares text bounds, typography, button geometry and colors against the live
Workshop header at 1920, 1780 and 1200px. The collection design suites retain
responsive, image-heavy description and native-control coverage.
Workshop reset occupies its own card column on the sidebar-facing edge on both
sides, including wrapped toolbars. `toolbar-reset-test.js` checks both densities
and placements at wide and narrow widths; `sidebar-alignment-test.js` also checks
control/card edges and pinned layouts at five widths.

October 27 collection visual parity (1.10.1): measured the current Workshop's
card gradient/shadow, typography, gray controls and input treatment before
restyling collections. Cards use the same charcoal gradient, sidebar fields
match the measured control sizes and colors, and collection filters use the
same 38px height. Store links include Steam's age-check URL variant. The existing
production and live design suites cover functional preservation and responsive
bounds; live screenshots are visually reviewed before updating the Chrome copy.

Browse Collections uses Steam's horizontal summary cards with up to six columns
in Compact and five in Comfortable. Both densities keep title/rating
rows from squeezing each other. `node tests/browse-collections-test.js` and its
Firefox variants check visible text bounds, native links/order, responsive columns
and toolbar alignment. Chrome also checks repeated density switching and both
sidebar placements. The ordinary appearance suite retains its six-column mod checks.

October 27 collection Design C integration (1.10.0): the production collection
layout moves native Steam nodes and handlers into the approved Workshop-style
shell. Production saved filters, author/title pickers, subscription planning,
metadata, popup density/placement and independent pinning remain connected.
Collection title search updates the displayed counts and subscription plan.
Native descriptions, author credits, tabs, account actions and linked collections
remain available. Collections with and without a background image are supported.

`node tests/collection-design-test.js` (also `--firefox`) checks native handlers,
IDs, awards, description collapse, title search, the subscription plan, whole-word
exclusions, inspection, picker undo, title words and responsive row bounds.
`node tests/collection-design-live-test.js` (also `--firefox`) checks Ferny's
image-heavy collection and the Project Viewpoint collection at six widths and
both sidebar placements. It does not click account actions. The existing live
collection filtering suite now expects the saved filters in the sidebar; its
author-alias, undo, cross-page sync and long-name checks are retained.

October 26 collections layout (1.9.1): the toolbar retains two equal rows of
three. Second-row labels center independently of their left icons and right
arrows. Reset moves beside the hidden-mod count in the Saved filters heading;
it clears only subscription and rating filters. Groups span the panel above
one inline type/input/actions row, with description search below.
`node tests/collection-layout-test.js` (also `--firefox`) covers three viewport
widths, label alignment, input bounds, counts, group enable/collapse/inspection,
keyboard reset, preserved saved filters and pinned dropdowns. The existing
composer, live collection filtering and both-browser pinning suites cover shared
behavior on Workshop and collections.

October 26 independent pinning and collection parity (1.9.0): the existing
`pinnedSidebar` setting remains sidebar-only. New `pinnedWorkshopBar` and
`pinnedCollections` settings default off and independently pin the original bars,
using placeholders to preserve layout. Both sidebar and toolbar can be enabled;
wrapped toolbars reserve enough space above the sidebar. Collections gained a
single type dropdown using the classic page skin (reset moved to the Saved filters
heading in 1.9.1).
The collection reset only clears the three local filters and never navigates.

`filter-bar-pinning-test.js` passes 15 live checks using the real popup, including
each independent combination, saved settings, pinned menus, reset and narrow-screen
overlap. `filter-bar-pinning-firefox-test.js` passes 10 checks for both live layouts,
including scroll restoration and resizing. Composer checks pass 22 per browser.

October 26 reset styling (1.8.6): reset remains in its separate fifth slot and is
now square at the same measured height as the four controls. It shares their base
background, blur, shadow, border and hover rules. The 14 toolbar reset checks
include exact computed-style comparisons and top/height alignment in both layouts
and sidebar positions.

October 26 reset placement correction (1.8.5): the reset occupies a separate fifth
card column, never part of the sort control. All four original controls retain
full card widths. Five slots wrap on smaller grids. The earlier shared-slot
assertion encoded the wrong design and has been replaced: reset tests now require
the sort's full card edges, a separate reset parent, and reset aligned with the
next card's left edge. The 78 alignment checks also verify reset's own slot across
five widths and both sidebar placements; 12 reset behavior checks, 26 Chrome
appearance checks and 8 Firefox appearance checks pass.

October 26 toolbar reset and GIF previews (1.8.4): the final toolbar column now
contains sort plus a 22px reset button. Alignment tests measure that shared slot,
while `toolbar-reset-test.js` also checks its internal spacing and card edges in
both densities/placements. All 12 reset checks and 68 width/pinning checks pass.
Reset clears the three local preferences and uses Steam's native callback for
Most Popular / One Week; search, tags, page size and saved filters are retained.

`preview-motion-test.js` serves a real two-frame cross-origin GIF without CORS:
18 Chrome and 12 Firefox checks cover still pixels, image/link alignment, source
replacement, resize and cleanup on Workshop, homepage and collection pages.
Chrome also exercises the real popup to verify restored animation and independent
GIF/master choices. Canvas frames use bounded resolution and no additional fetch.
Live appearance checks (26 Chrome, 8 Firefox) include homepage previews after React
hydration; inserting canvases into the initial SSR markup caused a regression and
is now gated by the MAIN-world readiness signal.

October 26 dropdown parity (1.8.3): `node tests/filter-dropdown-test.js` and
`--firefox` each pass 11 live checks comparing the type dropdown directly with
Steam's Special Filters control: dimensions, typography, background, hover shadow,
focus outline, menu styling/alignment, keyboard selection, Escape, outside click,
repeated-trigger dismissal and scroll anchoring. The trigger reuses the adjacent
native control's presentation classes and chevron without its React handlers.
Both browsers also pass 22 composer checks across Workshop and collections.

October 26 native Workshop integration (1.8.2): Workshop saved filters inherit Steam's
font, gray dropdown/buttons and input background; collections keep their own style.
Help is limited to four paragraphs under 60 words. The native global result count is
preserved, with a separate rendered-card count that updates for overlapping filters
and inspection. `node tests/workshop-native-ui-test.js` passes 20 live checks for
these styles/counts and native searches across all three search-field scopes.
`node tests/native-search-contract-test.js` passes 66 checks for native boolean queries,
field scope, POST/GET routing, untouched request identity, blank-query optimization
and foreign-origin isolation. Composer tests cover both the Workshop type dropdown
and collection tabs through one public helper; both retain unfinished drafts.
The 26 search-scope checks pass, including outage/retry and reload. Two stale test
assumptions were corrected: cache reuse counts only collection requests (the synced
Workshop tab can fetch new results), and the reload exclusion test explicitly switches
back from positive to negative mode. Appearance retains all 25 checks; Firefox
composer retains all 22 checks across Workshop and collections.

October 26 group visibility and composer repair (1.8.1): reproduced a regression
where replacing a card's class attribute left excluded cards visible until another
action reapplied filtering. `group-visibility-test.js` failed on the old code with
all eight cards visible instead of the five allowed cards. The observer now compares
the final DOM batch with remembered filter state and repairs overwritten flags;
geometry's temporary unhide/restore does not trigger a feedback loop. Local group
edits also apply immediately instead of waiting for a storage notification.

`node tests/group-visibility-test.js` and `--firefox` measure actual rendered
visibility in Workshop and collections: cold reload, collapsed groups, class
replacement, text-node changes, late cards, inspection exit, enable/disable and
stale flags. Collection subscription exclusions are checked too.
`group-live-test.js` passes against real Steam and the shared dependency service
with inspection never used: reload, 75 results, native page two, Compact/right
placement and native sorting. `filter-composer-test.js` passes 22 checks per
browser for the single input, draft preservation, validation, styled folder menu,
keyboard focus, Escape/outside dismissal and description-checkbox placement.
The existing group, inspection and appearance suites now use the public type
buttons and folder menus instead of setting hidden select values.

October 26 appearance update (1.8.0): `node tests/appearance-test.js` passes 25
checks using the real settings popup, live Steam browse/home pages and both
Workshop/collection sidebar fixtures. Covers default Comfortable/motion-off,
six-column Compact, title wrapping, narrower screens, native item order,
Comfortable restoration, exact card-column widths on both sidebar sides,
independent motion controls, persistence, manual carousel navigation, aligned
input/action/help rows, folder membership menus and contextual dependency help.
`node tests/appearance-firefox-test.js` checks the packaged Firefox appearance
scripts against live Steam. Its disposable copy seeds only the four presentation
preferences because BiDi blocks moz-extension popup URLs. Steam's WebAssembly CSP
warning also reproduces without extensions and is excluded specifically; every
other page error still fails the suite. Native homepage tracks currently use
manual arrows; the motion setting blocks unattended scrolling and pauses scoped
track animations while preserving manual navigation.

Regression coverage retained: 68 live sidebar/card alignment checks across five
widths, 73 paired inspection checks, 63 group checks in each browser, 21 Firefox
inspection checks, and live collection/subscription checks. No production test
bridge or new runtime permission is introduced.

October 26 card-width correction (1.7.2): each of the four controls must match an
actual mod card's left/right edges and width. Controls must never stretch to fill
five card columns. With the sidebar left they align to the trailing card columns;
with it right they mirror to the leading columns. Narrow grids wrap using the same
card width. The 1.7.1 full-grid-width assertions encoded the wrong requirement and
have been replaced, rather than retained as valid acceptance criteria.
`sidebar-alignment-test.js` passed 68 checks at 1780, 1828, 1536, 1366 and 1100px,
covering individual card edges, unchanged widths after flipping, card gaps, pinning
and Steam scrollbar styling. `workshop-geometry-test.js` passed 71 checks including
Quick View, sort/rating/hide changes, narrow widths and zero-match inspection.

October 26 layout/test review (1.7.1): controls now span the entire card grid even
when there are five columns, with four equal controls and matching card gaps. Search
matches the sidebar width and gap on either side. The existing pinned-sidebar behavior
is retained; no floating control toolbar is added. Removing `scrollbar-width:thin`
lets Steam's native 14px scrollbar, rounded grey thumb and transparent track apply.
Grouped filter labels use 11px text and their membership menus use 10px text.

`node tests/sidebar-alignment-test.js` measures both grid edges, every control gap,
search/sidebar alignment and preserved pinning at 1780, 1828, 1536 and 1366 CSS pixels.
It compares sidebar scrollbar styles to a real native Steam filter scrollbar.
`sidebar-page-size-test.js` now runs one shared matrix for 75 and 100: actual unique
counts, page two, reload, Back/Forward, return to 30, search and category filtering.

Quick test review: removed the assertion-free whitespace diagnostic (its investigation
is complete); removed duplicate third-page/Firefox dependency checks from the shared
service suite, reusing its existing collection page for settings verification. Replaced
a hardcoded collection length with the current DOM item count. The browser helper now
checks extension-world liveness rather than choosing a stale disabled copy by name.
Kept security/parser/queue unit tests, storage migration, Quick View, picker/motion,
rating, word matching, collection plans and grouped/individual inspection regressions:
these cover distinct behaviors rather than duplicating the new layout matrix.
Final checks passed: 43 live alignment/scrollbar checks, 27 Chromium and 18 Firefox
page-size/popup checks, 73 paired inspection checks, 29 real collection regressions,
and the simplified live shared-service smoke checks. Alignment screenshots are in
`tests/out/aligned-<width>-<side>.png`; the original bug screenshots have five card
columns, which was the missing case in the previous four-column measurements.

October 26 sidebar popup and page size (1.7.0): `node tests/sidebar-page-size-test.js`
passed 19 checks for the actual popup, saved pinning/placement, live native left/right
movement, pinned search alignment, internal scrolling, narrow viewport fallback,
collection isolation and the native 75-item path. The 75 path also passed 10 checks
with `--firefox` after `node build.js`: 75 distinct mods, nonoverlapping page two,
same-page reload, Back/Forward, returning to 30, search and native category filters.
The initial native navigation query is normalized before hydration on a 75-item reload
to match Steam's 30-item SSR, then restored with the native browse callback after
hydration. No React hydration errors are accepted. Firefox's known Steam WebAssembly
CSP diagnostics are distinguished from extension errors. Popup controls are automated
in Chromium; Firefox BiDi's extension-page navigation restriction still applies.
Packages contain 35 files. The existing 73-check paired exclusion suite also passed.

`browse-integration.js` structurally checks native React contexts for browse and
preference callbacks, including hydrated boundaries and the current fiber. If that
capability is absent, the native selector remains available. The isolated sidebar
script applies `pinnedSidebar` and `sidebarPosition` from local storage. It pins existing
nodes using CSS and a measured placeholder, without moving React-owned nodes. The
search placeholder is removed on unpin, sidebar replacement or narrow viewports.

October 26 collapsible groups (1.6.2): group records gain `collapsed` (default false for
existing groups). The header disclosure button has `aria-expanded`/`aria-controls` and
works with Enter/Space while retaining keyboard focus through rerenders. Only the member
container is hidden: group enablement, search terms, exclusion inspection and collection
subscription plans retain their behavior. The paired group suites verify collapse height,
inspection while collapsed, independent enablement, reloads and cross-tab synchronization.

October 26 compact inspection rows (1.6.1): collection exclusions use a 72px thumbnail,
side-by-side details/action and an inline reason inside `.collectionItemDetails`.
This replaces the inspection `display:revert` stacking of Steam's native flex rows.
The real Barricade Fix row measured about 258px before and 100px after. Normal collection
rows retain Steam's layout. Collection fixtures now include the native thumbnail,
short-description padding and subscription-control wrapper so this regression is visible.
The inspection suites passed 73 Chromium checks and 21 Firefox checks, including row
geometry, reason placement, filter state and subscription-plan preservation.

October 26 filter groups (1.6.0): `node tests/filter-groups-test.js` and, after
`node build.js`, `node tests/filter-groups-test.js --firefox` exercise group creation,
membership, independent group toggles, overlapping keyword/dependency exclusions,
group and individual inspection, retained +/- states, positive search-term removal,
reloads, game isolation, names, removal and synchronization across open Workshop and
collection pages. Collection checks cover subscription plans during inspection and when
an active group has unavailable dependency data. Disabled groups must neither hide mods
nor block the subscription plan. Filters keep their existing `savedFilters:<appid>` key
and gain an optional `groupId`; groups use `savedFilterGroups:<appid>` in local storage.
Ungrouped filters retain their previous behavior. Groups contain no API credentials.
Both group suites passed 46 checks each. A separate Chrome profile also verified a
combined Viewpoint keyword/dependency group against live Steam HTML and the deployed API:
three exclusions on the seven-day Workshop feed and 25 in collection 3818340638 at test
time. Group inspection, disabling and reenabling passed on both live pages. The manual
Chrome test copy was refreshed to 1.6.0 with saved filters preserved.

October 25 shared-service release (1.5.0): the developer key was moved to a Cloudflare
Worker secret after explicit deployment approval. The consumer extension contains only
https://steam-workshop-data.prodbycave.workers.dev and its narrow host permission. The
local test-profile key copy was removed, and the consumer profile was verified key-free.
Live service validation returned HTTP 200 for Project Viewpoint - Fixes: dependency
3809306528, 387480 bytes, 71 ratings and a full description. On each loaded Workshop tab,
eight items verified all three API paths: metadata, descriptions and dependencies.

Run `cd backend; npm test` for ten tests inside the Workers runtime, including secret/header
exclusion, field filtering, bounded bodies, canonical batch caching, incomplete requirements,
read-only routes, upstream error sanitization and atomic persisted request budgets. The live
failure from browser-only fetch options led to a native `new Request(url, options)` assertion;
Workers uses manual redirects and no browser credentials option. `npm run check` verifies the
Worker deployment bundle. The deployed Worker leaves Idyllium.dev and its DNS untouched.

`node tests/api-primary-test.js` verifies ten metadata/description checks with no page fallback
on partial or failed configured API responses. Dependency tests now also assert zero page
fetches on API failures. `node tests/api-settings-test.js` has twelve personal/service UI checks.
`node tests/shared-service-live-test.js` verifies the deployed Chromium consumer path
with no key supplied or stored, and a hidden personal-key form. Both this command and
`--firefox` verify dependency minus, inspection and plus controls in Workshop and collection
layout fixtures using real API data for Project Viewpoint - Fixes and Project Viewpoint.
No keyword filter is active, so it cannot mask a dependency-filter failure. Firefox BiDi explicitly
rejects moz-extension navigation, so Firefox extension-settings UI acceptance is not claimed. Fixture suites explicitly
clear only their temporary service configuration to avoid consuming production quota.
Builds now contain 29 source-matched entries, including api-client.js/api-data.js/api-config.js.

October 26 Workshop report investigation: a separate Chrome profile with the current source
and deployed API correctly excluded Viewpoint - Wind Sway + Falling Leaves (3823558761)
on the real seven-day trending feed using only the Project Viewpoint dependency filter;
inspection showed that one excluded mod. The API and public Required Items section agreed.
At investigation time, Viewpoint Wristwatch (3824119825) declared only ZombieBuddy, and
Viewpoint Vehicle Interiors (3826550325) declared no required items. A title mentioning
Viewpoint does not by itself establish a dependency. The user's exact failing mod remains
unidentified; these passing checks do not establish that their reported failure is fixed.

October 25 optional API follow-up: `node tests/steam-api-test.js` covers 18
background authentication, fixed-endpoint, header secrecy, validation, children completeness,
collection-member and error cases. `node tests/dependency-api-test.js` covers 11 batching,
cache, fallback and settings-change cases. `node tests/api-settings-test.js` runs 10 real
Edge UI checks with a synthetic key and mocked worker responses (permission denial, local
storage only, blank password field, reload, save/test/remove, sanitized errors). No real key
is used by the automated suites or placed in test output. The user separately entered their
own key directly in the Chrome options page and reported API verified; its value was not
read or returned to the assistant. The paired 73-check MCP suite and 20-check Firefox
suite also pass with API support installed and no key configured.

Live user-key follow-up confirmed GetDetails v1 with includechildren and the x-webapi-key
header: Project Viewpoint - Fixes (3812510377) returned Required Item 3809306528.
Both loaded Workshop tabs verified 12 sampled items through the API path. The collection
HTML page remained rate limited, so its public GetCollectionDetails response was used for
an API sample: 154 members, 100 requested detail lists, 99 verified, 16 direct Viewpoint
dependents. The remaining item stayed unverified; partial API results do not prove an empty
list. Real collection layout acceptance is still not claimed from that API-only sample.

The Chrome package uses a background service worker; Firefox uses background scripts.
The optional API permission is requested only by Save and test. The build includes
steam-api.js and options.html/options.css/options.js in both packages. Test extension
copy helpers include these files too. No key is bundled in either package.

October 25 filter inspection/dependency update: saved exclusions now check whole
title words and opted-in full descriptions locally, never comments or Steam's
negative search index. This intentionally leaves Workshop's server count and
pagination unchanged. Longer positive keywords still narrow Steam searches.
Historical negative-query count assertions below describe the previous behavior;
the saved-filter, search-scope and regression scripts now expect local exclusions.

Run `node tests/filter-matching-test.js` (30 cases),
`node tests/dependency-queue-test.js` (5 queue/cooldown cases), and
`node tests/filter-inspection-test.js --mcp` (73 real Edge checks, including two
Chrome DevTools MCP assertions). The default paired test uses eight-item structural
fixtures at Steam URLs, with intercepted metadata/description/detail responses and
blocked subscription mutations. It covers AI/rain/train/terrain/aim boundaries,
comments-only terms in both scopes, hover/keyboard/text/magnifier inspection,
switching between keyword and dependency exclusions, subscribed/rating-hidden rows,
unchanged collection subscription plans, ID recycling, failed required-item lists,
retry, cache reuse, cross-tab synchronization and reloads. `--live` selects actual
Steam layouts when available; live collections returned Steam's rate-limit page
during this run, so full live collection acceptance is not claimed.

DevTools MCP is attached to the temporary browser through its WebSocket endpoint,
using an installed `chrome-devtools-mcp` and MCP SDK discovered in npm's cache;
`WSHS_MCP_ENTRY` can override the server entry point. The ordinary configured MCP
profile was already in use. This does not close or change that browser.

After `node build.js`, `node tests/filter-inspection-firefox-test.js` runs the
packaged Firefox extension with public UI controls (20 checks passed). It avoids
Chromium-only CDP execution contexts. `node tests/workshop-geometry-test.js
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"` also checks live
Workshop controls, Quick View, 1600/1280/640/520px, heavy filters, and zero-match
inspection (71 live checks passed). Package manifests now reference 29 files. No real subscriptions changed.

The dependency reader uses at most two detail requests concurrently and a
15-minute device cache capped at 5,000 entries. HTTP 429 and Steam's rate-limit
HTML stop queued requests. Failed or unknown requirements remain unverified;
they cannot be cached as empty dependency lists or authorize bulk subscriptions.
Matching never consumes `.commentthread_comment_text` or entire card text.

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
Chrome's native whitespace-search reload warning (React #418) was previously reproduced
without the extension; the maintained search-scope test separately verifies recovery,
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
