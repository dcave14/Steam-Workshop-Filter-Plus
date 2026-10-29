const {selectAddKind}=require('./browser-helpers');
const assert=require('assert/strict');
const {launch,closeBrowser,addSavedFilter,wait}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
let checks=0;function check(name,ok){assert.ok(ok,name);checks++;console.log('PASS '+name);}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined);try{
 for(const collection of [false,true]){
  const p=await b.newPage();await p.setViewport({width:1280,height:900});await p.setRequestInterception(true);
  p.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:fixture(collection)}):r.respond({status:200,contentType:'text/html',body:'<div class="workshopItemTitle">Project Viewpoint</div><div id="RequiredItems"></div>'}));
  await p.goto(collection?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100');await p.waitForSelector('.wshs-sf-input');
  while(await p.$('.wshs-group-remove')){await p.click('.wshs-group-remove');await wait(60);}
  while(await p.$('.wshs-sf-delete')){await p.click('.wshs-sf-delete');await wait(60);}
  const prefix=(collection?'Collection':'Workshop')+': ';
  check(prefix+'all three types share one text input',await p.$$eval('.wshs-add-composer input',ns=>ns.length===1)&&await p.$$eval('[data-add-kind]',ns=>ns.length===3));
  await p.type('.wshs-sf-input','AI');await selectAddKind(p,'group');await p.type('.wshs-sf-input','My group');
  await selectAddKind(p,'keyword');check(prefix+'switching type preserves keyword draft',await p.$eval('.wshs-sf-input',n=>n.value==='AI'));
  await p.click('.wshs-sf-save');await wait(100);await selectAddKind(p,'group');
  check(prefix+'switching back preserves group draft',await p.$eval('.wshs-sf-input',n=>n.value==='My group'));
  await p.keyboard.press('Enter');await wait(100);
  await addSavedFilter(p,'group','MY GROUP');check(prefix+'duplicate group names show validation without adding another group',await p.$$eval('.wshs-filter-group',ns=>ns.length===1)&&await p.$eval('.wshs-sf-input',n=>!n.validity.valid));
  await selectAddKind(p,'dependency');await p.type('.wshs-sf-input','https://example.com/?id=3809306528');await p.click('.wshs-sf-save');
  check(prefix+'invalid dependency link is rejected',await p.$eval('.wshs-sf-input',n=>!n.validity.valid)&&await p.$$eval('.wshs-sf-row',ns=>ns.length===1));
  await p.$eval('.wshs-sf-input',n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});await addSavedFilter(p,'dependency','3809306528');
  check(prefix+'valid dependency works through the shared input',await p.$$eval('.wshs-sf-row',ns=>ns.length===2));
  await p.click('.wshs-group-select');await p.waitForSelector('.wshs-folder-menu:popover-open');
  check(prefix+'folder menu is centered, small and inside the viewport',await p.$eval('.wshs-folder-menu',n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n.firstElementChild);return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&s.textAlign==='center'&&s.fontSize==='11px';}));
  await p.screenshot({path:'tests/out/folder-menu-'+(firefox?'firefox-':'')+(collection?'collection':'workshop')+'.png'});
  await p.keyboard.press('End');await p.keyboard.press('Enter');await wait(150);
  check(prefix+'keyboard selection moves filter and returns focus to its folder button',await p.$$eval('.wshs-filter-group .wshs-sf-row',ns=>ns.length===1)&&await p.evaluate(()=>document.activeElement.classList.contains('wshs-group-select')));
  await p.keyboard.press('ArrowDown');await p.waitForSelector('.wshs-folder-menu:popover-open');await p.keyboard.press('Escape');await wait(100);
  check(prefix+'Escape closes folder menu and preserves keyboard focus',!await p.$('.wshs-folder-menu:popover-open')&&await p.evaluate(()=>document.activeElement.classList.contains('wshs-group-select')));
  await p.keyboard.press('ArrowDown');await p.waitForSelector('.wshs-folder-menu:popover-open');await p.mouse.click(5,5);await wait(100);
  check(prefix+'outside click dismisses the folder menu',!await p.$('.wshs-folder-menu')&&await p.$$eval('.wshs-group-select',ns=>ns.every(n=>n.getAttribute('aria-expanded')==='false')));
  check(prefix+'description checkbox sits below the complete composer',await p.$eval('.wshs-description-option',n=>n.getBoundingClientRect().top>=document.querySelector('.wshs-add-composer').getBoundingClientRect().bottom));
  await p.close();
 }
 console.log(checks+' '+(firefox?'Firefox':'Chrome')+' composer checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
