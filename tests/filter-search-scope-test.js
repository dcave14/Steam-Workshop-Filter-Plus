const assert=require('assert/strict');
const {launch,closeBrowser,openBrowse,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{
 const browser=await launch(process.argv.includes('--firefox')?'firefox':undefined);
 try{
  const page=await browser.newPage();await page.setViewport({width:1600,height:1000});
  const requests=[],errors=[];let ids=[],outage=false,descriptionCalls=0,collectionDescriptionCalls=0,reloading=false;
  page.on('pageerror',e=>{
   // Reproduced with a native whitespace search in Chrome without any extension:
   // the earlier no-extension diagnostic. Accept only that known reload warning.
   if(reloading&&/Minified React error #418;/.test(e.message)){console.log('Native Steam reload warning reproduced; checking recovery.');return;}
   errors.push(e.message);console.error('Workshop page error:',e.stack||e.message);
  });
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname==='/ISteamRemoteStorage/GetPublishedFileDetails/v1/'){
    descriptionCalls++;const data=new URLSearchParams(await r.fetchPostData());
    const batch=[...data].filter(([k])=>k.startsWith('publishedfileids[')).map(([,v])=>v);
    if(outage)return r.respond({status:503,headers:{'access-control-allow-origin':'https://steamcommunity.com'},body:'{}'});
    return r.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'https://steamcommunity.com'},body:JSON.stringify({response:{result:1,publishedfiledetails:batch.map(id=>({publishedfileid:id,result:1,description:id===ids[1]?'Neutral text. '.repeat(100)+' Codex documentation.':''}))}})});
   }
   if(r.headers()['x-valve-request-type']==='routeAction'){
    try{const body=JSON.parse(await r.fetchPostData());requests.push(...(Array.isArray(body)?body:[body]).filter(x=>typeof x?.search_text==='string'));}catch(_){}
   }
   r.continue();
  });
  await openBrowse(page);await page.evaluate(()=>document.fonts.ready);await wait(250);
  check('description search is off by default',await page.$eval('.wshs-description-toggle',e=>!e.checked));
  check('checkbox has the requested exact wording',await page.$eval('.wshs-description-option',e=>e.textContent==='Include descriptions in search'));
  const labels=await page.$$eval('.wshs-injected-controls .wshs-button-label',es=>es.map(e=>e.textContent));
  check('Workshop order is Hide Subscribed, Ratings, Star Rating, native sort',labels.join('|')==='Hide Subscribed|Ratings|Star Rating');
  check('Workshop filter labels are centered independently of icons',await page.$$eval('.wshs-injected-controls .hide-subscribed-button',es=>es.every(e=>{const r=e.getBoundingClientRect(),l=e.querySelector('.wshs-button-label').getBoundingClientRect();return Math.abs(l.left+l.right-r.left-r.right)<1})));
  check('game versions are visually descending with 1.7 and 1.6 first',await page.evaluate(()=>{
   const category=document.querySelector('.wshs-saved-filters').nextElementSibling;
   const rows=[...category.querySelectorAll('div')].filter(r=>r.children.length>=3&&/^\d+\.\d+$/.test(r.children[2].textContent.trim())&&r.children[0].getAttribute('role')==='button');
   rows.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
   return rows[0]?.children[2].textContent==='1.7'&&rows[1]?.children[2].textContent==='1.6'&&rows.every((r,i)=>!i||Number(rows[i-1].children[2].textContent)>=Number(r.children[2].textContent));
  }));
  await page.$eval('.wshs-sf-input',e=>{e.value='Codex';e.nextElementSibling.click()});
  await page.waitForSelector('.wshs-sf-label');
  check('saved minus is kept out of Steam search',await page.evaluate(()=>!document.documentElement.getAttribute('data-wshs-terms')));
  await page.$eval('.wshs-sf-row',r=>r.children[0].click());
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-requested-terms')==='"Codex"');
  check('default keyword requests enforce title-only scope',requests.some(r=>r.search_text.includes('Codex')&&r.search_text_target===1));
  await page.click('.wshs-description-toggle');
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-requested-description-search')==='1');
  await wait(150);
  check('opt-in keyword requests use titles and descriptions',requests.some(r=>r.search_text.includes('Codex')&&r.search_text_target===0));
  await page.click('.wshs-description-toggle');
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-requested-description-search')==='0');
  await wait(150);
  check('turning description search off refetches title-only results',requests.at(-1).search_text_target===1);
  await page.$eval('.wshs-sf-row',r=>r.children[1].click());await wait(250);
  const callsBeforeCollection=descriptionCalls;
  const collection=await browser.newPage();await collection.setViewport({width:1280,height:1000});
  collection.on('pageerror',e=>{errors.push(e.message);console.error('Collection page error:',e.stack||e.message)});
  // Intercept public descriptions in this tab as well.
  await collection.setRequestInterception(true);
  collection.on('request',async r=>{
   if(new URL(r.url()).pathname==='/ISteamRemoteStorage/GetPublishedFileDetails/v1/'){
    descriptionCalls++;collectionDescriptionCalls++;const batch=[...new URLSearchParams(await r.fetchPostData())].filter(([k])=>k.startsWith('publishedfileids[')).map(([,v])=>v);
    return r.respond({status:outage?503:200,contentType:'application/json',headers:{'access-control-allow-origin':'https://steamcommunity.com'},body:JSON.stringify({response:{publishedfiledetails:batch.map(id=>({publishedfileid:id,result:1,description:id===ids[1]?'Neutral text. '.repeat(100)+' Codex documentation.':''}))}})});
   }r.continue();
  });
  await collection.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'load'});await collection.waitForSelector('.wshs-description-toggle');
  ids=await collection.$$eval('.collectionItem',rows=>{
   rows.slice(4).forEach(r=>r.remove());return rows.slice(0,4).map((row,i)=>{row.querySelector('.workshopItemTitle').textContent=i===0?'Codex Tools':'Neutral fixture '+i;return row.id.replace('sharedfile_','')});
  });
  await wait(200);
  check('collection bottom row has exactly the requested three controls',await collection.$$eval('.wshs-collection-controls .wshs-button-label',es=>es.map(e=>e.textContent).join('|')==='Hide Subscribed|Ratings|Star Rating'));
  check('description checkbox is separate from the toolbar',await collection.$eval('.wshs-description-toggle',e=>!e.closest('.subscribeCollection')&&!!e.closest('.wshs-saved-filters')));
  check('collection downloads no descriptions while its toggle is off',descriptionCalls===callsBeforeCollection);
  check('title-only collection filter leaves description matches visible',await collection.$$eval('.collectionItem.wshs-filtered',es=>es.length)===1);
  await collection.click('.wshs-description-toggle');
  await collection.waitForFunction(()=>document.querySelectorAll('.collectionItem.wshs-filtered').length===2,{timeout:30000});
  check('minus checks full descriptions beyond the truncated row preview',await collection.$eval('#sharedfile_'+ids[1],r=>r.classList.contains('wshs-filtered')));
  check('collection opt-in synchronizes to the open Workshop tab',await page.$eval('.wshs-description-toggle',e=>e.checked));
  check('subscription plan excludes description matches',await collection.$eval('[data-wshs-subscription-plan]',e=>{const p=JSON.parse(e.dataset.wshsSubscriptionPlan);return p.excluded.length===2&&p.allowed.length===2}));
  // The open Workshop tab also reacts to synchronized scope/mode changes and can
  // legitimately fetch descriptions for newly returned cards. Measure this cache only.
  const calls=collectionDescriptionCalls;
  await collection.$eval('.wshs-sf-list> :first-child',r=>r.children[0].click());await wait(150);
  check('plus also includes matches found only in descriptions',await collection.$$eval('.collectionItem:not(.wshs-filtered)',es=>es.length)===2);
  await collection.click('.wshs-description-toggle');await wait(200);
  check('disabling description search restores title-only plus behavior',await collection.$$eval('.collectionItem:not(.wshs-filtered)',es=>es.length)===1);
  await collection.click('.wshs-description-toggle');await wait(200);
  check('changing phrase modes reuses full description data',collectionDescriptionCalls===calls);
  outage=true;
  await collection.evaluate(()=>{
   const row=document.querySelector('.collectionItem').cloneNode(true);row.id='sharedfile_999991119';
   row.querySelector('.collectionItemDetails>a').href='/sharedfiles/filedetails/?id=999991119';row.querySelector('.workshopItemTitle').textContent='Unavailable description fixture';
   document.querySelector('.collectionChildren').append(row);
  });
  await collection.waitForFunction(()=>document.querySelector('.wshs-description-status').textContent.includes('unavailable'));
  check('failed descriptions are explained with a retry control',await collection.$eval('.wshs-description-retry',e=>!e.hidden));
  check('unverified descriptions block subscription plans',await collection.$eval('.subscribeCollection [onclick*="SubscribeCollection("]',e=>!e.hasAttribute('data-wshs-subscription-plan')&&e.hasAttribute('data-wshs-subscription-error')));
  check('unknown descriptions are not treated as known nonmatches',await collection.$eval('#sharedfile_999991119',e=>!e.classList.contains('wshs-filtered')));
  outage=false;await collection.click('.wshs-description-retry');
  await collection.waitForFunction(()=>document.querySelector('.wshs-description-status').hidden);
  check('retry verifies an empty description and restores the subscription plan',await collection.$eval('#sharedfile_999991119',e=>e.classList.contains('wshs-filtered'))&&!!await collection.$('[data-wshs-subscription-plan]'));
  await collection.$eval('#sharedfile_999991119',e=>e.remove());
  // The previous cache checks leave this filter positive. Explicitly restore
  // exclusion mode before checking that exclusions stay local across reload.
  await collection.$eval('.wshs-sf-row',r=>r.children[1].click());
  await page.waitForFunction(()=>!document.documentElement.getAttribute('data-wshs-terms'));
  await page.bringToFront();
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-description-search')==='1');await wait(600);
  await page.mouse.move(0,0);reloading=true;await page.reload({waitUntil:'load'});
  try{await page.waitForSelector('.wshs-description-toggle')}catch(e){console.error(await page.evaluate(()=>({url:location.href,hydrated:document.documentElement.getAttribute('data-wshs-page-hydrated'),text:document.body.innerText.slice(0,1800)})));await page.screenshot({path:'tests/out/search-scope-failure.png'});throw e;}
  check('description preference and saved phrase survive reload',await page.$eval('.wshs-description-toggle',e=>e.checked)&&await page.$eval('.wshs-sf-list',e=>e.textContent.includes('Codex')));
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-description-search')==='1');
  check('reload preserves description scope and keeps exclusions local',await page.evaluate(()=>!document.documentElement.getAttribute('data-wshs-terms')));
  // Steam's native Firefox WASM CSP error is independently reproduced without an extension (TESTING.md).
  check('no additional errors beyond independently reproduced native Steam issues',errors.filter(e=>!(/WebAssembly/.test(e)&&/Content-Security-Policy/.test(e))).length===0);
  console.log(checks+' search-scope/order checks passed.');
 }finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
