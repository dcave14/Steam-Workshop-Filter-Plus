const assert = require('assert/strict');
const path = require('path');
const {launch, closeBrowser, openBrowse, extensionWorld, wait, setWordMode, clickTitleWord} = require('./browser-helpers');

let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }

(async () => {
    const browser = await launch();
    let page;
    try {
        page = await browser.newPage();
        await page.setViewport({width:1600, height:1000});
        await openBrowse(page);
        const world = await extensionWorld(page);
        await world(`(() => {
            const card = WSHSDom.enumerateCards()[0].root;
            card.dataset.dismissTestCard = 'true';
            [...card.querySelectorAll('a[href*="sharedfiles/filedetails/?id="]')].find(a => !a.querySelector('img')).dataset.dismissTestTitle = 'true';
        })()`);
        const title = '[data-dismiss-test-title]';
        const off = () => page.evaluate(() =>
            !document.documentElement.classList.contains('wshs-title-selection') &&
            !CSS.highlights.has('wshs-selected-word') && !CSS.highlights.has('wshs-hover-word') &&
            [...document.querySelectorAll('.wshs-picker-word-toggle')].every(b => b.getAttribute('aria-checked') === 'false') &&
            (!document.querySelector('.wshs-picker') || getComputedStyle(document.querySelector('.wshs-picker')).display === 'none'));
        const on = () => page.evaluate(() => document.documentElement.classList.contains('wshs-title-selection') && CSS.highlights.has('wshs-selected-word'));
        async function select(dialog = false) {
            await setWordMode(page, true, dialog);
            await clickTitleWord(page, dialog ? 'dialog[open] .wshs-qv-title' : title);
        }
        async function gutter() {
            const point = await page.$eval('[data-dismiss-test-card]', card => {
                const r = card.getBoundingClientRect();
                return {x:r.left - 6, y:r.bottom - 45};
            });
            check('test clicks the gutter outside every mod', await world(`!WSHSDom.enumerateCards().some(c => c.root.contains(document.elementFromPoint(${point.x},${point.y})))`));
            await page.mouse.click(point.x, point.y);
        }

        await select();
        await page.click('.wshs-picker-help');
        check('help keeps the selected word and toggle active', await on());
        await page.click('.wshs-picker-help');
        await page.$eval('[data-dismiss-test-card]', card => {
            // Click a non-interactive patch inside the mod without following its links.
            const title = card.querySelector('[data-dismiss-test-title]');
            title.parentElement.dispatchEvent(new MouseEvent('click', {bubbles:true}));
        });
        check('clicking inside the mod keeps word mode active', await on());
        await gutter();
        check('gutter click unchecks the toggle and clears both highlights and controls', await off());

        await select();
        await page.keyboard.press('Escape');
        check('Escape clears the selected word and mode', await off());
        await select();
        await page.focus('.wshs-picker-word-toggle');
        await page.keyboard.press('Escape');
        check('Escape also works with focus inside the controls', await off());

        const savedBefore = await world('chrome.storage.local.get(null)');
        await select();
        await page.click('.wshs-picker [data-action="hide"]');
        await wait(150);
        await gutter();
        await wait(2700);
        check('outside click cancels an unconfirmed word filter', await off() && JSON.stringify(await world('chrome.storage.local.get(null)')) === JSON.stringify(savedBefore));

        async function openQuickView() {
            await page.$eval('[data-dismiss-test-card] .SVGIcon_MagnifyingGlass', s => s.closest('[role="button"],button').click());
            await page.waitForSelector('dialog[open] .wshs-qv-title');
            await wait(400);
        }
        await openQuickView();
        await select(true);
        await page.$eval('dialog[open] .wshs-qv-title', a => a.parentElement.parentElement.parentElement.dispatchEvent(new MouseEvent('click', {bubbles:true})));
        check('Quick View content keeps word mode active', await on());
        await page.click('dialog[open] .wshs-picker-help');
        check('Quick View controls keep word mode active', await on());
        await page.click('dialog[open] .SVGIcon_X');
        await wait(400);
        check('closing Quick View with X exits word mode', await off() && !await page.$('dialog[open]'));

        await openQuickView();
        await select(true);
        await page.keyboard.press('Escape');
        await wait(400);
        check('Escape exits word mode and still closes native Quick View', await off() && !await page.$('dialog[open]'));

        await openQuickView();
        await select(true);
        const backdrop = await page.$eval('dialog[open]', d => {
            const r = d.getBoundingClientRect();
            return {x:r.left + 4, y:r.top + 10};
        });
        await page.mouse.click(backdrop.x, backdrop.y);
        await wait(400);
        check('Quick View backdrop click exits word mode', await off());
        console.log(checks + ' word-mode dismissal checks passed.');
    } catch (e) {
        if (page) await page.screenshot({path:path.join(__dirname,'out/word-mode-dismiss-failure.png')});
        throw e;
    } finally { await closeBrowser(browser); }
})().catch(e => {console.error(e);process.exitCode = 1;});
