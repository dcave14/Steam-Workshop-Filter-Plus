// capture.js
// Captures real Steam pages with the extension loaded, for the store
// screenshots and promo tiles (compose.js frames them).
//
// Usage: node capture.js   (writes PNGs to ../out/store-assets/raw/)
//
// The extension is copied from the files manifest.json lists (the same set
// build.js packages), through ../../tests/browser-helpers.js.
//
// Logged-out capture: "Hide Subscribed" can be toggled but has nothing to
// hide without a Steam session, so the shots show saved filters, the rating
// menus and the collection sizes instead of hidden items.

const fs = require('fs');
const path = require('path');
const { launch, closeBrowser, wait, clickTitleWord, setWordMode } = require('../../tests/browser-helpers');

const OUT = path.resolve(__dirname, '..', 'out', 'store-assets', 'raw');

const BROWSE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems';
// An English RimWorld collection, so the store shots read clearly.
const COLLECTION_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3811511129';

// Shots are taken at 2x so compose.js can scale them into a frame crisply.
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 };

const GRID_AUTHOR = '#CommunityTemplate a[href*="/myworkshopfiles"]';

async function scrollTo(page, selector, topOffset) {
    await page.evaluate((sel, offset) => {
        const el = document.querySelector(sel);
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
    }, selector, topOffset);
    await page.mouse.move(2, 2);
    await wait(500);
}

async function shot(page, name) {
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file, captureBeyondViewport: false });
    console.log('saved ' + path.relative(process.cwd(), file));
}

async function addKeyword(page, phrase) {
    await page.click('.wshs-sf-input');
    await page.type('.wshs-sf-input', phrase, { delay: 20 });
    await page.click('.wshs-sf-save');
    await wait(2500);
}

async function choose(page, button, option) {
    await page.$eval(button, b => b.click());
    await page.$eval(option, o => o.click());
    await wait(600);
}

// Nth visible grid author whose card is on screen and not filtered out.
async function authorHandle(page, nth) {
    const links = await page.$$(GRID_AUTHOR);
    const visible = [];
    for (const link of links) {
        const ok = await link.evaluate(a => {
            if (a.closest('dialog, .wshs-saved-filters')) return false;
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.top > 120 && r.bottom < window.innerHeight - 40;
        });
        if (ok) visible.push(link);
    }
    return visible[nth];
}

async function captureBrowse(page) {
    await page.goto(BROWSE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.wshs-sf-input', { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await wait(1500);
    await scrollTo(page, '.wshs-injected-controls', 110);
    await shot(page, 'browse');

    // Saved filters: a hidden keyword and a hidden author in the sidebar,
    // then the card picker open on another author.
    await addKeyword(page, 'xenotype');
    const blocked = await authorHandle(page, 2);
    await blocked.hover();
    await wait(400);
    await page.click('.wshs-picker [data-action="hide"]');
    await wait(3200);
    await scrollTo(page, '.wshs-injected-controls', 110);
    const next = await authorHandle(page, 1);
    await next.hover();
    await wait(500);
    await shot(page, 'browse-saved');

    // Clickable title words: pick one word in a title.
    await setWordMode(page, true);
    await page.mouse.move(2, 2);
    await wait(300);
    let picked = false;
    for (let i = 0; i < 12 && !picked; i++) {
        const sel = await page.evaluate(i => {
            const links = [...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')]
                .filter(a => !a.closest('dialog') && a.firstChild && a.firstChild.nodeType === Node.TEXT_NODE &&
                    /\s/.test(a.textContent.trim()) && a.getBoundingClientRect().top > 200 &&
                    a.getBoundingClientRect().bottom < window.innerHeight - 60);
            const a = links[i];
            if (!a) return null;
            a.setAttribute('data-capture-title', 'true');
            return '[data-capture-title="true"]';
        }, i + 2);
        if (!sel) break;
        await clickTitleWord(page, sel, 0);
        await wait(500);
        picked = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return !!p && getComputedStyle(p).display !== 'none';
        });
        if (!picked) await page.evaluate(() => document.querySelector('[data-capture-title]')?.removeAttribute('data-capture-title'));
    }
    await shot(page, 'browse-word');
    await setWordMode(page, false).catch(() => {});
    await page.keyboard.press('Escape');

    // Ratings and stars: a 25+ rating threshold, Hide Subscribed on, the
    // star menu open on 4+.
    await page.$$eval('.wshs-sf-delete', es => es.forEach(e => e.click()));
    await wait(2500);
    await scrollTo(page, '.wshs-injected-controls', 110);
    await page.evaluate(() => document.querySelector('.hide-subscribed-button:not(.star-filter-button):not(.ratings-filter-button)').click());
    await choose(page, '.ratings-filter-button', '[data-ratings="25"]');
    await page.evaluate(() => document.querySelector('.star-filter-button').click());
    await page.hover('.star-option[data-stars="4"]');
    await wait(400);
    await shot(page, 'browse-star-menu');
    await page.evaluate(() => document.querySelector('.star-option[data-stars="4"]').click());
    await wait(800);
    await page.mouse.move(2, 2);
    await shot(page, 'browse-filtered');

    // Reset stored choices so the collection shots start clean.
    await page.evaluate(() => document.querySelector('.hide-subscribed-button:not(.star-filter-button):not(.ratings-filter-button)').click());
    await choose(page, '.ratings-filter-button', '[data-ratings="0"]');
    await choose(page, '.star-filter-button', '.star-option[data-stars="0"]');
}

async function captureCollection(page) {
    await page.goto(COLLECTION_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.wshs-collection-sizes', { timeout: 30000 });
    // Steam's item preview pops up beside any hovered row; keep it out of the shots.
    await page.addStyleTag({ content: '#workshop_item_hover { display: none !important; }' });
    await page.waitForFunction(() => document.querySelector('.wshs-collection-sizes')?.getAttribute('aria-busy') === 'false', { timeout: 30000 });
    await wait(1000);
    await scrollTo(page, '.wshs-collection-summary', 120);
    await shot(page, 'collection');

    // Stars and a rating threshold: After filters drops below Total.
    await choose(page, '.ratings-filter-button', '[data-ratings="100"]');
    await choose(page, '.star-filter-button', '.star-option[data-stars="5"]');
    await scrollTo(page, '.wshs-collection-summary', 120);
    await shot(page, 'collection-sizes');

    // Saved filters on the collection, with the picker on a creator.
    await addKeyword(page, 'retexture');
    await scrollTo(page, '.wshs-collection-summary', 120);
    const author = await page.$$('.collectionItem:not(.wshs-filtered):not(.wshs-ratings-filtered) .workshopItemAuthorName a');
    for (const a of author) {
        const ok = await a.evaluate(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.top > 380 && r.bottom < window.innerHeight - 80;
        });
        if (ok) { await a.hover(); break; }
    }
    await wait(500);
    await shot(page, 'collection-saved');

    await page.$$eval('.wshs-sf-delete', es => es.forEach(e => e.click()));
    await choose(page, '.ratings-filter-button', '[data-ratings="0"]');
    await choose(page, '.star-filter-button', '.star-option[data-stars="0"]');
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport(VIEWPORT);
        if (!only || only === 'browse') await captureBrowse(page);
        if (!only || only === 'collection') await captureCollection(page);
    } finally {
        await closeBrowser(browser);
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
