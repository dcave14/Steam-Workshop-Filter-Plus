// Public UI acceptance for groups in both Steam layouts, with real extension storage.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {launch, closeBrowser, wait, addSavedFilter, moveFilterToGroup} = require('./browser-helpers');
const {fixture} = require('./filter-fixtures');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
const target = '3809306528';
(async () => {
    const firefox = process.argv.includes('--firefox');
    const browser = await launch(firefox ? 'firefox' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
    try {
        const pages = [], errors = [];
        for (const collection of [false, true]) {
            const page = await browser.newPage(); pages.push(page);
            await page.setViewport({width:1600, height:1100});
            page.on('pageerror', e => errors.push(e.message));
            let html = fixture(collection).replace('AI Survivors', 'Viewpoint survivors').replace('[ai] NPCs', 'Viewpoint NPCs');
            await page.setRequestInterception(true);
            page.on('request', async r => {
                const u = new URL(r.url());
                if (r.isNavigationRequest() && r.frame() === page.mainFrame()) return r.respond({status:200, contentType:'text/html', body:html});
                if (u.pathname === '/sharedfiles/actions') {
                    const ids = JSON.parse(u.searchParams.get('qp'))[0];
                    return r.respond({status:200, contentType:'application/json', body:JSON.stringify({data:ids.map(publishedfileid=>({publishedfileid,file_size:'100',total_votes:10}))})});
                }
                if (/\/(?:sharedfiles|workshop)\/filedetails\/?$/.test(u.pathname)) {
                    const id = u.searchParams.get('id');
                    if (id === '999888777') return r.respond({status:503,body:'Unavailable'});
                    const dependent = ['990000003','990000004'].includes(id);
                    return r.respond({status:200,contentType:'text/html',body:'<div class="workshopItemTitle">Project Viewpoint</div><div class="workshopItemDescription">Description</div>'+(dependent?'<div id="RequiredItems"><a href="/workshop/filedetails/?id='+target+'">Viewpoint</a></div>':'')});
                }
                return r.abort();
            });
            const url = collection ? 'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585' : 'https://steamcommunity.com/workshop/browse/?appid=294100';
            await page.goto(url, {waitUntil:'load'}); await page.waitForSelector('.wshs-sf-input');
            const prefix = (collection ? 'Collection' : 'Workshop') + ': ';
            if (collection) check('groups and assignments synchronize from Workshop to collections', await page.$$eval('.wshs-filter-group', es=>es.length===1&&es[0].querySelector('.wshs-group-name').value==='Viewpoint set'&&es[0].querySelectorAll('.wshs-sf-row').length===2));
            while (await page.$('.wshs-sf-delete')) { await page.click('.wshs-sf-delete'); await wait(60); }
            while (await page.$('.wshs-group-remove')) { await page.click('.wshs-group-remove'); await wait(60); }
            async function save(selector, value) {
                await addSavedFilter(page, selector.includes('dependency') ? 'dependency' : selector.includes('group') ? 'group' : 'keyword', value);
            }
            const hidden = () => page.$$eval('.collectionItem,.fixture-card', es=>es.map((e,i)=>e.classList.contains('wshs-filtered')?i:null).filter(i=>i!==null));
            const shown = () => page.$$eval('.collectionItem,.fixture-card', es=>es.map((e,i)=>e.getBoundingClientRect().width>0?i:null).filter(i=>i!==null));
            const expectHidden = async indices => {
                await page.waitForFunction((collection,expected)=>JSON.stringify([...document.querySelectorAll(collection?'.collectionItem':'.fixture-card')].map((r,i)=>r.classList.contains('wshs-filtered')?i:null).filter(i=>i!==null))===JSON.stringify(expected),{},collection,indices);
            };
            await save('.wshs-sf-input', 'Viewpoint');
            check(prefix+'existing filters work without groups', JSON.stringify(await hidden())==='[0,3]');
            await save('.wshs-dependency-input', target);
            await page.waitForFunction(()=>document.querySelector('.wshs-dependency-status').hidden);
            await expectHidden([0,2,3]);
            await save('.wshs-group-input','Viewpoint set');
            check(prefix+'creating an empty group preserves active filters', JSON.stringify(await hidden())==='[0,2,3]');
            const groupId = await page.$eval('.wshs-filter-group',e=>e.dataset.groupId);
            const move = async index => {
                await moveFilterToGroup(page, '.wshs-sf-row .wshs-group-select', groupId, index);
            };
            // Moving the first row changes its display order; locate the remaining ungrouped row.
            await move(0); await move(0);
            check(prefix+'keyword and dependency filters move into the same group', await page.$$eval('.wshs-filter-group .wshs-sf-row',es=>es.length===2));
            const expandedHeight=await page.$eval('.wshs-filter-group',e=>e.getBoundingClientRect().height);
            await page.focus('.wshs-group-collapse');await page.keyboard.press('Enter');await wait(120);
            check(prefix+'collapse hides members and makes the group shorter',await page.$eval('.wshs-filter-group',(e,height)=>e.querySelector('.wshs-group-members').hidden&&e.getBoundingClientRect().height<height-20&&e.querySelector('.wshs-group-collapse').getAttribute('aria-expanded')==='false',expandedHeight));
            check(prefix+'collapsing preserves active filter results',JSON.stringify(await hidden())==='[0,2,3]');
            check(prefix+'keyboard focus stays on the collapse control after saving',await page.evaluate(()=>document.activeElement.classList.contains('wshs-group-collapse')));
            await page.click('.wshs-group-header .wshs-sf-inspect');await wait(100);
            check(prefix+'group inspection works while members are collapsed',JSON.stringify(await shown())==='[0,2,3]'&&await page.$eval('.wshs-group-members',e=>e.hidden));
            if(collection)check(prefix+'collapse preserves the collection subscription exclusions',await page.$eval('[data-wshs-subscription-plan]',e=>JSON.parse(e.dataset.wshsSubscriptionPlan).excluded.length===3));
            await page.click('.wshs-review-exit');
            await page.reload({waitUntil:'load'});await page.waitForSelector('.wshs-group-collapse');
            check(prefix+'collapsed state survives reload without disabling the group',await page.$eval('.wshs-filter-group',e=>e.querySelector('.wshs-group-members').hidden&&e.querySelector('.wshs-group-toggle').checked));
            await page.click('.wshs-group-toggle');await expectHidden([]);
            await page.click('.wshs-group-toggle');await expectHidden([0,2,3]);
            check(prefix+'enable toggle works independently of collapsed state',await page.$eval('.wshs-group-members',e=>e.hidden));
            await page.focus('.wshs-group-collapse');await page.keyboard.press(' ');await wait(120);
            check(prefix+'Space expands the group accessibly',await page.$eval('.wshs-group-collapse',e=>e.getAttribute('aria-expanded')==='true'&&!document.getElementById(e.getAttribute('aria-controls')).hidden));
            await page.click('.wshs-group-toggle'); await expectHidden([]);
            check(prefix+'one group toggle disables both exclusions', (await hidden()).length===0);
            check(prefix+'disabled groups retain both minus settings', await page.$$eval('.wshs-filter-group .wshs-sf-row',es=>es.every(e=>e.children[1].style.getPropertyValue('--button-fill')==='#d3ac42')));
            if (collection) check(prefix+'disabled dependencies do not block the subscription plan',!!await page.$('[data-wshs-subscription-plan]'));
            await page.click('.wshs-group-toggle'); await expectHidden([0,2,3]);
            // Overlapping rules must reveal a mod once, even with Hide Subscribed.
            await page.$eval(collection?'.collectionItem':'.fixture-card',e=>e.classList.add('hidden-item'));
            await page.click('.wshs-group-header .wshs-sf-inspect');
            await page.waitForFunction(()=>document.querySelectorAll('.wshs-review-match').length===3);
            check(prefix+'group inspection reveals the union, including subscribed mods', JSON.stringify(await shown())==='[0,2,3]');
            check(prefix+'overlapping matches list both exclusion reasons once',await page.$$eval('.collectionItem,.fixture-card',es=>es[3].querySelectorAll('.wshs-review-reason').length===1&&es[3].querySelector('.wshs-review-reason').textContent.includes('Requires Project Viewpoint')&&es[3].querySelector('.wshs-review-reason').textContent.includes('− Viewpoint')));
            if (collection) check(prefix+'group inspection preserves the actual subscription exclusions',await page.$eval('[data-wshs-subscription-plan]',e=>JSON.parse(e.dataset.wshsSubscriptionPlan).excluded.length===3));
            await page.click('.wshs-filter-group .wshs-sf-row .wshs-sf-inspect'); await wait(100);
            check(prefix+'individual keyword inspection remains available inside a group', JSON.stringify(await shown())==='[0,3]');
            await page.click('.wshs-group-header .wshs-sf-inspect');
            await page.click('.wshs-group-toggle'); await expectHidden([]);
            check(prefix+'disabling the inspected group exits inspection',!await page.evaluate(()=>document.documentElement.classList.contains('wshs-reviewing')));
            await page.reload({waitUntil:'load'}); await page.waitForSelector('.wshs-group-toggle');
            check(prefix+'reload preserves disabled groups and their assignments',await page.$eval('.wshs-filter-group',e=>!e.querySelector('.wshs-group-toggle').checked&&e.querySelectorAll('.wshs-sf-row').length===2));
            await page.click('.wshs-group-toggle'); await expectHidden([0,2,3]);
            // Exercise + keywords: disabling a group must also remove Steam's server search terms.
            await page.$eval('.wshs-filter-group .wshs-sf-row',e=>e.children[0].click()); await expectHidden([1,2,3,4,5,6,7]);
            if (!collection) check(prefix+'enabled group publishes positive keyword terms',await page.evaluate(()=>document.documentElement.getAttribute('data-wshs-terms')==='"Viewpoint"'));
            await page.click('.wshs-group-toggle'); await expectHidden([]);
            if (!collection) check(prefix+'disabled group removes its server search terms',await page.evaluate(()=>!document.documentElement.hasAttribute('data-wshs-terms')));
            await page.click('.wshs-group-toggle'); await expectHidden([1,2,3,4,5,6,7]);
            check(prefix+'reenabling restores distinct plus and minus settings',JSON.stringify(await hidden())==='[1,2,3,4,5,6,7]');
            await page.$eval('.wshs-filter-group .wshs-sf-row',e=>e.children[1].click()); await expectHidden([0,2,3]);
            await page.click('.wshs-group-remove'); await wait(100);
            check(prefix+'removing an enabled group keeps its filters working',await page.$$eval('.wshs-sf-row',es=>es.length===2)&&JSON.stringify(await hidden())==='[0,2,3]');
            await save('.wshs-group-input','Viewpoint set');
            const nextId=await page.$eval('.wshs-filter-group',e=>e.dataset.groupId);
            for(let i=0;i<2;i++){
                await moveFilterToGroup(page, '.wshs-sf-list > .wshs-sf-row .wshs-group-select', nextId);
            }
            await page.focus('.wshs-group-name');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type('Renamed set');await page.keyboard.press('Enter');await wait(100);
            check(prefix+'group names can be edited',await page.$eval('.wshs-group-name',e=>e.value==='Renamed set'));
            await page.click('.wshs-group-toggle');await expectHidden([]);
            await page.click('.wshs-group-remove');await wait(100);
            check(prefix+'removing a disabled group cannot unexpectedly activate its filters',(await hidden()).length===0&&await page.$$eval('.wshs-sf-inspect',es=>es.length===0));
            // Leave a shared enabled set for the next layout / cross-tab checks.
            await page.$$eval('.wshs-sf-row',rows=>rows.forEach(r=>r.children[1].click()));await wait(150);
            await save('.wshs-group-input','Viewpoint set');
            const finalId=await page.$eval('.wshs-filter-group',e=>e.dataset.groupId);
            for(let i=0;i<2;i++){
                await moveFilterToGroup(page, '.wshs-sf-list > .wshs-sf-row .wshs-group-select', finalId);
            }
            await expectHidden([0,2,3]);
            async function replaceLastId(id) {
                await page.$$eval('.collectionItem,.fixture-card',(rows,{id,collection})=>{
                    const root=rows[7];root.querySelectorAll('a[href*="filedetails"]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('id',id);a.href=u.href;});
                    if(collection)root.id='sharedfile_'+id;
                },{id,collection});
            }
            await replaceLastId('999888777');
            await page.waitForFunction(()=>!document.querySelector('.wshs-dependency-retry').hidden);
            if(collection) check(prefix+'unavailable active group dependencies block bulk subscription',!!await page.$('[data-wshs-subscription-error]'));
            await page.click('.wshs-group-toggle');await expectHidden([]);
            check(prefix+'disabled groups remove unavailable dependency warnings',await page.$eval('.wshs-dependency-status',e=>e.hidden));
            if(collection)check(prefix+'disabling an unavailable group restores the bulk subscription plan',!!await page.$('[data-wshs-subscription-plan]'));
            await replaceLastId('990000008');
            await page.click('.wshs-group-toggle');await expectHidden([0,2,3]);
            await save('.wshs-sf-input','Rain');
            await save('.wshs-group-input','Rain set');
            const rainId=await page.$eval('.wshs-filter-group:last-child',e=>e.dataset.groupId);
            await moveFilterToGroup(page, '.wshs-sf-list > .wshs-sf-row .wshs-group-select', rainId);
            await expectHidden([0,1,2,3]);
            await page.click('.wshs-filter-group:last-child .wshs-group-header .wshs-sf-inspect');await wait(100);
            check(prefix+'a second group inspects only its own exclusions',JSON.stringify(await shown())==='[1]');
            await page.click('.wshs-filter-group:first-child .wshs-group-header .wshs-sf-inspect');await wait(100);
            check(prefix+'switching groups does not include unrelated hidden mods',JSON.stringify(await shown())==='[0,2,3]');
            await page.click('.wshs-filter-group:last-child .wshs-group-toggle');await wait(100);
            check(prefix+'one group can be disabled while another stays active',JSON.stringify(await hidden())==='[0,2,3]');
            await page.click('.wshs-filter-group:last-child .wshs-sf-delete');await wait(100);
            await page.click('.wshs-filter-group:last-child .wshs-group-remove');await wait(100);
            if (!collection) {
                await page.goto('https://steamcommunity.com/workshop/browse/?appid=108600',{waitUntil:'load'});await page.waitForSelector('.wshs-sf-input');
                check(prefix+'groups remain specific to their game',await page.$$eval('.wshs-filter-group,.wshs-sf-row',es=>es.length===0));
                await page.goto(url,{waitUntil:'load'});await page.waitForSelector('.wshs-group-header .wshs-sf-inspect');
            }
            if (await page.evaluate(()=>document.documentElement.classList.contains('wshs-reviewing'))) await page.click('.wshs-review-exit');
            await page.click('.wshs-group-header .wshs-sf-inspect');
            fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
            await page.screenshot({path:path.join(__dirname,'out','groups-'+(firefox?'firefox-':'')+(collection?'collection':'workshop')+'.png')});
            await page.click('.wshs-review-exit');
        }
        await pages[1].click('.wshs-group-collapse'); await wait(150);
        check('collapsed state synchronizes to the other open layout',await pages[0].$eval('.wshs-group-members',e=>e.hidden));
        check('synchronized collapse keeps filters enabled',await pages[0].$eval('.wshs-group-toggle',e=>e.checked));
        await pages[1].click('.wshs-group-toggle'); await wait(150);
        check('group toggles synchronize to the other open layout',!await pages[0].$eval('.wshs-group-toggle',e=>e.checked));
        check('no page errors',errors.length===0);
        console.log(checks+' '+(firefox?'Firefox':'Chrome')+' filter-group checks passed.');
    } finally { await closeBrowser(browser); }
})().catch(e=>{console.error(e);process.exitCode=1;});
