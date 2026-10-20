# Store listing text (1.4.0)

Paste-ready text for the Chrome Web Store and Firefox Add-ons listings. Images
come from `out/store-assets/` (run `store-assets/capture.js`, then
`store-assets/compose.js`).

## Short description / summary

Chrome takes this from `manifest.json` (132 characters max). Firefox Add-ons
"Summary" (250 max):

> Hide Steam Workshop mods you already have, filter by stars and number of ratings, and save keyword and creator filters for each game. Works on Workshop pages and collections.

## Detailed description

Chrome Web Store takes plain text. Firefox Add-ons accepts `<strong>` and `<a>`;
the AMO version below uses them.

### Chrome Web Store

```
Steam Workshop Filter Plus adds filters to Steam Workshop pages and collections, so you only see mods you don't have yet and that are worth your time.

FILTERS
- Hide Subscribed: one click hides every mod you're already subscribed to (sign in to Steam)
- Star Rating: show only 5-star, 4+, 3+, 2+ or 1+ rated mods
- Ratings: require 10+ up to 5,000+ user ratings, so a 5-star mod with two votes doesn't make the cut
- Saved Filters: hide a keyword or a creator for good, or show only their mods. Filters are kept per game and shared between Workshop and collection pages

ADD FILTERS FROM THE PAGE
- Hover a creator's name on any mod card and click - to hide them or + to show only them
- Turn on clickable title words and click any word in a title to filter by it
- Every pick has a 2.5-second undo window
- Works in Quick View too

COLLECTIONS
- The same filters work on collection pages
- See the collection's total size and its size after your filters, in MB and GB
- Subscribe to all skips the mods your saved filters exclude, and still offers Steam's Add Only / Overwrite choice

BUILT INTO STEAM
- On Workshop pages the buttons sit next to Steam's sort menu and line up with the mod grid; on collections they join the Subscribe to all row
- Works with Steam's current Workshop layout and the classic one
- Keeps working as you page, sort or scroll
- Your choices are remembered between sessions

PRIVACY
Nothing is sent to the developer or any third party. Every request goes to Steam itself: your subscription status for the mods on the page, your saved keywords added to Steam's own search, public mod sizes and rating counts, public creator profiles for creator filters, and public descriptions when you turn on description search. Full details are in the privacy policy.

Open source: https://github.com/dcave14/Steam-Workshop-Filter-Plus
```

### Firefox Add-ons

```
Steam Workshop Filter Plus adds filters to Steam Workshop pages and collections, so you only see mods you don't have yet and that are worth your time.

<strong>Filters</strong>
- <strong>Hide Subscribed</strong>: one click hides every mod you're already subscribed to (sign in to Steam)
- <strong>Star Rating</strong>: show only 5-star, 4+, 3+, 2+ or 1+ rated mods
- <strong>Ratings</strong>: require 10+ up to 5,000+ user ratings, so a 5-star mod with two votes doesn't make the cut
- <strong>Saved Filters</strong>: hide a keyword or a creator for good, or show only their mods. Filters are kept per game and shared between Workshop and collection pages

<strong>Add filters from the page</strong>
- Hover a creator's name on any mod card and click − to hide them or + to show only them
- Turn on clickable title words and click any word in a title to filter by it
- Every pick has a 2.5-second undo window
- Works in Quick View too

<strong>Collections</strong>
- The same filters work on collection pages
- See the collection's total size and its size after your filters, in MB and GB
- Subscribe to all skips the mods your saved filters exclude, and still offers Steam's Add Only / Overwrite choice

<strong>Built into Steam</strong>
- On Workshop pages the buttons sit next to Steam's sort menu and line up with the mod grid; on collections they join the Subscribe to all row
- Works with Steam's current Workshop layout and the classic one
- Keeps working as you page, sort or scroll
- Your choices are remembered between sessions

<strong>Privacy</strong>
Nothing is sent to the developer or any third party. Every request goes to Steam itself: your subscription status for the mods on the page, your saved keywords added to Steam's own search, public mod sizes and rating counts, public creator profiles for creator filters, and public descriptions when you turn on description search. Full details are in the privacy policy.

Open source: <a href="https://github.com/dcave14/Steam-Workshop-Filter-Plus">https://github.com/dcave14/Steam-Workshop-Filter-Plus</a>
```

## Screenshot captions (Firefox Add-ons)

1. Saved filters: Hide any keyword or creator, saved per game.
2. Title words: Click a word in any title to filter by it.
3. Ratings + stars: Hide what you have. Keep what's rated well.
4. Collection sizes: See how big a collection is, before and after filters.
5. Collections: Your saved filters work on collections too.

## Links

- Homepage: https://github.com/dcave14/Steam-Workshop-Filter-Plus
- Support: https://github.com/dcave14/Steam-Workshop-Filter-Plus/issues
- Privacy policy: https://dcave14.github.io/Steam-Workshop-Filter-Plus/privacy-policy.html
  (the old `Steam-Workshop-Hide-Subscribed` Pages URL now returns 404)

## Version notes (1.4.0)

```
- Saved keyword and creator filters per game, on Workshop pages and collections
- Hover a creator or click a title word to add a filter, with a 2.5-second undo
- New Ratings filter for a minimum number of user ratings
- Collection sizes before and after filters
- Subscribe to all on a collection skips mods your saved filters exclude
- Fixed saved filters not applying on the first page load in Firefox
```
