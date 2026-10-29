# Steam Workshop Filter Plus

A Chrome and Firefox extension that adds filters to Steam Workshop pages and collections. Hide the mods you already have, drop the ones with low or few ratings, and save keyword and creator filters for each game.

[Chrome Web Store](https://chromewebstore.google.com/detail/steam-workshop-filter-plu/ahdjppacldfaiahihkhfkhhmadhicfda) | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/steam-workshop-filter-plus/) | [Releases](https://github.com/dcave14/Steam-Workshop-Filter-Plus/releases)

## Preview

![Workshop page: Hide Subscribed, 100+ Ratings and 5 Stars Only, then sorting by Top Rated](docs/workshop.gif)
*On a Workshop page: hide subscribed mods, require 100+ ratings, keep only 5-star mods, then sort with Steam's own menu. The filters stay on.*

![Workshop page: saving a keyword filter, then hiding a creator from a mod card](docs/saved-filters.gif)
*Saved filters: type a phrase and press Save, or hover a creator and click the minus. Both are kept for that game.*

![Redesigned collection page: Hide Subscribed, 5 Stars Only and 100+ Ratings, then a long scroll and Back to top](docs/collection.gif)
*On a collection, redesigned like the Workshop: the same filters update the shown count and the size after filters; Back to top floats over long lists.*

## Features

- **Hide Subscribed** hides every mod you are already subscribed to
- **Star Rating** filter (5 stars only, 4+, 3+, 2+, 1+)
- **Ratings** filter: require 10+, 25+, 50+, 100+, 250+, 500+, 1,000+ or 5,000+ user ratings, separately from the star score
- **Saved Filters** for keywords and creators, kept per game, shared between Workshop and collection pages and synced across open tabs. **−** hides matches, **+** shows only matches
- **Filter groups** organize saved filters into reusable sets with one toggle and a magnifying glass to inspect the group's exclusions
- **Sidebar settings popup**: optional pinned search/filters and immediate Left / Right placement on Workshop and collection pages
- **Workshop-style collections**: two mod rows side by side, full descriptions with centered images and pinned collapse controls, linked mod authors, collection ratings, automatically sized awards, and Steam's original account controls. Enabled by default; turn off **Collections overhaul** in the settings popup to use Steam's original collection layout
- **Comfortable / Compact layout**: Compact fits up to six cards per row; Comfortable collections fit five. Titles stay readable, and toolbar controls match individual card columns on either sidebar side
- **Optional Reduce motion** master switch, with separate controls for card hover animations, homepage carousels and still previews for GIFs
- **75 or 100 mods per page** in the Workshop per-page dropdown, alongside 10, 15, 30 and 50, using Steam's native browse results and pagination
- Hover a creator on any mod card, or turn on clickable title words, to add a filter without typing
- **Include descriptions in search**: optional matching against full mod descriptions (titles only by default)
- **Collection sizes**: the full collection and the size after your filters, in MB and GB
- **Subscribe to all** on a filtered collection subscribes only to the mods your saved filters allow
- Game version categories appear newest first (1.7 above 1.6)
- Remembers your choices between browser sessions
- Built into Steam's own UI:
  - On Workshop pages the buttons sit next to Steam's sort menu, match its style and line up with the mod card columns
  - On collection pages the buttons join the collection's own Subscribe / Unsubscribe / Save row
- Works on Steam's current Workshop layout and on the classic one
- No tracking; public item IDs go to Steam and the shared Workshop data service

## Installation

### Chrome, Edge, Brave and other Chromium browsers
Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/steam-workshop-filter-plu/ahdjppacldfaiahihkhfkhhmadhicfda).

### Firefox
Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/steam-workshop-filter-plus/) (Firefox 140 or newer, also on Firefox for Android 142+).

### Manual installation (Chrome developer mode)
1. Download the latest `-chrome.zip` from [Releases](https://github.com/dcave14/Steam-Workshop-Filter-Plus/releases) and unzip it, or clone this repository
2. Open `chrome://extensions`
3. Turn on "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the folder containing `manifest.json`

## Usage

1. Open any Steam Workshop page (for example `steamcommunity.com/app/<appid>/workshop/` or
   `steamcommunity.com/workshop/browse/?appid=<appid>`) or a collection page
   (`steamcommunity.com/sharedfiles/filedetails/?id=<collectionid>`)
2. Use the controls next to the sort menu (Workshop pages) or under the Subscribe to all row (collections):
   - **Hide Subscribed** toggles visibility of subscribed items (sign in to Steam for this one)
   - **Star Rating** filters by minimum star rating
3. Your choices are saved automatically

Click the extension's toolbar icon for three independent pinning switches:
**Pin Workshop sidebar**, **Pin Workshop filter bar**, and **Pin collection filters**.
Sidebar-only remains available and keeps your existing preference. The new bar
switches start off. The Workshop sidebar scrolls internally so every saved filter
remains reachable; its separate bar switch keeps the four controls and reset visible.
Collection pinning keeps the native actions and filter/reset row visible while the
saved-filter panel scrolls normally. Left/right placement and all pin choices save
automatically. Narrow screens use Steam's normal sidebar layout.
The page sidebar contains search and filters; appearance settings live in the popup.
Collection controls keep their native styling; reset clears only Hide Subscribed,
Ratings and Star Rating without changing saved filters or subscriptions.

The popup's **Card layout** switch applies immediately to Workshop browse results.
**Compact** fits up to six cards across when space allows and uses fewer columns on
narrower screens. Each filter dropdown stays exactly one card wide after flipping
the sidebar. **Comfortable** restores Steam's original card layout.

**Reduce motion** starts off. Enable it to apply the selected **Disable card hover
animations**, **Pause homepage carousels**, and **Freeze animated previews (GIFs)**
controls. GIF freezing displays a still frame on Workshop, homepage and collection
thumbnails. Turning it off restores the original animation. It uses the already-loaded
image without additional requests. Manual carousel navigation remains available.
Turning the master off preserves the individual choices.

The small **×** at the end of the Workshop toolbar resets Hide Subscribed, Ratings,
Star Rating, and sorting to **Most Popular (One Week)** on page one. Saved filters,
search, categories and page size remain unchanged. All four controls stay a full
card wide. Reset sits at the start of a separate fifth card column, above the next
mod; narrower grids wrap it into its own slot on the next row.

Choose **75** or **100** from **Per page** at the bottom of Workshop results. Steam renders the
cards and handles page changes, sorting, categories and search. A new size starts at
page one; your chosen size is retained in the page URL, reloads and browser history. The extension
adds this choice only when Steam's native browse integration is available; unknown
future page structures retain the original Steam selector.

On the current Workshop browse page, use **Saved Filters** above Categories. Choose
**Keyword**, **Required mod**, or **Group** above the shared input, then add a phrase,
Workshop URL/ID, or group name. Keyword and required-mod filters start in hide mode.
Both pages use one type dropdown, styled for their respective Steam layouts.
Switching types keeps each unfinished draft. The description checkbox sits below
the complete add control and applies to keyword filters.
Hover an author name to use the **+ / −** picker. Its confirmation
stays inside that mod's card for 2.5 seconds before applying the filter; click the message
to undo. The compact checkbox immediately after **−** enables clickable title words:
only hovered or chosen words turn yellow and underlined. Clicking a word opens its **+ / − / ?** controls
without opening the mod. The controls stay on that word until you click another word or
turn the mode off. Clicking outside the mod area or pressing **Escape** also unchecks
the toggle and clears the highlights. This optional mode starts off on each page load.
Click an active sidebar **+** or **−** again to turn it off; **×** deletes the
saved filter. Filters are kept separately for each game and synchronize between open tabs.

Create a group by choosing **Group** above the input, then assign filters through
their folder-icon menus. The menu supports arrow keys, Enter, Escape and outside-click dismissal.
For example, put **− Viewpoint** and **− Requires Project Viewpoint** in one group to
catch both keyword matches and declared dependencies. Either exclusion can hide a mod.
The group's checkbox enables or disables all its filters while remembering their individual
**+ / −** settings. Edit the group name directly to rename it. Choose **Ungrouped** to move
a filter out. Existing filters remain ungrouped until you assign them.
Click the arrow beside a group to collapse or expand its filters. Collapsed groups keep
filtering, and their checkbox and inspection magnifying glass remain available. Expansion
state is remembered per group and shared across Workshop and collection tabs for that game.
Enabled groups apply automatically, including after page updates and reloads. The
hidden-mod count is visible in normal filtering mode; inspection is never required
to activate exclusions.

The magnifying glass beside a group shows every mod its active filters exclude, once per
mod, with all matching exclusion reasons. Individual filter inspection is still available.
Groups are shared between Workshop and collection pages for the same game. **×** beside
a group removes the group and keeps its filters; removing a disabled group leaves those
filters inactive. Groups organize existing filter rules: negative rules exclude any match,
positive keyword/dependency rules all apply, and positive creator rules accept any selected
creator across enabled groups.

Click **?** beside **Add / Create** for four short help lines. Input tooltips explain each filter type.
Card pickers also have a compact **?** explaining the buttons and word-mode checkbox.
Author controls share a row with Quick View;
long creator names shorten to make room. Title-selection controls sit over the image,
clear of the star rating.

Quick View has the same filters: hover any listed creator for the controls, enable the
checkbox beside **−**, then hover and click a title word. The mode applies to both the grid
and Quick View. The same 2.5-second undo window applies;
Closing Quick View exits word mode; already saved filters remain. Exiting word mode cancels
a title-word filter still in its undo window. Its picker never follows the next mod.
Only the hovered creator gets inline control space. One extra wrap line keeps the content
below the creator list steady without leaving gaps after every name.

Clicked English plurals use their singular form, such as **workbenches → workbench** or
**bodies → body**. Words such as **glass**, **series**, and **news** stay intact; names with
digits, possessives and non-English words are preserved. Manually saved phrases keep the
exact text you enter.

Saved keywords match whole words in the displayed title, case-insensitively: **AI** matches
**[AI]** and **AI-powered**, while **rain**, **train**, **terrain**, and **aim** remain visible.
English singular/plural title words remain supported. Enable **Include descriptions in search**
to also check full public descriptions. **Comments are never used for matching.**
Saved **−** phrases are checked locally and never sent to Steam's search index. When Steam's
search box is empty, longer **+** phrases also narrow Steam's title/description search, then
receive the same local check. When you enter a native search, its text, boolean operators,
parentheses and Title & Description / Title Only / Description Only selection stay unchanged;
saved filters apply to the returned page. Saved keyword inputs always treat phrases literally.
Steam's total covers its full query. Beside it, **X of Y shown on this page** updates for saved,
subscription, minimum-rating-count and star filters. Unknown rating counts are marked unverified.
Exclusions and short keywords apply to the loaded Workshop page; later pages are not pulled in
to fill gaps. Collections check every row.
The scope preference is saved per game and synchronizes across open tabs.

Click an active filter's text, or the **magnifying glass** revealed on hover or keyboard focus,
to inspect its exclusions. **−** shows matching mods; **+** shows nonmatches. Each item names
the selected filter. Inspection shows subscribed and rating-hidden mods too, keeps saved states
and collection subscription exclusions intact, and can be switched directly to another filter.
Click again or **Back to filtered results** to leave inspection. Workshop inspection uses the
current page and Steam's pagination; collection inspection covers all rows.

Paste a Workshop URL or numeric item ID into **Required mod URL or ID** to save a dependency
filter. For example, Project Viewpoint's ID is **3809306528**. **−** excludes mods that directly
list that ID under **Required Items**; **+** keeps direct dependents. This checks declared IDs,
not mentions in descriptions or comments, and does not recursively follow dependency chains
or exclude the required mod itself. The shared API provides dependency data, cached on
the device for 15 minutes (up to 5,000 items). Unavailable lists offer **Retry required items**. Unknown
items remain visible until verified and block filtered collection bulk subscriptions.

Version 1.5.0 uses the shared Workshop data service for dependency lists, full descriptions,
file sizes and rating counts. Users do not enter an API key. The developer's Steam key stays
in a Cloudflare Worker secret; the extension contains only the public service URL. Open
**Data service settings** below Saved Filters to see service status and **Test connection**.
Requests contain public item IDs, with no Steam login cookies, subscription lists or comments.
Incomplete or failed API results remain unverified and offer Retry; API mode never automatically
fetches individual Workshop detail pages. Unknown dependency/description data blocks filtered
collection bulk subscriptions. Steam still renders the underlying Workshop/collection page.
See `backend/README.md` for caching, request limits and deployment instructions. A development
build with an empty service URL may use a locally entered personal key or legacy keyless sources.

Author filters apply to the cards on the current page; multiple **+** authors include any of
those authors. Author filtering does not change Steam's result count or fill gaps from later
pages. Opening Quick View also makes that mod's listed co-creators available for matching
on the current page; unopened mods still use the creator shown on their cards.
On collection pages, the same **Saved Filters** list sits below the existing filter bar.
Edits synchronize across Workshop and collection tabs for that game. Keywords match
the displayed mod title by default. Description search downloads full public descriptions
in batches, rather than matching only the shortened row previews. If descriptions cannot be
verified, a Retry control appears and filtered subscription changes wait for verification.
Creator filters still match creator names. Creator hover and clickable title words use the same compact controls.
Steam's numeric and vanity creator links are matched using cached public profile identifiers.

When saved filters exclude collection mods, **Subscribe to all** first explains how many
will be skipped, then keeps Steam's **Add Only / Overwrite My Subscriptions** choices.
**Add Only** subscribes to eligible mods and keeps existing subscriptions, including previously
subscribed excluded mods. **Overwrite** verifies the complete current subscription list, adds
eligible mods first, then removes subscriptions outside that set. Failed additions stop before
any removals. An unreadable list prevents replacement; Add Only remains available. A progress
dialog has a Stop button; completed changes remain if stopped or a later request fails.
Star rating, minimum number of ratings, and Hide Subscribed affect browsing, not this
saved-filter subscription selection. The collection toolbar has two rows of three buttons.
Workshop order is **Hide Subscribed → Ratings → Star Rating → Steam sort**; on narrower
grids the controls wrap into equal columns. The collection bottom row is **Hide Subscribed
→ Ratings → Star Rating**. Description search stays in Saved Filters below the phrase box.

Collection sizes appear beside the item count: **Total** sums all listed mods, and **After
filters** sums the visible mods after saved filters, stars, rating counts, and Hide Subscribed.
Both show decimal MB and GB (1 GB = 1,000 MB). These are Steam-reported file sizes, which
can differ from installed disk usage. Missing sizes are marked unavailable or as a lower
bound with a Retry button. Missing vote counts remain visible with an explanation in the
Ratings menu, where they can be retried. Public item summaries are fetched in batches of
100 and cached locally for 15 minutes; filter changes reuse them. Cache storage is bounded.

## How It Works

The extension:
1. Adds the filter controls to Workshop and collection pages
2. Reads each item's star rating and subscribed state
3. Hides items that don't pass the filters
4. Watches for new content (paging, sorting, infinite scroll) and filters it too
5. Saves your choices with Chrome's storage API

Steam's current Workshop layout is rendered by React with generated class names, so the
extension finds things by page structure instead. Subscribed state is not part of that
page, so while Hide Subscribed is on and you are signed in, the extension asks Steam
(`/sharedfiles/actions?q=GetUserListStatus`, with your existing Steam login) which of the
items on the page you are subscribed to. Star ratings come from the card's star icons, with
the page's embedded data as a fallback. The buttons are only added once React has finished
setting up the page, so Steam's own page keeps working normally.

See the [privacy policy](https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html) for exactly what is stored and sent.

## Development

For a short performance check with one test browser at a time, run
`npm --prefix perf run perf`. It uses current manifest files and defaults to one bounded
sample per page, sequentially. The regression suite is `node tests/release-regression.js`
(at most two test browsers). Run profiling separately from functional tests.
Measured changes and resource limits are in [perf/REPORT.md](perf/REPORT.md).

### Project Structure
```
├── manifest.json            Extension manifest
├── steam-dom.js             Finds cards, ratings and subscribed state on Steam's current layout
├── content.js               Injects the controls, applies the filters, sizes the buttons
├── workshop-metadata.js     Shared cached file sizes and user-rating counts from Steam
├── collection-sizes.js      Total and filtered collection sizes
├── collection-descriptions.js  Full mod descriptions for collection keyword search
├── collection-row-align.js  Two rows of three collection controls
├── collection-subscriptions.js  Filtered subscription confirmation and eligible-mod requests
├── sort-popover-fit.js      Fits Steam's sort menu to the width of the sort button
├── hydration-signal.js      Tells content.js when Steam's page has finished loading (React)
├── saved-filters.js         Per-game keyword and author filters and card pickers
├── title-word-inflection.js  Normalizes clicked English plurals, preserving exceptions
├── pluralize.js             Bundled pluralize 8.0.0 (MIT; license included in source)
├── search-terms-hook.js     Applies saved keywords to Steam's search requests
├── saved-filters.css        Saved-filter sidebar and picker styles
├── styles.css               Styles for the controls and dropdowns
├── icons/                   Extension icons (16, 32, 48, 128) and the full-size source artwork
├── build.js                 Builds the Chrome and Firefox packages into dist/
├── docs/                    Privacy policy page (GitHub Pages) and README GIFs
├── perf/                    Performance test (Puppeteer)
└── promo/                   Scripts for the promo video, store images and README GIFs
```

English inflection uses [pluralize 8.0.0](https://github.com/plurals/pluralize/tree/v8.0.0).
Its MIT notice is included in the bundled source and [vendor/pluralize-LICENSE.txt](vendor/pluralize-LICENSE.txt).

### Building
No compile step - plain JavaScript, and Chrome can load the repository folder directly.
To make the store packages:
```
node build.js
```
This writes `dist/Steam-Workshop-Filter-Plus-<version>-chrome.zip` (Chrome Web Store) and
`dist/Steam-Workshop-Filter-Plus-<version>-firefox.zip` (Firefox Add-ons) from the same
source files. The only difference is the Firefox manifest, which adds
`browser_specific_settings.gecko` (add-on ID, Firefox 140+, data-collection declaration).

### Testing
1. Make changes to the code
2. Reload the extension in `chrome://extensions`
3. Test on Steam Workshop pages and a collection page

Performance test (headless Chrome, compares pages with and without the extension):
```
cd perf
npm install
npm run perf
```
See `TESTING.md` for the full runtime checklist.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

dcave14 - [GitHub Profile](https://github.com/dcave14)

## Changelog

### 1.5.0 (unreleased)
- Workshop-style collection pages with native descriptions, authors, ratings, awards, linked collections and account controls
- Filter groups, direct required-mod filters, and inspection of hidden items, including subscribed mods
- Whole-word keyword matching: `AI` matches `AI`, not `rain`; optional full-description matching never searches comments
- Settings popup for sidebar placement, independent sidebar/filter-bar pinning, Comfortable / Compact density and reduced motion
- Native 75/100-item paging, mirrored card-aligned controls and reset buttons
- Faster collection scrolling, creator controls and filter changes through cached discovery, targeted observers and fewer layout writes
- Fixed the unnecessary gap above pinned collection sidebars and a startup hydration race in loaded-result counts

1.4.0 is the last shipped release. Intermediate local development labels were not
published releases; the pending Chrome and Firefox packages both use 1.5.0.

### 1.4.0
- Saved keyword and creator filters per game, in the Workshop sidebar and under the collection filter bar, shared between both page types
- Card pickers: hover a creator, or turn on clickable title words, then **+** or **−**. Each pick has a 2.5-second undo window
- The same pickers work in Quick View
- Clicked English plurals are saved in singular form (workbenches → workbench); typed phrases stay exact
- Keyword filters use Steam's Title Only search; **Include descriptions in search** extends them to full descriptions
- New **Ratings** filter for a minimum number of user ratings, on Workshop pages and collections
- Collection sizes: total and after filters, in MB and GB
- **Subscribe to all** on a collection skips mods excluded by saved filters, with Steam's Add Only / Overwrite choices kept
- Workshop controls reordered to Hide Subscribed, Ratings, Star Rating, Steam sort; collections get two rows of three buttons
- Game version categories listed newest first
- A **?** button after Save explains the controls
- Fixed saved filters not applying on the first page load in Firefox, and Quick View collapsing the gaps between the browse controls
- Existing saved filters carry over when upgrading
- Updated the privacy policy

### 1.3.1
- Firefox version (Firefox 140+), built from the same source with `node build.js`
- Hide Subscribed on Steam's new Workshop layout now works in Firefox (the subscription
  request carries your Steam login there too)
- Added the MIT `LICENSE` file
- Same features as 1.3.0; re-released so the store packages can be replaced

### 1.3.0
- Support for Steam's new Workshop layout (`steamcommunity.com/app/*/workshop/*` and the
  new browse pages): card detection, star ratings and subscribed state via Steam's
  `GetUserListStatus` query
- Filters on collection pages, joined to the collection's Subscribe / Unsubscribe / Save row
- Controls rebuilt in Steam's own style, placed next to the sort menu and sized to the mod
  card width so all three buttons sit flush on the card columns at any window size (the
  labels shrink slightly on narrow windows instead of the buttons overhanging)
- Steam's sort menu is fitted to the width of the sort button
- Star Rating dropdown restyled to match each page
- Buttons appear as soon as Steam's page is ready (about 1.4s instead of 3s+)
- Faster on large collections: no extra page-load delay, fewer layout passes, quicker clicks
- Added a performance test (`perf/`)
- Updated the privacy policy (now hosted on GitHub Pages)

### 1.2.0
- Added support for multiple item types (collection, workshop item, etc.)
- Improved filter logic to handle different item structures

### 1.1.0
- Added star rating filter
- UI improvements with dropdown menu
- Enhanced filter persistence
- Fixed issues with dynamic content loading

### 1.0.0
- Initial release
- Basic hide/show functionality
- Persistent storage of preferences
- Infinite scroll support
