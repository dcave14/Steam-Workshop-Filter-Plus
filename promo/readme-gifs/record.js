// record.js
// Records the two README preview GIFs with the real extension loaded,
// recreating the v1.2.0 ones on current Steam pages:
//   workshop.gif    Project Zomboid browse page: Hide Subscribed removes the
//                   subscribed mods, 5 Stars Only removes the lower-rated
//                   ones, then Steam's sort menu (Top Rated) reloads the
//                   results with both filters still applied
//   collection.gif  "Genesis Mod Pack" (RimWorld, mixed 4/5-star items):
//                   Hide Subscribed, then 5 Stars Only, then scroll the list
//
// Usage: node record.js [--convert-only] [--only workshop|collection]
//   (writes to ../out/readme-gifs/; needs ffmpeg on PATH; --convert-only
//   re-encodes the existing .webm recordings without opening Steam)
//
// Recording is logged out, so a few items are marked as subscribed the way
// Steam shows it to a signed-in user: a check badge (svg.SVGIcon_Check) on
// workshop cards, and the "toggled" subscribe button on collection items.
// The extension reads that same page state, so the filtering itself is real.
//
// Headless Chrome draws no mouse pointer, so a cursor overlay is injected
// into the page and follows the scripted mouse. The cursor is kept off the
// mod cards (controls row, page margins) because Steam pops up an item
// preview on card hover.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('../../perf/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EXT_SRC = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'out', 'readme-gifs');
const EXT_FILES = ['manifest.json', 'steam-dom.js', 'content.js', 'collection-row-align.js',
    'hydration-signal.js', 'sort-popover-fit.js', 'styles.css', 'Steam-Workshop-Filter-Plus-Icon.png',
    'saved-filters.js', 'saved-filters.css', 'search-terms-hook.js'];

const VIEWPORT = { width: 1600, height: 900 };
const GIF_FPS = 12;
// The collection page sits in a 950px column (x 325-1275 at a 1600px
// viewport); the cursor rests in the margin just right of it, inside the crop.
const MARGIN_X = 1288;

const WORKSHOP_URL = 'https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend&section=readytouseitems';
const COLLECTION_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3798004429';

function copyExtension() {
    // Chrome's Extensions.loadUnpacked rejects paths containing spaces.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-gif-'));
    for (const file of EXT_FILES) fs.copyFileSync(path.join(EXT_SRC, file), path.join(dir, file));
    return dir;
}

// Arrow cursor drawn on top of the page, moved by real mousemove events.
function cursorOverlay() {
    const install = () => {
        if (document.getElementById('__rec-cursor')) return;
        const c = document.createElement('div');
        c.id = '__rec-cursor';
        c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;' +
            'transform:translate(800px,450px);';
        c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.6-7.4L20 11z" ' +
            'fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
        document.documentElement.appendChild(c);
        window.addEventListener('mousemove', e => {
            c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
        }, true);
    };
    if (document.documentElement) install();
    document.addEventListener('DOMContentLoaded', install);
}

// Workshop cards: mark `count` of the first visible 5-star cards subscribed
// with a check badge like the one Steam shows signed-in users. Cards are found
// the way steam-dom.js finds them (highest single-item ancestor of an item
// link that holds the preview frame). Returns how many 4-or-fewer-star cards
// are on screen, so the star filter visibly removes something.
function mockWorkshopSubscriptions(count) {
    const LINK = 'a[href*="sharedfiles/filedetails/?id="]';
    const idOf = a => (/[?&]id=(\d+)/.exec(a.href) || [])[1];
    const cards = [];
    const seen = new Set();
    for (const link of document.querySelectorAll(LINK)) {
        const id = idOf(link);
        if (!id || seen.has(id)) continue;
        let node = link.parentElement;
        let root = null;
        while (node && node !== document.body) {
            const frame = '.aspectratio_16x9, .aspectratio_square';
            if (!node.matches(frame) && !node.querySelector(frame)) break;
            const ids = new Set([...node.querySelectorAll(LINK)].map(idOf));
            if (ids.size !== 1) break;
            root = node;
            node = node.parentElement;
        }
        if (!root) continue;
        seen.add(id);
        const r = root.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) continue;
        cards.push({ root, stars: root.querySelectorAll('svg.SVGIcon_Star_Filled').length });
    }
    const ns = 'http://www.w3.org/2000/svg';
    let marked = 0;
    for (const card of cards) {
        if (marked >= count || card.stars < 5) continue;
        // Skip every other 5-star card so the marked ones are spread out.
        if (marked === 0 && cards.indexOf(card) === 0) continue;
        if (window.getComputedStyle(card.root).position === 'static') card.root.style.position = 'relative';
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;right:10px;bottom:10px;width:24px;height:24px;border-radius:2px;' +
            'background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'SVGIcon_Check');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', 'M9.55 17.6L3.4 11.45l2.12-2.12 4.03 4.03 8.93-8.93 2.12 2.12L9.55 17.6z');
        p.setAttribute('fill', '#fff');
        svg.appendChild(p);
        badge.appendChild(svg);
        card.root.appendChild(badge);
        marked += 1;
    }
    return { marked, belowFive: cards.filter(c => c.stars < 5).length, onScreen: cards.length };
}

// Collection items: Steam's own subscribed state is the "toggled" class on the
// item's subscribe button (dark button with a check). Marks `count` 5-star
// items among the first rows.
function mockCollectionSubscriptions(count) {
    const items = [...document.querySelectorAll('.collectionItem')].slice(0, 12);
    const stars = item => {
        const img = item.querySelector('.fileRating');
        const m = img ? /(\d)-star/.exec(img.getAttribute('src')) : null;
        return m ? Number(m[1]) : 0;
    };
    let marked = 0;
    for (let i = 1; i < items.length && marked < count; i += 2) {
        if (stars(items[i]) < 5) continue;
        const btn = items[i].querySelector('a.general_btn.subscribe');
        if (btn) {
            btn.classList.add('toggled');
            marked += 1;
        }
    }
    return { marked, belowFive: items.filter(i => stars(i) < 5).length };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function center(page, selectorOrFn) {
    return page.evaluate(sel => {
        const el = sel.startsWith('fn:')
            ? new Function('return (' + sel.slice(3) + ')()')()
            : document.querySelector(sel);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, selectorOrFn);
}

async function moveTo(page, target, steps) {
    const p = await center(page, target);
    await page.mouse.move(p.x, p.y, { steps: steps || 30 });
    return p;
}

async function clickOn(page, target, steps) {
    const p = await moveTo(page, target, steps);
    await wait(250);
    await page.mouse.click(p.x, p.y);
}

async function smoothScroll(page, dy, steps) {
    const n = steps || 30;
    for (let i = 0; i < n; i++) {
        await page.mouse.wheel({ deltaY: dy / n });
        await wait(25);
    }
}

const SORT_BUTTON = 'fn:() => [...document.querySelectorAll(\'div[role="button"][tabindex]\')]' +
    '.find(x => x.querySelector(\'svg[viewBox="0 0 32 18"]\'))';
const TOP_RATED = 'fn:() => [...document.querySelectorAll(\'[role="radio"]\')]' +
    '.find(x => x.textContent.trim() === \'Top Rated All Time\')';

async function recordWorkshop(page, webm) {
    await page.goto(WORKSHOP_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.hide-subscribed-button', { timeout: 20000 });
    await wait(1500);
    await page.evaluate(() => {
        const c = document.querySelector('.wshs-injected-controls');
        window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 240);
    });
    await wait(300);
    console.log('workshop mock', JSON.stringify(await page.evaluate(mockWorkshopSubscriptions, 3)));
    const start = await center(page, '.wshs-injected-controls');
    await page.mouse.move(start.x - 300, start.y - 70);
    await wait(400);

    const recorder = await page.screencast({ path: webm });
    await wait(1200);
    // 1. Hide Subscribed: the badged cards disappear.
    await clickOn(page, '.hide-subscribed-button:not(.star-filter-button)');
    const row = await center(page, '.star-filter-button');
    await wait(1600);
    // 2. 5 Stars Only: the lower-rated cards disappear.
    await clickOn(page, '.star-filter-button');
    await wait(700);
    await moveTo(page, '.star-option[data-stars="4"]', 15);
    await wait(250);
    await clickOn(page, '.star-option[data-stars="5"]', 10);
    // The menu closes under the cursor; leave the card before Steam's hover
    // preview opens, back up to the controls row.
    await page.mouse.move(row.x, row.y - 40, { steps: 6 });
    await wait(1700);
    // 3. Steam's sort menu: Top Rated reloads the results, filters still on.
    await clickOn(page, SORT_BUTTON);
    await wait(900);
    await clickOn(page, TOP_RATED, 15);
    await wait(500);
    await page.keyboard.press('Escape');
    const sort = await center(page, SORT_BUTTON);
    await page.mouse.move(sort.x - 200, sort.y - 70, { steps: 10 });
    await page.mouse.click(sort.x - 200, sort.y - 70);
    await wait(2200);
    await recorder.stop();
}

async function recordCollection(page, webm) {
    await page.goto(COLLECTION_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.wshs-collection-controls.wshs-row-aligned', { timeout: 20000 });
    await wait(1200);
    console.log('collection mock', JSON.stringify(await page.evaluate(mockCollectionSubscriptions, 3)));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(MARGIN_X, 450);
    await wait(400);

    const recorder = await page.screencast({ path: webm });
    await wait(600);
    // Scroll down to the collection's item list and the controls.
    const target = await page.evaluate(() => {
        const c = document.querySelector('.subscribeCollection');
        return c.getBoundingClientRect().top + window.scrollY - 120;
    });
    await smoothScroll(page, target, 45);
    await wait(1000);
    // 1. Hide Subscribed: the subscribed (checked) items disappear.
    await page.mouse.move(MARGIN_X, (await center(page, '.subscribeCollection')).y, { steps: 10 });
    await clickOn(page, '.hide-subscribed-button:not(.star-filter-button)', 20);
    await wait(1600);
    // 2. 5 Stars Only: the 4-star items disappear.
    const star = await center(page, '.star-filter-button');
    await clickOn(page, '.star-filter-button', 20);
    await wait(700);
    await moveTo(page, '.star-option[data-stars="4"]', 15);
    await wait(250);
    await clickOn(page, '.star-option[data-stars="5"]', 10);
    // Leave the item list before Steam's hover preview opens.
    await page.mouse.move(star.x, star.y - 40, { steps: 6 });
    await wait(1500);
    // Out to the right margin along the button row, then down the margin.
    await page.mouse.move(MARGIN_X, star.y - 40, { steps: 20 });
    await page.mouse.move(MARGIN_X, 600, { steps: 15 });
    await smoothScroll(page, 900, 40);
    await wait(1200);
    await recorder.stop();
}

// GitHub rejects README images over 10 MB. Static stretches are dropped with
// mpdecimate (GIF frames then carry longer delays), the palette is 128
// colors and Bayer dithering compresses far better than error diffusion.
function toGif(webm, gif, crop, width, fps) {
    const filters = 'fps=' + (fps || GIF_FPS) + (crop ? ',crop=' + crop : '') + ',scale=' + width + ':-1:flags=lanczos';
    const palette = gif.replace(/\.gif$/, '-palette.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-vf',
        filters + ',palettegen=max_colors=128:stats_mode=diff', palette]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-i', palette, '-lavfi',
        filters + ',mpdecimate=hi=512:lo=256:frac=0.5 [x]; [x][1:v] ' +
        'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-vsync', 'vfr', gif]);
    fs.rmSync(palette, { force: true });
    console.log('saved ' + path.relative(process.cwd(), gif) + ' (' +
        Math.round(fs.statSync(gif).size / 1024) + ' KB)');
}

async function withBrowser(fn) {
    // Fresh profile per recording, so saved filter choices never carry over.
    const extDir = copyExtension();
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        pipe: true,
        enableExtensions: [extDir.split(path.sep).join('/')]
    });
    try {
        const page = await browser.newPage();
        await page.setViewport(VIEWPORT);
        await page.evaluateOnNewDocument(cursorOverlay);
        await fn(page);
    } finally {
        await browser.close();
        fs.rmSync(extDir, { recursive: true, force: true });
    }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    // The collection crop keeps the whole page column (header, logo, sidebar)
    // with a little margin; 10 fps keeps it under GitHub's 10 MB limit.
    const jobs = [
        ['workshop', recordWorkshop, null, 1200, GIF_FPS],
        ['collection', recordCollection, '1000:900:300:0', 1000, 10]
    ];
    const onlyAt = process.argv.indexOf('--only');
    const only = onlyAt === -1 ? null : process.argv[onlyAt + 1];
    for (const [name, fn, crop, width, fps] of jobs) {
        if (only && name !== only) continue;
        const webm = path.join(OUT, name + '.webm');
        if (!process.argv.includes('--convert-only')) await withBrowser(page => fn(page, webm));
        toGif(webm, path.join(OUT, name + '.gif'), crop, width, fps);
    }
})();
