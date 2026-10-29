const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,openBrowse,wait}=require('./browser-helpers');
const url='https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=collections';
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{const firefox=process.argv.includes('--firefox'),initialDensity=process.argv.includes('--comfortable')?'comfortable':'compact',b=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:{layoutDensity:initialDensity}}:{});try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});const errors=[];p.on('pageerror',e=>{if(!e.message.includes('WebAssembly'))errors.push(e.stack||e.message);});await openBrowse(p,url);
 const world=!firefox&&await extensionWorld(p);
 await p.waitForSelector('.wshs-collection-browse-card');
 const identities=()=>p.$$eval('.wshs-collection-browse-card > .aspectratio_square',ns=>ns.map(n=>n.querySelector('a[href*="filedetails"]')?.href));
 const original=await identities();check('collection results load with native identities',original.length>=10&&original.every(Boolean));
 for(const density of firefox?[initialDensity]:['compact','comfortable','compact']){
  await p.mouse.move(0,0);if(world)await world(`chrome.storage.local.set({layoutDensity:'${density}'})`);await wait(150);
  for(const width of [1780,1200,900,600]){
   await p.setViewport({width,height:1050});await wait(150);
   for(const side of world?['left','right']:['left']){
    if(world)await world(`chrome.storage.local.set({sidebarPosition:'${side}'})`);await wait(120);
    check(density+' '+width+' '+side+': title, ratings and description stay within the card',await p.$$eval('.wshs-collection-browse-card > .aspectratio_square',ns=>ns.slice(0,12).every(preview=>{const card=preview.parentElement,c=card.getBoundingClientRect(),title=card.querySelector('.wshs-collection-browse-title'),t=title.parentElement.getBoundingClientRect(),stars=card.querySelector('.SVGIcon_Star_Filled,.SVGIcon_Star_Unfilled')?.parentElement.getBoundingClientRect();return t.width>0&&(!title.classList.contains('wshs-compact-title')||t.width>=100)&&t.left>=c.left&&t.right<=c.right+1&&(!stars||t.bottom<=stars.top+1||t.right<=stars.left+1)&&card.scrollWidth<=card.clientWidth+1;})));
    check(density+' '+width+' '+side+': filter controls still match collection card columns',await p.evaluate(()=>{const card=document.querySelector('#CommunityTemplate .aspectratio_square').parentElement.getBoundingClientRect();return [...document.querySelectorAll('.hide-subscribed-button')].every(n=>Math.abs(n.getBoundingClientRect().width-card.width)<1);}));
    check(density+' '+width+' '+side+': magnifiers stay inside thumbnails at every width',await p.$$eval('.wshs-collection-browse-card',ns=>ns.slice(0,12).every(n=>{const p=n.querySelector('.aspectratio_square').getBoundingClientRect(),q=n.querySelector('.wshs-collection-browse-actions [role="button"],.wshs-collection-browse-actions button').getBoundingClientRect();return q.left>=p.left-1&&q.right<=p.right+1&&q.top>=p.top-1&&q.bottom<=p.bottom+1;})));
    {
     check(density+' '+width+' '+side+': cards in each row have matching heights',await p.$$eval('.wshs-collection-browse-card',ns=>{const rows=new Map();return ns.length>0&&ns.every(n=>{const r=n.getBoundingClientRect();if(!r.width)return true;const row=Math.round(r.top);if(!rows.has(row))rows.set(row,r.height);return Math.abs(rows.get(row)-r.height)<1;});}));
     if(width>=1000)check(density+' '+width+' '+side+': reset hugs its card edge nearest the filters',await p.evaluate(()=>{const r=document.querySelector('.wshs-toolbar-reset').getBoundingClientRect(),slot=document.querySelector('.wshs-toolbar-reset-slot').getBoundingClientRect(),pane=document.querySelector('.wshs-saved-filters').getBoundingClientRect(),controls=[...document.querySelectorAll('.hide-subscribed-button')].map(n=>n.getBoundingClientRect()),left=pane.left<slot.left;return (left?Math.abs(r.right-slot.right)<1:Math.abs(r.left-slot.left)<1)&&controls.every(c=>Math.abs(c.top-r.top)>1||c.right<=r.left||c.left>=r.right);}));
     if(width===1780){
      check(density+' '+side+': correct collection count per desktop row',await p.$eval('.wshs-collection-browse-grid',(n,d)=>getComputedStyle(n).gridTemplateColumns.split(' ').length===(d==='compact'?6:5),density));
      check(density+' '+side+': cards stay short without item-count lines',await p.$$eval('.wshs-collection-browse-card',(ns,d)=>ns.every(n=>n.getBoundingClientRect().height<=(d==='compact'?100:124)&&getComputedStyle(n.querySelector('.wshs-collection-browse-details>:nth-child(3)')).display==='none'),density));
      check(side+': all five toolbar slots stay on one desktop row',await p.evaluate(()=>{const controls=[...document.querySelectorAll('.hide-subscribed-button'),document.querySelector('.wshs-toolbar-reset')],r=controls[0].getBoundingClientRect(),sort=document.querySelector('.wshs-toolbar-reset-slot').parentElement;return controls.every(n=>Math.abs(n.getBoundingClientRect().top-r.top)<1)&&[...sort.children].filter(n=>n.textContent.includes('Most Popular')).some(n=>Math.abs(n.getBoundingClientRect().top-r.top)<1);}));
     }
    }
   }
  }
  check(density+': native collection order and links are preserved',JSON.stringify(await identities())===JSON.stringify(original));
  await p.setViewport({width:1780,height:1050});await p.hover('.wshs-collection-browse-card a[href*="/myworkshopfiles"]');await wait(180);
  check(density+': Quick View stays on the thumbnail and clear of title, author and description',await p.$eval('.wshs-collection-browse-card',n=>{const q=n.querySelector('.wshs-collection-browse-actions [role="button"],.wshs-collection-browse-actions button'),r=q.getBoundingClientRect(),preview=n.querySelector('.aspectratio_square').getBoundingClientRect(),text=[n.querySelector('.wshs-collection-browse-title'),n.querySelector('a[href*="/myworkshopfiles"]'),n.querySelector('.wshs-collection-browse-details>:nth-child(2)')].map(n=>n.getBoundingClientRect());return r.left>=preview.left-1&&r.right<=preview.right+1&&r.top>=preview.top-1&&r.bottom<=preview.bottom+1&&text.every(t=>t.right<=r.left||t.left>=r.right||t.bottom<=r.top||t.top>=r.bottom)&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role="button"],button')===q;}));
  await p.click('.wshs-collection-browse-actions [role="button"]');await p.waitForSelector('dialog[open]');
  check(density+': thumbnail magnifier still opens native Quick View',!!await p.$('dialog[open] .SVGIcon_X'));
  await p.$eval('dialog[open] .SVGIcon_X',n=>n.closest('[role="button"]').click());await p.waitForSelector('dialog[open]',{hidden:true});await p.mouse.move(0,0);
  if(density==='comfortable'){await p.setViewport({width:1780,height:1050});await wait(150);check('Comfortable keeps larger previews and type without stale Compact styles',await p.$eval('.wshs-collection-browse-card',n=>!n.classList.contains('wshs-compact-card')&&n.querySelector('.aspectratio_square').getBoundingClientRect().width===96&&getComputedStyle(n.querySelector('.wshs-collection-browse-title')).fontSize==='13px'));}
 }
 await p.setViewport({width:1780,height:1050});await wait(150);await p.mouse.move(0,0);await p.$eval('.ratings-filter-button',n=>n.scrollIntoView());await p.screenshot({path:'tests/out/browse-collections-fixed-'+(firefox?'firefox':'chrome')+'.png'});
 check('Collection browsing retains the selected desktop density',await p.$eval('.wshs-collection-browse-grid',(n,d)=>getComputedStyle(n).gridTemplateColumns.split(' ').length===(d==='compact'?6:5),firefox?initialDensity:'compact'));
 if(errors.length)console.error('Browse collection page errors:',errors);
 check('no browse collection errors',!errors.length);console.log(checks+' '+(firefox?'Firefox':'Chrome')+' browse-collection checks passed.');
 }finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
