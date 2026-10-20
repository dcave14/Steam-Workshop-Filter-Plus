const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('../perf/node_modules/puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&days=7';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(chrome) {
    const firefox = chrome === 'firefox';
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, firefox ? 'dist/firefox/manifest.json' : 'manifest.json'), 'utf8'));
    const files = new Set(['manifest.json', ...Object.values(manifest.icons || {})]);
    for (const script of manifest.content_scripts) {
        for (const file of [...(script.js || []), ...(script.css || [])]) files.add(file);
    }
    const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-test-'));
    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(extension, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(extension, file));
    }
    if (firefox) {
        fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
        return lowerPriority(await puppeteer.launch({browser:'firefox', executablePath:'C:/Program Files/Mozilla Firefox/firefox.exe', headless:true, protocolTimeout:30000, enableExtensions:[extension]}));
    }
    return lowerPriority(await puppeteer.launch({
        executablePath: chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
        pipe: true,
        protocolTimeout: 30000,
        enableExtensions: [extension]
    }));
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
        const context = [...contexts.values()].find(c => c.name === 'Steam Workshop Filter Plus');
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

module.exports = { launch, closeBrowser, extensionWorld, openBrowse, wait, BASE_URL, clickTitleWord, setWordMode };
