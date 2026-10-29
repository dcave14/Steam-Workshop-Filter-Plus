# Store listing text (1.5.0)

Paste-ready text for the Chrome Web Store and Firefox Add-ons listings. Images
come from `out/store-assets/` (run `store-assets/capture.js`, then
`store-assets/compose.js`).

## Short description / summary

Chrome takes this from `manifest.json` (132 characters max), currently:

> Hide subscribed Workshop items, filter ratings, and save keyword, author, and dependency filters per game.

Firefox Add-ons "Summary" (250 max):

> Hide Steam Workshop mods you already have, filter by stars and number of ratings, and save keyword, creator and required-mod filters for each game. Works on Workshop pages and collections, which get a cleaner Workshop-style layout.

## Detailed description

Chrome Web Store takes plain text. Firefox Add-ons accepts `<strong>` and `<a>`;
the AMO version below uses them.

### Chrome Web Store

```
Steam Workshop Filter Plus adds filters to Steam Workshop pages and collections, so you only see mods you don't have yet and that are worth your time.

FILTERS
- Hide Subscribed: hide every mod you're already subscribed to (sign in to Steam)
- Star Rating: 5 stars only, or 4+, 3+, 2+, 1+
- Ratings: require 10+ up to 5,000+ ratings, so a 5-star mod with two votes doesn't make the cut
- Saved filters: hide a keyword, a creator or anything that requires a given mod, or show only their mods. Kept per game and shared between Workshop and collection pages
- Filter groups: bundle filters together and switch them on or off at once
- Inspect any filter to see exactly which mods it hides

ADD FILTERS FROM THE PAGE
- Hover a creator's name on a mod card and click - to hide them or + to show only them
- Turn on clickable title words and click any word in a title to filter by it
- Every pick has a 2.5-second undo, and it works in Quick View too

COLLECTIONS
- Collection pages get a Workshop-style layout: two mods per row, a readable description, the mod authors, ratings and linked collections
- The same filters work on collections and on the Collections browse page
- See a collection's total size and its size after your filters
- Subscribe to all skips mods your saved filters exclude, and keeps Steam's Add Only / Overwrite choice
- A Back to top button stays on screen in long collections

LAYOUT AND SETTINGS
- Compact layout fits up to six cards per row
- Put the sidebar on the left or right, and pin it or the filter bar while you scroll
- 75 or 100 mods per page
- Optional reduced motion: turn off card hover animations, pause homepage carousels, freeze animated previews
- Switch the collection redesign off to get Steam's original layout back

BUILT INTO STEAM
- The buttons sit next to Steam's sort menu and line up with the mod grid
- Works with Steam's current Workshop layout and the classic one
- Keeps working as you page, sort or scroll, and remembers your choices

PRIVACY
No account, no analytics, no tracking. Your settings and filters stay in your browser. Subscription checks and filtered subscriptions go straight to Steam with your existing login. Public mod data (sizes, rating counts, descriptions, required mods) comes from the extension's read-only data service, which receives only public Workshop item IDs: never your login, subscriptions or saved filters. Full details are in the privacy policy.

Open source: https://github.com/dcave14/Steam-Workshop-Filter-Plus
```

### Firefox Add-ons

```
Steam Workshop Filter Plus adds filters to Steam Workshop pages and collections, so you only see mods you don't have yet and that are worth your time.

<strong>Filters</strong>
- <strong>Hide Subscribed</strong>: hide every mod you're already subscribed to (sign in to Steam)
- <strong>Star Rating</strong>: 5 stars only, or 4+, 3+, 2+, 1+
- <strong>Ratings</strong>: require 10+ up to 5,000+ ratings, so a 5-star mod with two votes doesn't make the cut
- <strong>Saved filters</strong>: hide a keyword, a creator or anything that requires a given mod, or show only their mods. Kept per game and shared between Workshop and collection pages
- <strong>Filter groups</strong>: bundle filters together and switch them on or off at once
- Inspect any filter to see exactly which mods it hides

<strong>Add filters from the page</strong>
- Hover a creator's name on a mod card and click − to hide them or + to show only them
- Turn on clickable title words and click any word in a title to filter by it
- Every pick has a 2.5-second undo, and it works in Quick View too

<strong>Collections</strong>
- Collection pages get a Workshop-style layout: two mods per row, a readable description, the mod authors, ratings and linked collections
- The same filters work on collections and on the Collections browse page
- See a collection's total size and its size after your filters
- Subscribe to all skips mods your saved filters exclude, and keeps Steam's Add Only / Overwrite choice
- A Back to top button stays on screen in long collections

<strong>Layout and settings</strong>
- Compact layout fits up to six cards per row
- Put the sidebar on the left or right, and pin it or the filter bar while you scroll
- 75 or 100 mods per page
- Optional reduced motion: turn off card hover animations, pause homepage carousels, freeze animated previews
- Switch the collection redesign off to get Steam's original layout back

<strong>Built into Steam</strong>
- The buttons sit next to Steam's sort menu and line up with the mod grid
- Works with Steam's current Workshop layout and the classic one
- Keeps working as you page, sort or scroll, and remembers your choices

<strong>Privacy</strong>
No account, no analytics, no tracking. Your settings and filters stay in your browser. Subscription checks and filtered subscriptions go straight to Steam with your existing login. Public mod data (sizes, rating counts, descriptions, required mods) comes from the extension's read-only data service, which receives only public Workshop item IDs: never your login, subscriptions or saved filters. Full details are in the <a href="https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html">privacy policy</a>.

Open source: <a href="https://github.com/dcave14/Steam-Workshop-Filter-Plus">https://github.com/dcave14/Steam-Workshop-Filter-Plus</a>
```

## Screenshot captions (Firefox Add-ons)

1. Collections: Collections, redesigned like the Workshop.
2. Saved filters: Hide any keyword or creator, saved per game.
3. Ratings + stars: Hide what you have. Keep what's rated well.
4. Collection sizes: See how big a collection is, before and after filters.
5. Compact layout: Six cards per row, with your filters in a sidebar.

## Links

- Homepage: https://github.com/dcave14/Steam-Workshop-Filter-Plus
- Support: https://github.com/dcave14/Steam-Workshop-Filter-Plus/issues
- Privacy policy: https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html

## Store review notes

1.5.0 adds a host permission for
`https://steam-workshop-data.prodbycave.workers.dev/*`. Chrome's privacy
practices form should say the service receives public Workshop item IDs only,
with no personal or account data (tick Website content in the Data usage
form). The Firefox build declares
`data_collection_permissions: { required: ['websiteContent'] }` (`build.js`),
which Firefox shows at install.

## Version notes (1.5.0)

```
- Collection pages redesigned like the Workshop, with linked collections and a floating Back to top
- Filter groups, required-mod filters, and inspection of what each filter hides
- Settings popup: Compact layout, sidebar left or right, pinned sidebar and filter bar, reduced motion
- 75 or 100 mods per page
- Filters on the Collections browse page
- Faster scrolling and filtering on large collections
```
