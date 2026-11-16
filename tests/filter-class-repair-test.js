// React rewrites a redrawn card's className whole. That dropped hidden-item
// (stars / subscribed) and wshs-ratings-filtered without any node changing, so
// a filtered card came back into view. Count real applyFilters() passes in a
// disposable copy of the source; no production test hooks.
// WSHS_SOURCE_OVERLAY=<folder of older sources> shows the repair checks failing.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {launch,closeBrowser,extensionWorld,wait,sourcePath}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
const overlay=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-filter-repair-'));
{
 const base=process.env.WSHS_SOURCE_OVERLAY;
 if(base)fs.cpSync(base,overlay,{recursive:true});
 const target=path.join(overlay,'src/core/content.js'),needle='function applyFilters() {';
 const source=fs.readFileSync(fs.existsSync(target)?target:sourcePath('content.js'),'utf8');
 if(!source.includes(needle))throw Error('Missing content.js:applyFilters');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,source.replace(needle,needle+' window.__filterPasses=(window.__filterPasses||0)+1;'));
}
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
// Cards 1-4 carry five stars, cards 5-8 none; cards 1-2 have 5 ratings, the rest 500.
const star=name=>'<svg class="SVGIcon_'+name+'" viewBox="0 0 14 14"><rect width="14" height="14"/></svg>';
let card=0;
const body=fixture(false).replace(/<\/article>/g,()=>'<div class="fixture-stars">'+(card++<4?star('Star_Filled').repeat(5):star('Star_Unfilled').repeat(5))+'</div></article>').replace('</style>','body{min-height:3000px}.fixture-stars svg{width:10px;height:10px}</style>');
const flags=()=>[...document.querySelectorAll('.fixture-card')].map(n=>(n.classList.contains('hidden-item')?'H':'-')+(n.classList.contains('wshs-ratings-filtered')?'R':'-')+(n.getBoundingClientRect().width?'v':'_')).join(' ');
const expected='-R_ -R_ --v --v H-_ H-_ H-_ H-_';
(async()=>{const b=await launch(undefined,{sourceOverlay:overlay});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1600,height:1000});await p.setRequestInterception(true);
 p.on('request',r=>{const url=new URL(r.url());
  if(r.isNavigationRequest())return r.respond({status:200,contentType:'text/html',body});
  if(url.pathname==='/sharedfiles/actions'&&url.searchParams.get('q')==='GetUGCSummary')return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:JSON.parse(url.searchParams.get('qp'))[0].map(id=>({publishedfileid:id,file_size:'1000',total_votes:Number(id)<=990000002?5:500}))})});
  r.abort();});
 const url='https://steamcommunity.com/workshop/browse/?appid=294100';
 await p.goto(url);await p.waitForSelector('.wshs-sf-input');let w=await extensionWorld(p);
 // Filters are read at load: store them, then load the page again.
 await w("chrome.storage.local.set({starFilter:3,minimumRatings:100,hideSubscribed:false,'savedFilters:294100':[]})");
 await p.goto(url);await p.waitForSelector('.wshs-sf-input');await p.waitForFunction(()=>document.querySelectorAll('.wshs-ratings-filtered').length===2&&document.querySelectorAll('.hidden-item').length===4,{timeout:15000});await wait(400);w=await extensionWorld(p);
 const passes=()=>w('window.__filterPasses||0');
 async function after(change){await w('window.__filterPasses=0');await p.evaluate(change);await wait(250);return passes();}
 check('star and rating filters hide the expected cards',await p.evaluate(flags)===expected);
 check('a settled page runs no filter pass',await after(()=>{})===0);

 // What React does on a redraw: one whole className write per card.
 let count=await after(()=>{document.querySelectorAll('.fixture-card').forEach(n=>{n.className='fixture-card';});});
 check('filter classes return after every card is redrawn',await p.evaluate(flags)===expected);
 check('the whole batch is repaired by one filter pass, not one per card',count===1);
 check('the repair does not feed itself',await after(()=>{})===0);

 count=await after(()=>{document.querySelectorAll('.fixture-card')[5].className='fixture-card';});
 check('one redrawn star-hidden card is hidden again with one pass',count===1&&await p.evaluate(flags)===expected);
 count=await after(()=>{document.querySelectorAll('.fixture-card')[0].className='fixture-card';});
 check('one redrawn rating-hidden card is hidden again with one pass',count===1&&await p.evaluate(flags)===expected);

 // Hover states and other flags on cards must not cost a filter pass.
 count=await after(()=>{document.querySelectorAll('.fixture-card').forEach(n=>n.classList.add('native-hover'));});
 check('class additions on filtered and visible cards run no pass',count===0);
 count=await after(()=>{document.querySelectorAll('.fixture-card').forEach(n=>{n.className=n.className.replace('native-hover','native-idle');});});
 check('whole className writes that keep the filter classes run no pass',count===0&&await p.evaluate(flags)===expected);
 count=await after(()=>{document.querySelectorAll('.fixture-card').forEach(n=>n.classList.remove('native-idle'));});
 check('other classes leaving filtered cards run no pass',count===0);

 // The geometry pass un-hides filtered cards to measure them and restores them.
 await w('window.__filterPasses=0');
 const measured=await w("(()=>{const cards=WSHSDom.enumerateCards();cards.forEach(c=>c.root.classList.remove('hidden-item','wshs-ratings-filtered'));cards.forEach((c,i)=>{if(i<2)c.root.classList.add('wshs-ratings-filtered');if(i>3)c.root.classList.add('hidden-item')});return cards.length})()");await wait(250);
 check('a synchronous remove-and-restore, as geometry does, runs no pass',measured===8&&await passes()===0&&await p.evaluate(flags)===expected);

 // Turning a filter off while React has already dropped its class: nothing
 // may stay remembered, or every later class change would run a pass.
 // Both happen in one task of the content script, before any repair frame.
 await w("(()=>{document.querySelectorAll('.fixture-card')[0].className='fixture-card';minimumRatings=0;applyFilters();})()");await wait(300);
 await w('chrome.storage.local.set({minimumRatings:0})');await wait(300);
 check('turning the rating filter off shows its cards and keeps the star filter',await p.evaluate(flags)==='--v --v --v --v H-_ H-_ H-_ H-_');
 count=await after(()=>{const c=document.querySelectorAll('.fixture-card');[c[0],c[1]].forEach(n=>{n.classList.add('native-hover');n.className='fixture-card';});});
 check('cards released by a filter are no longer repaired',count===0&&await p.evaluate(flags)==='--v --v --v --v H-_ H-_ H-_ H-_');
 await w('chrome.storage.local.set({minimumRatings:100})');await p.waitForFunction(()=>document.querySelectorAll('.wshs-ratings-filtered').length===2);await wait(300);
 count=await after(()=>{document.querySelectorAll('.fixture-card').forEach(n=>{n.className='fixture-card';});});
 check('a filter turned back on is repaired again with one pass',count===1&&await p.evaluate(flags)===expected);

 await w("chrome.storage.local.set({starFilter:0,minimumRatings:0})");
 if(errors.length)console.error(errors);
 check('no page errors',!errors.length);console.log(checks+' filter class repair checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
