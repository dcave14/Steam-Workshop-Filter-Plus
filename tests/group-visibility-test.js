// Check rendered visibility, not only filter class names. Steam can replace a
// card's class attribute without inserting any new DOM nodes.
const assert=require('assert/strict');
const {launch,closeBrowser,addSavedFilter,moveFilterToGroup,wait}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
(async()=>{const b=await launch(process.argv.includes('--firefox')?'firefox':undefined);try{
 for(const collection of [false,true]){
  const p=await b.newPage();await p.setRequestInterception(true);
  p.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:fixture(collection)}):r.abort());
  const url=collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100';
  await p.goto(url);await p.waitForSelector('.wshs-sf-input');
  while(await p.$('.wshs-group-remove')){await p.click('.wshs-group-remove');await wait(60);}
  while(await p.$('.wshs-sf-delete')){await p.click('.wshs-sf-delete');await wait(60);}
  await addSavedFilter(p,'keyword','AI');await addSavedFilter(p,'group','AI group');
  const groupId=await p.$eval('.wshs-filter-group',n=>n.dataset.groupId);
  await moveFilterToGroup(p,'.wshs-group-select',groupId);await p.click('.wshs-group-collapse');
  const shown=()=>p.$$eval('.fixture-card,.collectionItem',es=>es.map((n,i)=>n.getBoundingClientRect().width?i:null).filter(i=>i!==null));
  await wait(150);assert.deepEqual(await shown(),[1,2,4,6,7]);
  await p.reload();await p.waitForSelector('.wshs-group-toggle');await wait(150);
  assert.deepEqual(await shown(),[1,2,4,6,7]);
  assert.equal(await p.$eval('html',n=>n.classList.contains('wshs-reviewing')),false);
  // Equivalent to React committing its owned className during an update.
  await p.$$eval('.fixture-card,.collectionItem',es=>es.forEach(n=>n.setAttribute('class',n.className.replace(/\bwshs-filtered\b/g,''))));
  await wait(200);
  assert.deepEqual(await shown(),[1,2,4,6,7],(collection?'Collection':'Workshop')+' keeps exclusions after native class replacement without using inspection');
  console.log('PASS '+(collection?'Collection':'Workshop')+' visible results survive reload and native class replacement without inspection');
  const titleSelector=collection?'.collectionItem .workshopItemTitle':'.fixture-card > a';
  await p.$$eval(titleSelector,ns=>ns[1].firstChild.data='AI added by a native title update');await wait(150);
  assert.deepEqual(await shown(),[2,4,6,7],'text-node updates reapply matching');
  await p.$$eval(titleSelector,ns=>ns[1].firstChild.data='Rain collectors');await wait(150);
  assert.deepEqual(await shown(),[1,2,4,6,7]);
  await p.$eval(collection?'.collectionChildren':'.fixture-grid',container=>{const row=container.firstElementChild.cloneNode(true);row.classList.remove('wshs-filtered');row.querySelectorAll('a[href*=filedetails]').forEach(a=>a.href=a.href.replace('990000001','990000009'));container.append(row);});await wait(150);
  assert.deepEqual(await shown(),[1,2,4,6,7],'newly inserted matching cards are hidden immediately');
  await p.$eval(collection?'.collectionChildren':'.fixture-grid',n=>n.lastElementChild.remove());await wait(100);
  await p.click('.wshs-group-header .wshs-sf-inspect');await wait(120);
  assert.deepEqual(await shown(),[0,3,5],'inspection reveals only excluded rows');
  await p.click('.wshs-review-exit');await wait(120);
  assert.deepEqual(await shown(),[1,2,4,6,7],'leaving inspection restores filtered results');
  await p.click('.wshs-group-toggle');await wait(100);
  assert.deepEqual(await shown(),[0,1,2,3,4,5,6,7],'disabling group reveals all rows');
  await p.$eval(collection?'.collectionItem':'.fixture-card',n=>n.classList.add('wshs-filtered'));await wait(150);
  assert.deepEqual(await shown(),[0,1,2,3,4,5,6,7],'stale flags cannot keep a disabled group filtering');
  await p.click('.wshs-group-toggle');await wait(150);
  assert.deepEqual(await shown(),[1,2,4,6,7],'reenabling collapsed group applies without inspection');
  if(collection)assert.equal(await p.$eval('[data-wshs-subscription-plan]',n=>JSON.parse(n.dataset.wshsSubscriptionPlan).excluded.length),3);
  console.log('PASS '+(collection?'Collection':'Workshop')+' title changes, late cards, inspection roundtrip, disable/enable and stale flags use correct visible results');
  await p.close();
 }
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
