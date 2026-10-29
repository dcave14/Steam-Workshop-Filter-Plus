// Real popup + live Steam cards/carousels, followed by both sidebar layout fixtures.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait,addSavedFilter,moveFilterToGroup}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
const geometry=`(()=>{const cards=WSHSDom.enumerateCards(),g=WSHSDom.getCardGeometry();const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,right:r.right};};return{count:cards.length,ids:cards.map(c=>c.id),columns:g.columns,gap:g.gap,cardWidth:g.width,cards:cards.map(c=>rect(c.root)),buttons:[document.querySelector('.hide-subscribed-button'),document.querySelector('.ratings-filter-button'),document.querySelector('.star-filter-button'),WSHSDom.getSortButton().button].map(rect)};})()`;
(async()=>{const b=await launch('C:/Program Files/Google/Chrome/Application/chrome.exe');try{
 const errors=[];const page=await b.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1780,height:1050});
 await page.goto('https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend',{waitUntil:'load',timeout:45000});await page.waitForSelector('.wshs-page-size');
 const world=await extensionWorld(page),before=await world(geometry);
 const target=b.targets().find(t=>t.url().startsWith('chrome-extension://'));const popup=await b.newPage();await popup.goto('chrome-extension://'+new URL(target.url()).hostname+'/popup.html');
 await popup.waitForFunction(()=>!document.querySelector('#reduce-motion').disabled);
 check('new settings default to comfortable and motion off',await popup.$eval('#density-comfortable',e=>e.checked)&&await popup.$eval('#reduce-motion',e=>!e.checked)&&await popup.$eval('#motion-settings',e=>e.disabled));
 async function click(selector){await popup.bringToFront();await popup.click(selector);await page.bringToFront();}
 await click('label[for="density-compact"]');await page.waitForSelector('.wshs-compact-grid');await wait(150);
 let compact=await world(geometry);
 check('wide compact layout has six cards and tighter spacing',compact.columns===6&&compact.gap<before.gap);
 check('compact mode preserves native mods and their order',JSON.stringify(compact.ids)===JSON.stringify(before.ids));
 function aligned(g){return g.buttons.every(button=>g.cards.some(card=>Math.abs(button.x-card.x)<1&&Math.abs(button.w-card.w)<1&&Math.abs(button.right-card.right)<1));}
 check('all compact filter controls remain exactly one card wide',aligned(compact));
 check('compact titles support three lines',await page.$eval('.wshs-compact-title',e=>getComputedStyle(e).webkitLineClamp==='3'&&getComputedStyle(e).whiteSpace==='normal'));
 await click('label[for="position-right"]');await page.waitForFunction(()=>document.querySelector('.wshs-saved-filters')?.getBoundingClientRect().left>innerWidth/2,{polling:100});await wait(100);
 var rightGeometry=await world(geometry);
 check('compact right placement keeps the exact card-column rule',aligned(rightGeometry));
 await page.screenshot({path:'tests/out/compact-right.png'});
 await click('label[for="position-left"]');await page.waitForFunction(()=>document.querySelector('.wshs-saved-filters')?.getBoundingClientRect().left<innerWidth/2,{polling:100});await wait(100);
 check('compact left placement keeps the exact card-column rule',aligned(await world(geometry)));
 await page.screenshot({path:'tests/out/compact-left.png'});
 await page.setViewport({width:1100,height:1050});await wait(180);compact=await world(geometry);
 check('compact adapts to narrow widths without undersized cards',compact.columns<6&&compact.cardWidth>=159&&aligned(compact));
 await page.setViewport({width:1780,height:1050});await click('label[for="density-comfortable"]');await page.waitForFunction(()=>!document.querySelector('.wshs-compact-grid'));await wait(120);
 const comfortable=await world(geometry);check('comfortable restores the original grid',comfortable.columns===before.columns&&Math.abs(comfortable.cardWidth-before.cardWidth)<1&&aligned(comfortable));
 await click('label[for="reduce-motion"]');await page.waitForSelector('.wshs-no-hover-motion');
 check('master motion toggle activates the selected hover policy',await page.$eval('.wshs-no-hover-motion',e=>getComputedStyle(e).transitionDuration==='0s'));
 await page.hover('.wshs-no-hover-motion');check('hover no longer transforms cards',await page.$eval('.wshs-no-hover-motion',e=>getComputedStyle(e).transform==='none'));
 await click('#disable-card-hover');await page.waitForFunction(()=>!document.querySelector('.wshs-no-hover-motion'));
 check('hover control can be switched independently',await popup.$eval('#reduce-motion',e=>e.checked));
 await page.goto('https://steamcommunity.com/app/108600/workshop/',{waitUntil:'load'});await page.waitForSelector('.wshs-paused-carousel',{timeout:20000});
 await page.waitForSelector('.wshs-still-preview');
 check('GIF freezing initializes on live hydrated homepage previews',await page.$eval('html',n=>n.getAttribute('data-wshs-previews-ready')==='1'));
 await page.$eval('.wshs-paused-carousel',n=>n.dataset.appearanceCarousel='1');
 const left=await page.$eval('[data-appearance-carousel]',n=>n.scrollLeft);
 await page.$eval('[data-appearance-carousel]',n=>n.scrollLeft+=120);
 await page.waitForFunction(left=>Math.abs(document.querySelector('[data-appearance-carousel]').scrollLeft-left)<1,{},left);
 check('homepage carousel blocks unattended movement',true);
 await page.$eval('[data-appearance-carousel]',n=>{let scope=n.parentElement;for(let depth=0;scope&&depth<4;depth++,scope=scope.parentElement){const arrows=[...scope.querySelectorAll('button,[role="button"]')].filter(b=>!n.contains(b)&&!b.textContent.trim()&&b.querySelector('svg'));if(arrows.length>=2){arrows.at(-1).click();return;}}throw Error('Native carousel arrows not found');});
 await page.waitForFunction(left=>document.querySelector('[data-appearance-carousel]').scrollLeft>left+20,{},left);
 check('manual homepage carousel arrows still work',true);
 await click('#pause-home-carousels');await page.waitForFunction(()=>!document.querySelector('.wshs-paused-carousel'));
 check('carousel control can be switched independently',await popup.$eval('#reduce-motion',e=>e.checked));
 await click('label[for="reduce-motion"]');await popup.bringToFront();await popup.reload();await popup.waitForFunction(()=>!document.querySelector('#reduce-motion').disabled);
 check('master off preserves individual choices across reopening',await popup.$eval('#reduce-motion',e=>!e.checked)&&await popup.$eval('#disable-card-hover',e=>!e.checked)&&await popup.$eval('#pause-home-carousels',e=>!e.checked));
 await popup.screenshot({path:'tests/out/appearance-popup.png'});
 await popup.close();
 for(const collection of [false,true]){
  const p=await b.newPage();await p.setViewport({width:1600,height:1050});await p.setRequestInterception(true);
  p.on('request',r=>{if(r.isNavigationRequest())return r.respond({status:200,contentType:'text/html',body:fixture(collection)});if(/\/filedetails\/?/.test(new URL(r.url()).pathname))return r.respond({status:200,contentType:'text/html',body:'<div class="workshopItemTitle">Project Viewpoint</div><div class="workshopItemDescription">Details</div>'});return r.abort();});
  await p.goto(collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100');await p.waitForSelector('.wshs-sf-input');const w=await extensionWorld(p);
  await w("chrome.storage.local.set({'savedFilters:294100':[],'savedFilterGroups:294100':[]})");await wait(80);
  for(const [kind,value]of[['keyword','Viewpoint'],['dependency','3809306528'],['group','Project Viewpoint']])await addSavedFilter(p,kind,value);
  const id=await p.$eval('.wshs-filter-group',e=>e.dataset.groupId);
  for(let i=0;i<2;i++)await moveFilterToGroup(p,'.wshs-sf-list > .wshs-sf-row .wshs-group-select',id);
  const prefix=(collection?'Collection':'Workshop')+': ';
  check(prefix+'one aligned input/action/help row replaces three inputs',await p.$$eval('.wshs-sf-add',rows=>rows.length===1&&[...rows[0].children].every(n=>n.getBoundingClientRect().height===30)));
  check(prefix+'group movement uses a compact icon instead of repeated names',await p.$$eval('.wshs-group-select',es=>es.every(e=>e.getBoundingClientRect().width===20&&e.getAttribute('aria-haspopup')==='menu')));
  check(prefix+'description setting follows the entire add control',await p.$eval('.wshs-description-toggle',e=>e.closest('.wshs-description-option').getBoundingClientRect().top>document.querySelector('.wshs-add-composer').getBoundingClientRect().bottom));
  await p.click('.wshs-sf-help');check(prefix+'help explains declared requirements',await p.$eval('.wshs-sf-help-panel',e=>!e.hidden&&e.textContent.includes('declared')));
  await p.click('.wshs-sf-help');
  await p.screenshot({path:'tests/out/sidebar-design-'+(collection?'collection':'workshop')+'.png'});
  await p.close();
 }
 check('no unexpected appearance errors',errors.length===0);console.log(checks+' appearance checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
