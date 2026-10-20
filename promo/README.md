# Promo video

Source for the 40-second showcase video used on GitHub and the Chrome Web Store.
Store listing text for both stores is in `store-listing.md`.
The scene is plain HTML/CSS/JS rendered frame by frame in headless Chrome, so
every export is identical and edits are a re-render away.

| File | Role |
| --- | --- |
| `showcase.html` / `showcase.css` | 1920x1080 stage, intro, outro, headlines |
| `scene-data.js` | Games, mod cards, labels (mod names and art are invented) |
| `thumbs.js` | Procedural SVG thumbnails and page banners |
| `page-builder.js` | Mock Chrome window and Steam Workshop pages |
| `timeline.js` | Schedule, camera, cursor and every animated property as a function of time |
| `render.js` | Headless capture and ffmpeg encoding |

## Preview

Open `showcase.html` in Chrome (a scrubber appears at the bottom), or freeze a
frame with `showcase.html?t=17.5`.

## Render

Needs Node 18+, Chrome and ffmpeg on `PATH`.

```bash
npm install
node render.js                                            # out/showcase-1080p.mp4, 60 fps
node render.js --stills 12.5,17.5,21,24.8,29.5 --size 1280x800 --prefix store   # store screenshots
node render.js --stills 35 --prefix poster                # thumbnail / poster frame
ffmpeg -i out/showcase-1080p.mp4 -c:v libx264 -preset slow -crf 24 -tune animation -pix_fmt yuv420p -movflags +faststart out/showcase-web.mp4
```

`showcase-web.mp4` (about 7 MB) fits GitHub's 10 MB attachment limit for the
README. A full-length GIF is 24 MB+ even at 720px, so `--gif` is only worth it
for a short clip (`--src` a trimmed MP4).

Timing lives in the `T` table and `HEADLINES` list at the top of `timeline.js`.

## Store images and README GIFs (real Steam pages)

These load the real extension in headless Chrome on live Steam pages, unlike the
video above. Both write under `out/` and use the Puppeteer install in `../perf`
(`cd ../perf && npm install` first).

```bash
cd store-assets
node capture.js      # raw captures of browse and collection pages -> out/store-assets/raw/
node compose.js      # Chrome Web Store screenshots (1280x800) and promo tiles -> out/store-assets/

cd ../readme-gifs
node record.js       # README GIFs (workshop, saved-filters, collection) -> out/readme-gifs/ (copy to ../docs/)
node record.js --convert-only           # re-encode the last recordings only
node record.js --only saved-filters     # record one GIF
```

The GIFs are recorded logged out, so `record.js` marks a few items subscribed the
way Steam shows it to a signed-in user; the extension's filtering on them is real.
Each GIF must stay under GitHub's 10 MB image limit.
