// saved-filters-test.js
// End-to-end check of the saved keyword/author filters on the live RimWorld
// Workshop browse page, with the real extension in headless Chrome.
//
// Usage: node tests/saved-filters-test.js [--chrome <path>] [--out <dir>]
// Needs the Puppeteer install in ../perf (cd perf && npm install).
// Writes screenshots to tests/out/ (or --out) and exits 1 on any failure.
//
// Result counts come from live Steam, which drifts by a few items a minute,
// so counts are compared to a reference within COUNT_TOLERANCE.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('../perf/node_modules/puppeteer-core');

const args = process.argv.slice(2);
const arg = (name, def) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? def : args[i + 1];
};

const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const OUT = path.resolve(arg('out', path.join(__dirname, 'out')));
const EXT_SRC = path.resolve(__dirname, '..');
const BASE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems&days=7';
const PHRASE = 'vanilla';
const COUNT_TOLERANCE = 0.01;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function copyExtension() {
    // Chrome's Extensions.loadUnpacked rejects paths containing spaces.
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_SRC, 'manifest.json'), 'utf8'));
    const files = new Set(['manifest.json', ...Object.values(manifest.icons || {})]);
    for (const script of manifest.content_scripts) {
        for (const f of [...(script.js || []), ...(script.css || [])]) files.add(f);
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-sf-'));
    for (const f of files) fs.copyFileSync(path.join(EXT_SRC, f), path.join(dir, f));
    return dir.split(path.sep).join('/');
}

async function count(page) {
    return page.evaluate(() => {
        const m = document.body.innerText.match(/([\d,]+) entries matching/);
        return m ? Number(m[1].replace(/,/g, '')) : null;
    });
}

function near(actual, expected) {
    return actual !== null && expected && Math.abs(actual - expected) <= expected * COUNT_TOLERANCE;
}

async function fetchedCount(page) {
    return page.evaluate(() => Number(document.documentElement.getAttribute('data-wshs-fetched') || 0));
}

// Waits for the hook to report a rewritten Browse response, then for the
// result count to settle.
async function waitForRefetch(page, before, label) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && (await fetchedCount(page)) <= before) await wait(200);
    const arrived = (await fetchedCount(page)) > before;
    let last = await count(page);
    for (let i = 0; i < 10; i++) {
        await wait(500);
        const now = await count(page);
        if (now === last) break;
        last = now;
    }
    if (!arrived) console.log('  note: no rewritten request seen for ' + label);
    return arrived;
}

async function openBrowse(page, url) {
    await page.goto(url || BASE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.hide-subscribed-button', { timeout: 30000 });
}

async function referenceCount(page, searchtext) {
    await page.goto(BASE_URL + '&searchtext=' + encodeURIComponent(searchtext), { waitUntil: 'load', timeout: 60000 });
    await wait(2500);
    return count(page);
}

async function searchBoxState(page) {
    return page.evaluate(() => {
        const input = [...document.querySelectorAll('#CommunityTemplate form input')]
            .find(i => /^(text|search)$/i.test(i.getAttribute('type') || 'text') && !i.closest('.wshs-saved-filters'));
        const blankChip = [...document.querySelectorAll('#CommunityTemplate *')].some(el =>
            el.offsetParent !== null && el.children.length === 0 && /"\s*"$/.test(el.textContent.trim()) &&
            el.textContent.trim().length < 60 && !el.closest('.wshs-saved-filters'));
        return { value: input ? input.value : null, url: location.href, blankChip };
    });
}

async function rowCount(page) {
    return page.evaluate(() => document.querySelectorAll('.wshs-sf-list > *').length);
}

async function shot(page, name) {
    const top = await page.evaluate(() => {
        const c = document.querySelector('.wshs-injected-controls');
        return c ? c.getBoundingClientRect().top + window.scrollY - 70 : 0;
    });
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: Math.max(0, top), width: 1600, height: 700 } });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        pipe: true,
        enableExtensions: [copyExtension()]
    });
    const errors = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {
            if (m.type() === 'error' && /#418|hydrat|WSHS|saved-filters|search-terms-hook/i.test(m.text())) errors.push(m.text());
        });

        // References straight from Steam, before any filter is saved.
        const refBase = await referenceCount(page, '');
        const refHide = await referenceCount(page, '-"' + PHRASE + '"');
        const refOnly = await referenceCount(page, '"' + PHRASE + '"');
        console.log('references: base=' + refBase + ' hide=' + refHide + ' only=' + refOnly);

        // 1. Section appears and starts empty.
        await openBrowse(page);
        const section = await page.waitForSelector('.wshs-saved-filters', { timeout: 15000 }).catch(() => null);
        check('sidebar section injected', section);
        check('section starts empty', (await rowCount(page)) === 0);
        const sectionAboveCategories = await page.evaluate(() => {
            const s = document.querySelector('.wshs-saved-filters');
            const next = s && s.nextElementSibling;
            return !!(next && next.querySelector('[role="button"] > svg[viewBox="0 0 14 14"]'));
        });
        check('section sits directly above Categories', sectionAboveCategories);

        // 2. Adding a phrase hides matches through Steam's search.
        const sortLabel = () => page.evaluate(() => {
            const b = [...document.querySelectorAll('div[role="button"][tabindex]')]
                .find(x => x.querySelector('svg[viewBox="0 0 32 18"]'));
            return b ? b.textContent.trim() : null;
        });
        const sortBefore = await sortLabel();
        let before = await fetchedCount(page);
        await page.type('.wshs-sf-input', PHRASE);
        await page.click('.wshs-sf-save');
        await waitForRefetch(page, before, 'add phrase');
        let n = await count(page);
        check('added phrase hides matches', near(n, refHide), 'count=' + n + ' expected~' + refHide);
        check('new row is in "-" state', (await rowCount(page)) === 1);
        let box = await searchBoxState(page);
        check('search box shows no filter text', box.value !== null && box.value.trim() === '', JSON.stringify(box.value));
        check('address bar has no filter text', !/searchtext=[^&]*vanilla/i.test(box.url), box.url);
        check('no blank "Results for" chip', !box.blankChip);
        const sortAfter = await sortLabel();
        check('sort order unchanged by the refetch', sortAfter === sortBefore, sortBefore + ' -> ' + sortAfter);
        await shot(page, 'sf-1-hide');

        // 3. "+" switches the row to show-only.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(1)');
        await waitForRefetch(page, before, 'plus');
        n = await count(page);
        check('"+" shows only matches', near(n, refOnly), 'count=' + n + ' expected~' + refOnly);

        // 4. Turning "+" off again leaves the filter saved but inactive.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(1)'); // + off
        await waitForRefetch(page, before, 'plus off');
        n = await count(page);
        check('turning "+" off restores all results', near(n, refBase), 'count=' + n + ' expected~' + refBase);

        // 5. Persistence and the first-load refetch.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(2)'); // - on
        await waitForRefetch(page, before, 'minus');
        await openBrowse(page);
        await page.waitForSelector('.wshs-sf-list > *', { timeout: 15000 }).catch(() => null);
        await waitForRefetch(page, 0, 'first load');
        n = await count(page);
        check('filter survives reload and applies on first load', near(n, refHide), 'count=' + n + ' expected~' + refHide);
        box = await searchBoxState(page);
        check('search box still clean after reload', box.value !== null && box.value.trim() === '' && !box.blankChip, JSON.stringify(box.value));

        // 6. Delete removes the row and the filter.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-delete');
        await waitForRefetch(page, before, 'delete');
        n = await count(page);
        check('delete removes the row', (await rowCount(page)) === 0);
        check('delete restores all results', near(n, refBase), 'count=' + n + ' expected~' + refBase);

        // 7. Author picker: hover shows [+][-] beside the name.
        const author = await page.evaluate(() => {
            const link = document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]');
            const href = link.getAttribute('href');
            const m = /\/(id|profiles)\/([^/?#]+)/.exec(href);
            return { href, key: (m[1] + '/' + m[2]).toLowerCase(), name: link.textContent.trim() };
        });
        const authorLink = await page.$('#CommunityTemplate a[href="' + author.href + '"]');
        await authorLink.hover();
        await wait(300);
        const picker = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return p && getComputedStyle(p).display !== 'none'
                ? { buttons: p.querySelectorAll('.wshs-sq').length, hint: p.textContent } : null;
        });
        check('author hover shows [+][-]', picker && picker.buttons === 2, JSON.stringify(picker));
        check('author hint reads "Show only / hide"', picker && picker.hint === 'Show only / hide');
        await shot(page, 'sf-2-author-hover');

        // 8. "-" on the author hides their cards and becomes a check.
        await page.click('.wshs-picker .wshs-sq[data-action="hide"]');
        await wait(400);
        const afterHide = await page.evaluate(href => {
            const links = [...document.querySelectorAll('#CommunityTemplate a[href="' + href + '"]')];
            const visible = links.filter(l => l.offsetParent !== null).length;
            const p = document.querySelector('.wshs-picker');
            return { total: links.length, visible, hint: p ? p.textContent : '' };
        }, author.href);
        check('author "-" hides their cards', afterHide.total > 0 && afterHide.visible === 0, JSON.stringify(afterHide));
        check('picker turns into a check', afterHide.hint === 'Hidden, click to undo', afterHide.hint);
        const authorRow = await page.evaluate(() => [...document.querySelectorAll('.wshs-sf-label')].map(l => l.textContent));
        check('author row added to the sidebar', authorRow.some(t => t.startsWith('By ')), JSON.stringify(authorRow));
        await shot(page, 'sf-3-author-hidden');
        await wait(1000);
        const pickerGone = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return !p || getComputedStyle(p).display === 'none';
        });
        check('picker closes after its card is hidden', pickerGone);

        // 9. Title text selection by a real mouse drag: selects, does not navigate.
        await page.mouse.move(5, 5);
        await wait(400);
        const titleBox = await page.evaluate(() => {
            const link = [...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')]
                .find(a => !a.querySelector('img') && a.offsetParent !== null && a.textContent.trim().length > 6);
            const r = link.getBoundingClientRect();
            return { x: r.left, y: r.top + r.height / 2, w: Math.min(r.width, 120) };
        });
        const urlBefore = page.url();
        await page.mouse.move(titleBox.x + 1, titleBox.y);
        await page.mouse.down();
        await page.mouse.move(titleBox.x + titleBox.w / 2, titleBox.y, { steps: 5 });
        await page.mouse.move(titleBox.x + titleBox.w, titleBox.y, { steps: 5 });
        await page.mouse.up();
        await wait(600);
        const sel = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return {
                text: window.getSelection().toString(),
                picker: p && getComputedStyle(p).display !== 'none' ? p.querySelectorAll('.wshs-sq').length : 0
            };
        });
        check('dragging over a title selects text', sel.text.trim().length > 0, JSON.stringify(sel.text));
        check('dragging over a title does not open the item', page.url() === urlBefore, page.url());
        check('title selection shows [+][-]', sel.picker === 2, 'buttons=' + sel.picker);
        await shot(page, 'sf-4-title-select');

        check('no page errors from the extension or hydration', errors.length === 0, errors.slice(0, 3).join(' | '));
    } catch (error) {
        check('test ran to completion', false, error && error.stack ? error.stack.split('\n').slice(0, 3).join(' ') : String(error));
    } finally {
        await browser.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed. Screenshots: ' + OUT);
    process.exit(failed ? 1 : 0);
})();
