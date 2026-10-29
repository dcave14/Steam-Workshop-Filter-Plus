const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('../perf/node_modules/puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&days=7';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(chrome, options = {}) {
    const { useConfiguredService = false, presentationPreferences, sourceOverlay, ...launchOptions } = options;
    const firefox = chrome === 'firefox';
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, firefox ? 'dist/firefox/manifest.json' : 'manifest.json'), 'utf8'));
    const files = new Set(['manifest.json', ...Object.values(manifest.icons || {})]);
    if (manifest.background && manifest.background.service_worker) files.add(manifest.background.service_worker);
    for (const file of manifest.background && manifest.background.scripts || []) files.add(file);
    if (manifest.options_ui) ['options.html', 'options.js', 'options.css', 'api-config.js', 'api-data.js'].forEach(file => files.add(file));
    if (manifest.action && manifest.action.default_popup) ['popup.html', 'popup.js', 'popup.css'].forEach(file => files.add(file));
    for (const script of manifest.content_scripts) {
        for (const file of [...(script.js || []), ...(script.css || [])]) files.add(file);
    }
    const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-test-'));
    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(extension, file)), { recursive: true });
        const overlay = sourceOverlay && path.join(sourceOverlay, file);
        fs.copyFileSync(overlay && fs.existsSync(overlay) ? overlay : path.join(ROOT, file), path.join(extension, file));
    }
    // Fixture suites must not depend on or consume the deployed shared service.
    if (!useConfiguredService && files.has('api-config.js')) fs.writeFileSync(path.join(extension,'api-config.js'),"globalThis.WSHS_API_CONFIG = { serviceUrl: '' };\n");
    // Firefox BiDi cannot open moz-extension popups. Seed only presentation
    // preferences in this disposable test copy; no production test bridge.
    if (presentationPreferences) {
        const allowed = {sidebarPosition:['left','right'],collectionOverhaul:[true,false], pinnedSidebar:[true,false], pinnedWorkshopBar:[true,false], pinnedCollections:[true,false], layoutDensity: ['comfortable', 'compact'], reduceMotion: [true, false], disableCardHover: [true, false], pauseHomepageCarousels: [true, false], freezeAnimatedPreviews: [true, false]};
        for (const [key, value] of Object.entries(presentationPreferences)) {
            if (!allowed[key]?.includes(value)) throw Error('Invalid presentation test preference: '+key);
        }
        const bootstrap = 'test-presentation-preferences.js';
        fs.writeFileSync(path.join(extension, bootstrap), 'chrome.storage.local.set('+JSON.stringify(presentationPreferences)+');');
        manifest.content_scripts.find(script => script.js && script.world !== 'MAIN').js.unshift(bootstrap);
        fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    }
    if (firefox) {
        fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
        const browser = await puppeteer.launch({browser:'firefox', executablePath:'C:/Program Files/Mozilla Firefox/firefox.exe', headless:true, protocolTimeout:30000, enableExtensions:true});
        await browser.installExtension(extension);
        return lowerPriority(browser);
    }
    const browser = await puppeteer.launch({
        executablePath: chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
        pipe: true,
        protocolTimeout: 30000,
        enableExtensions: true,
        ...launchOptions
    });
    // Puppeteer 25.12 nests its enableExtensions promises instead of awaiting
    // each install. Explicit installation waits for background/options readiness.
    await browser.installExtension(extension);
    return lowerPriority(browser);
}

function lowerPriority(browser) {
    try { os.setPriority(browser.process().pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {}
    return browser;
}

async function closeBrowser(browser) {
    // Some Windows Chromium builds leave the pipe open during graceful exit.
    // Bound shutdown and terminate only the process this test launched.
    let timer;
    const deadline=new Promise(resolve=>{
        timer=setTimeout(async()=>{
            browser.process()?.kill();
            await browser.disconnect();
            resolve();
        },5000);
    });
    try {await Promise.race([browser.close(),deadline]);} finally {clearTimeout(timer);}
}

// Evaluate in the real content-script world, where chrome.storage is available.
async function extensionWorld(page) {
    const session = await page.createCDPSession();
    const contexts = new Map();
    session.on('Runtime.executionContextCreated', ({ context }) => contexts.set(context.id, context));
    session.on('Runtime.executionContextDestroyed', ({ executionContextId }) => contexts.delete(executionContextId));
    session.on('Runtime.executionContextsCleared', () => contexts.clear());
    await session.send('Runtime.enable');
    return async expression => {
        // Chrome can retain named worlds from disabled development copies.
        // Select a live extension world, rather than trusting its shared name.
        let context;
        for (const candidate of [...contexts.values()].reverse().filter(c => c.name === 'Steam Workshop Filter Plus')) {
            try {
                const probe=await session.send('Runtime.evaluate',{contextId:candidate.id,expression:'!!(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local)',returnByValue:true});
                if(probe.result.value){context=candidate;break;}
            } catch (_) {}
        }
        if (!context) throw new Error('Extension content-script world not found');
        const result = await session.send('Runtime.evaluate', {
            contextId: context.id, expression, awaitPromise: true, returnByValue: true
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    };
}

async function openBrowse(page, url = BASE_URL) {
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.wshs-sf-input', { timeout: 30000 });
        const state = await page.evaluate(() => ({
            serverError: /There was a problem performing that action/.test(document.body.innerText),
            cards: document.querySelectorAll('#CommunityTemplate a[href*="/myworkshopfiles"]').length
        }));
        if (!state.serverError && state.cards) return;
        if (attempt < 2) await wait(2000 * (attempt + 1));
    }
    throw new Error('Steam is not returning browse results; live acceptance is unavailable');
}

// window.__wshsAfterFrame(cb) runs cb after this frame's animation callbacks and
// layout, just before paint (a ResizeObserver tick on a 1px offscreen probe).
// requestAnimationFrame samplers can run before the extension's own frame
// update and then report one frame of movement as lag; this reads what paints.
async function installFrameSampler(page) {
    await page.evaluate(() => {
        if (window.__wshsAfterFrame) return;
        const probe = document.createElement('span');
        probe.style.cssText = 'position:fixed;left:-40px;top:0;display:block;width:1px;height:1px;pointer-events:none';
        document.documentElement.appendChild(probe);
        let queue = [], size = 1;
        new ResizeObserver(() => { const due = queue; queue = []; due.forEach(cb => cb()); }).observe(probe);
        window.__wshsAfterFrame = cb => { queue.push(cb); requestAnimationFrame(() => { size = size % 30 + 1; probe.style.width = size + 'px'; }); };
    });
}

async function clickTitleWord(page, selector, index = 0) {
    const title = await page.$(selector);
    await title.hover();
    await wait(250);
    const point = await title.evaluate((a, index) => {
        const words = [...a.textContent.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu)];
        const word = words[index];
        if (!word || a.firstChild.nodeType !== Node.TEXT_NODE) throw Error('Test title has no requested word');
        const range = document.createRange();
        range.setStart(a.firstChild, word.index);range.setEnd(a.firstChild, word.index + word[0].length);
        window.__wshsTestWordRange = range.cloneRange();
        const r = range.getBoundingClientRect();
        return { word: word[0], x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, index);
    await page.mouse.click(point.x, point.y);
    await wait(100);
    // The extension filters on a word's stem (Mechs -> Mech) and highlights only
    // that prefix. Report and measure the stem so checks match live titles.
    const stem = await page.evaluate(() => (document.querySelector('dialog[open] .wshs-picker') || document.querySelector('.wshs-picker'))?.dataset.word || '');
    if (stem && stem.length < point.word.length && point.word.toLowerCase().startsWith(stem.toLowerCase())) {
        await page.evaluate(length => { const r = window.__wshsTestWordRange; r.setEnd(r.startContainer, r.startOffset + length); }, stem.length);
        point.word = point.word.slice(0, stem.length);
    }
    return point;
}

async function setWordMode(page, enabled, dialog = false) {
    const scope = dialog ? 'dialog[open] ' : '';
    let input = await page.$(scope + '.wshs-picker-word-toggle');
    if (!input || !await input.isVisible()) {
        const author = await page.$((dialog ? 'dialog[open]' : '#CommunityTemplate') + ' a[href*="/myworkshopfiles"]');
        await author.hover();await wait(250);
        input = await page.$(scope + '.wshs-picker-word-toggle');
    }
    if (await input.evaluate(el => el.getAttribute('aria-checked')==='true') !== enabled) await input.click();
    await wait(100);
    if (await page.evaluate(()=>document.documentElement.classList.contains('wshs-title-selection')) !== enabled) throw Error('Word-mode toggle did not change the mode');
}

async function selectAddKind(page, kind) {
    if (await page.$('.wshs-add-kind')) {
        await page.click('.wshs-add-kind');
        await page.waitForSelector('.wshs-type-menu:popover-open');
        await page.click('.wshs-type-menu [data-add-kind="'+kind+'"]');
    }
    else await page.click('[data-add-kind="'+kind+'"]');
}

async function addSavedFilter(page, kind, value) {
    await selectAddKind(page, kind);
    await page.type('.wshs-sf-input', value);
    await page.click('.wshs-sf-save');
    await wait(120);
}

async function moveFilterToGroup(page, selector, groupId, index = 0) {
    const triggers = await page.$$(selector);
    await triggers[index].click();
    await page.waitForSelector('.wshs-folder-menu:popover-open');
    await page.$eval('.wshs-folder-menu', (menu, id) => {
        const option = [...menu.querySelectorAll('[role="menuitemradio"]')].find(n=>n.dataset.groupId===id);
        if (!option) throw Error('Requested folder is missing');
        option.click();
    }, groupId);
    await wait(100);
}

module.exports = { launch, closeBrowser, extensionWorld, openBrowse, wait, BASE_URL, installFrameSampler, clickTitleWord, setWordMode, addSavedFilter, moveFilterToGroup, selectAddKind };
