const assert=require('assert/strict'),path=require('path');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name)}
const fakeId='999991111',first='2889112010';
const bytes=id=>id===first?0:id==='3538584455'?5500000000:(Number(id)%1000+1)*1000000+123456;
const votes=id=>Number(id)%1000;
(async()=>{
 const browser=await launch(process.argv.includes('--firefox')?'firefox':undefined);let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1280,height:1000});
  let calls=0,batches=[],outage=false,missing=false;
  await page.setRequestInterception(true);
  page.on('request',r=>{
   const url=new URL(r.url());if(url.pathname==='/sharedfiles/actions'&&url.searchParams.get('q')==='GetUGCSummary'){
    const ids=JSON.parse(url.searchParams.get('qp'))[0];calls++;batches.push(ids);
    if(outage)return r.respond({status:503,contentType:'application/json',body:'{}'});
    return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:ids.map(id=>({publishedfileid:id,...(missing&&id===fakeId?{}:{file_size:String(bytes(id))}),total_votes:votes(id)}))})});
   }r.continue();
  });
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Collection page error:',e.stack||e.message)});
  await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'load',timeout:60000});
  await page.waitForSelector('.wshs-collection-sizes');
  const settled=()=>page.waitForFunction(()=>document.querySelector('.wshs-collection-sizes').getAttribute('aria-busy')==='false',{timeout:30000});
  await settled();
  const mods=await page.$$eval('.collectionItem',rs=>rs.map(r=>({id:r.id.replace('sharedfile_',''),title:r.querySelector('.workshopItemTitle').textContent,stars:Number(r.querySelector('.fileRating')?.src.match(/([1-5])-star/)?.[1]||0)})));
  const expected=mods.reduce((sum,m)=>sum+bytes(m.id),0);
  const summary=()=>page.$eval('.wshs-collection-sizes',s=>({...s.dataset,text:s.innerText}));
  let s=await summary();
  check('total sums all unique collection mod bytes',Number(s.totalBytes)===expected&&s.totalMissing==='0');
  check('unfiltered size equals full collection size',s.filteredBytes===s.totalBytes);
  check('both units use decimal MB and GB',s.text.includes((expected/1e6).toLocaleString('en-US',{maximumFractionDigits:2})+' MB')&&s.text.includes((expected/1e9).toLocaleString('en-US',{maximumFractionDigits:2})+' GB'));
  check('zero-byte files remain valid',!s.text.includes('unavailable'));
  check('metadata is batched without duplicate IDs',batches.every(b=>b.length<=100)&&new Set(batches.flat()).size===mods.length&&batches.flat().length===mods.length);
  check('native collection item count is preserved',await page.$eval('.wshs-collection-count .childCount',(e,n)=>e.textContent.includes(String(n)),mods.length));
  await page.$eval('.wshs-collection-summary',e=>e.scrollIntoView());
  check('six controls form equal three-column rows',await page.evaluate(()=>{
   const top=[...document.querySelectorAll('.subscribeCollection>.general_btn')].slice(0,3),bottom=[document.querySelector('.hide-subscribed-button:not(.star-filter-button)'),document.querySelector('.ratings-filter-button'),document.querySelector('.star-filter-button')];
   const a=top.map(e=>e.getBoundingClientRect()),b=bottom.map(e=>e.getBoundingClientRect());
   return a.length===3&&a.every((r,i)=>Math.abs(r.left-b[i].left)<.5&&Math.abs(r.width-b[i].width)<.5&&Math.abs(r.height-b[i].height)<.5)&&Math.abs(a[0].width-a[2].width)<.5&&a.every(r=>r.top===a[0].top)&&b.every(r=>r.top===b[0].top)&&b[0].top>a[0].bottom;
  }));
  check('both rows center their labels and keep icons pinned left',await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('.subscribeCollection>.general_btn'),...document.querySelectorAll('.wshs-collection-controls .hide-subscribed-button')];
   return buttons.length===6&&buttons.every(button=>{
    const label=button.querySelector('span:not(.wshs-toggle-slot)'),icon=button.querySelector('.subscribeIcon,.unsubscribeIcon,.duplicateCollectionIcon,.wshs-left-icon');
    const range=document.createRange();range.selectNodeContents(label);
    const b=button.getBoundingClientRect(),l=range.getBoundingClientRect(),i=icon.getBoundingClientRect();
    return Math.abs((l.left+l.right-b.left-b.right)/2)<1&&Math.abs(i.left-b.left-8)<1;
   });
  }));
  async function ratings(n){await page.$eval('.ratings-filter-button',b=>b.click());await page.$eval('[data-ratings="'+n+'"]',o=>o.click());await wait(100);}
  await page.hover('.collectionItem .workshopItemAuthorName a');await wait(100);
  await ratings(100);
  check('creator controls disappear when rating filtering hides their mod',await page.$eval('.wshs-picker',p=>getComputedStyle(p).display==='none'));
  const rated=mods.filter(m=>votes(m.id)>=100);
  check('minimum rating count hides only values below the threshold',await page.$$eval('.collectionItem:not(.wshs-ratings-filtered)',rs=>rs.map(r=>r.id.replace('sharedfile_',''))).then(ids=>ids.length===rated.length&&ids.every(id=>votes(id)>=100)));
  s=await summary();check('filtered size follows the rating-count threshold',Number(s.filteredBytes)===rated.reduce((n,m)=>n+bytes(m.id),0)&&Number(s.totalBytes)===expected);
  await page.$eval('.star-filter-button',b=>b.click());await page.$eval('[data-stars="5"]',b=>b.click());await wait(100);
  const starred=rated.filter(m=>m.stars===5);
  check('rating count and stars combine without overwriting each other',Number((await summary()).filteredBytes)===starred.reduce((n,m)=>n+bytes(m.id),0));
  await page.$eval('.wshs-sf-input',e=>{e.value='Anomaly Upscaled';e.nextElementSibling.click()});await wait(150);
  const saved=starred.filter(m=>!m.title.includes('Anomaly Upscaled'));
  check('saved keyword filters update the size alongside other filters',Number((await summary()).filteredBytes)===saved.reduce((n,m)=>n+bytes(m.id),0));
  const beforeCalls=calls;await ratings(5000);
  check('all filtered out displays an exact zero in both units',(await summary()).text.includes('After filters: 0 MB (0 GB)'));
  check('changing filters reuses metadata without network requests',calls===beforeCalls);
  // Avoid Firefox firing Steam's native hover handler while the next document
  // is still parsing and its workshop_item_hover element does not exist yet.
  await page.mouse.move(0,0);
  await page.reload({waitUntil:'load'});await page.waitForSelector('.wshs-collection-sizes');await settled();
  check('rating threshold persists on reload',await page.$eval('.ratings-filter-button',b=>b.textContent==='5,000+ Ratings'));
  check('warm reload uses cached metadata',calls===beforeCalls);
  await ratings(0);await page.$eval('.star-filter-button',b=>b.click());await page.$eval('[data-stars="0"]',b=>b.click());
  await page.$$eval('.wshs-sf-delete',es=>es.forEach(e=>e.click()));await wait(100);
  const subscribed=mods.find(m=>bytes(m.id)>0);
  await page.evaluate(id=>document.getElementById('SubscribeItemBtn'+id).classList.add('toggled'),subscribed.id);
  await page.$eval('.hide-subscribed-button:not(.star-filter-button)',b=>b.click());await wait(100);
  check('Hide Subscribed changes filtered size while keeping full size',Number((await summary()).filteredBytes)===expected-bytes(subscribed.id));
  await page.$eval('.hide-subscribed-button:not(.star-filter-button)',b=>b.click());
  outage=true;
  await page.evaluate(id=>{
   const clone=document.querySelector('.collectionItem').cloneNode(true);clone.id='sharedfile_'+id;
   clone.querySelectorAll('a[href*="sharedfiles/filedetails/"]').forEach(a=>a.href='/sharedfiles/filedetails/?id='+id);
   clone.querySelector('.workshopItemTitle').textContent='Temporary metadata test';
   document.querySelector('.collectionChildren').appendChild(clone);
  },fakeId);
  await wait(1000);await settled();s=await summary();
  check('failed metadata is shown as a lower bound, never a false complete total',s.totalMissing==='1'&&s.text.includes('Total: ≥ ')&&s.text.includes('1 unavailable'));
  check('failed size lookup offers Retry',await page.$eval('.wshs-size-retry',b=>!b.hidden));
  outage=false;missing=true;await page.$eval('.wshs-size-retry',b=>b.click());await settled();s=await summary();
  check('missing file_size is not mistaken for zero bytes',s.totalMissing==='1');
  await page.$eval('.wshs-sf-input',e=>{e.value='Temporary metadata test';e.nextElementSibling.click()});await wait(150);
  s=await summary();check('excluding an unknown-size mod gives an exact filtered total',s.totalMissing==='1'&&s.filteredMissing==='0'&&Number(s.filteredBytes)===expected&&!s.text.split('\n')[1].includes('≥'));
  missing=false;await page.$eval('.wshs-size-retry',b=>b.click());await settled();s=await summary();
  check('Retry recovers unavailable sizes',s.totalMissing==='0'&&Number(s.totalBytes)===expected+bytes(fakeId));
  await page.evaluate(()=>{
   const row=document.getElementById('sharedfile_999991111');row.id='sharedfile_999991117';
   row.querySelector('.collectionItemDetails>a').href='/sharedfiles/filedetails/?id=999991117';
  });await wait(200);await settled();
  check('cached row identities refresh when a mod link changes',Number((await summary()).totalBytes)===expected+bytes('999991117'));
  check('no extension or collection page errors',errors.length===0);
  await page.$eval('.wshs-collection-summary',e=>e.scrollIntoView());await page.screenshot({path:path.join(__dirname,'out/collection-size-ratings-final.png')});
  console.log(checks+' collection size and rating checks passed.');
 }catch(e){console.error(e);if(page)try{await page.screenshot({path:path.join(__dirname,'out/collection-size-ratings-failure.png')})}catch(_){}throw e}
 finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
