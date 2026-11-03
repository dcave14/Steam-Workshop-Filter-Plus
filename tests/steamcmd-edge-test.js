// SteamCMD edge cases on offline fixtures (no Steam load or rate limits):
// pointer and keyboard paths, required-mod graphs, failures, placement,
// collections, the .bat, and the settings toggle.
const assert=require('assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const F=require('./steamcmd-fixtures');
let checks=0;function check(name,value,detail){if(!value&&detail!==undefined)console.log(JSON.stringify(detail));assert.ok(value,name);checks++;console.log('PASS '+name);}

const T='Atmosphere & <Weather> 100% ^|"';
const cards=[
 {id:'990200001',title:T},{id:'990200002',title:'No requirements'},{id:'990200003',title:'Rate limited'},{id:'990200004',title:'Cycle A'},
 {id:'990200007',title:'Slow requirements'},{id:'990200009',title:'Requires itself'},{id:'990200010',title:'Filler one'},{id:'990200011',title:'Filler two'}
];
// Required-item graph served to workshop-dependencies.js.
const deps={
 '990200001':['990209001'],'990209001':['990209002'],'990209002':[],
 '990200002':[],'990200003':'429once',
 '990200004':['990200005'],'990200005':['990200004','990200006'],'990200006':[],
 '990200007':{delay:1500,ids:['990200008']},'990200008':[],
 '990200009':['990200009'],'990200010':[],'990200011':[],
 '990400001':['990409001'],'990409001':[]
};
const COLL='3521297585',BIG='3521297586',LATE='3521297587';
const collIds=Array.from({length:12},(_,i)=>String(990500001+i));
const bigIds=Array.from({length:250},(_,i)=>String(990600001+i));

const served429=new Set();
function route(r){
 const u=new URL(r.url());const id=u.searchParams.get('id');
 if(r.isNavigationRequest()){
  if(u.pathname.startsWith('/workshop/browse'))return F.browse(cards);
  if(id===COLL)return F.collection(COLL,collIds,{titles:collIds.map((_,i)=>i%4===0?'Excluded skin pack '+i:'Collection mod '+i)});
  if(id===BIG)return F.collection(BIG,bigIds);
  if(id===LATE)return F.collection(LATE,collIds,{delayControls:1500});
  if(id==='990400001')return F.item('990400001','Item & page',['990409001']);
  if(id==='990400002')return F.item('990400002','Own item',[],{noSubscribe:true});
  return F.item(id||'0','Unknown',[]);
 }
 if(u.pathname.startsWith('/sharedfiles/filedetails')&&id){
  const d=deps[id];
  if(d==='429once'&&!served429.has(id)){served429.add(id);return {status:429,body:"<html><body>You've made too many requests recently.</body></html>"};}
  if(d&&d.delay)return {delay:d.delay,body:F.item(id,'Mod '+id,d.ids)};
  return {body:F.item(id,'Mod '+id,Array.isArray(d)?d:[])};
 }
 return {body:''};
}

async function open(b,url,viewport={width:1400,height:1000}){
 const p=await b.newPage();await p.setViewport(viewport);await p.setRequestInterception(true);
 p.on('request',r=>{const out=route(r);if(typeof out==='string')return r.respond({status:200,contentType:'text/html',body:out});
  const send=()=>r.respond({status:out.status||200,contentType:'text/html',body:out.body}).catch(()=>{});out.delay?setTimeout(send,out.delay):send();});
 p.errors=[];p.on('pageerror',e=>p.errors.push(String(e)));
 await p.goto(url,{waitUntil:'domcontentloaded'});await wait(600);return p;
}
const cardSel=i=>`.grid > .card:nth-child(${i+1})`;
const state=p=>p.evaluate(()=>{const pop=document.querySelector('.wshs-steamcmd-pop'),q=s=>pop&&pop.querySelector(s);
 return {open:!!pop&&!pop.hidden,code:q('.wshs-steamcmd-code')?.textContent||'',deps:q('.wshs-steamcmd-deps-line')?.hidden?null:q('.wshs-steamcmd-deps span')?.textContent,
  depsDisabled:q('.wshs-steamcmd-deps input')?.disabled,summary:q('.wshs-steamcmd-summary')?.hidden?'':q('.wshs-steamcmd-summary')?.textContent,
  error:q('.wshs-steamcmd-error')?.hidden?'':q('.wshs-steamcmd-error')?.textContent,copy:q('.wshs-steamcmd-primary')?.textContent,copyDisabled:q('.wshs-steamcmd-primary')?.disabled,
  rect:pop&&pop.getBoundingClientRect().toJSON(),buttons:document.querySelectorAll('.wshs-steamcmd-card').length,
  tip:(()=>{const t=document.querySelector('.wshs-steamcmd-tip');return !!t&&getComputedStyle(t).display!=='none';})()};});
const buttonCard=p=>p.evaluate(()=>{const b=document.querySelector('.wshs-steamcmd-card');return b?[...document.querySelectorAll('.grid > .card')].findIndex(c=>c.contains(b)):-1;});
async function openCard(p,i){await p.hover(cardSel(i));await p.waitForFunction(i=>document.querySelector('.grid > .card:nth-child('+(i+1)+') .wshs-steamcmd-card'),{},i);await p.click('.wshs-steamcmd-card');await p.waitForSelector('.wshs-steamcmd-pop:not([hidden])');}
async function settle(p,until){await p.waitForFunction(re=>!new RegExp(re).test(document.querySelector('.wshs-steamcmd-deps span')?.textContent||''),{timeout:8000},until||'Checking');}
async function closePop(p){await p.mouse.click(5,990);await p.waitForFunction(()=>document.querySelector('.wshs-steamcmd-pop').hidden);}
async function popupPage(b){const t=b.targets().find(t=>t.url().startsWith('chrome-extension://'));const pp=await b.newPage();await pp.goto('chrome-extension://'+new URL(t.url()).hostname+'/popup.html');await pp.waitForFunction(()=>!document.querySelector('#steamcmd-buttons').disabled);return pp;}

(async()=>{
 const downloads=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-steamcmd-edge-'));
 // Off by default: nothing is added until the setting is turned on.
 // WSHS_SOURCE_OVERLAY: a folder of older source files, to prove a check catches a regression.
 const b=await launch(undefined,{sourceOverlay:process.env.WSHS_SOURCE_OVERLAY});
 try{
  await b.defaultBrowserContext().overridePermissions('https://steamcommunity.com',['clipboard-read','clipboard-write','clipboard-sanitized-write']);
  let p=await open(b,'https://steamcommunity.com/workshop/browse/?appid='+F.APP);
  await p.hover(cardSel(0));await wait(400);
  check('Default off: no card button, popover or tooltip',await p.evaluate(()=>!document.querySelector('.wshs-steamcmd-card,.wshs-steamcmd-pop,.wshs-steamcmd-tip')));
  const popup=await popupPage(b);
  check('Default off: settings switch starts off',!(await popup.$eval('#steamcmd-buttons',n=>n.checked)));
  await popup.click('#steamcmd-buttons');await p.bringToFront();
  await p.hover(cardSel(1));await p.hover(cardSel(0));
  await p.waitForSelector(cardSel(0)+' .wshs-steamcmd-card',{timeout:5000});
  check('Turning on works without reload',true);

  // Fast sweep: one button, on the last card, and no tooltip from a passing pointer.
  for(let r=0;r<3;r++)for(let i=0;i<8;i++){const box=await (await p.$(cardSel(i))).boundingBox();await p.mouse.move(box.x+box.width-20,box.y+box.height-15,{steps:2});}
  await wait(60);let s=await state(p);
  check('Fast sweep: exactly one button, on the last hovered card',s.buttons===1&&await buttonCard(p)===7,{buttons:s.buttons,card:await buttonCard(p)});
  await wait(300);
  check('Fast sweep: tooltip never shows from a passing pointer',!(await state(p)).tip);
  await p.hover(cardSel(0));await p.hover(cardSel(0)+' .wshs-steamcmd-card');await wait(500);
  check('Dwell: tooltip shows after hovering the button',(await state(p)).tip);

  // Transitive requirements and the special title.
  await p.click('.wshs-steamcmd-card');await p.waitForSelector('.wshs-steamcmd-pop:not([hidden])');
  check('Opening the popover hides the tooltip',!(await state(p)).tip);
  await settle(p);s=await state(p);
  check('Required mods: chain A -> B -> C included once each',s.deps==='Include 2 required mods'&&['990200001','990209001','990209002'].every(id=>s.code.split(' '+id+' ').length===2||s.code.includes(' '+id+' +quit')),s);
  // Popover stays put while the pointer roams, scrolls and resizes.
  const r0=s.rect;
  for(let i=1;i<8;i++){await p.hover(cardSel(i));}
  await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await wait(100);s=await state(p);
  check('Open popover: hovering every other card leaves it on its card',s.open&&await buttonCard(p)===0&&Math.abs(s.rect.left-r0.left)<1&&Math.abs(s.rect.top-r0.top)<=5,{r0,r:s.rect,card:await buttonCard(p)});
  const gap0=await p.evaluate(()=>document.querySelector('.wshs-steamcmd-pop').getBoundingClientRect().top-document.querySelector('.wshs-steamcmd-card').getBoundingClientRect().top);
  await p.evaluate(()=>window.scrollBy(0,120));await wait(100);
  const gap1=await p.evaluate(()=>document.querySelector('.wshs-steamcmd-pop').getBoundingClientRect().top-document.querySelector('.wshs-steamcmd-card').getBoundingClientRect().top);
  check('Open popover: scrolling keeps it attached to its button',Math.abs(gap1-gap0)<=6,{gap0,gap1});
  await p.evaluate(()=>window.scrollTo(0,0));
  // Clicking the button again toggles it closed; outside click closes too.
  await p.hover(cardSel(0));await p.click('.wshs-steamcmd-card');
  check('Second click on the button closes the popover',!(await state(p)).open);
  await p.click('.wshs-steamcmd-card');await p.waitForSelector('.wshs-steamcmd-pop:not([hidden])');await closePop(p);
  check('Outside click closes the popover',!(await state(p)).open);
  // Rapid triple click ends open, with matching button state.
  await p.hover(cardSel(0));await p.click('.wshs-steamcmd-card',{count:1});await p.click('.wshs-steamcmd-card');await p.click('.wshs-steamcmd-card');await wait(100);
  s=await state(p);const openClass=await p.$eval('.wshs-steamcmd-card',n=>n.classList.contains('wshs-steamcmd-open')&&n.getAttribute('aria-expanded')==='true');
  check('Rapid clicks: popover and button agree',s.open===openClass&&s.open,{open:s.open,openClass});
  await closePop(p);

  // Each requirement case.
  await openCard(p,1);await settle(p);s=await state(p);
  check('No requirements: says so, checkbox disabled, command has the mod',s.deps==='No required mods'&&s.depsDisabled&&s.code.includes(' 990200002 +quit'),s);await closePop(p);
  await openCard(p,3);await settle(p);s=await state(p);
  check('Cycle A -> B -> A: finite, each mod once',s.deps==='Include 2 required mods'&&s.code.split('990200004').length===2&&s.code.split('990200005').length===2&&s.code.includes('990200006'),s);await closePop(p);
  await openCard(p,4);s=await state(p);const sawChecking=/Checking/.test(s.deps||'');await settle(p);s=await state(p);
  check('Slow lookup: shows Checking, then the result',sawChecking&&s.deps==='Include 1 required mod'&&s.code.includes('990200008'),s);await closePop(p);
  await openCard(p,5);await settle(p);s=await state(p);
  check('Mod listing itself as required: not duplicated',s.deps==='No required mods'&&s.code.split('990200009').length===2,s);await closePop(p);
  // Steam pauses all lookups for a minute after a rate limit; Retry asks again.
  await openCard(p,2);await settle(p);s=await state(p);
  check('Rate-limited lookup: reports it instead of waiting forever',s.deps==='Required mods could not be checked'&&!s.copyDisabled&&s.code.includes(' 990200003 +quit'),s);
  check('Rate-limited lookup: Retry is offered',await p.$eval('.wshs-steamcmd-retry',n=>!n.hidden&&getComputedStyle(n).display!=='none'));
  await p.click('.wshs-steamcmd-retry');await settle(p,'Checking|could not');s=await state(p);
  check('Retry after the limit clears: lookup succeeds',s.deps==='No required mods'&&await p.$eval('.wshs-steamcmd-retry',n=>n.hidden),s);await closePop(p);

  // Keyboard: focusing Quick View brings the button; Shift+Tab reaches it.
  await p.mouse.move(5,990);await p.focus(cardSel(6)+' .qv');await wait(100);
  await p.keyboard.down('Shift');await p.keyboard.press('Tab');await p.keyboard.up('Shift');
  check('Keyboard: focus reaches the SteamCMD button',await p.evaluate(()=>document.activeElement&&document.activeElement.classList.contains('wshs-steamcmd-card')&&!!document.activeElement.closest('.grid > .card:nth-child(7)')));
  await p.keyboard.press('Enter');await p.waitForSelector('.wshs-steamcmd-pop:not([hidden])');
  check('Keyboard: Enter opens the popover',(await state(p)).open);
  await p.keyboard.press('Escape');
  check('Keyboard: Escape closes and returns focus to the button',await p.evaluate(()=>document.querySelector('.wshs-steamcmd-pop').hidden&&document.activeElement.classList.contains('wshs-steamcmd-card')));

  // Steam replaces or hides the card under an open popover.
  await openCard(p,7);await p.evaluate(()=>{const c=document.querySelector('.grid > .card:nth-child(8)');const fresh=c.cloneNode(true);fresh.querySelectorAll('.wshs-steamcmd-card').forEach(n=>n.remove());c.replaceWith(fresh);});
  await p.hover(cardSel(6));await wait(100);
  check('Card replaced while open: popover closes on the next pointer move',!(await state(p)).open);
  await p.hover(cardSel(7));await wait(100);
  check('Replaced card: hovering it gets a working button',await buttonCard(p)===7&&(await state(p)).buttons===1);
  await openCard(p,6);await p.evaluate(()=>document.querySelector('.grid > .card:nth-child(7)').style.display='none');
  await p.hover(cardSel(5));await wait(100);
  check('Card hidden by a filter while open: popover closes',!(await state(p)).open);
  await p.evaluate(()=>document.querySelector('.grid > .card:nth-child(7)').style.display='');

  // Placement at the right edge and with no room above.
  await openCard(p,3);s=await state(p);
  check('Right-edge card: popover fits the viewport',s.rect.left>=8&&s.rect.right<=1392,s.rect);await closePop(p);
  await p.evaluate(()=>{const c=document.querySelector('.grid > .card:nth-child(1)');window.scrollTo(0,c.getBoundingClientRect().top+scrollY+c.offsetHeight-60);});await wait(150);
  await openCard(p,0);s=await state(p);const btnTop=await p.$eval('.wshs-steamcmd-card',n=>n.getBoundingClientRect().bottom);
  check('No room above: popover opens below the button',s.rect.top>=btnTop,{pop:s.rect,btnTop});await closePop(p);await p.evaluate(()=>window.scrollTo(0,0));

  // Copy and .bat for the special title.
  await openCard(p,0);await settle(p);await p.click('.wshs-steamcmd-primary');await wait(150);
  const clip=await p.evaluate(()=>navigator.clipboard.readText());
  check('Copy: clipboard has the full command',clip==='steamcmd +login anonymous +workshop_download_item 294100 990200001 +workshop_download_item 294100 990209001 +workshop_download_item 294100 990209002 +quit',clip);
  const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await p.click('.wshs-steamcmd-secondary');let bat='';const batFile=path.join(downloads,'steamcmd-294100-990200001.bat');for(let i=0;i<50&&!bat;i++){await wait(100);if(fs.existsSync(batFile))bat=fs.readFileSync(batFile,'utf8');}
  const rem=bat.split('\r\n')[1]||'';
  check('.bat: title cannot break out of the rem line',/^rem Atmosphere/.test(rem)&&!/[&<>%^|]/.test(rem)&&bat.split('\r\n').filter(l=>l.startsWith('steamcmd ')).length===1,bat);
  check('.bat: CRLF lines, cd to its folder, ends with pause',bat.includes('\r\ncd /d "%~dp0"\r\n')&&bat.endsWith('pause\r\n')&&!/[^\r]\n/.test(bat));
  await closePop(p);

  // Toggle off while open with the tooltip showing, then back on.
  await openCard(p,1);await p.hover(cardSel(1)+' .wshs-steamcmd-card');
  await popup.bringToFront();await popup.click('#steamcmd-buttons');await p.bringToFront();
  await p.waitForFunction(()=>!document.querySelector('.wshs-steamcmd-card'));s=await state(p);
  check('Turning off while open: button, popover and tooltip all go',!s.open&&!s.tip&&s.buttons===0);
  await p.hover(cardSel(2));await wait(200);
  check('Turned off: hovering adds nothing',(await state(p)).buttons===0);
  await popup.bringToFront();await popup.click('#steamcmd-buttons');await p.bringToFront();await p.hover(cardSel(3));
  await p.waitForSelector(cardSel(3)+' .wshs-steamcmd-card');
  check('Turned back on: button returns on hover',true);

  // Collections browse lists collections, not mods.
  const cp=await open(b,'https://steamcommunity.com/workshop/browse/?appid='+F.APP+'&section=collections');
  await cp.hover(cardSel(0));await wait(300);
  check('Collections browse: no card button',(await state(cp)).buttons===0);await cp.close();

  // Narrow window.
  const np=await open(b,'https://steamcommunity.com/workshop/browse/?appid='+F.APP,{width:420,height:800});
  await np.evaluate(()=>document.querySelector('.grid').style.gridTemplateColumns='repeat(1,242px)');
  await openCard(np,0);s=await state(np);
  check('Narrow window: popover fits within 8px margins',s.rect.left>=8&&s.rect.right<=412,s.rect);await np.close();
  check('Workshop: no page errors',!p.errors.length,p.errors);

  // Item pages.
  const ip=await open(b,'https://steamcommunity.com/sharedfiles/filedetails/?id=990400001');
  await ip.waitForSelector('.wshs-steamcmd-item');
  check('Item: button sits before Subscribe at its height',await ip.evaluate(()=>{const b=document.querySelector('.wshs-steamcmd-item'),s=document.getElementById('SubscribeItemBtn');const r=b.getBoundingClientRect(),q=s.getBoundingClientRect();return b.nextElementSibling===s&&Math.abs(r.height-q.height)<1&&Math.abs(r.top-q.top)<1&&r.right<=q.left;}));
  await ip.click('.wshs-steamcmd-item');await settle(ip);s=await state(ip);
  check('Item: required mod included',s.deps==='Include 1 required mod'&&s.code.includes('990409001'),s);
  await ip.evaluate(()=>document.querySelector('.wshs-steamcmd-item').scrollIntoView({block:'start'}));await wait(150);
  s=await state(ip);check('Item: popover stays in the viewport near the top',s.rect.top>=0,s.rect);
  const op=await open(b,'https://steamcommunity.com/sharedfiles/filedetails/?id=990400002');await wait(500);
  check('Item without Subscribe (own or removed): no button, no errors',!(await op.$('.wshs-steamcmd-item'))&&!op.errors.length,op.errors);
  await ip.close();await op.close();

  // Collections.
  let cl=await open(b,'https://steamcommunity.com/sharedfiles/filedetails/?id='+COLL);
  await cl.waitForSelector('.wshs-steamcmd-collection');await wait(800);
  check('Collection: one button in the native item controls',await cl.$$eval('.wshs-steamcmd-collection',n=>n.length===1&&!!n[0].closest('#ItemControls')));
  await cl.click('.wshs-steamcmd-collection');s=await state(cl);
  check('Collection: all mods, no required-mod option',s.summary==='All 12 mods'&&s.deps===null,s);
  await cl.click('.wshs-steamcmd-primary');await wait(150);let copied=await cl.evaluate(()=>navigator.clipboard.readText());
  check('Collection: copy lists every mod once, in order',copied.match(/\d{9}(?= )/g).filter(x=>x.startsWith('9905')).join()===collIds.join(),copied);
  // Rebuilt controls: the button returns once.
  await closePop(cl);await cl.evaluate(()=>{const c=document.getElementById('ItemControls');c.replaceWith(c.cloneNode(false));setTimeout(()=>{document.getElementById('ItemControls').innerHTML='<div class="workshopItemControlCtn"><span role="button" id="AddToCollectionBtn" class="general_btn share">Add to Collection</span></div>';},100);});
  await cl.waitForSelector('#ItemControls .wshs-steamcmd-collection',{timeout:3000});
  check('Collection controls rebuilt: button returns once',await cl.$$eval('.wshs-steamcmd-collection',n=>n.length===1));
  // Saved filter excludes some mods.
  await cl.evaluate(()=>window.scrollTo(0,0));
  const {addSavedFilter}=require('./browser-helpers');await addSavedFilter(cl,'keyword','skin');await wait(800);
  await cl.click('.wshs-steamcmd-collection');s=await state(cl);
  await cl.click('.wshs-steamcmd-primary');await wait(150);copied=await cl.evaluate(()=>navigator.clipboard.readText());
  const excluded=collIds.filter((_,i)=>i%4===0);
  check('Collection: saved filters leave excluded mods out',s.summary==='9 of 12 mods, after saved filters'&&excluded.every(id=>!copied.includes(id))&&collIds.filter(id=>!excluded.includes(id)).every(id=>copied.includes(id)),{s,copied});
  check('Collection: no page errors',!cl.errors.length,cl.errors);await cl.close();
  // 250 mods: split into commands of at most 100.
  cl=await open(b,'https://steamcommunity.com/sharedfiles/filedetails/?id='+BIG);await cl.waitForSelector('.wshs-steamcmd-collection');await wait(800);
  await cl.click('.wshs-steamcmd-collection');s=await state(cl);
  check('Big collection: offers 3 commands',s.copy==='Copy 3 commands',s);
  await cl.click('.wshs-steamcmd-primary');await wait(150);copied=await cl.evaluate(()=>navigator.clipboard.readText());const lines=copied.split(/\r?\n/); // Windows' clipboard stores CRLF
  check('Big collection: each command <= 100 mods, all 250 once, in order',lines.length===3&&lines.every(l=>l.startsWith('steamcmd +login anonymous ')&&l.endsWith(' +quit')&&l.split('+workshop_download_item').length-1<=100)&&copied.match(/9906\d{5}/g).join()===bigIds.join(),{lengths:lines.map(l=>l.length),count:(copied.match(/9906\d{5}/g)||[]).length,first:copied.slice(0,120),summary:s.summary});
  await cl.close();
  // Controls mounted after load.
  cl=await open(b,'https://steamcommunity.com/sharedfiles/filedetails/?id='+LATE);
  await cl.waitForSelector('#ItemControls .wshs-steamcmd-collection',{timeout:5000});
  check('Collection controls mounted after load: button still appears',true);await cl.close();
 }finally{await closeBrowser(b);fs.rmSync(downloads,{recursive:true,force:true});}
 console.log(checks+' SteamCMD edge checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
