// capture.js
// Captures real Steam pages with the extension loaded, for the Chrome Web
// Store screenshots and promo tiles (compose.js frames them).
//
// Usage: node capture.js   (writes PNGs to ../out/store-assets/raw/)
//
// Logged-out capture: "Hide Subscribed" can be toggled but has nothing to
// hide without a Steam session, so the shots show the star filter, the sort
// menu and the collection page instead of hidden items.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('../../perf/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EXT_SRC = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'out', 'store-assets', 'raw');
const EXT_FILES = ['manifest.json', 'steam-dom.js', 'content.js', 'collection-row-align.js',
    'hydration-signal.js', 'sort-popover-fit.js', 'styles.css', 'Steam-Workshop-Filter-Plus-Icon.png',
    'saved-filters.js', 'saved-filters.css', 'search-terms-hook.js'];

const BROWSE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems';
// An English RimWorld collection, so the store shots read clearly.
const COLLECTION_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3811511129';

// Shots are taken at 2x so compose.js can scale them into a frame crisply.
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 };

function copyExtension() {
    // Chrome's Extensions.loadUnpacked rejects paths containing spaces.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-store-'));
    for (const file of EXT_FILES) fs.copyFileSync(path.join(EXT_SRC, file), path.join(dir, file));
    return dir;
}

const sortButton = () => [...document.querySelectorAll('div[role="button"][tabindex]')]
    .find(x => x.querySelector('svg[viewBox="0 0 32 18"]'));

async function scrollControlsTo(page, topOffset) {
    await page.evaluate((findSrc, offset) => {
        const controls = document.querySelector('.wshs-injected-controls');
        window.scrollTo(0, controls.getBoundingClientRect().top + window.scrollY - offset);
    }, sortButton.toString(), topOffset);
    await page.mouse.move(2, 2);
    await new Promise(r => setTimeout(r, 400));
}

async function shot(page, name) {
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file, captureBeyondViewport: false });
    console.log('saved ' + path.relative(process.cwd(), file));
}

async function setStars(page, stars) {
    await page.evaluate(n => {
        document.querySelector('.star-filter-button').click();
        document.querySelector('.star-option[data-stars="' + n + '"]').click();
    }, stars);
    await new Promise(r => setTimeout(r, 500));
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
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

        // Browse page: controls in place, then each control in use.
        await page.goto(BROWSE_URL, { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.hide-subscribed-button', { timeout: 20000 });
        await new Promise(r => setTimeout(r, 1500));
        await scrollControlsTo(page, 120);
        await shot(page, 'browse');

        await page.evaluate(() => document.querySelector('.star-filter-button').click());
        await page.hover('.star-option[data-stars="4"]');
        await new Promise(r => setTimeout(r, 300));
        await shot(page, 'browse-star-menu');
        await page.evaluate(() => document.querySelector('.star-option[data-stars="4"]').click());
        await new Promise(r => setTimeout(r, 500));

        await page.evaluate(() => document.querySelector('.hide-subscribed-button:not(.star-filter-button)').click());
        await scrollControlsTo(page, 120);
        await shot(page, 'browse-filtered');

        await page.evaluate(new Function('(' + sortButton.toString() + ')().click()'));
        await new Promise(r => setTimeout(r, 700));
        await page.mouse.move(2, 2);
        await shot(page, 'browse-sort-menu');
        await page.keyboard.press('Escape');

        // Reset stored filters so the collection shots start clean.
        await page.evaluate(() => document.querySelector('.hide-subscribed-button:not(.star-filter-button)').click());
        await setStars(page, 0);

        // Collection page: the controls joined to Steam's own button row.
        await page.goto(COLLECTION_URL, { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.wshs-collection-controls.wshs-row-aligned', { timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));
        await scrollControlsTo(page, 260);
        await shot(page, 'collection');

        await page.evaluate(() => document.querySelector('.star-filter-button').click());
        await page.hover('.star-option[data-stars="5"]');
        await new Promise(r => setTimeout(r, 300));
        await shot(page, 'collection-star-menu');
        await setStars(page, 0);
    } finally {
        await browser.close();
        fs.rmSync(extDir, { recursive: true, force: true });
    }
})();
