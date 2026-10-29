// Live extension regression: Quick View must not change the browse grid or
// leave controls touching after close. Also exercises the filter/size matrix.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, closeBrowser, extensionWorld, openBrowse, wait } = require('./browser-helpers');

const measure = `(() => {
    const sort = WSHSDom.getSortButton().button;
    const buttons = [document.querySelector('.hide-subscribed-button:not(.star-filter-button)'),
        document.querySelector('.ratings-filter-button'), document.querySelector('.star-filter-button'), sort];
    const rects = buttons.map(b => {
        const r = b.getBoundingClientRect();
        return { x:r.x, y:r.y, w:r.width, h:r.height, font:getComputedStyle(b).fontSize };
    });
    const geometry = WSHSDom.getCardGeometry();
    return { rects, gaps:rects.slice(1).map((r,i)=>Math.abs(r.y-rects[i].y)>.5?null:r.x-rects[i].x-rects[i].w),
        grid:geometry && { width:geometry.width,gap:geometry.gap,columns:geometry.columns },
        cards:WSHSDom.enumerateCards().length,
        dialogCards:WSHSDom.enumerateCards().filter(c=>c.root.closest('dialog,[role=dialog],[aria-modal=true]')).length,
        leaked: [...document.querySelectorAll('.hidden-item,.wshs-filtered,.wshs-ratings-filtered')].filter(c=>c.getBoundingClientRect().width>0).length };
})()`;

let checks = 0;
function same(actual, expected, label, fallback = false) {
    for (let i = 0; i < (fallback ? 2 : 4); i++) {
        // The fallback is allowed to wrap and follow Steam's own row alignment.
        for (const k of (fallback ? ['w','h'] : ['x','y','w','h'])) assert.ok(Math.abs(actual.rects[i][k]-expected.rects[i][k]) <= .5, `${label}: button ${i} ${k}`);
        assert.equal(actual.rects[i].font, expected.rects[i].font, `${label}: font`);
    }
    for (let i = 0; i < (fallback ? 1 : 3); i++) assert.ok(actual.gaps[i]===null&&expected.gaps[i]===null||actual.gaps[i]!==null&&expected.gaps[i]!==null&&Math.abs(actual.gaps[i]-expected.gaps[i])<=.5, `${label}: gap ${i}`);
    assert.equal(actual.leaked, 0, `${label}: hidden-card leak`);
    checks++; console.log('PASS '+label);
}

(async () => {
    const browser = await launch(process.argv[2]);
    try {
        const page = await browser.newPage();
        await page.setViewport({width:1600,height:1000});
        const world = await extensionWorld(page);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await openBrowse(page);
        await page.evaluate(()=>document.fonts.ready);
        await wait(750);
        const baseline = await world(measure);
        assert.ok(baseline.gaps.every(g=>g===null||g>4), 'baseline has separated buttons within each toolbar row');
        for (const close of ['cross','escape','cross']) {
            await world(`WSHSDom.enumerateCards().find(c=>c.root.querySelector('svg.SVGIcon_MagnifyingGlass')).root.querySelector('svg.SVGIcon_MagnifyingGlass').closest('[role=button]').click()`);
            await page.waitForSelector('dialog[open]');
            await page.waitForFunction(()=>!!document.querySelector('dialog[open] a[href*="sharedfiles/filedetails/?id="]'));
            await wait(350);
            const during=await world(measure);
            assert.equal(during.dialogCards,0,'Quick View dependencies excluded from cards');
            assert.equal(during.cards,baseline.cards,'Quick View does not add browse cards');
            // Steam may change scrollbar space while a modal is open; the
            // measured card width may follow that, but the gaps must not collapse.
            assert.ok(during.gaps.every(g=>g===null||Math.abs(g-during.grid.gap)<=.5),'Quick View gaps follow browse columns');
            if(close==='escape') await page.keyboard.press('Escape');
            else await page.evaluate(()=>document.querySelector('dialog[open] svg.SVGIcon_X').closest('[role=button]').click());
            // Keep the pointer away from all cards: hovering used to hide the bug.
            await page.mouse.move(5,5);
            await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
            await wait(500);
            same(await world(measure),baseline,'Quick View closed without card hover: '+close);
        }
        fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
        await page.screenshot({path:path.join(__dirname,'out','quick-view-fixed.png')});

        for (const width of [1600,1280,640,520]) {
            await page.setViewport({width,height:1000});await wait(350);
            const initial=await world(measure);
            const fallback=width<800;
            for(const stars of [5,4,3,2,1,0]) {
                await page.evaluate(n=>document.querySelector('.star-option[data-stars="'+n+'"]').click(),stars);
                await wait(60);
                same(await world(measure),initial,`${width}px star ${stars}`,fallback);
            }
            for(const toggle of [true,false,true,false]) {
                await page.click('.hide-subscribed-button:not(.star-filter-button)');
                same(await world(measure),initial,`${width}px hide ${toggle}`,fallback);
            }
            for(const ratings of [5000,1000,100,0]) {
                await page.$eval('[data-ratings="'+ratings+'"]',e=>e.click());await wait(80);
                same(await world(measure),initial,`${width}px minimum ratings ${ratings}`,fallback);
            }
            if(!fallback) {
                // All currently mounted native sort choices, including time frames.
                await world('WSHSDom.getSortButton().button.click()');
                const labels=await page.evaluate(()=>[...document.querySelectorAll('[role=radiogroup] [role=radio]')].filter(r=>!r.closest('.wshs-injected-controls')).map(r=>r.textContent.trim()));
                await world('WSHSDom.getSortButton().button.click()');
                for(const label of labels) {
                    await world('WSHSDom.getSortButton().button.click()');
                    const clicked=await page.evaluate(text=>{const r=[...document.querySelectorAll('[role=radiogroup] [role=radio]')].find(r=>!r.closest('.wshs-injected-controls')&&r.textContent.trim()===text);if(r)r.click();return !!r},label);
                    await wait(650);
                    // Time-independent sorts do not expose the time-frame options.
                    if(clicked) same(await world(measure),initial,`${width}px sort ${label}`);
                    const open=await page.evaluate(()=>!![...document.querySelectorAll('[role=radiogroup]')].find(r=>!r.closest('.wshs-injected-controls')));
                    if(open)await world('WSHSDom.getSortButton().button.click()');
                }
            }
        }
        await page.setViewport({width:1600,height:1000});await wait(350);
        const beforeHeavy=await world(measure);
        await page.evaluate(()=>document.querySelector('.star-option[data-stars="5"]').click());
        // Simulate the all-hidden case regardless of the live page's rating mix.
        await world(`WSHSDom.enumerateCards().forEach(c=>c.root.classList.add('hidden-item'))`);
        same(await world(measure),beforeHeavy,'all cards hidden preserves geometry');
        await world(`chrome.storage.local.set({'savedFilters:294100':[{kind:'keyword',value:'NoSuchInspectionFixture987654321',label:'NoSuchInspectionFixture987654321',state:-1}]})`);
        await page.waitForSelector('.wshs-sf-inspect');
        await page.click('.wshs-sf-inspect');await wait(100);
        same(await world(measure),beforeHeavy,'zero-match inspection preserves geometry');
        await page.click('.wshs-review-exit');
        assert.equal(errors.length,0,errors.join('\n'));
        await page.screenshot({path:path.join(__dirname,'out','all-hidden-geometry.png')});
        console.log(`${checks} geometry checks passed; no page errors.`);
    } finally { await closeBrowser(browser); }
})().catch(error=>{console.error(error);process.exitCode=1});
