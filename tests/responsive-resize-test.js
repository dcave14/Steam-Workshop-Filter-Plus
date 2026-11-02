const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,openBrowse,wait}=require('./browser-helpers');
const {toolbarState,dropdownFontsState}=require('./toolbar-layout-helpers');
const collectionId=process.argv.find(arg=>arg.startsWith('--collection-id='))?.slice(16)||'3521297585';
assert.match(collectionId,/^\d+$/,'collection ID must be numeric');
let checks=0;
function check(name,value,diagnostic){if(!value&&diagnostic)console.log(JSON.stringify(diagnostic));assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{const b=await launch();try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1000});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const section of process.argv.includes('--detail-only')?[]:['items','collections']){
  const url='https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend'+(section==='collections'?'&section=collections':'');
  await p.setViewport({width:752,height:642});await p.goto(url,{waitUntil:'load',timeout:60000});
  await p.waitForSelector('.wshs-search-controls .wshs-toolbar-reset',{timeout:15000});await wait(150);
  const initial=await p.evaluate(toolbarState);
  check(section+' initial 752×642: search/reset and native Apply filters fit without a mounted sidebar',initial&&initial.searchReset&&initial.separated&&initial.inViewport&&initial.apply?.fit,initial);
  await p.setViewport({width:1780,height:1000});await openBrowse(p,url);
  const world=await extensionWorld(p);await p.waitForSelector('[data-wshs-toolbar-layout]');
  for(const density of ['comfortable','compact'])for(const side of ['left','right']){
   await world('chrome.storage.local.set('+JSON.stringify({layoutDensity:density,sidebarPosition:side,pinnedSidebar:false,pinnedWorkshopBar:false})+')');await wait(200);
   for(const width of [1780,1435,1200,1190,1100,1000,999,900,875,768,752,740,660,600,495,420,1190,1435,1780]){
    await p.setViewport({width,height:width>=740&&width<=768?642:1000});await wait(180);
    const s=await p.evaluate(toolbarState),name=section+' '+density+' '+side+' '+width;
    check(name+': controls remain separate and inside viewport',s&&s.separated&&s.inViewport,s);
    check(name+': Apply filters matches its card column, toolbar font and search height',!s.apply||s.apply.fit,s);
    check(name+': reset mirrors with the sidebar and matches gear/search dimensions',s.searchReset&&s.searchAligned,s);
    check(name+': sort label stays between its icons',s.sortLabelFits,s);
    const menuFonts=await p.evaluate(dropdownFontsState);check(name+': every dropdown text size is capped by its own button',menuFonts.fits,menuFonts);
    check(name+': sidebar starts just below search without a toolbar-sized gap',!s.sidebar||s.sidebar.gap>=8&&s.sidebar.gap<=16,s);
    check(name+': desktop controls share the search row',!s.sidebar||Math.abs(s.controls[0].top-s.sidebar.search.top)<2,s);
    if(s.mode==='cards')check(name+': original control widths match card columns',await world(`(()=>{const width=WSHSDom.getCardGeometry().width;return [document.querySelector('.hide-subscribed-button'),document.querySelector('.ratings-filter-button'),document.querySelector('.star-filter-button'),WSHSDom.getSortButton().button].every(n=>Math.abs(n.getBoundingClientRect().width-width)<1);})()`));
    if(s.mode==='compact')check(name+': every wrapped row shares its full width equally',s.equalRows&&s.filledRows,s);
    if(width===752&&s.apply){
     const nativePanelOpen=()=>p.evaluate(()=>[...document.querySelectorAll('[popover]:popover-open')].some(n=>n.querySelector('[role="combobox"]')&&n.textContent.includes('Special Filters')));
     await p.click('.wshs-apply-filters');await wait(100);
     check(name+': native Apply filters pointer callback opens the filter panel',await nativePanelOpen());
     await p.keyboard.press('Escape');await wait(100);
     check(name+': native filter panel closes with Escape',!await nativePanelOpen());
     await p.focus('.wshs-apply-filters');await p.keyboard.press('Enter');await wait(100);
     check(name+': native Apply filters keyboard callback still works',await nativePanelOpen());
     await p.keyboard.press('Escape');
    }
   }
   await world('chrome.storage.local.set({starFilter:5,minimumRatings:5000})');await wait(180);
   await world('WSHSDom.enumerateCards().forEach(c=>c.root.classList.add("hidden-item"))');
   for(const width of [1435,600,1780]){
    await p.setViewport({width,height:1000});await wait(180);const s=await p.evaluate(toolbarState);
    check(section+' '+density+' '+side+' filtered '+width+': resizing retains layout',s&&s.separated&&s.inViewport&&(s.mode==='cards'||s.equalRows&&s.filledRows),s);
    check(section+' '+density+' '+side+' filtered '+width+': all hidden rows remain hidden',await world('WSHSDom.enumerateCards().every(c=>!c.root.getBoundingClientRect().width)'));
   }
   await world('chrome.storage.local.set({starFilter:0,minimumRatings:0})');
   await world('chrome.storage.local.set({pinnedSidebar:true,pinnedWorkshopBar:true})');
   await p.addStyleTag({content:'body{min-height:4000px}'});
   for(const width of [1435,600,1780]){
    await p.setViewport({width,height:1000});await p.evaluate(()=>scrollTo(0,1200));await wait(200);const s=await p.evaluate(toolbarState);
    check(section+' '+density+' '+side+' pinned '+width+': controls stay aligned',s&&s.separated&&s.inViewport&&(s.mode==='cards'||s.equalRows&&s.filledRows),s);
   }
   await p.evaluate(()=>scrollTo(0,0));await world('chrome.storage.local.set({pinnedSidebar:false,pinnedWorkshopBar:false})');
  }
 }
 if(process.argv.includes('--fixture-detail')){
  const {fixture}=require('./filter-fixtures');
  const html=fixture(true).replace('<body>','<body><div class="collectionTop"><div class="collectionHeader"><div class="workshopItemTitle">Responsive collection fixture</div></div></div><div class="workshopItemDescription"><p>Native <strong>formatted description</strong> with <a href="https://steamcommunity.com/">a Steam link</a>.</p></div>');
  await p.setRequestInterception(true);p.on('request',request=>request.respond({status:200,contentType:request.isNavigationRequest()?'text/html':'application/json',body:request.isNavigationRequest()?html:'{}'}));
 }
 await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id='+collectionId,{waitUntil:'load',timeout:60000});
 await p.waitForSelector('.wshs-design-collection',{timeout:30000}).catch(async error=>{
  console.error('Collection initialization diagnostic',JSON.stringify(await p.evaluate(()=>({url:location.href,title:document.title,rootClass:document.documentElement.className,actions:document.querySelectorAll('.subscribeCollection').length,filters:document.querySelectorAll('.wshs-saved-filters').length,rows:document.querySelectorAll('.collectionItem').length,body:document.body.innerText.slice(0,500)}))));
  console.error('Collection page errors',errors);throw error;
 });
 await p.waitForSelector('.subscribeCollection.wshs-six-controls .wshs-collection-controls .star-filter-button',{timeout:10000});
 const world=await extensionWorld(p);
 const native=()=>p.$$eval('.wshs-design-items>.collectionItem',ns=>ns.map(n=>({id:n.id,href:n.querySelector('a[href*="filedetails"]')?.href})));
 const before=await native(),description=await p.$eval('.workshopItemDescription',n=>n.innerHTML);
 for(const density of ['comfortable','compact'])for(const side of ['left','right']){
  await world('chrome.storage.local.set('+JSON.stringify({layoutDensity:density,sidebarPosition:side,pinnedSidebar:true,pinnedCollections:true})+')');
  for(const width of [1780,1435,900,600,420,1435,1780]){
   await p.setViewport({width,height:1000});await p.evaluate(()=>scrollTo(0,0));await wait(180);
   const state=await p.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.subscribeCollection>.general_btn,.wshs-collection-controls .hide-subscribed-button')];
    const rects=nodes.map(n=>n.getBoundingClientRect()),row=document.querySelector('.collectionItem')?.getBoundingClientRect();
    return {count:nodes.length,fit:rects.every(r=>r.width>0&&r.left>=-1&&r.right<=innerWidth+1),equal:rects.every(r=>Math.abs(r.width-rects[0].width)<1),overflow:document.documentElement.scrollWidth>innerWidth,rowFit:row&&row.left>=0&&row.right<=innerWidth+1};
   });
   check('detail '+density+' '+side+' '+width+': native and filter rows resize equally',state.count===6&&state.fit&&state.equal&&!state.overflow&&state.rowFit,state);
   const menuFonts=await p.evaluate(dropdownFontsState);check('detail '+density+' '+side+' '+width+': every dropdown text size is capped by its own button',menuFonts.fits,menuFonts);
  }
 }
 check('detail: native item links and IDs survive repeated resize',JSON.stringify(await native())===JSON.stringify(before));
 check('detail: rich description stays intact',await p.$eval('.workshopItemDescription',(n,html)=>n.innerHTML===html,description));
 const originalLabelStyle=await p.$eval('.star-filter-button .wshs-button-label',n=>n.getAttribute('style'));
 const originalBox=await p.$eval('.star-filter-button',n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));
 await p.$eval('.star-filter-button .wshs-button-label',n=>n.style.setProperty('font-size','8px','important'));await wait(100);
 const reducedFonts=await p.evaluate(dropdownFontsState);
 check('detail: dropdown follows text shrinking inside a fixed-size button',reducedFonts.fits&&reducedFonts.menus.find(m=>m.button==='Star Rating').largest<=8&&await p.$eval('.star-filter-button',(n,b)=>Math.abs(n.getBoundingClientRect().width-b.width)<1&&Math.abs(n.getBoundingClientRect().height-b.height)<1,originalBox),reducedFonts);
 await p.$eval('.star-filter-button .wshs-button-label',(n,style)=>style===null?n.removeAttribute('style'):n.setAttribute('style',style),originalLabelStyle);await wait(100);
 check('no resize page errors',errors.length===0,errors);
 console.log(checks+' responsive resize checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
