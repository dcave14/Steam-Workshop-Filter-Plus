# Changelog

## 1.5.0 (unreleased)
- Workshop-style collection pages with native descriptions, authors, ratings, awards, linked collections and account controls
- Filter groups, direct required-mod filters, and inspection of hidden items, including subscribed mods
- Whole-word keyword matching: `AI` matches `AI`, not `rain`; optional full-description matching never searches comments
- Settings popup for sidebar placement, independent sidebar/filter-bar pinning, Comfortable / Compact density and reduced motion
- Native 75/100-item paging, mirrored card-aligned controls and reset buttons
- Faster collection scrolling, creator controls and filter changes through cached discovery, targeted observers and fewer layout writes
- Fixed the unnecessary gap above pinned collection sidebars and a startup hydration race in loaded-result counts

1.4.0 is the last shipped release. Intermediate local development labels were not
published releases; the pending Chrome and Firefox packages both use 1.5.0.

## 1.4.0
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

## 1.3.1
- Firefox version (Firefox 140+), built from the same source with `node build.js`
- Hide Subscribed on Steam's new Workshop layout now works in Firefox (the subscription
  request carries your Steam login there too)
- Added the MIT `LICENSE` file
- Same features as 1.3.0; re-released so the store packages can be replaced

## 1.3.0
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

## 1.2.0
- Added support for multiple item types (collection, workshop item, etc.)
- Improved filter logic to handle different item structures

## 1.1.0
- Added star rating filter
- UI improvements with dropdown menu
- Enhanced filter persistence
- Fixed issues with dynamic content loading

## 1.0.0
- Initial release
- Basic hide/show functionality
- Persistent storage of preferences
- Infinite scroll support
