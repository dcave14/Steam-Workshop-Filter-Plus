const assert=require('assert/strict'),path=require('path');
const {launch,closeBrowser,openBrowse,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name)}
(async()=>{
 const b=await launch(process.argv.includes('--firefox')?'firefox':undefined);let p;
 try{
  p=await b.newPage();await p.setViewport({width:1600,height:1000});
  await openBrowse(p);await p.evaluate(()=>document.fonts.ready);await wait(250);
  const records=await p.evaluate(()=>{
   const data={};function visit(v,depth){if(!v||depth>16)return;if(typeof v==='string'){if(/^[\[{]/.test(v))try{visit(JSON.parse(v),depth+1)}catch(_){}return}if(typeof v==='object'){if(v.publishedfileid&&Number.isInteger(v.total_votes))data[v.publishedfileid]=v.total_votes;Object.values(v).forEach(n=>visit(n,depth+1))}}
   visit(window.SSR.loaderData,0);visit(window.SSR.renderContext,0);return data;
  });
  const ids=await p.$$eval('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]',as=>[...new Set(as.filter(a=>!a.closest('dialog')).map(a=>new URL(a.href).searchParams.get('id')))]);
  check('SSR provides actual numeric rating counts for every displayed mod',ids.length>0&&ids.every(id=>Number.isInteger(records[id])));
  const hidden=()=>p.$$eval('.wshs-ratings-filtered a[href*="sharedfiles/filedetails/?id="]',as=>[...new Set(as.map(a=>new URL(a.href).searchParams.get('id')))]);
  async function choose(n){await p.$eval('[data-ratings="'+n+'"]',e=>e.click());await wait(100)}
  await choose(100);await p.waitForFunction(()=>document.querySelector('.wshs-ratings-status').textContent==='Minimum number of user ratings.',{timeout:30000});let excluded=await hidden();
  check('100+ uses user vote counts rather than star scores',excluded.length===ids.filter(id=>records[id]<100).length&&excluded.every(id=>records[id]<100));
  await choose(5000);excluded=await hidden();
  check('high threshold filters all known low-count mods',excluded.length===ids.filter(id=>records[id]<5000).length);
  await choose(0);check('Any number restores mods filtered by rating count',(await hidden()).length===0);
  const geometry=()=>p.evaluate(()=>{
   const own=document.querySelector('.wshs-injected-controls'),sort=own.nextElementSibling.querySelector('[role=button]');
   return [...own.querySelectorAll('button.hide-subscribed-button'),sort].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(e).fontSize}});
  });
  for(const width of [1600,1280,1024,640,520]){
   await p.setViewport({width,height:1000});await wait(400);const base=await geometry();
   check('all four dropdowns remain separated at '+width+'px',base.length===4&&base.every((a,i)=>base.every((c,j)=>i===j||Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x)<=.5||Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y)<=.5)));
   await choose(5000);const after=await geometry();
   check('rating filtering cannot change toolbar geometry at '+width+'px',after.every((r,i)=>['x','y','w','h'].every(k=>Math.abs(r[k]-base[i][k])<.5)&&r.font===base[i].font));
   await choose(0);
  }
  await p.setViewport({width:1600,height:1000});await wait(350);await choose(250);
  await p.reload({waitUntil:'load'});await p.waitForSelector('.wshs-sf-input');
  check('rating-count preference survives reload',await p.$eval('.ratings-filter-button',b=>b.textContent==='250+ Ratings'));
  await p.$eval('.ratings-filter-button',b=>b.click());
  await p.focus('[data-ratings="50"]');await p.keyboard.press('Enter');await wait(100);
  check('rating thresholds work from the keyboard',await p.$eval('.ratings-filter-button',b=>b.textContent==='50+ Ratings'&&b.getAttribute('aria-expanded')==='false'));
  await p.$eval('.ratings-filter-button',b=>b.click());await p.focus('[data-ratings="0"]');await p.keyboard.press('Escape');
  check('Escape closes the ratings dropdown',await p.$eval('.wshs-ratings-menu',m=>!m.classList.contains('show')));
  await choose(0);
  let recover=false,requests=0;await p.setRequestInterception(true);
  p.on('request',r=>{
   const u=new URL(r.url());if(u.pathname==='/sharedfiles/actions'&&u.searchParams.get('q')==='GetUGCSummary'){
    requests++;return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:recover?[{publishedfileid:'999991112',total_votes:0}]:[]})});
   }r.continue();
  });
  await p.evaluate(()=>{
   let a=document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]');
   while(a&&!a.querySelector('.aspectratio_16x9,.aspectratio_square'))a=a.parentElement;
   const clone=a.cloneNode(true);clone.dataset.ratingTest='true';
   clone.querySelectorAll('a[href*="sharedfiles/filedetails/?id="]').forEach(link=>link.href='/sharedfiles/filedetails/?id=999991112');a.parentElement.appendChild(clone);
  });
  await choose(100);await p.waitForFunction(()=>document.querySelector('.wshs-ratings-status').textContent.includes('unavailable'));
  check('unavailable vote count is not silently treated as zero',await p.$eval('[data-rating-test]',r=>!r.classList.contains('wshs-ratings-filtered')));
  check('dropdown explains unavailable counts and offers retry',await p.$eval('.wshs-ratings-retry',b=>!b.hidden));
  recover=true;await p.$eval('.wshs-ratings-retry',b=>b.click());await p.waitForFunction(()=>document.querySelector('[data-rating-test]').classList.contains('wshs-ratings-filtered'));
  check('a confirmed zero-vote count is filtered after retry',await p.$eval('[data-rating-test]',r=>r.getBoundingClientRect().width===0));
  check('metadata retry does not create a request loop',requests<=2);
  await p.$eval('[data-rating-test]',r=>r.remove());await choose(0);
  await p.screenshot({path:path.join(__dirname,'out/workshop-four-dropdowns.png')});
  console.log(checks+' Workshop rating checks passed.');
 }catch(e){if(p)try{await p.screenshot({path:path.join(__dirname,'out/workshop-ratings-failure.png')})}catch(_){}throw e}
 finally{await closeBrowser(b)}
})().catch(e=>{console.error(e);process.exitCode=1});
