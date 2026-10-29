// Read-only acceptance on two public collections. Account actions are not clicked.
const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined,{useConfiguredService:true});try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const id of ['3521297585','3818340638']){
  await p.setViewport({width:1780,height:1050});await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id='+id,{waitUntil:'load',timeout:60000});await p.waitForSelector('.wshs-design-collection');await p.evaluate(()=>document.fonts.ready);
  check(id+': native mod rows, collection title, rating, tabs and actions retained',await p.evaluate(()=>document.querySelectorAll('.wshs-design-items>.collectionItem').length>100&&!!document.querySelector('.wshs-design-info>.workshopItemTitle')&&!!document.querySelector('.wshs-design-rating .numRatings')&&!!document.querySelector('.sharedfiles_tabs_ctn a[href*="comments"]')&&!!document.querySelector('#ItemControls [onclick]')));
  check(id+': all received awards fit one line to the banner edge',await p.$$eval('.wshs-design-awards .review_award:has(img)',ns=>{const r=ns[0]?.parentElement.getBoundingClientRect();return ns.length>0&&ns.every(n=>getComputedStyle(n).display!=='none'&&Math.abs(n.getBoundingClientRect().top-ns[0].getBoundingClientRect().top)<1)&&ns.at(-1).getBoundingClientRect().right<=r.right+1;}));
  if(id==='3818340638')check('sparse awards stay together instead of stretching across the banner',await p.$$eval('.wshs-design-awards .review_award:has(img)',ns=>ns.length===3&&ns.at(-1).getBoundingClientRect().right-ns[0].getBoundingClientRect().left<150));
  check(id+': Steam and game headers share the centered collection inset',await p.evaluate(()=>{const content=document.querySelector('#global_header .content').getBoundingClientRect(),game=document.querySelector('.apphub_HomeHeaderContent').getBoundingClientRect(),main=document.querySelector('.wshs-design-collection').getBoundingClientRect();return Math.abs(content.left-main.left)<2&&Math.abs(game.left-main.left)<2&&Math.abs(content.right-main.right)<2&&Math.abs(game.right-main.right)<2;}));
  check(id+': stars align with collection title',await p.evaluate(()=>Math.abs(document.querySelector('.wshs-design-info>.workshopItemTitle').getBoundingClientRect().top-document.querySelector('.wshs-design-rating img').getBoundingClientRect().top)<1));
  check(id+': collapsed description previews its opening text',await p.$eval('.wshs-design-description-preview',(n,id)=>n.textContent.includes(id==='3818340638'?'A curated setup':'A behemoth newcomer'),id));
  await p.click('.wshs-design-description-more');
  check(id+': original description images and author credits are available',await p.evaluate(()=>!document.querySelector('#highlightContent').hidden&&document.querySelectorAll('.wshs-design-author-list a').length>30&&!!document.querySelector('#highlightContent a')));
  for(const width of [1780,1200,1024,900,600,420]){
   await p.setViewport({width,height:1050});await wait(120);
   await p.evaluate(()=>scrollTo(400,scrollY));check(id+' '+width+': horizontal scrolling cannot clip the collection',await p.evaluate(()=>scrollX===0));
   // Steam's off-canvas mobile menu is intentionally beyond the viewport.
   check(id+' '+width+': redesigned collection fits viewport',await p.$eval('.wshs-design-collection',n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth;}));
   check(id+' '+width+': description images stay centered and bounded',await p.$$eval('#highlightContent img',ns=>ns.every(n=>{const r=n.getBoundingClientRect(),c=n.closest('.workshopItemDescription').getBoundingClientRect();return r.width<=800&&r.width<=c.width+1&&Math.abs((r.left-c.left)-(c.right-r.right))<2;})));
   check(id+' '+width+': row image, title and subscribe button do not overlap',await p.$eval('.collectionItem',n=>{const a=n.querySelector('.workshopItemPreviewImage').getBoundingClientRect(),t=n.querySelector('.workshopItemTitle').getBoundingClientRect(),b=n.querySelector('.subscriptionControls').getBoundingClientRect();return a.right<=t.left&&t.right<=b.left;}));
   for(const side of ['left','right']){
    await p.evaluate(side=>document.documentElement.dataset.wshsCollectionSide=side,side);
    check(id+' '+width+' '+side+': sidebar leaves the full results column available',await p.evaluate(()=>{const results=document.querySelector('.wshs-design-results').getBoundingClientRect(),pane=document.querySelector('.wshs-design-sidebar').getBoundingClientRect(),workspace=document.querySelector('.wshs-design-workspace'),r=workspace.getBoundingClientRect(),gap=parseFloat(getComputedStyle(workspace).columnGap);return innerWidth<=760||Math.abs(results.width+pane.width+gap-r.width)<2;}));
   }
  }
  await p.setViewport({width:1024,height:1050});await p.click('.wshs-design-description-toggle');await p.evaluate(()=>document.documentElement.dataset.wshsCollectionSide='left');await p.$eval('.wshs-design-workspace',n=>n.scrollIntoView());await p.screenshot({path:'tests/out/collection-design-live-'+id+'-1024-left-'+(firefox?'firefox':'chrome')+'.png'});
  await p.setViewport({width:1780,height:1050});await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'tests/out/collection-design-live-'+id+'-'+(firefox?'firefox':'chrome')+'.png'});
 }
 check('no collection page errors',errors.length===0);console.log(checks+' read-only live collection design checks passed.');
 }finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
