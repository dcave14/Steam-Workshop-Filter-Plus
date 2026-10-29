const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{const b=await launch('firefox',{presentationPreferences:{pinnedSidebar:true,pinnedWorkshopBar:true,pinnedCollections:true}});try{
 for(const collection of [false,true]){
  const p=await b.newPage();await p.setViewport({width:1280,height:1000});const label=collection?'Collection':'Workshop';
  await p.goto(collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3818340638':'https://steamcommunity.com/workshop/browse/?appid=108600',{waitUntil:'load'});await p.waitForSelector('.wshs-toolbar-reset');
  await p.$eval('.wshs-toolbar-reset',n=>scrollTo(0,n.getBoundingClientRect().top+scrollY+700));await p.waitForSelector('.wshs-pinned-filter-bar');await wait(150);
  check(label+': bar stays pinned and matches placeholder width',await p.$eval('.wshs-pinned-filter-bar',n=>{const r=n.getBoundingClientRect(),s=document.querySelector('.wshs-filter-bar-placeholder').getBoundingClientRect();return Math.abs(r.top-12)<1&&Math.abs(r.left-s.left)<1&&Math.abs(r.width-s.width)<1;}));
  check(label+': pinned background stays transparent',await p.$eval('.wshs-pinned-filter-bar',n=>{const s=getComputedStyle(n);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.backgroundImage==='none'&&s.boxShadow==='none';}));
  await p.click('.ratings-filter-button');check(label+': pinned dropdown remains usable',await p.$eval('.wshs-ratings-menu',n=>n.classList.contains('show')));
  await p.$eval('[data-ratings="100"]',n=>n.click());await p.click('.wshs-toolbar-reset');await wait(200);
  check(label+': reset clears rating selection',await p.$eval('.ratings-filter-button',n=>n.textContent==='Ratings'));
  if(collection){await p.$eval('.subscribeCollection',n=>scrollTo(0,(document.querySelector('.wshs-filter-bar-placeholder')||n).getBoundingClientRect().top+scrollY+700));await p.waitForSelector('.wshs-pinned-filter-bar');}
  await p.setViewport({width:1100,height:900});await wait(250);
  check(label+': resize preserves viewport bounds',await p.$eval('.wshs-pinned-filter-bar',n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<innerHeight;}));
  await p.evaluate(()=>scrollTo(0,0));await p.waitForFunction(()=>!document.querySelector('.wshs-pinned-filter-bar'));
  check(label+': returning to top restores original flow',!await p.$('.wshs-filter-bar-placeholder'));
  await p.close();
 }
 console.log(checks+' Firefox filter-bar pinning checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
