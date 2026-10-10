// perf-test.js
// Performance test for the extension on live Steam pages, run in headless
// Chrome with Puppeteer. Each scenario is measured with no extension, with
// the current extension, and (browse page only) with the pre-hydration-signal
// gate, so the extension's own cost is the difference between the columns.
//
// Usage: node perf-test.js [--runs 5] [--only browse|collection] [--chrome <path>]
//
// The extension is copied to a temp folder first: Chrome's
// Extensions.loadUnpacked rejects paths containing spaces, and the copy lets
// the "old gate" variant drop hydration-signal.js from its manifest.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const args = process.argv.slice(2);
function arg(name, def) {
    const i = args.indexOf('--' + name);
    return i === -1 ? def : args[i + 1];
}

const RUNS = Number(arg('runs', 5));
const ONLY = arg('only', null); // 'browse' or 'collection'
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const EXT_SRC = path.resolve(__dirname, '..');
const IDLE_MS = 5000;

const BROWSE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems';
// RimWorld collection with ~860 items: the large-list stress case.
const COLLECTION_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3808371772';

const EXT_FILES = ['manifest.json', 'steam-dom.js', 'content.js', 'collection-row-align.js',
    'hydration-signal.js', 'sort-popover-fit.js', 'styles.css', 'Steam-Workshop-Filter-Plus-Icon.png',
    'saved-filters.js', 'saved-filters.css', 'search-terms-hook.js'];

function copyExtension(variant) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-perf-'));
    for (const file of EXT_FILES) {
        const from = path.join(EXT_SRC, file);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, file));
    }
    if (variant === 'old-gate') {
        const manifestPath = path.join(dir, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.content_scripts = manifest.content_scripts.filter(
            entry => !entry.js.includes('hydration-signal.js'));
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
    }
    return dir.split(path.sep).join('/');
}

// Runs in the page before any page script: records when our buttons first
// appear and collects long tasks (>50ms main-thread blocks).
function pageProbe() {
    window.__perf = { buttonsAt: null, longTasks: [] };
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration);
        }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* unsupported */ }
    const check = () => {
        if (window.__perf.buttonsAt === null && document.querySelector('.hide-subscribed-button')) {
            window.__perf.buttonsAt = performance.now();
        }
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
}

// Click an element and time the main-thread cost: the click handlers plus
// the style/layout they cause (forced with offsetHeight), plus any work the
// extension deferred to the next animation frame. Frame-to-frame timing is
// not used because it rounds everything to 16.7ms steps.
async function timeClick(page, selector) {
    return page.evaluate(async sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const t0 = performance.now();
        el.click();
        void document.body.offsetHeight;
        const sync = performance.now() - t0;
        // Our deferred pass is queued as a rAF callback before this one, so
        // the time from frame start to this callback covers it.
        const deferred = await new Promise(r => requestAnimationFrame(frameStart => {
            void document.body.offsetHeight;
            r(Math.max(0, performance.now() - frameStart));
        }));
        return sync + deferred;
    }, selector);
}

async function measure(variant, url, withInteraction) {
    const launch = {
        executablePath: CHROME,
        headless: true,
        pipe: true,
        args: ['--window-size=1400,900']
    };
    const extDir = variant !== 'none' ? copyExtension(variant) : null;
    if (extDir) launch.enableExtensions = [extDir];
    const browser = await puppeteer.launch(launch);
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        let reactErrors = 0;
        page.on('console', m => {
            if (m.type() === 'error' && /Minified React error #4(18|19|21|23)/.test(m.text())) reactErrors++;
        });
        page.on('pageerror', e => {
            if (/Minified React error #4(18|19|21|23)/.test(String(e.message))) reactErrors++;
        });
        await page.evaluateOnNewDocument(pageProbe);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        if (variant !== 'none') {
            await page.waitForSelector('.hide-subscribed-button', { timeout: 20000 }).catch(() => {});
        }
        // Let late work (fonts, retries, geometry sync) finish before sampling.
        await new Promise(r => setTimeout(r, 1500));

        const nav = await page.evaluate(() => {
            const n = performance.getEntriesByType('navigation')[0];
            return {
                dcl: n.domContentLoadedEventEnd,
                load: n.loadEventEnd,
                buttonsAt: window.__perf.buttonsAt,
                longTasks: window.__perf.longTasks.slice(),
                items: document.querySelectorAll('a[href*="filedetails/?id="]').length,
                url: location.href,
                title: document.title
            };
        });
        const loaded = await page.metrics();

        // Idle cost: what the page (and our observers) burn while nobody
        // touches it.
        await new Promise(r => setTimeout(r, IDLE_MS));
        const idle = await page.metrics();

        const result = {
            buttonsMs: nav.buttonsAt,
            dclMs: nav.dcl,
            loadMs: nav.load,
            scriptMs: loaded.ScriptDuration * 1000,
            taskMs: loaded.TaskDuration * 1000,
            layouts: loaded.LayoutCount,
            styleRecalcs: loaded.RecalcStyleCount,
            heapMB: loaded.JSHeapUsedSize / 1048576,
            longTasks: nav.longTasks.length,
            longTaskMs: nav.longTasks.reduce((a, b) => a + b, 0),
            idleTaskMs: (idle.TaskDuration - loaded.TaskDuration) * 1000,
            reactErrors,
            items: nav.items,
            url: nav.url,
            title: nav.title
        };
        // Kept so an off-target run (redirect, throttle page, layout test)
        // can be inspected after it is dropped from the medians.
        result.html = await page.content();

        if (withInteraction && variant !== 'none') {
            // Star filter: open the dropdown, pick 4+, then back to Show All.
            await timeClick(page, '.star-filter-button');
            result.star4Ms = await timeClick(page, '.star-option[data-stars="4"]');
            const hiddenAfter = await page.evaluate(() => document.querySelectorAll('.hidden-item').length);
            result.hiddenByStar = hiddenAfter;
            await timeClick(page, '.star-filter-button');
            result.starResetMs = await timeClick(page, '.star-option[data-stars="0"]');
            result.hideToggleMs = await timeClick(page, '.hide-subscribed-button:not(.star-filter-button)');
            await timeClick(page, '.hide-subscribed-button:not(.star-filter-button)');
        }
        return result;
    } finally {
        await browser.close();
        if (extDir) fs.rmSync(extDir, { recursive: true, force: true });
    }
}

function median(values) {
    const v = values.filter(x => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function fmt(x, digits) {
    if (x === null || x === undefined) return '-';
    return x.toFixed(digits === undefined ? 0 : digits);
}

const ROWS = [
    ['buttonsMs', 'buttons visible (ms)', 0],
    ['dclMs', 'DOMContentLoaded (ms)', 0],
    ['loadMs', 'load event (ms)', 0],
    ['scriptMs', 'script time (ms)', 0],
    ['taskMs', 'main-thread task time (ms)', 0],
    ['layouts', 'layout count', 0],
    ['styleRecalcs', 'style recalc count', 0],
    ['heapMB', 'JS heap (MB)', 1],
    ['longTasks', 'long tasks (>50ms)', 0],
    ['longTaskMs', 'long task total (ms)', 0],
    ['idleTaskMs', 'idle task time over 5s (ms)', 1],
    ['reactErrors', 'React hydration errors', 0],
    ['items', 'item links on page', 0],
    ['star4Ms', 'star filter 4+ click (ms)', 1],
    ['hiddenByStar', 'items hidden by 4+', 0],
    ['starResetMs', 'star filter reset click (ms)', 1],
    ['hideToggleMs', 'hide subscribed click (ms)', 1]
];

// Steam sometimes answers a run with a different page (a redirect or a
// throttle page). Those runs measure the wrong thing, so any run whose item
// link count differs from the scenario's most common count is dropped and its
// HTML is saved next to this script.
function dropOffTarget(title, variants, results) {
    const counts = {};
    for (const v of variants) for (const r of results[v]) counts[r.items] = (counts[r.items] || 0) + 1;
    const expected = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
    for (const v of variants) {
        results[v] = results[v].filter((r, i) => {
            if (r.items === expected) return true;
            const file = path.join(__dirname, 'off-target-' + title.replace(/\W+/g, '-').toLowerCase() +
                '-' + v + '-' + i + '.html');
            fs.writeFileSync(file, r.html);
            console.log('dropped ' + v + ' run ' + (i + 1) + ': got "' + r.title + '" (' + r.items +
                ' item links, expected ' + expected + ') ' + r.url + ' -> ' + path.basename(file));
            return false;
        });
    }
    for (const v of variants) for (const r of results[v]) delete r.html;
}

function report(title, variants, results) {
    const kept = variants.map(v => results[v].length).join('/');
    console.log('\n' + title + ' (median; runs kept per variant: ' + kept + ')');
    const width = 30;
    console.log(''.padEnd(width) + variants.map(v => v.padStart(12)).join(''));
    for (const [key, label, digits] of ROWS) {
        const cells = variants.map(v => median(results[v].map(r => r[key])));
        if (cells.every(c => c === null)) continue;
        console.log(label.padEnd(width) + cells.map(c => fmt(c, digits).padStart(12)).join(''));
    }
}

async function scenario(title, url, variants, withInteraction) {
    const results = {};
    for (const v of variants) results[v] = [];
    // Interleave variants so network and cache drift hit them equally.
    for (let run = 0; run < RUNS; run++) {
        for (const v of variants) {
            process.stdout.write('.');
            try {
                results[v].push(await measure(v, url, withInteraction));
            } catch (error) {
                console.log('\n' + v + ' run ' + (run + 1) + ' failed: ' + error.message);
            }
        }
    }
    process.stdout.write('\n');
    dropOffTarget(title, variants, results);
    report(title, variants, results);
    return results;
}

(async () => {
    console.log('Chrome: ' + CHROME);
    console.log('Runs per variant: ' + RUNS);
    const all = {};
    if (!ONLY || ONLY === 'browse') all.browse = await scenario('Workshop browse page', BROWSE_URL, ['none', 'extension', 'old-gate'], true);
    if (!ONLY || ONLY === 'collection') all.collection = await scenario('Collection page (large)', COLLECTION_URL, ['none', 'extension'], true);
    const out = path.join(__dirname, 'results.json');
    fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), runs: RUNS, results: all }, null, 2));
    console.log('\nRaw results: ' + out);
})();
