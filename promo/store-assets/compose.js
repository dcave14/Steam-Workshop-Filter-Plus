// compose.js
// Builds the Chrome Web Store and Firefox Add-ons images from the real captures in
// ../out/store-assets/raw/ (run capture.js first):
//   screenshot-1..5.jpg   1280x800
//   promo-small.jpg       440x280
//   promo-marquee.jpg     1400x560
// JPEG, because the store wants JPEG or 24-bit PNG without alpha.
// Styling follows the promo video (showcase.css): #090d14 background, #1a9fff
// accent, Sora headlines, Figtree UI text.
//
// Usage: node compose.js

const fs = require('fs');
const path = require('path');
const puppeteer = require('../../perf/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(__dirname, '..', 'out', 'store-assets');
const RAW = path.join(OUT, 'raw');
// Full-size artwork; the packaged icons carry store padding.
const ICON = path.resolve(__dirname, '..', '..', 'icons', 'icon-source.png');

// Raw captures are 1600x1000 CSS px at 2x.
const RAW_W = 1920;

function dataUri(file) {
    return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
}

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Sora:wght@500;600;700&display=block" rel="stylesheet">';

const BASE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
    background: #090d14;
    color: #eef3f8;
    font-family: 'Figtree', 'Segoe UI', sans-serif;
    overflow: hidden;
}
.glow {
    position: absolute; inset: 0;
    background:
        radial-gradient(60% 55% at 22% 0%, rgba(26, 159, 255, 0.20), transparent 70%),
        radial-gradient(50% 60% at 100% 100%, rgba(102, 192, 244, 0.08), transparent 70%);
}
.eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    color: #66c0f4; font: 700 13px 'Figtree', sans-serif; letter-spacing: 2px; text-transform: uppercase;
}
.eyebrow b {
    padding: 2px 9px; border-radius: 10px; background: #1a9fff22; border: 1px solid #1a9fff66; color: #cfe8ff;
}
h1 { font-family: 'Sora', sans-serif; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
.window {
    position: absolute; overflow: hidden; border-radius: 12px;
    background: #1b2838; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
}
.bar {
    height: 38px; background: #202124; display: flex; align-items: center; gap: 8px; padding: 0 14px;
}
.dot { width: 11px; height: 11px; border-radius: 50%; }
.url {
    margin-left: 14px; flex: 1; height: 24px; border-radius: 12px; background: #35363a;
    color: #9aa0a6; font: 500 12px 'Figtree', sans-serif; display: flex; align-items: center; padding: 0 12px;
}
.url span { color: #e8eaed; }
.ext { width: 22px; height: 22px; border-radius: 5px; }
.view { position: absolute; left: 0; right: 0; top: 38px; bottom: 0; overflow: hidden; }
.view img { position: absolute; }
.inset { position: absolute; overflow: hidden; border-radius: 8px; background: #1b2838;
    box-shadow: 0 18px 50px rgba(0,0,0,0.6), 0 0 0 2px #1a9fff; }
.inset img { position: absolute; }
`;

function windowHtml(o) {
    // o: { x, y, w, h, raw, crop: { x, y, w } (CSS px of the raw capture), url }
    const viewH = o.h - 38;
    const scale = o.w / o.crop.w;
    const imgW = RAW_W * scale;
    return `
<div class="window" style="left:${o.x}px; top:${o.y}px; width:${o.w}px; height:${o.h}px;">
  <div class="bar">
    <div class="dot" style="background:#ff5f57"></div>
    <div class="dot" style="background:#febc2e"></div>
    <div class="dot" style="background:#28c840"></div>
    <div class="url"><span>steamcommunity.com</span>${o.url}</div>
    <img class="ext" src="${dataUri(ICON)}">
  </div>
  <div class="view" style="height:${viewH}px">
    <img src="${dataUri(path.join(RAW, o.raw + '.png'))}" style="width:${imgW}px; left:${-o.crop.x * scale}px; top:${-o.crop.y * scale}px;">
  </div>
</div>`;
}

const BROWSE_PATH = '/workshop/browse/?appid=294100';
const COLLECTION_PATH = '/sharedfiles/filedetails/?id=3521297585';

const SCREENSHOTS = [
    { n: 1, eyebrow: 'Collections', title: 'Collections, redesigned like the Workshop.',
      raw: 'collection', url: COLLECTION_PATH, crop: { x: 100, y: 134, w: 1720 } },
    { n: 2, eyebrow: 'Saved filters', title: 'Hide any keyword or creator, saved per game.',
      raw: 'browse-saved', url: BROWSE_PATH, crop: { x: 100, y: 40, w: 880 } },
    { n: 3, eyebrow: 'Ratings + stars', title: 'Hide what you have. Keep what’s rated well.',
      raw: 'browse-star-menu', url: BROWSE_PATH, crop: { x: 420, y: 100, w: 1400 } },
    { n: 4, eyebrow: 'Collection sizes', title: 'See how big a collection is, before and after filters.',
      raw: 'collection-sizes', url: COLLECTION_PATH, crop: { x: 100, y: 10, w: 1720 },
      // Steam's stats strip is small; magnify the real Total / After filters text.
      inset: { x: 926, y: 20, w: 336, h: 26, scale: 2.2, left: 277, top: 300 } },
    { n: 5, eyebrow: 'Compact layout', title: 'Six cards per row, with your filters in a sidebar.',
      raw: 'browse-compact', url: BROWSE_PATH, crop: { x: 100, y: 30, w: 1720 } }
];

// A magnified crop of the same raw capture, laid over the window.
function insetHtml(i, raw) {
    return `<div class="inset" style="left:${i.left}px; top:${i.top}px; width:${i.w * i.scale}px; height:${i.h * i.scale}px;">
  <img src="${dataUri(path.join(RAW, raw + '.png'))}" style="width:${RAW_W * i.scale}px; left:${-i.x * i.scale}px; top:${-i.y * i.scale}px;">
</div>`;
}

function screenshotHtml(s) {
    return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
body { width: 1280px; height: 800px; }
.head { position: absolute; left: 0; right: 0; top: 52px; text-align: center; }
h1 { font-size: 40px; margin-top: 14px; }
</style></head><body><div class="glow"></div>
<div class="head"><div class="eyebrow"><b>0${s.n}</b>${s.eyebrow}</div><h1>${s.title}</h1></div>
${windowHtml({ x: 130, y: 172, w: 1020, h: 590, raw: s.raw, crop: s.crop, url: s.url })}
${s.inset ? insetHtml(s.inset, s.raw) : ''}
</body></html>`;
}

function smallTileHtml() {
    return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
body { width: 440px; height: 280px; }
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 30px; gap: 14px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand img { width: 64px; height: 64px; }
h1 { font-size: 25px; line-height: 1.1; }
p { margin: 0; color: #8f9bab; font: 500 15px 'Figtree', sans-serif; line-height: 1.4; }
p b { color: #eef3f8; font-weight: 600; }
</style></head><body><div class="glow"></div>
<div class="wrap">
  <div class="brand"><img src="${dataUri(ICON)}"><h1>Steam Workshop<br>Filter Plus</h1></div>
  <p><b>Hide subscribed mods</b>, <b>filter by rating</b> and <b>save keyword filters</b> on Workshop pages and redesigned collections.</p>
</div></body></html>`;
}

function marqueeHtml() {
    return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
body { width: 1400px; height: 560px; }
.left { position: absolute; left: 70px; top: 0; bottom: 0; width: 480px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
.brand { display: flex; align-items: center; gap: 18px; }
.brand img { width: 80px; height: 80px; }
h1 { font-size: 38px; line-height: 1.08; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
li { font: 500 19px 'Figtree', sans-serif; color: #c9d3de; display: flex; align-items: center; gap: 12px; }
li::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #1a9fff; flex: none; }
</style></head><body><div class="glow"></div>
<div class="left">
  <div class="brand"><img src="${dataUri(ICON)}"><h1>Steam Workshop<br>Filter Plus</h1></div>
  <ul>
    <li>Hide mods you\u2019re already subscribed to</li>
    <li>Filter by stars and number of ratings</li>
    <li>Save keyword and creator filters per game</li>
    <li>Workshop-style collection pages with sizes</li>
  </ul>
</div>
${windowHtml({ x: 620, y: 60, w: 740, h: 440, raw: 'browse-saved', crop: { x: 100, y: 40, w: 880 }, url: BROWSE_PATH })}
</body></html>`;
}

async function render(page, html, width, height, file) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
    console.log('saved ' + file);
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true });
    try {
        const page = await browser.newPage();
        for (const s of SCREENSHOTS) await render(page, screenshotHtml(s), 1280, 800, 'screenshot-' + s.n + '.jpg');
        await render(page, smallTileHtml(), 440, 280, 'promo-small.jpg');
        await render(page, marqueeHtml(), 1400, 560, 'promo-marquee.jpg');
    } finally {
        await browser.close();
    }
})();
