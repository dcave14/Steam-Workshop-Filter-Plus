// React rewrites a redrawn node's className whole, dropping the layout classes
// workshop-appearance.js marked without adding or removing a node. Count real
// sync() runs in a disposable copy of the source; no production test hooks.
// WSHS_SOURCE_OVERLAY=<folder of older sources> shows the repair checks failing.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {launch,closeBrowser,extensionWorld,wait,sourcePath,overlaySource}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
const overlay=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-class-repair-'));
{
 const needle='function sync() {';
 const source=fs.readFileSync(overlaySource(process.env.WSHS_SOURCE_OVERLAY,'src/workshop/workshop-appearance.js')||sourcePath('workshop-appearance.js'),'utf8');
 if(!source.includes(needle))throw Error('Missing workshop-appearance.js:sync');
 fs.mkdirSync(path.join(overlay,'src/workshop'),{recursive:true});
 fs.writeFileSync(path.join(overlay,'src/workshop/workshop-appearance.js'),source.replace(needle,needle+' window.__appearanceSyncs=(window.__appearanceSyncs||0)+1;'));
}
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
// The body is always taller than the window, so a repair can't toggle the
// scrollbar, resize the grid and add a second, unrelated sync.
const body=fixture(false).replaceAll('aspectratio_16x9','aspectratio_square').replace('</style>','body{min-height:3000px}</style>');
// Every node carrying one of the appearance classes, as a comparable snapshot.
const marked=`(()=>[...document.querySelectorAll('[class*="wshs-compact-"],[class*="wshs-collection-browse-"],.wshs-no-hover-motion')].map(n=>[...n.classList].filter(c=>/^wshs-(compact|collection-browse)-|^wshs-no-hover-motion$/.test(c)).sort().join(' ')))()`;
// What React does on a redraw: one whole className write per node.
const wipeCards=()=>{let wiped=0;document.querySelectorAll('[class*="wshs-collection-browse"],[class*="wshs-compact-"],.wshs-no-hover-motion').forEach(e=>{
 if(e.classList.contains('wshs-collection-browse-grid')||e.classList.contains('wshs-compact-grid'))return;
 e.className=[...e.classList].filter(c=>!/^wshs-(compact|collection-browse)-|^wshs-no-hover-motion$/.test(c)).join(' ');wiped++;});return wiped;};
(async()=>{const b=await launch(undefined,{sourceOverlay:overlay});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1600,height:1000});await p.setRequestInterception(true);
 p.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body}):r.abort());
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=294100&section=collections');
 await p.waitForSelector('.wshs-collection-browse-card');await wait(500);const w=await extensionWorld(p);
 const syncs=()=>w('window.__appearanceSyncs||0'),reset=()=>w('window.__appearanceSyncs=0');
 // Runs a page change, waits for the frames a repair needs, returns the sync count.
 async function after(change,arg){await reset();const result=await p.evaluate(change,arg);await wait(200);return {result,count:await syncs()};}
 for(const density of ['comfortable','compact']){
  await w(`chrome.storage.local.set({layoutDensity:'${density}',reduceMotion:${density==='compact'},disableCardHover:true})`);await wait(300);
  const before=await w(marked),label=density+': ';
  check(label+'grid and cards are marked',before.length>8&&await p.$$eval('.wshs-collection-browse-card',ns=>ns.length===8)&&!!await p.$('.wshs-collection-browse-grid')&&(density==='compact')===!!await p.$('.wshs-compact-grid.wshs-collection-browse-grid .wshs-compact-card.wshs-no-hover-motion'));
  check(label+'a settled page does no appearance work',(await after(()=>{})).count===0);

  let run=await after(wipeCards);
  check(label+'a className wipe of every card removes the classes',run.result>=8);
  check(label+'wiped card classes return',JSON.stringify(await w(marked))===JSON.stringify(before));
  check(label+'the whole batch is repaired by one sync, not one per card',run.count===1);

  // The wipe and the repair's own class writes must not schedule further syncs.
  check(label+'the repair does not feed itself',(await after(()=>{})).count===0);

  run=await after(()=>{const card=document.querySelector('.wshs-collection-browse-card');card.className='fixture-card';});
  check(label+'a single redrawn card is repaired with one sync',run.count===1&&JSON.stringify(await w(marked))===JSON.stringify(before));

  run=await after(()=>{const title=document.querySelector('.wshs-collection-browse-title');title.className='';});
  check(label+'a wiped node inside a card is repaired',run.count===1&&JSON.stringify(await w(marked))===JSON.stringify(before));

  run=await after(()=>{document.querySelector('.wshs-collection-browse-grid').className='fixture-grid';});
  check(label+'a wiped grid gets its classes and column count back',run.count===1&&JSON.stringify(await w(marked))===JSON.stringify(before)&&await p.$eval('.wshs-collection-browse-grid',n=>!!n.style.getPropertyValue('--wshs-compact-columns')));

  run=await after(()=>{const grid=document.querySelector('.wshs-collection-browse-grid'),next=document.createElement('main');next.className='fixture-grid';grid.replaceWith(next);next.append(...grid.children);});
  check(label+'a replaced grid node is marked again',run.count>=1&&JSON.stringify(await w(marked))===JSON.stringify(before)&&await p.$eval('main',n=>n.classList.contains('wshs-collection-browse-grid')&&!!n.style.getPropertyValue('--wshs-compact-columns')));
  run=await after(wipeCards);
  check(label+'cards under the replacement grid are watched too',run.count===1&&JSON.stringify(await w(marked))===JSON.stringify(before));

  // Steam hover states and other scripts' flags change classes constantly.
  run=await after(()=>{document.querySelectorAll('.fixture-card,.fixture-card *,.fixture-grid').forEach(n=>n.classList.add('native-hover'));});
  check(label+'class additions on marked nodes do no appearance work',run.count===0);
  run=await after(()=>{document.querySelectorAll('.native-hover').forEach(n=>{n.className=n.className.replace('native-hover','native-idle');});});
  check(label+'whole className writes that keep our classes do no appearance work',run.count===0&&JSON.stringify(await w(marked))===JSON.stringify(before));
  run=await after(()=>{document.querySelectorAll('.native-idle').forEach(n=>n.classList.remove('native-idle'));const card=document.querySelector('.fixture-card');card.classList.add('wshs-filtered');card.classList.remove('wshs-filtered');});
  check(label+'other classes leaving marked nodes do no appearance work',run.count===0);

  // RimOxide's page script answers a wipe with a window resize of its own.
  run=await after(()=>{dispatchEvent(new Event('resize'));document.querySelectorAll('.wshs-collection-browse-card').forEach(e=>{e.className='fixture-card';});dispatchEvent(new Event('resize'));});
  check(label+'a wipe alongside extra resize events is still one sync',run.count===1&&JSON.stringify(await w(marked))===JSON.stringify(before));
 }
 // Density switch: sync() removes and re-adds classes on nodes it keeps tracking.
 await reset();await w("chrome.storage.local.set({layoutDensity:'comfortable'})");await wait(300);
 check('our own class removals on a density switch cause no second sync',await syncs()===1&&!await p.$('[class*="wshs-compact-"]'));
 await reset();await w("chrome.storage.local.set({layoutDensity:'compact'})");await wait(300);
 check('our own class additions on a density switch cause no second sync',await syncs()===1&&!!await p.$('.wshs-compact-card'));

 let run=await after(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 check('a page restored from the back/forward cache syncs once',run.count===1);
 run=await after(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}));});
 check('an ordinary pageshow does no appearance work',run.count===0);
 run=await after(()=>{document.dispatchEvent(new Event('visibilitychange'));});
 check('becoming visible syncs once',run.count===1);
 run=await after(()=>{document.querySelectorAll('.wshs-collection-browse-card').forEach(e=>{e.className='fixture-card';});dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));});
 check('a wipe found on restore is repaired by one sync',run.count===1&&(await p.$$('.wshs-collection-browse-card.wshs-compact-card')).length===8);

 // Nothing marked: no class watching at all, so a wipe-shaped change is free.
 await w("chrome.storage.local.set({layoutDensity:'comfortable',reduceMotion:false})");
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=294100');await p.waitForSelector('.wshs-sf-input');await wait(500);
 const items=await extensionWorld(p);await items('window.__appearanceSyncs=0');
 await p.evaluate(()=>{document.querySelectorAll('.fixture-card,.fixture-grid').forEach(n=>{n.className=n.className+' native-hover';});});await wait(200);
 check('Comfortable item browsing marks nothing and does no work on class changes',await items('window.__appearanceSyncs||0')===0&&!await p.$('[class*="wshs-compact-"],[class*="wshs-collection-browse-"],.wshs-no-hover-motion'));
 if(errors.length)console.error(errors);
 check('no page errors',!errors.length);console.log(checks+' appearance class repair checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
