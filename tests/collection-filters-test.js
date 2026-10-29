const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {launch,closeBrowser,extensionWorld,openBrowse,wait,BASE_URL,installFrameSampler}=require('./browser-helpers');
const URL='https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585';
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch();let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1280,height:1000});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Collection page error:',e.message)});
  await page.goto(URL,{waitUntil:'load',timeout:60000});await page.waitForSelector('.wshs-design-collection');
  const world=await extensionWorld(page);
  const plan=()=>page.$eval('[data-wshs-subscription-plan]',b=>JSON.parse(b.getAttribute('data-wshs-subscription-plan')));
  const rows=()=>page.$$eval('.wshs-sf-chip',r=>r.length);
  const baseline=await plan();
  const actualItems=await page.$$eval('.collectionItemDetails > a[href*="filedetails"]',as=>new Set(as.map(a=>new URL(a.href).searchParams.get('id')).filter(Boolean)).size);
  check('collection identifies RimWorld and includes every current item',baseline.appId==='294100'&&actualItems>0&&baseline.allowed.length===actualItems&&baseline.excluded.length===0);
  check('saved filters sit beside the original native and extension toolbar',await page.evaluate(()=>!!document.querySelector('.wshs-design-sidebar .wshs-collection-filters')&&!!document.querySelector('.wshs-design-results .subscribeCollection')));
  await page.$eval('.subscribeCollection',e=>e.scrollIntoView());
  check('Save, phrase field and help share the native 30px height',await page.$$eval('.wshs-sf-add>*',es=>es.every(e=>Math.abs(e.getBoundingClientRect().height-30)<.1)));
  await page.hover('.collectionItem .workshopItemAuthorName a');await wait(150);
  check('four controls are text-sized and vertically flush with the creator',await page.evaluate(()=>{
   const a=document.querySelector('.collectionItem .workshopItemAuthorName a'),p=document.querySelector('.wshs-picker'),r=a.getBoundingClientRect(),b=p.getBoundingClientRect();
   return p.children.length===4&&Math.abs(b.left-r.right-4)<.1&&Math.abs(b.top+b.height/2-r.top-r.height/2)<.1&&[...p.children].every(c=>c.getBoundingClientRect().height===parseFloat(getComputedStyle(a).fontSize));
  }));
  await wait(600);
  await installFrameSampler(page);
  const motion=await page.evaluate(async()=>{
   const row=document.querySelector('.collectionItem'),author=row.querySelector('.workshopItemAuthorName a'),picker=document.querySelector('.wshs-picker');
   row.style.transition='transform 650ms linear';row.style.transform='translateY(-5px)';
   let maxError=0,frames=0;
   await new Promise(resolve=>{const until=performance.now()+800;function sample(){const a=author.getBoundingClientRect(),p=picker.getBoundingClientRect();maxError=Math.max(maxError,Math.abs(a.top+a.height/2-p.top-p.height/2));frames++;if(performance.now()<until)__wshsAfterFrame(sample);else resolve();}__wshsAfterFrame(sample)});
   row.style.removeProperty('transition');row.style.removeProperty('transform');return{maxError,frames};
  });await wait(100);
  check('collection controls track longer transitions after resting',motion.frames>10&&motion.maxError<.5);
  await page.mouse.move(0,0);await wait(450);
  await page.hover('.collectionItem .workshopItemAuthorName a');await wait(650);
  await page.evaluate(()=>scrollBy(0,30));await wait(100);
  check('resting collection controls wake for scrolling',await page.evaluate(()=>{
   const a=document.querySelector('.collectionItem .workshopItemAuthorName a').getBoundingClientRect(),p=document.querySelector('.wshs-picker').getBoundingClientRect();return Math.abs(a.top+a.height/2-p.top-p.height/2)<.2;
  }));
  const before=await page.$eval('.collectionItem',r=>({h:r.getBoundingClientRect().height,star:r.querySelector('.fileRating').getBoundingClientRect().top}));
  await page.click('.wshs-picker-help');
  check('creator help explains the shared list',await page.$eval('.wshs-picker-guide',e=>e.textContent.includes('shared with Workshop')));
  await page.click('.wshs-picker-help');await page.click('.wshs-picker-word-toggle');
  const title='.collectionItem .collectionItemDetails > a';
  await page.hover(title);await wait(100);
  const point=await page.$eval(title,a=>{
   const n=a.querySelector('.workshopItemTitle').firstChild,m=/Unofficial/.exec(n.textContent),r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);const b=r.getBoundingClientRect();return{x:b.left+5,y:b.top+5};
  });
  await page.mouse.click(point.x,point.y);
  check('title words select without opening the mod',page.url()===URL&&await page.evaluate(()=>CSS.highlights.get('wshs-selected-word')?.size===1));
  await page.mouse.move(5,5);await wait(350);
  check('selected word remains pinned after leaving the title',await page.$eval('.wshs-picker',e=>getComputedStyle(e).display!=='none'));
  await page.keyboard.press('Escape');
  check('Escape restores collection titles and unchecks word mode',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-title-selection')&&!CSS.highlights.has('wshs-selected-word')));
  check('hover and word controls do not shift row height or stars',await page.$eval('.collectionItem',(r,b)=>r.getBoundingClientRect().height===b.h&&r.querySelector('.fileRating').getBoundingClientRect().top===b.star,before));

  async function setFilters(filters){await world(`chrome.storage.local.set({'savedFilters:294100':${JSON.stringify(filters)}})`);await wait(150);}
  await setFilters([{kind:'keyword',value:'Anomaly Upscaled',label:'Anomaly Upscaled',state:-1}]);
  check('keyword hide excludes matching collection titles',await page.$$eval('.collectionItem.wshs-filtered',rs=>rs.length===1&&rs[0].querySelector('.workshopItemTitle').textContent.includes('Anomaly Upscaled')));
  check('descriptions alone never trigger saved keyword filters',await page.evaluate(()=>{
   const row=[...document.querySelectorAll('.collectionItem')].find(r=>r.querySelector('.workshopItemTitle').textContent.includes('Better Looking Plants'));row.querySelector('.workshopItemShortDesc').textContent='Anomaly Upscaled';return !row.classList.contains('wshs-filtered');
  }));
  await setFilters([{kind:'keyword',value:'zz-no-title-match-zz',label:'zz-no-title-match-zz',state:-1}]);
  await page.$eval('.collectionItem .workshopItemShortDesc',e=>e.textContent='zz-no-title-match-zz');await wait(150);
  check('description mutation still does not hide titles',await page.$$eval('.collectionItem.wshs-filtered',rs=>rs.length===0));
  await setFilters([{kind:'keyword',value:'Plants',label:'Plants',state:1}]);
  check('keyword plus only includes matching titles',await page.$$eval('.collectionItem:not(.wshs-filtered)',rs=>rs.length>0&&rs.every(r=>r.querySelector('.workshopItemTitle').textContent.toLowerCase().includes('plants'))));
  await page.click('.wshs-sf-chip .wshs-sq');await wait(100);
  check('clicking active plus turns it off without deleting the filter',await rows()===1&&(await plan()).excluded.length===0);
  await page.click('.wshs-sf-delete');await wait(100);
  check('collection delete persists an empty per-game list',await rows()===0&&(await world("chrome.storage.local.get('savedFilters:294100')"))['savedFilters:294100'].length===0);

  await page.hover('.collectionItem .workshopItemAuthorName a');await wait(100);
  await page.click('.wshs-picker [data-action="hide"]');await wait(1200);
  check('original collection row stays visible during undo window',await page.$eval('.collectionItem',e=>!e.classList.contains('wshs-filtered')));
  await page.click('.wshs-picker-hint');await wait(1500);
  check('undo leaves storage and the original row unchanged',await rows()===0&&await page.$eval('.collectionItem',e=>!e.classList.contains('wshs-filtered')));

  const vanityAuthor=await page.$$eval('.collectionItem .workshopItemAuthorName a',as=>{
   const a=as.find(a=>a.getAttribute('href').includes('/id/'));return {name:a.textContent,key:a.getAttribute('href').match(/\/(id|profiles)\/([^/?]+)/).slice(1).join('/')};
  });
  await setFilters([{kind:'author',value:vanityAuthor.key,label:vanityAuthor.name,state:-1}]);
  await page.waitForSelector('[data-wshs-subscription-plan]',{timeout:20000});
  const liveAlias=(await world(`chrome.storage.local.get(${JSON.stringify('savedFilterAuthorAlias:'+vanityAuthor.key.toLowerCase())})`))['savedFilterAuthorAlias:'+vanityAuthor.key.toLowerCase()];
  check('real Steam public XML resolves a vanity creator to a numeric identity',!!liveAlias&&/^\d{17}$/.test(liveAlias.steamId));
  await setFilters([]);
  const author=await page.$eval('.collectionItem .workshopItemAuthorName a',a=>({name:a.textContent,key:a.getAttribute('href').match(/\/(id|profiles)\/([^/?]+)/).slice(1).join('/')}));
  const steamId=author.key.startsWith('profiles/')?author.key.split('/')[1]:'76561197967932674';
  await world(`chrome.storage.local.set({${JSON.stringify('savedFilterAuthorAlias:'+author.key.toLowerCase())}:{steamId:${JSON.stringify(steamId)},vanity:'collection-alias-test'}})`);
  await setFilters([{kind:'author',value:author.key,label:author.name,state:-1}]);
  await page.waitForSelector('[data-wshs-subscription-plan]');
  check('creator minus excludes matching collection rows',await page.$eval('.collectionItem',e=>e.classList.contains('wshs-filtered')));
  await page.$eval('.collectionItem .workshopItemAuthorName a',a=>a.href='https://steamcommunity.com/id/collection-alias-test/myworkshopfiles?appid=294100');
  await setFilters([{kind:'author',value:author.key,label:author.name,state:-1},{kind:'keyword',value:'never-match-this',label:'never-match-this',state:0}]);
  check('Steam profile and vanity identities match the same saved author',await page.$eval('.collectionItem',e=>e.classList.contains('wshs-filtered')));
  await page.click('.wshs-sf-chip:first-child .wshs-sq:nth-child(2)');await wait(100);
  await page.hover('.collectionItem .workshopItemAuthorName a');await wait(100);
  await page.click('.wshs-picker [data-action="hide"]');await wait(2700);
  check('creator controls reuse the existing filter across numeric and vanity links',await rows()===2&&await page.$eval('.collectionItem',e=>e.classList.contains('wshs-filtered')));

  const browse=await browser.newPage();await browse.setViewport({width:1600,height:1000});await browse.bringToFront();await openBrowse(browse,BASE_URL);
  check('Workshop reads the collection saved list',await browse.$$eval('.wshs-sf-label',es=>es.some(e=>e.textContent==='never-match-this')));
  await browse.type('.wshs-sf-input','shared-live-test');await browse.click('.wshs-sf-save');await wait(250);
  check('Workshop edits synchronize to the open collection',await page.$$eval('.wshs-sf-label',es=>es.some(e=>e.textContent==='shared-live-test')));
  await setFilters([]);await browse.close();await page.bringToFront();await page.reload({waitUntil:'load'});await page.waitForSelector('[data-wshs-subscription-plan]');
  check('empty list remains empty after collection reload',await rows()===0&&(await plan()).allowed.length===baseline.allowed.length);
  for(const width of [1280,1024]){
   await page.setViewport({width,height:1000});await page.$eval('.subscribeCollection',e=>e.scrollIntoView());
   await page.$eval('.collectionItem .workshopItemAuthorName a',a=>a.textContent='Long creator name '.repeat(20));await page.mouse.move(5,5);await wait(350);
   const h=await page.$eval('.collectionItem',r=>r.getBoundingClientRect().height);
   await page.hover('.collectionItem .workshopItemAuthorName a');await wait(100);
   check('long creator stays flush without wrapping or covering subscribe at '+width+'px',await page.$eval('.collectionItem',(r,h)=>{
    const a=r.querySelector('.workshopItemAuthorName a').getBoundingClientRect(),p=document.querySelector('.wshs-picker').getBoundingClientRect(),s=r.querySelector('.subscriptionControls').getBoundingClientRect();
    return r.getBoundingClientRect().height===h&&Math.abs(p.top+p.height/2-a.top-a.height/2)<.2&&p.right<s.left;
   },h));
  }
  await page.$eval('.collectionItem .workshopItemAuthorName a',a=>a.textContent='The');
  await page.$eval('.subscribeCollection',e=>e.scrollIntoView());await page.screenshot({path:path.join(__dirname,'out/collection-filters-final.png')});
  check('no collection extension errors',errors.length===0);
  console.log(checks+' collection filter checks passed.');
 }catch(e){console.error('Original failure:',e);if(page)try{await page.bringToFront();await page.screenshot({path:path.join(__dirname,'out/collection-filters-failure.png')})}catch(_){}throw e}
 finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
