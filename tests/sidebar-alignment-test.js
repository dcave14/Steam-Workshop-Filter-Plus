// Live geometry checks: both placements, four/five columns and existing sidebar pinning.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
const measure=`(()=>{
 const cards=WSHSDom.enumerateCards().map(x=>x.root.getBoundingClientRect()).filter(r=>r.width>0);
 const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
 const buttons=[document.querySelector('.hide-subscribed-button'),document.querySelector('.ratings-filter-button'),document.querySelector('.star-filter-button'),WSHSDom.getSortButton().button].map(rect);
 return{grid:{left:Math.min(...cards.map(r=>r.left)),right:Math.max(...cards.map(r=>r.right))},columns:cards.filter((r,i)=>cards.findIndex(c=>Math.abs(c.left-r.left)<1)===i).map(r=>({left:r.left,right:r.right,width:r.width})),geometry:WSHSDom.getCardGeometry(),buttons,reset:rect(document.querySelector('.wshs-toolbar-reset-slot')),search:rect(document.querySelector('.wshs-sidebar-search')),pane:rect(document.querySelector('.wshs-saved-filters').parentElement)};
})()`;
(async()=>{const b=await launch('C:/Program Files/Google/Chrome/Application/chrome.exe');try{
 const page=await b.newPage();await page.setViewport({width:1780,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend',{waitUntil:'load',timeout:45000});await page.waitForSelector('.wshs-page-size');
 const world=await extensionWorld(page);
 for(const width of [1780,1828,1536,1366,1100]){
  let leftWidths;
  await page.setViewport({width,height:1000});
  for(const side of ['left','right']){
   await page.bringToFront();
   await page.evaluate(()=>scrollTo(0,0));await world(`chrome.storage.local.set({sidebarPosition:'${side}',pinnedSidebar:false})`);
   // Steam can replace the sidebar while applying its native side preference.
   // A thrown first predicate leaves Puppeteer's interval poller unstarted.
   try {
    await page.waitForFunction(side=>{const section=document.querySelector('.wshs-saved-filters');if(!section)return false;const r=section.getBoundingClientRect();return side==='left'?r.left<innerWidth/2:r.left>innerWidth/2;},{timeout:10000,polling:100},side);
   } catch(error) {
    console.error('Sidebar wait diagnostics',JSON.stringify({width,side,storage:await world("chrome.storage.local.get(['sidebarPosition','pinnedSidebar'])"),page:await page.evaluate(()=>({side:document.documentElement.getAttribute('data-wshs-sidebar-position'),sections:[...document.querySelectorAll('.wshs-saved-filters')].map(n=>({left:n.getBoundingClientRect().left,width:n.getBoundingClientRect().width,classes:n.className,paneClasses:n.parentElement.className}))}))}));throw error;
   }
   await wait(150);
   const base=await world(measure),buttons=base.buttons;
   if(side==='left')leftWidths=buttons.map(b=>b.w);
   else check(width+': flipping preserves every control width',buttons.every((b,i)=>Math.abs(b.w-leftWidths[i])<1));
   const cardAligned=state=>state.buttons.every(button=>state.columns.some(card=>Math.abs(button.x-card.left)<1&&Math.abs(button.right-card.right)<1&&Math.abs(button.w-card.width)<1));
   if(!cardAligned(base))console.log(JSON.stringify({width,side,buttons:base.buttons,columns:base.columns}));
   check(width+' '+side+': every control matches the card directly below its column',cardAligned(base));
   check(width+' '+side+': control block mirrors to the outer grid edge',side==='left'?Math.abs(Math.max(...buttons.map(b=>b.right),base.reset.right)-base.grid.right)<1:Math.abs(buttons[0].x-base.grid.left)<1);
   check(width+' '+side+': same-row control gaps match the card gap',buttons.slice(1).every((r,i)=>Math.abs(r.y-buttons[i].y)>1||Math.abs(r.x-buttons[i].right-base.geometry.gap)<1));
   check(width+' '+side+': reset has its own card slot',base.columns.some(c=>Math.abs(c.left-base.reset.x)<1&&Math.abs(c.right-base.reset.right)<1)&&buttons.every(b=>Math.abs(b.y-base.reset.y)>1||Math.abs(b.x-base.reset.x)>1));
   check(width+' '+side+': search flush with sidebar',Math.abs(base.search.x-base.pane.x)<1&&Math.abs(base.search.w-base.pane.w)<1);
   const top=Math.max(0,Math.floor(buttons[0].y)-15);
   await page.screenshot({path:'tests/out/aligned-'+width+'-'+side+'.png',clip:{x:0,y:top,width,height:Math.min(450,1000-top)}});
   await world('chrome.storage.local.set({pinnedSidebar:true})');await page.waitForSelector('.wshs-sidebar-pane');
   await page.evaluate(()=>scrollTo(0,1100));await page.waitForSelector('.wshs-search-fixed');await wait(150);
   const pinned=await world(measure);
   if(width===1780)check(side+': sidebar scrollbar matches Steam',await page.$eval('.wshs-sidebar-pane',pane=>{
    const native=[...pane.querySelectorAll('div')].find(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight);
    if(!native)return false;
    const a=getComputedStyle(pane),b=getComputedStyle(native),ta=getComputedStyle(pane,'::-webkit-scrollbar-thumb'),tb=getComputedStyle(native,'::-webkit-scrollbar-thumb');
    return a.scrollbarWidth===b.scrollbarWidth&&a.scrollbarColor===b.scrollbarColor&&ta.backgroundColor===tb.backgroundColor&&ta.borderRadius===tb.borderRadius&&getComputedStyle(pane,'::-webkit-scrollbar').width===getComputedStyle(native,'::-webkit-scrollbar').width;
   }));
   check(width+' '+side+': existing sidebar pinning is preserved',Math.abs(pinned.search.y-12)<1&&pinned.pane.y>=pinned.search.bottom&&pinned.pane.bottom<=1000);
   check(width+' '+side+': pinning preserves exact card widths and columns',cardAligned(pinned));
  }
 }
 if(errors.length)console.error('Live alignment page errors:',errors);
 check('no live alignment page errors',errors.length===0);
 console.log(checks+' live alignment checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
