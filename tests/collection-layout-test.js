const assert = require('assert/strict');
const {launch, closeBrowser, wait, addSavedFilter} = require('./browser-helpers');
const {fixture} = require('./filter-fixtures');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
(async () => {
    const firefox = process.argv.includes('--firefox');
    const browser = await launch(firefox ? 'firefox' : undefined, {presentationPreferences:{pinnedCollections:true}});
    try {
        const page = await browser.newPage();
        await page.setViewport({width:1000,height:900});
        await page.setRequestInterception(true);
        page.on('request', request => request.respond({status:200,contentType:'text/html',body:
            request.isNavigationRequest() ? fixture(true) : '<div id="RequiredItems"></div>'}));
        await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');
        await page.waitForSelector('.wshs-collection-filter-heading .wshs-collection-reset');
        await page.addStyleTag({content:'.subscribeCollection,.collectionChildren{width:100%}body{min-height:2200px}'});
        check('reset is outside both toolbar rows', await page.$eval('.subscribeCollection', n =>
            !n.querySelector('.wshs-toolbar-reset') && n.querySelector('.wshs-collection-controls').children.length === 3));
        check('reset uses a compact link instead of inheriting the Workshop square', await page.$eval('.wshs-collection-reset', n => n.offsetHeight===24 && n.scrollWidth<=n.clientWidth));
        for (const width of [1000, 720, 480]) {
            await page.setViewport({width,height:900}); await wait(80);
            check(width + 'px: all six cells align in two equal rows', await page.$eval('.subscribeCollection', n => {
                const top = [...n.querySelectorAll(':scope > .general_btn')].map(e => e.getBoundingClientRect());
                const bottom = [...n.querySelectorAll('.hide-subscribed-button')].map(e => e.getBoundingClientRect());
                return top.length === 3 && bottom.length === 3 && bottom.every((r,i) =>
                    Math.abs(r.left-top[i].left)<1 && Math.abs(r.width-top[i].width)<1 && Math.abs(r.width-bottom[0].width)<1 && r.top>top[i].bottom);
            }));
            check(width + 'px: label boxes center independently of icons and arrows', await page.$$eval('.wshs-collection-controls .hide-subscribed-button', buttons => buttons.every(n => {
                const r=n.getBoundingClientRect(), label=n.querySelector('.wshs-button-label'), l=label.getBoundingClientRect(), i=n.querySelector('.wshs-left-icon').getBoundingClientRect();
                const arrow=n.querySelector('.wshs-chevron,.wshs-toggle-slot').getBoundingClientRect();
                return Math.abs(l.left+l.width/2-r.left-r.width/2)<1 && getComputedStyle(label).textAlign==='center' && i.left-r.left<10 && r.right-arrow.right<10;
            })));
            check(width + 'px: composer and header remain inside panel', await page.$eval('.wshs-collection-filters', n => {
                const r=n.getBoundingClientRect();
                return [...n.querySelectorAll('.wshs-sf-input,.wshs-add-kind,.wshs-sf-save,.wshs-sf-help,.wshs-api-settings,.wshs-collection-reset')].every(e => {
                    const b=e.getBoundingClientRect(); return b.width>0 && b.left>=r.left && b.right<=r.right;
                });
            }));
        }
        await page.setViewport({width:1000,height:900});
        await addSavedFilter(page,'keyword','AI'); await wait(150);
        await page.waitForFunction(() => document.querySelectorAll('.collectionItem.wshs-filtered').length === 3);
        await addSavedFilter(page,'group','Project Viewpoint'); await wait(100);
        await page.click('.wshs-group-select'); await page.waitForSelector('.wshs-folder-menu:popover-open');
        await page.keyboard.press('End'); await page.keyboard.press('Enter'); await wait(150);
        check('group works without inspection and count matches hidden rows', await page.evaluate(() =>
            !document.documentElement.classList.contains('wshs-reviewing') && document.querySelectorAll('.collectionItem.wshs-filtered').length===3 && document.querySelector('.wshs-saved-count').textContent==='3 mods hidden'));
        check('group fills panel above the inline composer', await page.$eval('.wshs-collection-filters', n => {
            const list=n.querySelector('.wshs-sf-list').getBoundingClientRect(), group=n.querySelector('.wshs-filter-group').getBoundingClientRect(), composer=n.querySelector('.wshs-add-composer').getBoundingClientRect();
            const type=n.querySelector('.wshs-add-kind').getBoundingClientRect(), input=n.querySelector('.wshs-sf-input').getBoundingClientRect();
            return Math.abs(group.width-list.width)<1 && group.bottom<composer.top && Math.abs(type.top-input.top)<1 && type.right<input.left;
        }));
        await page.click('.wshs-group-toggle'); await wait(100);
        check('disabled group clears count and filtering', await page.evaluate(() => document.querySelector('.wshs-saved-count').textContent==='0 mods hidden' && !document.querySelector('.collectionItem.wshs-filtered')));
        await page.click('.wshs-group-toggle'); await wait(100);
        await page.click('.wshs-group-collapse'); await wait(100);
        check('collapsed group still filters', await page.evaluate(() => document.querySelector('.wshs-group-members').hidden && document.querySelectorAll('.collectionItem.wshs-filtered').length===3));
        await page.click('.wshs-group-header .wshs-sf-inspect'); await wait(100);
        check('inspection keeps header/reset and exposes excluded mods', await page.evaluate(() => document.querySelectorAll('.collectionItem.wshs-review-match').length===3 && !document.querySelector('.wshs-review-exit').hidden && !!document.querySelector('.wshs-collection-filter-heading .wshs-collection-reset')));
        await page.click('.wshs-review-exit');
        await page.click('.wshs-group-collapse'); await wait(100);
        await page.click('.wshs-collection-controls > .hide-subscribed-button');
        await page.$eval('[data-ratings="100"]', n => n.click());
        await page.$eval('[data-stars="4"]', n => n.click());
        await page.focus('.wshs-collection-reset'); await page.keyboard.press('Enter'); await wait(100);
        check('keyboard reset clears quick filters and preserves the active group', await page.evaluate(() =>
            document.querySelector('.hide-subscribed-button').getAttribute('aria-pressed')==='false' && document.querySelector('.ratings-filter-button').textContent==='Ratings' && document.querySelector('.star-filter-button').textContent==='Star Rating' && document.querySelector('.wshs-group-toggle').checked && document.querySelectorAll('.collectionItem.wshs-filtered').length===3));
        check('reset stays on collection and description option follows composer', page.url().includes('id=3521297585') && await page.$eval('.wshs-description-option', n => n.getBoundingClientRect().top>=document.querySelector('.wshs-add-composer').getBoundingClientRect().bottom));
        await page.screenshot({path:'tests/out/collection-layout-'+(firefox?'firefox':'chrome')+'.png'});
        await page.evaluate(() => scrollTo(0,500)); await page.waitForSelector('.wshs-pinned-filter-bar');
        check('pinned toolbar keeps the same three columns', await page.$eval('.wshs-pinned-filter-bar', n => Math.abs(n.getBoundingClientRect().top-12)<1 && !n.querySelector('.wshs-collection-reset') && n.querySelector('.wshs-collection-controls').children.length===3));
        await page.click('.ratings-filter-button');
        check('pinned rating menu still opens', await page.$eval('.wshs-ratings-menu', n => n.classList.contains('show')));
        console.log(checks + ' ' + (firefox?'Firefox':'Chrome') + ' collection layout checks passed.');
    } finally { await closeBrowser(browser); }
})().catch(error => { console.error(error); process.exitCode=1; });
