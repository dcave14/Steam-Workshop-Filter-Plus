// Real extension + Steam DOM. Every subscription POST is intercepted before it
// reaches Steam. The native dialog shim exposes the same add/overwrite choices.
const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch(process.argv.includes('--firefox')?'firefox':undefined);let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1280,height:1000});
  let writes=[],reads=[],failId=null,badList=false;
  let fixture=[];
  await page.setRequestInterception(true);
  page.on('request',async req=>{
   const u=new URL(req.url());
   if(req.method()==='POST'&&/\/sharedfiles\/(subscribe|unsubscribe|subscribecollection|unsubscribecollection)$/.test(u.pathname)){
    const data=Object.fromEntries(new URLSearchParams(await req.fetchPostData()));writes.push({path:u.pathname,...data});
    return req.respond({status:200,contentType:'application/json',body:JSON.stringify({success:data.id===failId?0:1})});
   }
   if(u.pathname.includes('/profiles/76561197960265728/myworkshopfiles/')){
    reads.push(req.url());const p=Number(u.searchParams.get('p')),ids=p===1?fixture.slice(0,2):fixture.slice(2);
    const html=badList?'<html>Login required</html>':`<div class="workshopBrowseItems">${ids.map(id=>`<div class="workshopItem"><a href="/sharedfiles/filedetails/?id=${id}">mod</a></div>`).join('')}</div><div class="workshopBrowsePagingInfo">Showing ${p===1?'1-2':'3-3'} of ${fixture.length} entries</div>`;
    return req.respond({status:200,contentType:'text/html',body:html});
   }
   req.continue();
  });
  await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'load',timeout:60000});
  await page.waitForSelector('[data-wshs-subscription-plan]');
  await page.evaluate(()=>{
   [...document.querySelectorAll('.collectionItem')].slice(4).forEach(r=>r.remove());
   document.querySelector('.collectionItem .workshopItemTitle').textContent='Blocked first';
   window.__dialogs=[];window.__alerts=[];window.__bulk=0;window.__progress=null;
   window.g_steamID='76561197960265728';window.g_sessionID='TEST-ONLY-NOT-A-REAL-SESSION';
   window.ShowConfirmDialog=(title,body,...buttons)=>{
    const d={title,body,buttons,callback:null};window.__dialogs.push(d);
    return {done(cb){d.callback=cb;return this}};
   };
   window.ShowAlertDialog=(title,body)=>window.__alerts.push({title,body});
   window.ShowBlockingWaitDialog=(title,body)=>{window.__progress={title,body,dismissed:false};return {Dismiss(){window.__progress.dismissed=true},fail(){}}};
   window.SubscribeCollectionHelper=()=>{window.__bulk++};
   window.SubscribeCollection=(id,appId)=>{
    ShowConfirmDialog('Subscribe to all','Native add or overwrite choice','Add Only',undefined,'Overwrite My Subscriptions').done(action=>{
     if(action==='OK')SubscribeCollectionHelper(id,appId,true);
     else ShowConfirmDialog('Overwrite My Subscriptions','Native second overwrite confirmation','Yes, Overwrite My Subscriptions',undefined,'Save Current Subscriptions to a Collection').done(action2=>{
      if(action2==='OK')SubscribeCollectionHelper(id,appId,false);
      else window.__savedBackup=true;
     });
    });
   };
  });
  const ids=await page.$$eval('.collectionItem',rs=>rs.map(r=>r.id.replace('sharedfile_','')));
  async function filters(list){
   await page.$$eval('.wshs-sf-delete',es=>es.forEach(e=>e.click()));await wait(50);
   for(const f of list){
    await page.$eval('.wshs-sf-input',(e,value)=>{e.value=value;e.nextElementSibling.click()},f.value);await wait(50);
    if(f.state===1)await page.$eval('.wshs-sf-chip:last-child .wshs-sq',b=>b.click());
   }
   await wait(100);
  }
  const blocked=[{kind:'keyword',value:'Blocked first',label:'Blocked first',state:-1}];
  async function reset(){writes=[];reads=[];failId=null;badList=false;await page.evaluate(()=>{window.__dialogs=[];window.__alerts=[];window.__progress=null;window.__bulk=0;document.querySelectorAll('.collectionItem .toggled').forEach(b=>b.classList.remove('toggled'))});await filters(blocked);}
  async function click(){await page.$eval('.subscribeCollection [onclick*="SubscribeCollection("]',b=>b.click());}
  async function choose(index,action){await page.evaluate((i,a)=>window.__dialogs[i].callback(a),index,action);}
  async function done(){await page.waitForFunction(()=>window.__progress?.dismissed,{timeout:10000});}

  await reset();await click();
  check('excluded-count warning appears before Steam subscription choices',await page.evaluate(()=>__dialogs.length===1&&__dialogs[0].body.includes('1 mod is')&&__dialogs[0].body.includes('3 mods remain')));
  check('warning explains that Add Only preserves existing excluded subscriptions',await page.evaluate(()=>__dialogs[0].body.includes('including any excluded mods you already have')));
  check('opening the warning sends no subscription requests',writes.length===0);
  await reset();await click();await choose(0,'OK');
  check('Continue opens Steam add-versus-overwrite choices',await page.evaluate(()=>__dialogs[1].title==='Subscribe to all'));
  check('waiting for native confirmation still sends no writes',writes.length===0);
  await choose(1,'OK');await done();
  check('Add Only submits only eligible individual mod IDs',writes.length===3&&writes.every(w=>w.path==='/sharedfiles/subscribe'&&ids.slice(1).includes(w.id)));
  check('filtered subscriptions never call the whole-collection endpoint',writes.every(w=>!w.path.includes('collection'))&&await page.evaluate(()=>__bulk===0));
  check('dependency expansion is disabled like native single-mod subscription',writes.every(w=>w.include_dependencies==='false'));
  check('Add Only neither reads nor removes existing subscriptions',reads.length===0&&!writes.some(w=>w.path.endsWith('/unsubscribe')));

  await reset();await page.evaluate(id=>document.getElementById('SubscribeItemBtn'+id).classList.add('toggled'),ids[1]);
  await click();await choose(0,'OK');await choose(1,'OK');await done();
  check('already subscribed eligible mods are not toggled off or added again',writes.length===2&&writes.every(w=>w.id!==ids[1]));

  await reset();fixture=[ids[1],ids[0],'7777777777'];
  await page.evaluate(id=>document.getElementById('SubscribeItemBtn'+id).classList.add('toggled'),ids[1]);
  await click();await choose(0,'OK');await choose(1,'SECONDARY');
  check('Overwrite retains Steam second confirmation before any reads or writes',await page.evaluate(()=>__dialogs[2].title==='Overwrite My Subscriptions')&&writes.length===0&&reads.length===0);
  await choose(2,'OK');await done();
  check('Overwrite verifies every subscription page before changing anything',reads.length===2);
  check('Overwrite adds eligible mods and excludes blocked IDs from subscription POSTs',writes.filter(w=>w.path.endsWith('/subscribe')).every(w=>ids.slice(1).includes(w.id)));
  const removals=writes.filter(w=>w.path.endsWith('/unsubscribe')).map(w=>w.id);
  check('Overwrite removes existing excluded and outside-collection mods',removals.length===2&&removals.includes(ids[0])&&removals.includes('7777777777'));
  check('eligible subscriptions are added before removals begin',writes.findIndex(w=>w.path.endsWith('/unsubscribe'))===2);

  await reset();badList=true;await click();await choose(0,'OK');await choose(1,'SECONDARY');await choose(2,'OK');await done();
  check('unrecognized subscription list fails before any mutation',writes.length===0&&await page.evaluate(()=>__alerts.at(-1).body.includes('Nothing has been removed')));

  await reset();failId=ids[2];await click();await choose(0,'OK');await choose(1,'SECONDARY');await choose(2,'OK');await done();
  check('failed eligible addition stops replacement without any unsubscriptions',writes.length===1&&writes[0].path.endsWith('/subscribe')&&await page.evaluate(()=>__alerts.at(-1).title==='Subscription update stopped'));

  await reset();await click();await choose(0,'OK');await filters([]);await choose(1,'OK');
  check('filters changing during confirmation invalidate the snapshot',writes.length===0&&await page.evaluate(()=>__alerts.at(-1).title==='Filters changed'));
  await reset();await filters([{kind:'keyword',value:'no-match-on-page',label:'no-match-on-page',state:1}]);await click();
  check('all-excluded collection cannot trigger a destructive overwrite',writes.length===0&&await page.evaluate(()=>__alerts.at(-1).title==='No matching mods'&&__dialogs.length===0));

  await reset();await filters([]);await click();await choose(0,'OK');
  check('unfiltered collection retains the original native bulk flow',await page.evaluate(()=>__bulk===1&&__dialogs[0].title==='Subscribe to all'));
  check('every simulated write was intercepted; no account subscriptions changed',writes.length===0);
  console.log(checks+' collection subscription checks passed.');
 }catch(e){if(page)await page.screenshot({path:'tests/out/collection-subscriptions-failure.png'});throw e}
 finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
