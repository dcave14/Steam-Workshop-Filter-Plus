const assert=require('assert/strict');
const{launch,closeBrowser,extensionWorld,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:{pinnedSidebar:true,pinnedCollections:true}}:{});try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3824338247',{waitUntil:'domcontentloaded'});await p.waitForSelector('.wshs-design-related');
 check('linked collections retain original previews, links and ratings in the sidebar',await p.$eval('.wshs-design-sidebar .wshs-design-linked-grid',n=>n.querySelectorAll(':scope>.workshopItem').length===2&&n.querySelectorAll('a[href*="id="]').length===4&&n.querySelectorAll('.fileRating').length===2));
 check('parent collection preserves its native navigation handler',await p.$eval('.wshs-design-parent-list .parentCollection',n=>n.getAttribute('onclick').includes('3565138082')&&!!n.querySelector('.parentCollectionTitle')));
 check('creator and version panels live in the redesigned sidebar',await p.$eval('.wshs-design-sidebar-details',n=>!!n.querySelector('.creatorsBlock .friendBlockLinkOverlay')&&n.textContent.includes('1.7')&&[...n.querySelectorAll('.rightSectionHolder')].filter(n=>n.textContent.includes('A collection of')).every(n=>n.hidden)));
 check('original empty item/footer boxes are hidden',await p.$eval('#profileBlock',n=>n.hidden));
 const w=!firefox&&await extensionWorld(p);
 for(const side of firefox?['left']:['left','right'])for(const pinBar of firefox?[true]:[false,true]){
  if(w)await w('chrome.storage.local.set('+JSON.stringify({sidebarPosition:side,pinnedSidebar:true,pinnedCollections:pinBar})+')');await wait(150);
  for(const where of ['middle','end']){
   await p.evaluate(where=>scrollTo(0,where==='middle'?12000:document.documentElement.scrollHeight),where);await wait(180);
   check(side+' toolbar '+pinBar+' '+where+': sidebar pins without an unnecessary top gap'+(where==='end'?' and stops at the collection end':''),await p.$eval('.wshs-design-sidebar',(n,where)=>{const r=n.getBoundingClientRect(),bar=document.querySelector('.wshs-pinned-filter-bar')?.getBoundingClientRect(),slot=document.querySelector('.wshs-design-sidebar-slot').getBoundingClientRect();return n.classList.contains('wshs-design-sidebar-fixed')&&Math.abs(r.left-slot.left)<1&&Math.abs(r.width-slot.width)<1&&(where==='middle'?Math.abs(r.top-12)<1:r.top<=12.5&&r.bottom<=document.querySelector('.wshs-design-workspace').getBoundingClientRect().bottom+1)&&(!bar||bar.right<=r.left||bar.left>=r.right)&&r.bottom<=innerHeight-13;},where));
  }
 }
 await p.$$eval('.collectionItem',ns=>{const mid=document.querySelector('.wshs-design-results').getBoundingClientRect();const right=ns.filter(n=>n.getBoundingClientRect().left>mid.left+mid.width/2);const row=right.find(n=>n.querySelector('.workshopItemTitle').textContent.includes('Warehouse Storage'))||right.at(-1);row.scrollIntoView({block:'center'});row.querySelector('.workshopItemPreviewHolder').setAttribute('data-pinned-hover-test','');});
 await p.hover('[data-pinned-hover-test]');await p.waitForSelector('#workshop_item_hover',{visible:true});await wait(200);
 const hoverClear=await p.$eval('#workshop_item_hover',n=>{const r=n.getBoundingClientRect(),s=document.querySelector('.wshs-design-sidebar').getBoundingClientRect();return r.right<=s.left||r.left>=s.right||r.bottom<=s.top||r.top>=s.bottom;});
 if(!hoverClear)console.log('Hover bounds',await p.evaluate(()=>({tip:document.getElementById('workshop_item_hover').getBoundingClientRect().toJSON(),style:document.getElementById('workshop_item_hover').getAttribute('style'),side:document.querySelector('.wshs-design-sidebar').getBoundingClientRect().toJSON(),results:document.querySelector('.wshs-design-results').getBoundingClientRect().toJSON(),fixed:document.querySelector('.wshs-design-sidebar').className})));
 check('native mod hover card does not cover the pinned sidebar',hoverClear);
 check('native mod hover card does not cover the hovered row or its subscribe button',await p.$eval('#workshop_item_hover',n=>{const r=n.getBoundingClientRect(),row=document.querySelector('[data-pinned-hover-test]').closest('.collectionItem').getBoundingClientRect();return r.right<=row.left||r.left>=row.right||r.bottom<=row.top||r.top>=row.bottom;}));await p.mouse.move(0,0);
 await p.setViewport({width:600,height:900});await p.evaluate(()=>scrollTo(0,0));await wait(150);
 check('mobile returns the sidebar to normal flow above results',await p.$eval('.wshs-design-sidebar',n=>!n.classList.contains('wshs-design-sidebar-fixed')&&n.getBoundingClientRect().top<document.querySelector('.wshs-design-results').getBoundingClientRect().top));
 await p.setViewport({width:1780,height:1050});await p.$eval('.wshs-design-related',n=>n.scrollIntoView({block:'end'}));await wait(150);await p.screenshot({path:'tests/out/collection-details-'+(firefox?'firefox':'chrome')+'.png'});console.log(checks+' collection details checks passed.');
 }finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
