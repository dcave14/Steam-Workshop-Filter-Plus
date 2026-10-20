// Live Chrome regression checks for storage migration, concurrent game saves,
// cross-tab sync, author include rules, and the armor/mechs cache collision.
const assert = require('assert/strict');
const { launch, closeBrowser, extensionWorld, openBrowse, wait, BASE_URL } = require('./browser-helpers');

const filter = (value, state) => ({kind:'keyword', value, label:value, state});
const getCount = () => {
    const m = document.body.innerText.match(/([\d,]+) entries matching/);
    return m ? Number(m[1].replace(/,/g,'')) : null;
};
let checks=0;
function pass(label) {checks++;console.log('PASS '+label);}

(async()=>{
    const browser=await launch(process.argv[2]);
    try {
        const page=await browser.newPage();await page.setViewport({width:1600,height:1000});
        const world=await extensionWorld(page);
        await openBrowse(page,BASE_URL+'&search_text_target=1&searchtext='+encodeURIComponent('"mechs"'));
        const onlyMechs=await page.evaluate(getCount);
        assert.ok(onlyMechs>0,'Steam reference for mechs is available');
        await openBrowse(page);

        const legacy={294100:[filter('old phrase',0)],108600:[filter('old zombie phrase',0)]};
        await world(`chrome.storage.local.set(${JSON.stringify({savedFilters:legacy})})`);
        await openBrowse(page);
        assert.equal(await page.$eval('.wshs-sf-label',e=>e.textContent),'old phrase');
        pass('existing shared-map filters load without losing either game');
        await page.click('.wshs-sf-delete');
        await page.waitForFunction(()=>document.querySelectorAll('.wshs-sf-label').length===0);
        await openBrowse(page);
        assert.equal(await page.$$eval('.wshs-sf-label',es=>es.length),0);
        pass('deleting a migrated filter does not resurrect it after reload');

        console.log('Checking second game and concurrent saves...');
        const other=await browser.newPage();await other.setViewport({width:1600,height:1000});
        const otherWorld=await extensionWorld(other);
        await openBrowse(other,BASE_URL.replace('appid=294100','appid=108600'));
        assert.equal(await other.$eval('.wshs-sf-label',e=>e.textContent),'old zombie phrase');
        // Force the old read/modify/write implementation to race reliably:
        // both reads finish before either delayed save callback runs.
        const delayReads=`(() => {const get=chrome.storage.local.get.bind(chrome.storage.local);chrome.storage.local.get=(keys,cb)=>cb?get(keys,data=>setTimeout(()=>cb(data),150)):get(keys);})()`;
        await world(delayReads);await otherWorld(delayReads);
        console.log('Both game pages ready.');
        await page.bringToFront();await page.type('.wshs-sf-input','armor');
        console.log('First game input ready.');
        await other.bringToFront();await other.type('.wshs-sf-input','survivor');
        console.log('Second game input ready.');
        // DOM clicks avoid Puppeteer's visibility wait on a background tab.
        await Promise.all([world(`document.querySelector('.wshs-sf-save').click()`),otherWorld(`document.querySelector('.wshs-sf-save').click()`)]);
        await wait(500);
        const saved=await world('chrome.storage.local.get(null)');
        assert.ok(saved['savedFilters:294100'].some(f=>f.value==='armor'));
        assert.ok(saved['savedFilters:108600'].some(f=>f.value==='survivor'));
        assert.deepEqual(saved.savedFilters,legacy,'migration leaves the old shared map intact');
        pass('simultaneous saves in different games preserve both lists');

        const sibling=await browser.newPage();await sibling.setViewport({width:1600,height:1000});
        await openBrowse(sibling);
        await sibling.click('.wshs-sf-list > :first-child > :nth-child(2)');
        await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-wshs-terms'),{polling:100});
        pass('same-game edits synchronize to another open tab');
        await sibling.close();await other.close();
        await page.bringToFront();

        const requests=[];
        const targets=[];
        page.on('request',r=>{
            if(r.headers()['x-valve-request-type']==='routeAction') {
                try {const body=JSON.parse(r.postData())[0];requests.push(body.search_text);targets.push({body:body.search_text_target,url:new URL(r.url()).searchParams.get('search_text_target')})}catch{}
            }
        });
        async function setFilters(list,expectRequest=true) {
            const before=await page.evaluate(()=>Number(document.documentElement.getAttribute('data-wshs-fetched')||0));
            await world(`chrome.storage.local.set(${JSON.stringify({'savedFilters:294100':list})})`);
            if(expectRequest)await page.waitForFunction(n=>Number(document.documentElement.getAttribute('data-wshs-fetched')||0)>n,{timeout:20000},before);
            await wait(500);
        }
        await setFilters([filter('armor',-1)],false); // This state is already in Steam's client cache.
        const armorCount=await page.evaluate(getCount);
        assert.ok(armorCount>onlyMechs,'reference queries distinguish the collision');
        await setFilters([filter('mechs',1)]);
        await page.waitForFunction(expected=>{
            const m=document.body.innerText.match(/([\d,]+) entries matching/);
            return m&&Math.abs(Number(m[1].replace(/,/g,''))-expected)<=expected*.01;
        },{timeout:15000},onlyMechs);
        assert.ok(requests.includes('"mechs"'),'the changed filter reaches Steam');
        pass('hide armor -> only mechs sends a new query and shows mechs results');

        await setFilters([filter('mechs',1),filter('armor',-1)]);
        assert.ok(requests.includes('"mechs" -"armor"'));
        await page.type('#CommunityTemplate form input[type=text]','vanilla');
        await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.querySelector('#CommunityTemplate form input[type=text]').value.trim()==='vanilla');
        await wait(500);
        assert.ok(requests.includes('vanilla "mechs" -"armor"'),'typed search and both saved keywords reach Steam together');
        assert.ok(targets.length>0&&targets.every(t=>t.body===1&&t.url==='1'),'saved keyword requests use native Title Only scope in both body and URL');
        pass('multiple saved keywords combine with the user search without polluting its text');

        await world(`chrome.storage.local.set({'savedFilters:294100':[]})`);
        await openBrowse(page);
        const authors=await world(`(() => [...new Set(WSHSDom.enumerateCards().map(c=>c.root.querySelector('a[href*="/myworkshopfiles"]')?.getAttribute('href')).filter(Boolean))].slice(0,2).map(h=>{const m=/\\/(id|profiles)\\/([^/?#]+)/.exec(h);return (m[1]+'/'+m[2]).toLowerCase()}))()`);
        assert.equal(authors.length,2,'at least two authors for the include test');
        await world(`chrome.storage.local.set(${JSON.stringify({'savedFilters:294100':authors.map(value=>({kind:'author',value,label:value,state:1}))})})`);
        await wait(150);
        const visibleAuthors=await world(`WSHSDom.enumerateCards().filter(c=>c.root.getBoundingClientRect().width>0).map(c=>{const h=c.root.querySelector('a[href*="/myworkshopfiles"]').getAttribute('href');const m=/\\/(id|profiles)\\/([^/?#]+)/.exec(h);return (m[1]+'/'+m[2]).toLowerCase()})`);
        assert.ok(visibleAuthors.length>0&&visibleAuthors.every(a=>authors.includes(a)));
        assert.ok(authors.every(a=>visibleAuthors.includes(a)));
        pass('multiple author + filters include the union of their cards');
        console.log(`${checks} saved-filter regression checks passed.`);
    } finally {await closeBrowser(browser);}
})().catch(error=>{console.error(error);process.exitCode=1});
