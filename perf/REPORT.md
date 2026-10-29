# Performance audit — October 20, 2026

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
