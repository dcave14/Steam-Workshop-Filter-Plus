// Live: the default mods-per-page setting. Applies on page one when the URL
// names no size; an explicit URL size, a later page, or a size chosen on the
// page in this tab always wins. Usage: node tests/page-size-default-test.js [--firefox]
const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value,detail){if(!value&&detail!==undefined)console.log(JSON.stringify(detail));assert.ok(value,name);checks++;console.log('PASS '+name);}
const BASE='https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=toprated';
const distinct=()=>new Set([...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].map(a=>new URL(a.href).searchParams.get('id'))).size;
async function visit(p,url){const r=await p.goto(url,{waitUntil:'load',timeout:60000});if(r&&r.status()===429)throw Error('Steam rate limit (429) on '+url+'. Wait a few minutes and rerun.');await p.waitForSelector('.wshs-page-size',{timeout:30000});}
async function settle(p,n){await p.waitForFunction(n=>new Set([...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].map(a=>new URL(a.href).searchParams.get('id'))).size===n,{timeout:30000},n).catch(()=>{});await wait(1500);return {mods:await p.evaluate(distinct),select:await p.$eval('.wshs-page-size',s=>s.value),url:p.url()};}
(async()=>{
 const firefox=process.argv.includes('--firefox');
 // The test launcher re-applies presets on every page load, so Chrome sets the
 // default through the real settings popup instead (Firefox cannot open it).
 const b=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:{defaultPageSize:75}}:{});
 try{
  let popup=null;
  if(!firefox){
   const t=await b.waitForTarget(t=>t.url().startsWith('chrome-extension://'),{timeout:15000});popup=await b.newPage();
   await popup.goto('chrome-extension://'+new URL(t.url()).hostname+'/popup.html');await popup.waitForFunction(()=>!document.querySelector('#default-page-size').disabled);
   check('Settings start at Steam (30)',await popup.$eval('#default-page-size',s=>s.value===''));
   await popup.select('#default-page-size','75');
  }
  let p=await b.newPage();await p.setViewport({width:1600,height:1050});const errors=[];p.on('pageerror',e=>{if(!/Content-Security-Policy/.test(e.message))errors.push(e.message);}); // Firefox reports Steam's own CSP notices as page errors
  await visit(p,BASE);let s=await settle(p,75);
  check('Default 75: a fresh browse page shows 75 mods and the dropdown says 75',s.mods===75&&s.select==='75',s);
  await visit(p,BASE+'&num_per_page=50');s=await settle(p,50);
  check('A size named in the URL wins over the default',s.mods===50&&s.select==='50',s);
  await visit(p,BASE+'&p=2');s=await settle(p,30);
  check('A later page keeps its size, so shared page links stay the same',s.mods===30&&new URL(s.url).searchParams.get('p')==='2',s);
  await visit(p,BASE);await settle(p,75);
  await p.select('.wshs-page-size','30');s=await settle(p,30);
  check('Choosing 30 on the page is not undone by the default',s.mods===30&&s.select==='30',s);
  await p.reload({waitUntil:'load'});await p.waitForSelector('.wshs-page-size');s=await settle(p,30);
  check('After choosing, reload keeps the chosen size in this tab',s.mods===30,s);
  await visit(p,BASE.replace('toprated','trend'));s=await settle(p,30);
  check('After choosing, another browse page in this tab keeps it too',s.mods===30,s);
  check('No page errors',!errors.length,errors);await p.close();
  // A new tab starts from the default again.
  p=await b.newPage();await p.setViewport({width:1600,height:1050});await visit(p,BASE);s=await settle(p,75);
  check('A new tab uses the default again',s.mods===75,s);await p.close();
  if(!firefox){
   await popup.reload();await popup.waitForFunction(()=>!document.querySelector('#default-page-size').disabled);
   check('Settings show the stored default',await popup.$eval('#default-page-size',s=>s.value==='75'&&[...s.options].map(o=>o.value).join()===',10,15,30,50,75,100'));
   p=await b.newPage();await p.setViewport({width:1600,height:1050});await visit(p,BASE);await settle(p,75);
   await popup.bringToFront();await popup.select('#default-page-size','100');await p.bringToFront();s=await settle(p,100);
   check('Changing the default applies to an open page where nothing was chosen',s.mods===100&&s.select==='100',s);
   await popup.bringToFront();await popup.reload();await popup.waitForFunction(()=>!document.querySelector('#default-page-size').disabled);
   check('Settings keep the new default after reopening',await popup.$eval('#default-page-size',s=>s.value==='100'));
   await popup.select('#default-page-size','');await p.close();
   check('Steam (30) removes the setting',(await popup.evaluate(()=>chrome.storage.local.get('defaultPageSize'))).defaultPageSize===undefined);
   p=await b.newPage();await p.setViewport({width:1600,height:1050});await visit(p,BASE);s=await settle(p,30);
   check('Without a default, Steam keeps its own 30',s.mods===30&&s.select==='30',s);await p.close();await popup.close();
  }
  console.log(checks+' default page size checks passed.');
 }finally{await closeBrowser(b);}
})().catch(e=>{console.error(e);process.exitCode=1});
