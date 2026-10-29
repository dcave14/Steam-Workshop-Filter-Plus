const {selectAddKind}=require('./browser-helpers');
// Both Steam layouts in real browsers, with controlled text and Required Items.
// Structural fixtures are the default; --live uses Steam's current layouts.
// All subscription mutations are blocked. Optional --mcp also checks via DevTools MCP.
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const {launch, closeBrowser, extensionWorld, openBrowse, wait} = require('./browser-helpers');
const {fixture} = require('./filter-fixtures');
let checks = 0;
function check(name, value) { assert.ok(value, name); console.log('PASS ' + name); checks++; }
const titles = ['AI Survivors', 'Rain collectors', 'Train station', '[ai] NPCs', 'Sailing boats', 'AI-powered helpers', 'Terrain tools', 'Aim training'];
const keyword = state => ({kind:'keyword', value:'AI', label:'AI', state});
const target = '3809306528';

async function attachMcp(browser) {
    const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
    const dirs = fs.readdirSync(cache).map(d => path.join(cache, d, 'node_modules'));
    const server = process.env.WSHS_MCP_ENTRY || dirs.map(d => path.join(d, 'chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js')).find(f => fs.existsSync(f));
    const sdk = dirs.map(d => path.join(d, '@modelcontextprotocol/sdk/dist/cjs/client')).find(f => fs.existsSync(path.join(f, 'index.js')));
    assert.ok(server && sdk, 'installed Chrome DevTools MCP and SDK are available');
    const {Client} = require(path.join(sdk, 'index.js'));
    const {StdioClientTransport} = require(path.join(sdk, 'stdio.js'));
    const client = new Client({name:'wshs-filter-inspection',version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:process.execPath,args:[server,'--wsEndpoint',browser.wsEndpoint(),'--no-usage-statistics','--no-performance-crux','--workspace',path.resolve(__dirname,'..')],stderr:'pipe'}));
    return client;
}

(async () => {
    if (process.argv.includes('--firefox')) throw Error('Use node tests/filter-inspection-firefox-test.js for Firefox UI checks.');
    const browser = await launch('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', process.argv.includes('--mcp') ? {pipe:false} : {});
    let mcp;
    try {
        const pages = [], errors = [], detailCalls = [];
        for (const collection of [false, true]) {
            const page = await browser.newPage(); pages.push(page);
            await page.setViewport({width:1600,height:1000});
            page.on('pageerror', e => errors.push(e.message));
            let ids = [], outage = false;
            await page.setRequestInterception(true);
            page.on('request', async request => {
                const url = new URL(request.url());
                if (!process.argv.includes('--live') && request.isNavigationRequest() && request.frame() === page.mainFrame()) return request.respond({status:200,contentType:'text/html',body:fixture(collection)});
                if (!process.argv.includes('--live') && url.pathname === '/sharedfiles/actions') {
                    const batch=JSON.parse(url.searchParams.get('qp'))[0];
                    return request.respond({status:200,contentType:'application/json',body:JSON.stringify({data:batch.map(publishedfileid=>({publishedfileid,file_size:'100',total_votes:10}))})});
                }
                if (/subscribe|unsubscribe/i.test(url.pathname) && request.method() === 'POST') return request.abort();
                if (!request.isNavigationRequest() && /\/(?:sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)) {
                    const id = url.searchParams.get('id');
                    if (ids.includes(id) || id === target) {
                        detailCalls.push(id);
                        if (outage && id === ids[7]) return request.respond({status:503,body:'unavailable'});
                        const required = id === ids[0] || id === ids[2] ? target : id === ids[3] ? ids[0] : null;
                        return request.respond({status:200,contentType:'text/html',body:'<div class="workshopItemTitle">' + (id === target ? 'Project Viewpoint' : 'Fixture') + '</div><div class="workshopItemDescription">Details</div>' + (required ? '<div id="RequiredItems"><a href="/workshop/filedetails/?id='+required+'"><div class="requiredItem">Required</div></a></div>' : '')});
                    }
                }
                if (url.pathname === '/ISteamRemoteStorage/GetPublishedFileDetails/v1/') {
                    const batch = [...new URLSearchParams(await request.fetchPostData())].filter(([key])=>key.startsWith('publishedfileids[')).map(([,id])=>id);
                    return request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'https://steamcommunity.com'},body:JSON.stringify({response:{publishedfiledetails:batch.map(id=>({publishedfileid:id,result:1,description:id===ids[1]?'AI in the full description':id===ids[4]?'Rain and terrain':''}))}})});
                }
                return request.continue();
            });
            if (collection) { await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'load'}); await page.waitForSelector('.wshs-collection-filters'); }
            else if (process.argv.includes('--live')) await openBrowse(page);
            else { await page.goto('https://steamcommunity.com/workshop/browse/?appid=294100',{waitUntil:'load'}); await page.waitForSelector('.wshs-sf-input'); }
            const world = await extensionWorld(page);
            await world("chrome.storage.local.set({'savedFilters:294100':[], 'savedFilterDescriptions:294100':false, hideSubscribed:false, starFilter:0, minimumRatings:0})");
            ids = await world(`(() => {
                const items = ${collection ? "[...document.querySelectorAll('.collectionItem')].map(root=>({root,id:root.id.replace('sharedfile_','')}))" : 'WSHSDom.enumerateCards()'};
                items.slice(8).forEach(item=>item.root.remove());
                const titles=${JSON.stringify(titles)};
                items.slice(0,8).forEach((item,i)=>{
                    item.root.dataset.fixtureIndex=String(i);
                    const title=${collection ? "item.root.querySelector('.workshopItemTitle')" : "[...item.root.querySelectorAll('a[href*=\"sharedfiles/filedetails/?id=\"]')].find(a=>a.textContent.trim())"};
                    title.textContent=titles[i];
                    const comment=document.createElement('div'); comment.className='commentthread_comment_text'; comment.textContent='AI CommentOnlyFilter'; item.root.appendChild(comment);
                    if(i===0) item.root.classList.add('hidden-item','wshs-ratings-filtered');
                });
                return items.slice(0,8).map(item=>item.id);
            })()`);
            const prefix = collection ? 'Collection: ' : 'Workshop: ';
            const setFilters = async list => { await world(`chrome.storage.local.set({'savedFilters:294100':${JSON.stringify(list)}})`); await wait(180); };
            const hidden = () => page.$$eval('[data-fixture-index].wshs-filtered', rows=>rows.map(r=>Number(r.dataset.fixtureIndex)).sort());
            const visibleReview = () => page.$$eval('[data-fixture-index]',rows=>rows.filter(r=>r.getBoundingClientRect().width>0).map(r=>Number(r.dataset.fixtureIndex)).sort());
            await setFilters([{kind:'keyword',value:'CommentOnlyFilter',label:'CommentOnlyFilter',state:-1}]);
            check(prefix+'a term present only in comments excludes no mods',(await hidden()).length===0);
            check(prefix+'saved minus terms never reach Steam’s search index',await page.evaluate(()=>!document.documentElement.getAttribute('data-wshs-terms')));
            await setFilters([keyword(-1)]);
            check(prefix+'AI minus matches complete words only', JSON.stringify(await hidden())==='[0,3,5]');
            const excludedWords = await hidden();
            check(prefix+'rain, train, sailing, terrain and aim are preserved', ![1,2,4,6,7].some(i=>excludedWords.includes(i)));
            check(prefix+'short keywords stay out of Steam substring searches',await page.evaluate(()=>!document.documentElement.getAttribute('data-wshs-terms')));
            check(prefix+'active filter has a magnifying glass',await page.$$eval('.wshs-sf-inspect',es=>es.length)===1);
            await page.hover('.wshs-sf-label');
            check(prefix+'magnifying glass appears on hover',await page.$eval('.wshs-sf-inspect',e=>getComputedStyle(e).opacity==='1'));
            await page.click('.wshs-sf-label'); await wait(150);
            check(prefix+'clicking text inspects only this filter',JSON.stringify(await visibleReview())==='[0,3,5]');
            check(prefix+'inspection reveals subscribed/rating-hidden matches',await page.$eval('[data-fixture-index="0"]',r=>r.classList.contains('hidden-item')&&r.getBoundingClientRect().width>0));
            check(prefix+'each revealed mod names the exclusion',await page.$$eval('.wshs-review-reason',es=>es.length===3&&es.every(e=>e.textContent.includes('AI'))));
            if (collection) {
                check(prefix+'inspection keeps thumbnail, details and action side by side',await page.$eval('.wshs-review-match',r=>{
                    const preview=r.querySelector('.workshopItem').getBoundingClientRect(),details=r.querySelector('.collectionItemDetails').getBoundingClientRect(),action=r.querySelector('.subscriptionControls').getBoundingClientRect();
                    return preview.right<=details.left&&details.right<=action.left&&r.getBoundingClientRect().height<115;
                }));
                check(prefix+'reason belongs to the details rather than a separate full-width row',await page.$eval('.wshs-review-match .wshs-review-reason',e=>e.parentElement.classList.contains('collectionItemDetails')));
            }
            if (collection) check(prefix+'inspection retains the actual subscription plan',await page.$eval('[data-wshs-subscription-plan]',b=>JSON.parse(b.dataset.wshsSubscriptionPlan).excluded.length===3));
            await page.click('.wshs-sf-inspect'); await wait(100);
            check(prefix+'magnifying glass toggles inspection off',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-reviewing')));
            await setFilters([keyword(1)]);
            check(prefix+'AI plus excludes the five nonmatching words',JSON.stringify(await hidden())==='[1,2,4,6,7]');
            await page.focus('.wshs-sf-label'); await page.keyboard.press('Enter'); await wait(100);
            check(prefix+'keyboard inspection of plus shows excluded nonmatches',JSON.stringify(await visibleReview())==='[1,2,4,6,7]');
            await page.click('.wshs-review-exit');
            await setFilters([keyword(0)]);
            check(prefix+'inactive filters have no inspection control',await page.$$eval('.wshs-sf-inspect',es=>es.length)===0);
            await setFilters([keyword(-1)]);
            await page.click('.wshs-description-toggle');
            try { await page.waitForFunction(()=>document.querySelectorAll('[data-fixture-index].wshs-filtered').length===4); }
            catch(e) { console.log('Description diagnostic',await world(`JSON.stringify({ids:${JSON.stringify(ids)},checked:document.querySelector('.wshs-description-toggle').checked,descriptions:${JSON.stringify(ids)}.map(id=>WSHSDescriptions.get(id)),hidden:[...document.querySelectorAll('.wshs-filtered')].map(r=>r.dataset.fixtureIndex),status:document.querySelector('.wshs-description-status').textContent})`),errors); throw e; }
            check(prefix+'full-description matching uses the same word boundaries',JSON.stringify(await hidden())==='[0,1,3,5]');
            await setFilters([{kind:'keyword',value:'CommentOnlyFilter',label:'CommentOnlyFilter',state:-1}]);
            check(prefix+'description opt-in still ignores comment-only matches',(await hidden()).length===0);
            await setFilters([keyword(-1)]);
            await page.click('.wshs-sf-label'); await wait(100);
            check(prefix+'description matches also appear in inspection',JSON.stringify(await visibleReview())==='[0,1,3,5]');
            await setFilters([]);
            check(prefix+'deleting the inspected filter exits inspection',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-reviewing')));
            await world("chrome.storage.local.set({'savedFilterDescriptions:294100':false})");
            await selectAddKind(page,'dependency');await page.type('.wshs-dependency-input','https://steamcommunity.com/workshop/filedetails/?id='+target);
            await page.$eval('.wshs-dependency-input',e=>e.nextElementSibling.click());
            await page.waitForFunction(()=>document.querySelector('.wshs-sf-label')?.textContent==='Requires Project Viewpoint');
            try { await page.waitForFunction(()=>document.querySelector('.wshs-dependency-status').hidden); }
            catch (e) { console.log('Dependency diagnostic',await world(`JSON.stringify({status:document.querySelector('.wshs-dependency-status').textContent,cards:WSHSDom.enumerateCards().map(c=>({id:c.id,deps:WSHSDependencies.get(c.id)}))})`),detailCalls); throw e; }
            check(prefix+'a required-item URL saves a named dependency filter',await world("chrome.storage.local.get('savedFilters:294100').then(s=>s['savedFilters:294100'][0].value==='3809306528')"));
            check(prefix+'dependencies use declared IDs, not title keywords',JSON.stringify(await hidden())==='[0,2]');
            check(prefix+'indirect dependents are not incorrectly treated as direct',!(await hidden()).includes(3));
            await page.click('.wshs-sf-label'); await wait(100);
            check(prefix+'dependency inspection includes hidden subscribed rows',JSON.stringify(await visibleReview())==='[0,2]');
            if (collection) check(prefix+'dependency inspection leaves allowed/excluded IDs intact',await page.$eval('[data-wshs-subscription-plan]',b=>JSON.parse(b.dataset.wshsSubscriptionPlan).excluded.length===2));
            await page.click('.wshs-review-exit');
            const calls = detailCalls.length;
            await page.$eval('.wshs-sf-row',r=>r.children[0].click()); await wait(120);
            check(prefix+'dependency plus keeps only direct dependents',JSON.stringify(await hidden())==='[1,3,4,5,6,7]');
            check(prefix+'changing dependency state reuses fetched data',detailCalls.length===calls);
            outage = true; ids[7] = collection ? '999991120' : '999991119';
            await world(`(() => {
                const root=document.querySelector('[data-fixture-index="7"]');
                root.querySelectorAll('a[href*="filedetails"]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('id',${JSON.stringify(ids[7])});a.href=u.href;});
                if (${collection}) root.id=${JSON.stringify('sharedfile_'+ids[7])};
            })()`);
            await setFilters([{kind:'dependency',value:target,label:'Project Viewpoint',state:1}]);
            await page.waitForFunction(()=>!document.querySelector('.wshs-dependency-retry').hidden);
            check(prefix+'unavailable dependency lists remain visible pending verification',!(await hidden()).includes(7));
            if (collection) check(prefix+'unverified dependencies block the bulk subscription plan',!await page.$('[data-wshs-subscription-plan]')&&!!await page.$('[data-wshs-subscription-error]'));
            outage = false; await page.click('.wshs-dependency-retry');
            await page.waitForFunction(()=>document.querySelector('.wshs-dependency-status').hidden);
            check(prefix+'retry verifies an empty Required Items list',(await hidden()).includes(7));
            await setFilters([keyword(-1),{kind:'dependency',value:target,label:'Project Viewpoint',state:-1}]);
            await page.click('.wshs-sf-row:first-child .wshs-sf-inspect'); await wait(100);
            check(prefix+'keyword inspection stays separate from dependency exclusions',JSON.stringify(await visibleReview())==='[0,3,5]');
            await page.click('.wshs-sf-row:nth-child(2) .wshs-sf-inspect'); await wait(100);
            check(prefix+'switching magnifying glasses shows only the selected filter',JSON.stringify(await visibleReview())==='[0,2]');
            await page.click('.wshs-review-exit');
            await world("chrome.storage.local.set({'savedFilterAuthorAlias:profiles/76561198000000000':{steamId:'76561198000000000',vanity:''},'savedFilterAuthorAlias:profiles/76561198000000001':{steamId:'76561198000000001',vanity:''}})");
            const author={kind:'author',value:'profiles/76561198000000000',label:'Fixture Creator',state:-1};
            await setFilters([author]);
            check(prefix+'creator exclusions still match actual creators',(await hidden()).length===8);
            await page.click('.wshs-sf-inspect');await wait(100);
            check(prefix+'creator inspection reveals all matching excluded mods',(await visibleReview()).length===8);
            await page.click('.wshs-review-exit');
            await setFilters([{...author,state:1},{kind:'author',value:'profiles/76561198000000001',label:'Other Creator',state:1}]);
            await page.click('.wshs-sf-row:nth-child(2) .wshs-sf-inspect');await wait(100);
            check(prefix+'plus-author inspection respects the union of included authors',(await visibleReview()).length===0);
            await page.click('.wshs-review-exit');
            // Preserve the current fixture for MCP inspection, then verify cross-tab storage below.
            await setFilters([keyword(-1),{kind:'dependency',value:target,label:'Project Viewpoint',state:0}]);
            await page.click('.wshs-sf-row:first-child .wshs-sf-inspect');
            await page.screenshot({path:path.join(__dirname,'out','inspection-'+(collection?'collection':'workshop')+'.png')});
        }
        check('saved filter edits synchronize between both layouts',await pages[0].$$eval('.wshs-sf-label',es=>es.length===2));
        for (const page of pages) {
            await page.bringToFront();
            if (!await page.evaluate(()=>document.documentElement.classList.contains('wshs-reviewing'))) await page.click('.wshs-sf-row:first-child .wshs-sf-inspect');
        }
        if (process.argv.includes('--mcp')) {
            mcp = await attachMcp(browser);
            const listed = await mcp.callTool({name:'list_pages',arguments:{}});
            console.log('MCP pages:',JSON.stringify(listed.content));
            const text = listed.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
            const pageIds = [...text.matchAll(/(?:^|\n)(\d+):[^\n]*https:\/\/steamcommunity.com\//g)].map(m=>Number(m[1]));
            assert.equal(pageIds.length,2,'DevTools MCP sees both test pages');
            for (const pageId of pageIds) {
                const result = await mcp.callTool({name:'evaluate_script',arguments:{pageId,function:`() => ({ inspection:document.documentElement.classList.contains('wshs-reviewing'), visible:[...document.querySelectorAll('[data-fixture-index]')].filter(r=>r.getBoundingClientRect().width>0).map(r=>Number(r.dataset.fixtureIndex)), controls:document.querySelectorAll('.wshs-sf-inspect').length, reasons:document.querySelectorAll('.wshs-review-reason').length })`}});
                console.log('MCP inspection:',JSON.stringify(result.content));
                const report=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
                const state=JSON.parse(report.slice(report.indexOf('{'),report.lastIndexOf('}')+1));
                check('Chrome DevTools MCP verifies inspection on page '+pageId,!result.isError&&state.inspection&&state.controls===1&&state.reasons===3&&JSON.stringify(state.visible)==='[0,3,5]');
            }
        }
        for (const page of pages) {
            await page.bringToFront(); await page.reload({waitUntil:'load'}); await page.waitForSelector('.wshs-sf-label');
            check('saved keyword and dependency filters survive reload on '+new URL(page.url()).pathname,await page.$$eval('.wshs-sf-label',es=>es.length===2&&es[1].textContent==='Requires Project Viewpoint'));
            check('reload exits inspection and reapplies saved AI exclusions',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-reviewing')&&document.querySelectorAll('.wshs-filtered').length===3));
        }
        check('no unexpected page errors',errors.filter(e=>!(/WebAssembly/.test(e)&&/Content-Security-Policy/.test(e))).length===0);
        console.log(checks+' filter inspection checks passed.');
    } finally { if (mcp) await mcp.close(); await closeBrowser(browser); }
})().catch(e=>{console.error(e);process.exitCode=1});
