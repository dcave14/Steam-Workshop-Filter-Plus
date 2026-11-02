const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait}=require('./browser-helpers');
const {toolbarState,applyPanelState}=require('./toolbar-layout-helpers');
let checks=0;
function check(name,value,diagnostic){if(!value&&diagnostic)console.log(JSON.stringify(diagnostic));assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{
 const firefox=process.argv.includes('--firefox'),comfortable=process.argv.includes('--comfortable');
 const seeded={layoutDensity:comfortable?'comfortable':'compact',sidebarPosition:comfortable?'left':'right'};
 const b=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:seeded}:{});
 try{
  const p=await b.newPage(),errors=[];
  p.on('pageerror',e=>{const native=firefox&&(e.message==='Image corrupt or truncated.'||e.message.startsWith('Content-Security-Policy:')&&e.message.includes('blocked WebAssembly (script-src)')&&e.message.includes('https://steamcommunity.com/_ssr/modules/'));if(!native)errors.push(e.message);});
  for(const surface of ['items','collections']){
   await p.setViewport({width:752,height:642});
   await p.goto('https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend'+(surface==='collections'?'&section=collections':''),{waitUntil:'load',timeout:60000});
   await p.waitForSelector('.wshs-search-controls .wshs-toolbar-reset',{timeout:15000});
   const world=!firefox&&await extensionWorld(p);
   for(const density of firefox?[seeded.layoutDensity]:['comfortable','compact'])for(const side of firefox?[seeded.sidebarPosition]:['left','right']){
    if(world)await world('chrome.storage.local.set('+JSON.stringify({layoutDensity:density,sidebarPosition:side})+')');
    await wait(150);const flipped=await p.evaluate(toolbarState);
    check(surface+' '+density+' '+side+': flipping mobile search mirrors gear/reset without a resize',flipped?.searchReset,flipped);
    await p.$eval('.wshs-apply-filters',n=>n.scrollIntoView({block:'start'}));await p.click('.wshs-apply-filters');
    await p.waitForSelector('.wshs-apply-popover:popover-open');
    for(const width of [900,875,752,660,600,495,420,752]){
     await p.setViewport({width,height:642});await wait(180);
     const state=await p.evaluate(applyPanelState),toolbar=await p.evaluate(toolbarState),name=surface+' '+density+' '+side+' '+width;
     check(name+': native filter panel follows its button width/font with one scroll area',state?.fit,state);
     check(name+': search/reset and Apply filters stay aligned',toolbar?.searchReset&&toolbar.apply?.fit,toolbar);
    }
    await p.click('.wshs-apply-popover [role="combobox"]');await p.waitForSelector('.wshs-apply-choice-popover:popover-open');
    check(surface+' '+density+' '+side+': native Special Filters choices follow their trigger',await p.$eval('.wshs-apply-choice-popover',n=>{const trigger=document.querySelector('.wshs-apply-popover [role="combobox"]'),font=parseFloat(getComputedStyle(trigger).fontSize);return Math.abs(n.getBoundingClientRect().width-trigger.getBoundingClientRect().width)<1&&[...n.querySelectorAll('[role="option"]')].every(o=>parseFloat(getComputedStyle(o).fontSize)<=font);}));
    await p.click('.wshs-apply-choice-popover [role="option"]');await wait(100);
    check(surface+' '+density+' '+side+': native Special Filters selection callback closes its choices',!await p.$('.wshs-apply-choice-popover:popover-open'));
    if(await p.$('.wshs-apply-popover .wshs-add-kind')){
     await p.click('.wshs-apply-popover .wshs-add-kind');await p.waitForSelector('.wshs-type-menu.wshs-apply-choice-popover:popover-open');
     check(surface+' '+density+' '+side+': saved-filter type choices also respect their button font',await p.$eval('.wshs-type-menu',n=>{const trigger=document.querySelector('.wshs-apply-popover .wshs-add-kind'),font=parseFloat(getComputedStyle(trigger).fontSize);return Math.abs(n.getBoundingClientRect().width-trigger.getBoundingClientRect().width)<1&&[...n.children].every(o=>parseFloat(getComputedStyle(o).fontSize)<=font);}));
     await p.keyboard.press('Escape');
    }
    await p.keyboard.press('Escape');await wait(100);
    check(surface+' '+density+' '+side+': Escape closes the native Apply filters panel',!await p.$('.wshs-apply-popover:popover-open'));
    await p.focus('.wshs-apply-filters');await p.keyboard.press('Enter');await p.waitForSelector('.wshs-apply-popover:popover-open');
    check(surface+' '+density+' '+side+': keyboard reopening preserves fitted text and dimensions',(await p.evaluate(applyPanelState))?.fit);
    await p.keyboard.press('Escape');
   }
   await p.setViewport({width:1780,height:1000});
   await p.waitForSelector('.wshs-sidebar-search',{timeout:15000});
   await p.waitForFunction(()=>{const section=[...document.querySelectorAll('.wshs-saved-filters')].find(n=>!n.closest('[popover]')&&n.getBoundingClientRect().width);if(!section)return false;const right=document.documentElement.getAttribute('data-wshs-sidebar-position')==='right';return right?section.getBoundingClientRect().left>innerWidth/2:section.getBoundingClientRect().left<innerWidth/2;},{timeout:15000});
   await wait(150);const expanded=await p.evaluate(toolbarState);
   check(surface+': expanding the fresh mobile page restores the chosen desktop sidebar and search alignment',expanded?.searchReset&&expanded.searchAligned&&expanded.sidebar?.gap>=8&&expanded.sidebar.gap<=16,expanded);
  }
  check('no unexpected native filter panel or hydration errors',errors.length===0,errors);
  console.log(checks+' '+(firefox?'Firefox':'Chrome')+' native Apply filters checks passed.');
 }finally{await closeBrowser(b);}
})().catch(e=>{console.error(e);process.exitCode=1;});
