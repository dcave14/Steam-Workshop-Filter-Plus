// Cached discovery must survive Steam replacing results without repeated full walks.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
(async()=>{const b=await launch();try{
 const p=await b.newPage();await p.setRequestInterception(true);
 p.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:fixture(false).replace('data-wshs-page-hydrated="1"','data-wshs-page-hydrated="0"').replace('<main class="fixture-grid">','<span>8 entries matching filters</span><main class="fixture-grid">')}):r.abort());
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=294100');
 assert.equal(await p.$('.wshs-page-result-count'),null,'no result summary is inserted before hydration');
 await p.evaluate(()=>document.documentElement.dataset.wshsPageHydrated='1');await p.waitForSelector('.wshs-sf-input');await p.waitForSelector('.wshs-page-result-count');
 console.log('PASS result summary waits for React readiness');
 const world=await extensionWorld(p);
 const checks=await world(`(()=>{
  const dom=WSHSDom,results=[],ok=(name,value)=>{if(!value)throw Error(name);results.push(name)};
  let cards=dom.enumerateCards();ok('all eight initial cards discovered',cards.length===8);
  const original=Element.prototype.querySelectorAll;let scans=0;
  try{Element.prototype.querySelectorAll=function(selector){if(selector.includes('sharedfiles/filedetails'))scans++;return original.call(this,selector)};
   for(let i=0;i<20;i++)dom.enumerateCards();
   ok('unchanged discovery does not repeatedly scan item subtrees',scans===0);
  }finally{Element.prototype.querySelectorAll=original}
  const first=cards[0].root,clone=first.cloneNode(true);first.replaceWith(clone);
  cards=dom.enumerateCards();ok('same-ID React replacement returns the connected new root',cards[0].root===clone&&cards.every(c=>c.root.isConnected));
  clone.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='https://steamcommunity.com/sharedfiles/filedetails/?id=998888888');
  cards=dom.enumerateCards();ok('synchronous link changes refresh the item ID',cards[0].id==='998888888');
  clone.remove();ok('removed cards leave the result set',dom.enumerateCards().length===7);
  document.querySelector('.fixture-grid').prepend(clone);ok('new cards join the result set',dom.enumerateCards().length===8);
  const dialog=document.createElement('dialog');dialog.append(clone.cloneNode(true));document.getElementById('CommunityTemplate').append(dialog);
  ok('Quick View dependency links never become results',dom.enumerateCards().length===8);
  const scope=document.getElementById('CommunityTemplate'),replacement=scope.cloneNode(true);scope.replaceWith(replacement);
  cards=dom.enumerateCards();ok('whole React scope replacement refreshes every root',cards.length===8&&cards.every(c=>replacement.contains(c.root)));
  const grid=replacement.querySelector('.fixture-grid'),sample=cards[0].root.cloneNode(true);
  const build=count=>{const fragment=document.createDocumentFragment();for(let i=0;i<count;i++){
   const card=sample.cloneNode(true),id=String(880000000+i);
   card.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='/sharedfiles/filedetails/?id='+id);
   card.append(card.querySelector('a[href*="filedetails"]').cloneNode(true));
   const outer=document.createElement('div'),inner=document.createElement('div');inner.append(card);outer.append(inner);fragment.append(outer);
  }grid.replaceChildren(fragment)};
  for(const count of [200,1200]){
   build(count);let visited=0,scans=0;
   try{Element.prototype.querySelectorAll=function(selector){const result=original.call(this,selector);if(selector.includes('sharedfiles/filedetails')){scans++;visited+=result.length}return result};
    cards=dom.enumerateCards();ok(count+' nested cards preserve their single-card roots',cards.length===count&&cards.every(c=>c.root.parentElement===grid));
    ok(count+' cards bound discovery link visits to linear work',visited<=count*6&&scans<=count+2);
   }finally{Element.prototype.querySelectorAll=original}
  }
  grid.append(cards[0].root.cloneNode(true));ok('duplicate-ID cards do not duplicate results',dom.enumerateCards().length===1200);
  const hover=document.createElement('div');hover.id='workshop_item_hover';hover.append(sample.cloneNode(true));grid.append(hover);
  ok('native hover thumbnails never become results',dom.enumerateCards().length===1200);hover.remove();
  const previewless=document.createElement('section');previewless.innerHTML='<a href="/sharedfiles/filedetails/?id=77777777">No preview</a>';grid.append(previewless);
  ok('links without a preview fail safe',dom.enumerateCards().length===1200);
  grid.replaceChildren(sample);ok('ambiguous single-card page wrappers fail safe',dom.enumerateCards().length===0);
  return results;
 })()`);
 checks.forEach(name=>console.log('PASS '+name));console.log(checks.length+' discovery/cache regression checks passed.');
 }finally{await closeBrowser(b)}})().catch(e=>{console.error(e);process.exitCode=1});
