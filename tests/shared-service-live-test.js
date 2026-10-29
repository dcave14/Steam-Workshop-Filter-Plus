const {selectAddKind}=require('./browser-helpers');
// Live public service acceptance. No Steam key is entered or read by this test.
const assert=require('assert/strict');
const {launch,closeBrowser}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
(async()=>{
 const firefox=process.argv.includes('--firefox');
 const b=await launch(firefox?'firefox':'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',{useConfiguredService:true});
 try{
  let settingsAnchor;
  // Exercise the actual shared service through BOTH layouts. In particular,
  // a keyword filter must not mask a broken Workshop dependency filter.
  for(const collection of [false,true]){
   const page=await b.newPage();await page.setViewport({width:1600,height:1000});
   let html=fixture(collection);
   html=html.replaceAll('990000001','3812510377').replaceAll('990000002','3809306528');
   await page.setRequestInterception(true);
   page.on('request',r=>r.isNavigationRequest()&&r.url().startsWith('https://steamcommunity.com/')?r.respond({status:200,contentType:'text/html',body:html}):r.continue());
   await page.goto(collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100');
   await page.waitForSelector('.wshs-sf-input');
   const selector=collection?'.collectionItem':'.fixture-card';
   await page.$$eval(selector,rows=>rows.slice(2).forEach(r=>r.remove()));
   await selectAddKind(page,'dependency');await page.type('.wshs-dependency-input','3809306528');
   await page.$eval('.wshs-dependency-input',e=>e.nextElementSibling.click());
   await page.waitForFunction(()=>document.querySelector('.wshs-dependency-status').hidden&&document.querySelectorAll('.wshs-filtered').length===1,{timeout:30000});
   assert.deepEqual(await page.$$eval(selector,rows=>rows.map(r=>r.classList.contains('wshs-filtered'))),[true,false]);
   await page.click('.wshs-sf-label');
   await page.waitForFunction(()=>document.querySelectorAll('.wshs-review-match').length===1);
   assert.ok(await page.$eval('.wshs-review-match',r=>r.querySelector('a[href*="3812510377"]')&&r.getBoundingClientRect().width>0));
   await page.click('.wshs-review-exit');
   // Both native +/- buttons must also work when the filter is already saved.
   await page.$eval('.wshs-sf-row',r=>r.children[0].click());
   await page.waitForFunction(()=>document.querySelectorAll('.wshs-filtered').length===1);
   assert.deepEqual(await page.$$eval(selector,rows=>rows.map(r=>r.classList.contains('wshs-filtered'))),[false,true]);
   if(collection&&!firefox)settingsAnchor=page;else await page.close();
   console.log((collection?'Collection':'Workshop')+': live API dependency minus, inspection and plus verified without a keyword filter.');
  }
  if(firefox){
   console.log('Firefox: both layouts verified above. Options-page automation is restricted by Firefox BiDi.');
   return;
  }
  const opening=b.waitForTarget(t=>t.url().endsWith('/options.html'));
  await settingsAnchor.click('.wshs-api-settings');const options=await(await opening).page();
  await options.waitForSelector('#service-settings:not([hidden])');
  assert.ok(await options.$eval('#personal-settings',e=>e.hidden));
  await options.click('#service-test');await options.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('API verified'),{timeout:30000});
  console.log((firefox?'Firefox':'Chromium')+': shared service verified without a client key; key form hidden.');
 }finally{await closeBrowser(b)}
})().catch(e=>{console.error(e);process.exitCode=1});
