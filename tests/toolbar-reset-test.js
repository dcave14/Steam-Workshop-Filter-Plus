const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{const b=await launch();try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=mostrecent&days=90&searchtext=car&search_text_target=1&num_per_page=75&requiredtags%5B%5D=Build+42',{waitUntil:'load'});
 await p.waitForSelector('.wshs-toolbar-reset');const w=await extensionWorld(p);
 const saved=[{kind:'keyword',value:'Viewpoint',label:'Viewpoint',state:-1}];
 await w("chrome.storage.local.set({'savedFilters:108600':"+JSON.stringify(saved)+"})");
 await p.click('.hide-subscribed-button');await p.$eval('[data-stars="5"]',n=>n.click());await p.$eval('[data-ratings="5000"]',n=>n.click());
 const savedBefore=await w("chrome.storage.local.get('savedFilters:108600').then(s=>JSON.stringify(s['savedFilters:108600']))");
 check('all three local controls are active before reset',await w('isHidingSubscribed && currentStarFilter===5 && minimumRatings===5000'));
 await p.click('.wshs-toolbar-reset');
 await p.waitForFunction(()=>{const q=new URL(location.href).searchParams;return q.get('browsesort')==='trend'&&q.get('days')==='7';});
 check('reset clears the three stored preferences',await w("chrome.storage.local.get(['hideSubscribed','starFilter','minimumRatings']).then(s=>s.hideSubscribed===false&&s.starFilter===0&&s.minimumRatings===0)"));
 check('labels and local filtering reset immediately',await p.$eval('.wshs-injected-controls',n=>n.querySelector('.hide-subscribed-button').getAttribute('aria-pressed')==='false'&&n.querySelector('.ratings-filter-button').textContent==='Ratings'&&n.querySelector('.star-filter-button').textContent==='Star Rating'));
 check('native sort resets to Most Popular / One Week',await w("WSHSDom.getSortButton().button.textContent.includes('Most Popular (One Week)')"));
 check('search, field scope, tag and page size survive reset',await p.evaluate(()=>{const q=new URL(location.href).searchParams;return q.get('searchtext')==='car'&&q.get('search_text_target')==='1'&&q.get('requiredtags[]')==='Build 42'&&q.get('num_per_page')==='75';}));
 check('saved filters are untouched',await w("chrome.storage.local.get('savedFilters:108600').then(s=>JSON.stringify(s['savedFilters:108600'])==="+JSON.stringify(savedBefore)+")"));
 for(const width of [1780,1100])for(const density of ['comfortable','compact'])for(const side of ['left','right']){
  await p.setViewport({width,height:1050});
  await w('chrome.storage.local.set('+JSON.stringify({layoutDensity:density,sidebarPosition:side})+')');await wait(300);
  check(width+' '+density+' '+side+': reset hugs its own card edge nearest the filters',await w(`(()=>{const s=WSHSDom.getSortButton(),reset=document.querySelector('.wshs-toolbar-reset'),r=reset.getBoundingClientRect(),slot=reset.parentElement.getBoundingClientRect(),b=s.button.getBoundingClientRect(),cards=WSHSDom.enumerateCards().map(c=>c.root.getBoundingClientRect()),buttons=[...document.querySelectorAll('.hide-subscribed-button'),s.button].map(n=>n.getBoundingClientRect()),edge=${JSON.stringify(side)}==='left'?slot.left<=Math.min(...buttons.map(n=>n.left))&&Math.abs(r.right-slot.right)<1:slot.right>=Math.max(...buttons.map(n=>n.right))&&Math.abs(r.left-slot.left)<1;return edge&&cards.some(c=>Math.abs(c.left-slot.left)<1&&Math.abs(c.right-slot.right)<1)&&cards.some(c=>Math.abs(c.left-b.left)<1&&Math.abs(c.right-b.right)<1)&&buttons.every(n=>Math.abs(n.top-r.top)>1||n.right<=r.left||n.left>=r.right)&&Math.abs(r.width-b.height)<1&&Math.abs(r.height-b.height)<1&&!s.wrapper.contains(reset);})()`));
 }
 const styleKeys=['backgroundColor','backdropFilter','boxShadow','border','borderRadius','color'];
 const styleOf=selector=>p.$eval(selector,(n,keys)=>Object.fromEntries(keys.map(k=>[k,getComputedStyle(n)[k]])),styleKeys);
 await p.mouse.move(0,0);await wait(100);
 assert.deepEqual(await styleOf('.wshs-toolbar-reset'),await styleOf('.ratings-filter-button'));check('reset shares toolbar background, blur, border, shadow and color',true);
 await p.hover('.ratings-filter-button');const hover=await styleOf('.ratings-filter-button');await p.hover('.wshs-toolbar-reset');
 assert.deepEqual(await styleOf('.wshs-toolbar-reset'),hover);check('reset hover matches the other controls',true);
 await p.screenshot({path:'tests/out/toolbar-reset.png'});
 await p.focus('.wshs-toolbar-reset');await p.keyboard.press('Enter');await wait(150);
 check('repeating reset through keyboard leaves one reset control',await p.$$eval('.wshs-toolbar-reset',ns=>ns.length===1));
 await p.reload({waitUntil:'load'});await p.waitForSelector('.wshs-toolbar-reset');
 check('cleared preferences survive reload',await p.$eval('.wshs-injected-controls',n=>n.querySelector('.hide-subscribed-button').getAttribute('aria-pressed')==='false'&&n.querySelector('.ratings-filter-button').textContent==='Ratings'&&n.querySelector('.star-filter-button').textContent==='Star Rating'));
 console.log(checks+' toolbar reset checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
