// Real popup/storage and production content scripts; no Steam account writes.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait,addSavedFilter}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name)}
function collectionFixture(){return fixture(true).replace('<body>','<body><div class="collectionTop"><div class="collectionHeader"><div class="workshopItemTitle">Toggle test collection</div></div></div>').replace('<a class="general_btn">Save</a>','<a class="general_btn" onclick="window.nativeSaveCalls++">Save</a>').replace('</body>','<script>window.nativeSaveCalls=0</script></body>')}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:{collectionOverhaul:false}}:{});try{
 const p=await b.newPage();await p.setViewport({width:1600,height:1000});const errors=[];let collectionLoads=0;p.on('pageerror',e=>errors.push(e.message));await p.setRequestInterception(true);
 p.on('request',r=>{if(r.isNavigationRequest()){collectionLoads++;return r.respond({status:200,contentType:'text/html',body:collectionFixture()})}return r.abort()});
 await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');await p.waitForSelector('.wshs-sf-input');
 if(firefox){await wait(100);check('Firefox saved off preference keeps native collection layout',!await p.$('.wshs-design-collection')&&await p.$eval('.collectionTop',n=>!n.hidden));check('Firefox native rows retain extension filters',await p.$$eval('.collectionItem',ns=>ns.length===8)&&!!await p.$('.ratings-filter-button'));}
 else{
  await p.waitForSelector('.wshs-design-collection');check('overhaul defaults on for existing and new installs',true);
  await addSavedFilter(p,'keyword','AI');await p.waitForFunction(()=>document.querySelectorAll('.collectionItem.wshs-filtered').length===3);
  const target=b.targets().find(t=>t.url().startsWith('chrome-extension://')),popup=await b.newPage();await popup.goto('chrome-extension://'+new URL(target.url()).hostname+'/popup.html');await popup.waitForFunction(()=>!document.querySelector('#collection-overhaul').disabled);
  check('settings toggle defaults checked',await popup.$eval('#collection-overhaul',n=>n.checked));
  const other=[];
  for(const suffix of ['','&section=collections']){const page=await b.newPage();let loads=0;await page.setRequestInterception(true);page.on('request',r=>{if(r.isNavigationRequest()){loads++;return r.respond({status:200,contentType:'text/html',body:fixture(false)})}return r.abort()});await page.goto('https://steamcommunity.com/workshop/browse/?appid=294100'+suffix);await page.waitForSelector('.wshs-sf-input');other.push({page,loads:()=>loads});}
  async function toggle(){await popup.bringToFront();await Promise.all([p.waitForNavigation({waitUntil:'load'}),popup.click('label[for="collection-overhaul"]')]);await p.bringToFront();await p.waitForSelector('.wshs-sf-input');}
  await toggle();check('turning off restores native layout after reload',!await p.$('.wshs-design-collection')&&await p.$eval('.collectionTop',n=>!n.hidden)&&await p.$eval('html',n=>!n.classList.contains('wshs-collection-design')));
  await p.waitForFunction(()=>document.querySelectorAll('.collectionItem.wshs-filtered').length===3);check('saved exclusions still apply in native layout',true);
  await p.$eval('.subscribeCollection>.general_btn:last-of-type',n=>n.click());check('native account controls keep their handlers',await p.evaluate(()=>nativeSaveCalls===1));
  await p.reload({waitUntil:'load'});await p.waitForSelector('.wshs-sf-input');check('off preference persists across reload',!await p.$('.wshs-design-collection'));
  await popup.reload();await popup.waitForFunction(()=>!document.querySelector('#collection-overhaul').disabled);check('popup remembers off preference',await popup.$eval('#collection-overhaul',n=>!n.checked));
  await toggle();await p.waitForSelector('.wshs-design-collection');await p.waitForFunction(()=>document.querySelectorAll('.collectionItem.wshs-filtered').length===3);check('turning on restores overhaul and keeps saved exclusions',true);
  check('Workshop and Collections browse do not reload or acquire detail layout',await Promise.all(other.map(async o=>o.loads()===1&&!await o.page.$('.wshs-design-collection'))).then(values=>values.every(Boolean)));
  const w=await extensionWorld(p),before=collectionLoads;await w("chrome.storage.local.set({collectionOverhaul:true})");await wait(100);check('writing the same setting does not reload collection pages',collectionLoads===before&&!!await p.$('.wshs-design-collection'));
 }
 check('no page errors',errors.length===0);console.log(checks+' collection overhaul toggle checks passed.');
 }finally{await closeBrowser(b)}})().catch(e=>{console.error(e);process.exitCode=1});
