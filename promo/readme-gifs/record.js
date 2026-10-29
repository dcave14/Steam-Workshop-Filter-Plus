// record.js
// Records the README preview GIFs with the real extension loaded, on live
// Steam pages:
//   workshop.gif       Project Zomboid browse page: Hide Subscribed removes the
//                      subscribed mods, 100+ Ratings and 5 Stars Only remove
//                      the little-rated and lower-rated ones, then Steam's sort
//                      menu (Top Rated) reloads the results with the filters on
//   saved-filters.gif  RimWorld browse page: save a keyword from the sidebar,
//                      then hide a creator from the card picker (with its
//                      2.5-second undo window)
//   collection.gif     "Genesis Mod Pack" (RimWorld, mixed 4/5-star items) in the
//                      redesigned layout: Hide Subscribed, 5 Stars Only and
//                      100+ Ratings with the shown count updating, a long scroll
//                      under the floating Back to top, then back to the sizes
//
// Usage: node record.js [--convert-only] [--only workshop|saved-filters|collection]
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

const VIEWPORT = { width: 1600, height: 900 };
const GIF_FPS = 12;

const WORKSHOP_URL = 'https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend&section=readytouseitems';
const COLLECTION_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3798004429';
const SAVED_FILTERS_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems';

// Records the exact Chrome package build.js produces (background worker, popup,
// options and content scripts), rebuilt first so it matches the sources.
function copyExtension() {
    execFileSync(process.execPath, [path.join(EXT_SRC, 'build.js')], { cwd: EXT_SRC, stdio: 'ignore' });
    const built = path.join(EXT_SRC, 'dist', 'chrome');
    // Chrome's Extensions.loadUnpacked rejects paths containing spaces.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-gif-'));
    fs.cpSync(built, dir, { recursive: true });
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
        const btn = items[i].querySelector('.subscriptionControls .general_btn, a.general_btn.subscribe');
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

// Scrolls the page itself; wheel events would scroll whatever scrollable pane
// (author list, pinned sidebar) sits under the cursor.
async function scrollPage(page, dy, steps) {
    const n = steps || 30;
    for (let i = 0; i < n; i++) {
        await page.evaluate(d => window.scrollBy(0, d), dy / n);
        await wait(25);
    }
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
const HIDE_SUBSCRIBED = '.hide-subscribed-button:not(.star-filter-button):not(.ratings-filter-button)';
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
    await clickOn(page, HIDE_SUBSCRIBED);
    const row = await center(page, '.star-filter-button');
    await wait(1600);
    // 2. 100+ Ratings: mods with few user ratings disappear.
    await clickOn(page, '.ratings-filter-button');
    await wait(700);
    await moveTo(page, '[data-ratings="50"]', 15);
    await wait(250);
    await clickOn(page, '[data-ratings="100"]', 10);
    await page.mouse.move(row.x, row.y - 40, { steps: 6 });
    await wait(1600);
    // 3. 5 Stars Only: the lower-rated cards disappear.
    await clickOn(page, '.star-filter-button');
    await wait(700);
    await moveTo(page, '.star-option[data-stars="4"]', 15);
    await wait(250);
    await clickOn(page, '.star-option[data-stars="5"]', 10);
    // The menu closes under the cursor; leave the card before Steam's hover
    // preview opens, back up to the controls row.
    await page.mouse.move(row.x, row.y - 40, { steps: 6 });
    await wait(1700);
    // 4. Steam's sort menu: Top Rated reloads the results, filters still on.
    await clickOn(page, SORT_BUTTON);
    await wait(900);
    await clickOn(page, TOP_RATED, 15);
    await wait(500);
    await page.keyboard.press('Escape');
    // Close the sort menu on plain heading text (the sidebar's search settings
    // gear sits where an offset click used to land).
    const heading = await center(page, 'fn:() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); ' +
        'while (w.nextNode()) if (/^\\s*Browsing:/.test(w.currentNode.nodeValue)) return w.currentNode.parentElement; }');
    await page.mouse.move(heading.x, heading.y, { steps: 10 });
    await page.mouse.click(heading.x, heading.y);
    await wait(2200);
    await recorder.stop();
}

async function recordCollection(page, webm) {
    await page.goto(COLLECTION_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.wshs-design-items', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('.wshs-collection-sizes')?.getAttribute('aria-busy') === 'false', { timeout: 30000 });
    // Steam's item preview pops up beside hovered rows; keep it out of the GIF.
    await page.addStyleTag({ content: '#workshop_item_hover { display: none !important; }' });
    await wait(1200);
    console.log('collection mock', JSON.stringify(await page.evaluate(mockCollectionSubscriptions, 3)));
    await page.evaluate(() => window.scrollTo(0, 0));
    // The cursor rests over the hero banner, away from rows and scrolling panes.
    const rest = await page.evaluate(() => { const r = document.querySelector('.wshs-design-hero').getBoundingClientRect(); return { x: r.left + r.width * 0.62, y: r.top + r.height * 0.55 }; });
    await page.mouse.move(rest.x, rest.y);
    await wait(400);

    const recorder = await page.screencast({ path: webm });
    // 1. The redesigned page: hero, account actions, sizes and description.
    await wait(1800);
    // 2. Down to the item count and the filter toolbar.
    const toList = await page.evaluate(() => document.querySelector('.wshs-design-browsing').getBoundingClientRect().top + window.scrollY - 90);
    await scrollPage(page, toList, 30);
    await wait(700);
    const side = await page.evaluate(() => { const r = document.querySelector('.wshs-design-sidebar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.bottom - 30, 520) }; });
    await page.mouse.move(side.x, side.y, { steps: 12 });
    // 3. Hide Subscribed: the subscribed items leave the list and the count.
    await clickOn(page, HIDE_SUBSCRIBED, 20);
    await page.mouse.move(side.x, side.y, { steps: 12 });
    await wait(1300);
    // 4. 5 Stars Only.
    await clickOn(page, '.star-filter-button', 18);
    await wait(600);
    await moveTo(page, '.star-option[data-stars="4"]', 12);
    await wait(200);
    await clickOn(page, '.star-option[data-stars="5"]', 8);
    await page.mouse.move(side.x, side.y, { steps: 12 });
    await wait(1300);
    // 5. 100+ Ratings.
    await clickOn(page, '.ratings-filter-button', 18);
    await wait(600);
    await moveTo(page, '[data-ratings="50"]', 12);
    await wait(200);
    await clickOn(page, '[data-ratings="100"]', 8);
    await page.mouse.move(side.x, side.y, { steps: 12 });
    await wait(1500);
    // 6. A long list: Back to top floats over it while scrolling.
    await scrollPage(page, 5200, 26);
    await wait(900);
    // 7. Back to top returns to the page header and the filtered size.
    await clickOn(page, '.wshs-design-back-to-top', 22);
    await wait(2400);
    await page.mouse.move(rest.x, rest.y, { steps: 12 });
    await wait(1200);
    await recorder.stop();
}

// Types into the sidebar phrase box one key at a time, so the GIF shows it.
async function typeSlowly(page, selector, text) {
    await clickOn(page, selector, 20);
    for (const ch of text) {
        await page.keyboard.type(ch);
        await wait(110);
    }
}

// Marks the visible card author at index `skip` (page order) for the cursor.
function pickAuthor(skip) {
    const links = [...document.querySelectorAll('#CommunityTemplate a[href*="/myworkshopfiles"]')]
        .filter(a => !a.closest('dialog, .wshs-saved-filters') && a.getBoundingClientRect().width > 0 &&
            a.getBoundingClientRect().top > 140 && a.getBoundingClientRect().bottom < window.innerHeight - 60);
    const a = links[skip];
    if (!a) return null;
    a.setAttribute('data-rec-author', 'true');
    return true;
}

async function recordSavedFilters(page, webm) {
    await page.goto(SAVED_FILTERS_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.wshs-sf-input', { timeout: 30000 });
    await wait(1500);
    await page.evaluate(() => {
        const c = document.querySelector('.wshs-injected-controls');
        window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 170);
    });
    await wait(300);
    const box = await center(page, '.wshs-sf-input');
    await page.mouse.move(box.x + 60, box.y - 120);
    await wait(400);

    const recorder = await page.screencast({ path: webm });
    await wait(1000);
    // 1. Save a keyword: every matching mod leaves the results.
    await typeSlowly(page, '.wshs-sf-input', 'xenotype');
    await wait(300);
    await clickOn(page, '.wshs-sf-save', 12);
    await page.mouse.move(box.x, box.y + 90, { steps: 10 });
    await wait(3200);
    // 2. Hide a creator from the card: the picker shows a 2.5 s undo window,
    //    then the creator's mods go.
    await page.evaluate(pickAuthor, 1);
    await moveTo(page, '[data-rec-author]', 35);
    await wait(700);
    await clickOn(page, '.wshs-picker [data-action="hide"]', 8);
    await wait(3300);
    // Back out to the sidebar, where both saved filters are listed.
    await page.mouse.move(box.x + 60, box.y - 80, { steps: 30 });
    await wait(2000);
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
    // The collection uses the full-width layout; 1000px at 10 fps keeps it
    // under GitHub's 10 MB limit.
    const jobs = [
        ['workshop', recordWorkshop, null, 1200, GIF_FPS],
        ['saved-filters', recordSavedFilters, null, 1200, GIF_FPS],
        ['collection', recordCollection, null, 1000, 10]
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
