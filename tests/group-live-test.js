// Real Steam results and the shared dependency service, with inspection unused.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait}=require('./browser-helpers');
const snapshot=`(()=>{const cards=WSHSDom.enumerateCards();return{review:document.documentElement.classList.contains('wshs-reviewing'),cards:cards.map(c=>{const title=[...c.root.querySelectorAll('a[href*="filedetails"]')].find(a=>a.textContent.trim())?.textContent||'';const required=WSHSDependencies.get(c.id);return{id:c.id,unknown:required===null,expected:/(^|[^a-z0-9])viewpoint([^a-z0-9]|$)/i.test(title)||(required||[]).includes('3809306528'),visible:c.root.getBoundingClientRect().width>0};})};})()`;
(async()=>{const b=await launch(undefined,{useConfiguredService:true});try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});
 await p.goto('https://steamcommunity.com/workshop/browse/?appid=108600&browsesort=trend',{waitUntil:'load'});await p.waitForSelector('.wshs-sf-input');
 const w=await extensionWorld(p);
 await w(`chrome.storage.local.set({'savedFilters:108600':[{kind:'keyword',value:'Viewpoint',label:'Viewpoint',state:-1,groupId:'live'},{kind:'dependency',value:'3809306528',label:'Project Viewpoint',state:-1,groupId:'live'}],'savedFilterGroups:108600':[{id:'live',name:'Viewpoint group',enabled:true,collapsed:true}]})`);
 async function verify(label){
  await p.waitForSelector('.wshs-group-toggle');let result;
  for(let i=0;i<100;i++){result=await w(snapshot);if(result.cards.length&&!result.cards.some(c=>c.unknown)&&result.cards.every(c=>c.visible!==c.expected))break;await wait(200);}
  assert.ok(result.cards.length>0,label+' contains cards');assert.equal(result.review,false,label+' never enters inspection');
  assert.ok(result.cards.every(c=>!c.unknown&&c.visible!==c.expected),label+' renders exactly the allowed mods');
  console.log('PASS '+label+': '+result.cards.filter(c=>c.expected).length+' excluded / '+result.cards.length+' loaded');return result;
 }
 const initial=await verify('Enabled collapsed group');assert.ok(initial.cards.some(c=>c.expected),'first page exercises an actual exclusion');
 await p.reload({waitUntil:'load'});await verify('Saved group after reload');
 await p.select('.wshs-page-size','75');await p.waitForFunction(()=>document.querySelector('.wshs-page-size').value==='75');await wait(400);const large=await verify('75 results with saved group');assert.equal(large.cards.length,75);
 await p.$eval('.wshs-page-size',select=>{const scope=select.parentElement.parentElement;const button=[...scope.querySelectorAll('[role="button"],button,a,[data-panel]')].find(e=>e.textContent.trim()==='2');if(!button)throw Error('Page 2 button missing');button.click();});
 await p.waitForFunction(()=>new URL(location.href).searchParams.get('p')==='2');await wait(400);await verify('Native page two');
 await w("chrome.storage.local.set({layoutDensity:'compact',sidebarPosition:'right'})");await p.waitForSelector('.wshs-compact-grid');await verify('Compact with right sidebar');
 await w('WSHSDom.getSortButton().button.click()');
 await p.evaluate(()=>{const option=[...document.querySelectorAll('[role=radiogroup] [role=radio]')].find(n=>!n.closest('.wshs-injected-controls')&&n.textContent.trim()==='Most Recent');if(!option)throw Error('Most Recent sort option missing');option.click();});
 await p.waitForFunction(()=>new URL(location.href).searchParams.get('browsesort')==='mostrecent');await wait(400);await verify('Native sorting refresh');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
