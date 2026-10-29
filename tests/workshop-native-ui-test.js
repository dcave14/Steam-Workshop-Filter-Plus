const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,addSavedFilter,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{const b=await launch(undefined,{useConfiguredService:true});try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});
 const requests=[];p.on('request',r=>{if(r.headers()['x-valve-request-type']==='routeAction')try{const body=JSON.parse(r.postData());requests.push(...(Array.isArray(body)?body:[body]).filter(n=>typeof n?.search_text==='string'));}catch{}});
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=108600',{waitUntil:'load'});await p.waitForSelector('.wshs-page-result-count');const w=await extensionWorld(p);
 const originalTotal=await p.$eval('.wshs-page-result-count',n=>n.previousElementSibling.textContent);
 async function count(label){
  for(let i=0;i<50;i++){
   const s=await w(`(()=>{const cards=WSHSDom.enumerateCards(),visible=cards.filter(c=>c.root.getClientRects().length).length;return{total:cards.length,visible,text:document.querySelector('.wshs-page-result-count')?.textContent,inspection:document.documentElement.classList.contains('wshs-reviewing')};})()`);
   const expected=s.inspection?'Inspecting '+s.visible+' excluded mods on this page':s.visible+' of '+s.total+' shown on this page';
   if(s.text?.startsWith(expected)){check(label,true);return s;}await wait(80);
  }throw Error('Count did not match actual rendered cards: '+label);
 }
 const base=await count('page summary reports loaded and visible counts');
 await p.$eval('[data-stars="5"]',n=>n.click());await wait(150);const stars=await count('star selection updates the page count');check('star filter exercises a real exclusion',stars.visible<base.visible);
 await p.$eval('[data-ratings="5000"]',n=>n.click());await p.waitForFunction(()=>document.querySelectorAll('.wshs-ratings-filtered').length>0,{timeout:30000});await count('rating count combines with star exclusions');
 check('global Steam total is not falsely reduced by page exclusions',await p.$eval('.wshs-page-result-count',n=>n.previousElementSibling.textContent)===originalTotal);
 await p.$eval('[data-stars="0"]',n=>n.click());await p.$eval('[data-ratings="0"]',n=>n.click());await count('clearing rating filters restores the page count');
 await addSavedFilter(p,'keyword','Viewpoint');await count('saved keyword exclusions share the count');
 await p.click('.wshs-sf-inspect');await count('inspection has a distinct count label');await p.click('.wshs-review-exit');await count('leaving inspection restores the normal count');
 await addSavedFilter(p,'group','Project Viewpoint');
 check('Workshop controls use the native background and typography',await p.$eval('.wshs-workshop-filters',section=>{
  const combo=section.parentElement.querySelector('[role="combobox"]'),type=section.querySelector('.wshs-add-kind'),input=section.querySelector('.wshs-sf-input'),native=document.querySelector('.wshs-sidebar-search input');
  return getComputedStyle(type).backgroundColor===getComputedStyle(combo).backgroundColor&&getComputedStyle(input).fontFamily===getComputedStyle(native).fontFamily&&getComputedStyle(input).backgroundColor===getComputedStyle(native).backgroundColor&&getComputedStyle(section.querySelector('.wshs-filter-group')).backgroundColor==='rgba(0, 0, 0, 0)';
 }));
 await p.click('.wshs-sf-help');check('help is four short lines',await p.$eval('.wshs-sf-help-panel',n=>!n.hidden&&n.querySelectorAll('p').length===4&&n.textContent.trim().split(/\s+/).length<60));await p.click('.wshs-sf-help');
 await p.screenshot({path:'tests/out/workshop-native-style.png'});
 await w("chrome.storage.local.set({'savedFilters:108600':[{kind:'keyword',value:'vehicle',label:'vehicle',state:1}]})");
 for(const scope of [0,1,2]){
  const query='car OR truck';await p.goto('https://steamcommunity.com/workshop/browse/?appid=108600&searchtext='+encodeURIComponent(query)+'&search_text_target='+scope,{waitUntil:'load'});await p.waitForSelector('.wshs-page-size');
  const before=requests.length;await p.select('.wshs-page-size','75');
  for(let i=0;i<50&&requests.length===before;i++)await wait(100);
  const request=requests.slice(before).find(r=>r.search_text.trim()===query);
  check('native search scope '+scope+' and OR text survive positive saved filters',request&&request.search_text_target===scope&&!request.search_text.includes('vehicle'));
  check('native query does not publish overriding saved search terms',await p.$eval('html',n=>!n.getAttribute('data-wshs-terms')));
  await count('native query scope '+scope+' still has a correct local page count');
 }
 console.log(checks+' native Workshop UI/search checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
