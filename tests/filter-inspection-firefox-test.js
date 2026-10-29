const {selectAddKind}=require('./browser-helpers');
// Firefox UI checks use the real packaged extension without Chromium's CDP realms.
const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch('firefox');
 try{
  const errors=[];
  for(const collection of [false,true]){
   const page=await browser.newPage();await page.setViewport({width:1280,height:1000});page.on('pageerror',e=>errors.push(e.message));
   await page.setRequestInterception(true);
   page.on('request',async r=>{
    const u=new URL(r.url());
    if(r.isNavigationRequest()&&r.frame()===page.mainFrame())return r.respond({status:200,contentType:'text/html',body:fixture(collection)});
    if(u.pathname==='/sharedfiles/actions'){const ids=JSON.parse(u.searchParams.get('qp'))[0];return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:ids.map(publishedfileid=>({publishedfileid,file_size:'100',total_votes:10}))})});}
    if(u.pathname==='/ISteamRemoteStorage/GetPublishedFileDetails/v1/'){
     const ids=[...new URLSearchParams(await r.fetchPostData())].filter(([k])=>k.startsWith('publishedfileids[')).map(([,v])=>v);
     return r.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'https://steamcommunity.com'},body:JSON.stringify({response:{publishedfiledetails:ids.map(id=>({publishedfileid:id,result:1,description:id==='990000002'?'AI helpers':'Rain only'}))}})});
    }
    if(/\/sharedfiles\/filedetails\/?$/.test(u.pathname))return r.respond({status:200,contentType:'text/html',body:'<div class="workshopItemTitle">Project Viewpoint</div><div class="workshopItemDescription">Description</div>'+(u.searchParams.get('id')==='990000003'?'<div id="RequiredItems"><a href="/workshop/filedetails/?id=3809306528">Project Viewpoint</a></div>':'')});
    r.abort();
   });
   await page.goto(collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100',{waitUntil:'load'});
   await page.waitForSelector('.wshs-sf-input');
   // Clear shared filters from the previous tab using public controls.
   while(await page.$('.wshs-sf-delete')){await page.click('.wshs-sf-delete');await wait(100);}
   if(await page.$eval('.wshs-description-toggle',e=>e.checked)){await page.click('.wshs-description-toggle');await wait(100);}
   await page.evaluate(()=>{
    const roots=[...document.querySelectorAll('.collectionItem,.fixture-card')];roots.forEach((r,i)=>{r.dataset.fixtureIndex=String(i);const c=document.createElement('div');c.className='commentthread_comment_text';c.textContent='CommentOnlyFilter AI';r.append(c);});
    roots[0].classList.add('hidden-item');
   });
   const prefix=(collection?'Collection':'Workshop')+' Firefox: ';
   const hidden=()=>page.$$eval('.wshs-filtered',es=>es.map(e=>Number(e.dataset.fixtureIndex)).sort());
   const shown=()=>page.$$eval('[data-fixture-index]',es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>Number(e.dataset.fixtureIndex)).sort());
   async function save(value){await selectAddKind(page,'keyword');await page.type('.wshs-sf-input',value);await page.$eval('.wshs-sf-input',e=>e.nextElementSibling.click());await wait(160);}
   await save('CommentOnlyFilter');check(prefix+'comment-only exclusions never hide a mod',(await hidden()).length===0);
   await page.click('.wshs-sf-delete');await wait(100);await save('AI');
   check(prefix+'AI matches whole words, preserving rain/train/aim',JSON.stringify(await hidden())==='[0,3,5]');
   await page.click('.wshs-sf-label');await wait(100);check(prefix+'filter text reveals subscribed exclusions',JSON.stringify(await shown())==='[0,3,5]');
   if(collection)check(prefix+'inspection uses compact side-by-side rows with the reason inside details',await page.$eval('.wshs-review-match',r=>r.getBoundingClientRect().height<115&&r.querySelector('.workshopItem').getBoundingClientRect().right<=r.querySelector('.collectionItemDetails').getBoundingClientRect().left&&r.querySelector('.wshs-review-reason').parentElement.classList.contains('collectionItemDetails')));
   await page.click('.wshs-sf-inspect');await wait(100);check(prefix+'magnifying glass toggles inspection off',!await page.evaluate(()=>document.documentElement.classList.contains('wshs-reviewing')));
   await page.$eval('.wshs-sf-row',r=>r.children[0].click());await wait(100);check(prefix+'plus keeps only matching words',JSON.stringify(await hidden())==='[1,2,4,6,7]');
   await page.$eval('.wshs-sf-row',r=>r.children[1].click());await page.click('.wshs-description-toggle');
   await page.waitForFunction(()=>document.querySelectorAll('.wshs-filtered').length===4);
   check(prefix+'description scope adds a verified whole-word match',JSON.stringify(await hidden())==='[0,1,3,5]');
   await selectAddKind(page,'dependency');await page.type('.wshs-dependency-input','3809306528');await page.$eval('.wshs-dependency-input',e=>e.nextElementSibling.click());
   await page.waitForFunction(()=>document.querySelector('.wshs-dependency-status').hidden&&document.querySelectorAll('.wshs-sf-label').length===2);
   check(prefix+'direct dependency IDs add the required mod exclusion',JSON.stringify(await hidden())==='[0,1,2,3,5]');
   await page.click('.wshs-sf-row:nth-child(2) .wshs-sf-inspect');await wait(100);check(prefix+'dependency inspection stays separate',JSON.stringify(await shown())==='[2]');
   if(collection)check(prefix+'inspection preserves the subscription exclusion plan',await page.$eval('[data-wshs-subscription-plan]',b=>JSON.parse(b.dataset.wshsSubscriptionPlan).excluded.length===5));
   await page.reload({waitUntil:'load'});await page.waitForSelector('.wshs-sf-label');
   check(prefix+'reload keeps both filters and exits inspection',await page.$$eval('.wshs-sf-label',es=>es.length===2)&&!await page.evaluate(()=>document.documentElement.classList.contains('wshs-reviewing')));
  }
  check('Firefox has no page errors',errors.length===0);console.log(checks+' Firefox inspection checks passed.');
 }finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
