// Live Steam acceptance: native browse/pagination and the actual extension popup.
const assert=require('assert/strict');
const path=require('path');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const firefox=process.argv.includes('--firefox');
 const browser=await launch(firefox?'firefox':'C:/Program Files/Google/Chrome/Application/chrome.exe');
 try{
  const page=await browser.newPage();await page.setViewport({width:1600,height:1050});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const start='https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=toprated';
  await page.goto(start,{waitUntil:'load',timeout:45000});await page.waitForSelector('.wshs-page-size',{timeout:30000});
  const ids=()=>page.$$eval('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]',as=>[...new Set(as.map(a=>new URL(a.href).searchParams.get('id')))]);
  const count=async n=>page.waitForFunction(n=>new Set([...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].map(a=>new URL(a.href).searchParams.get('id'))).size===n,{timeout:30000},n);
  check('dropdown offers 75 and 100 alongside native sizes',await page.$$eval('.wshs-page-size option',es=>es.map(e=>e.value).join(',')==='10,15,30,50,75,100'));
  if(!firefox){
   const target=browser.targets().find(t=>t.url().startsWith('chrome-extension://'));
   const origin='chrome-extension://'+new URL(target.url()).hostname;const popup=await browser.newPage();await popup.goto(origin+'/popup.html');
   await popup.waitForFunction(()=>!document.querySelector('#pinned-sidebar').disabled);
   check('popup contains independent sidebar, Workshop bar and collection pinning plus placement',await popup.$eval('body',b=>['pinned-sidebar','pinned-workshop-bar','pinned-collections','position-left','position-right'].every(id=>!!b.querySelector('#'+id))&&b.textContent.includes('Sidebar position')));
   await popup.screenshot({path:path.join(__dirname,'out','sidebar-popup.png'),clip:{x:0,y:0,width:330,height:280}});
   await popup.click('label[for="position-right"]');await page.bringToFront();await page.waitForFunction(()=>document.querySelector('.wshs-saved-filters')?.getBoundingClientRect().left>innerWidth/2);
   check('popup right placement moves the native sidebar',await page.$eval('.wshs-saved-filters',s=>s.getBoundingClientRect().left>innerWidth/2));
   await popup.bringToFront();await popup.click('label[for="pinned-sidebar"]');await page.bringToFront();await page.waitForSelector('.wshs-sidebar-pane');
   await page.evaluate(()=>scrollTo(0,1200));await wait(150);
   check('pinned sidebar keeps search and filters aligned',await page.$eval('.wshs-sidebar-pane',pane=>{const p=pane.getBoundingClientRect(),s=document.querySelector('.wshs-search-fixed')?.getBoundingClientRect();return !!s&&Math.abs(s.top-12)<2&&Math.abs(s.left-p.left)<2&&p.top>=s.bottom&&p.bottom<=innerHeight;}));
   check('sidebar scroll reaches its last filter',await page.$eval('.wshs-sidebar-pane',pane=>{pane.scrollTop=pane.scrollHeight;return pane.lastElementChild.getBoundingClientRect().bottom<=pane.getBoundingClientRect().bottom+1;}));
   await page.screenshot({path:path.join(__dirname,'out','sidebar-right-pinned.png')});
   await popup.bringToFront();await popup.click('label[for="position-left"]');await page.bringToFront();await page.waitForFunction(()=>document.querySelector('.wshs-sidebar-pane')?.getBoundingClientRect().left<innerWidth/2);
   check('placement updates immediately while pinned',await page.$eval('.wshs-sidebar-pane',s=>s.getBoundingClientRect().left<innerWidth/2));
   await page.setViewport({width:800,height:900});await wait(200);
   check('narrow layout releases pinned search',!await page.$('.wshs-search-fixed'));
   await page.setViewport({width:1600,height:1050});await wait(200);
   await popup.bringToFront();await popup.reload();await popup.waitForFunction(()=>!document.querySelector('#pinned-sidebar').disabled);
   check('popup preferences survive reopening',await popup.$eval('#pinned-sidebar',e=>e.checked)&&await popup.$eval('#position-left',e=>e.checked));
   await popup.click('label[for="pinned-sidebar"]');await page.bringToFront();await wait(150);
   check('unpin restores native scrolling layout',!await page.$('.wshs-sidebar-pane')&&!await page.$('.wshs-search-fixed'));
   await popup.evaluate(()=>chrome.storage.local.set({pinnedSidebar:true,sidebarPosition:'right'}));
   const collection=await browser.newPage();await collection.setRequestInterception(true);
   collection.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:require('./filter-fixtures').fixture(true)}):r.abort());
   await collection.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');await collection.waitForSelector('.wshs-collection-filters');
   check('sidebar preferences leave collection layout and controls intact',!await collection.$('.wshs-sidebar-pane')&&!await collection.$('.wshs-page-size')&&!!await collection.$('.subscribeCollection'));
   await collection.close();await popup.evaluate(()=>chrome.storage.local.set({pinnedSidebar:false,sidebarPosition:'left'}));await page.bringToFront();
   await popup.close();
  }
  for(const size of [75,100]){
  await page.goto(start,{waitUntil:'load'});await page.waitForSelector('.wshs-page-size');
  await page.select('.wshs-page-size',String(size));await count(size);
  check(size+' selection renders that many real distinct mods',(await ids()).length===size);
  const first=await ids();
  await page.$eval('.wshs-page-size',select=>{const scope=select.parentElement.parentElement;const button=[...scope.querySelectorAll('[role="button"],button,a,[data-panel]')].find(e=>e.textContent.trim()==='2');if(!button)throw Error('Native page 2 button not found');button.click();});
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('p')==='2');await count(size);
  await page.waitForFunction(first=>{const link=document.querySelector('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]');return link&&new URL(link.href).searchParams.get('id')!==first;},{timeout:30000},first[0]);
  check(size+': native page two has no duplicate first-page mods',!(await ids()).some(id=>first.includes(id))&&new URL(page.url()).searchParams.get('num_per_page')===String(size));
  await page.reload({waitUntil:'load'});await page.waitForSelector('.wshs-page-size');await count(size);
  check(size+': reload keeps the requested page and size',new URL(page.url()).searchParams.get('p')==='2'&&await page.$eval('.wshs-page-size',(e,size)=>e.value===String(size),size));
  await page.select('.wshs-page-size','30');await count(30);
  check('returning to a native size resets to page one',new URL(page.url()).searchParams.get('p')==='1');
  await page.goBack();await count(size);check(size+': Back restores the requested page',new URL(page.url()).searchParams.get('p')==='2'&&new URL(page.url()).searchParams.get('num_per_page')===String(size));
  await page.goForward();await count(30);check('Forward restores the native page size',new URL(page.url()).searchParams.get('num_per_page')==='30');
  await page.select('.wshs-page-size',String(size));await count(size);
  const input=await page.$('form input[placeholder*="Search"]');
  if(input){await input.type('storage');await input.press('Enter');await page.waitForFunction(()=>new URL(location.href).searchParams.get('searchtext')==='storage');await count(size);check(size+': native search keeps the page size',new URL(page.url()).searchParams.get('num_per_page')===String(size));}
  await page.evaluate(()=>{const pane=document.querySelector('.wshs-saved-filters').parentElement;const row=[...pane.querySelectorAll('div')].find(e=>e.children.length===3&&e.children[0].matches('[role="button"]')&&e.children[2].textContent.trim()==='Mod');if(!row)throw Error('Native Mod category not found');row.children[0].click();});
  await page.waitForFunction(()=>new URL(location.href).searchParams.getAll('requiredtags[]').includes('Mod'));await count(size);
  check(size+': native categories keep the page size and search query',new URL(page.url()).searchParams.get('num_per_page')===String(size)&&new URL(page.url()).searchParams.get('searchtext')==='storage');
  }
  // Steam's own Firefox bundle attempts WebAssembly blocked by its CSP;
  // existing acceptance suites also distinguish that site-level baseline.
  const unexpected=errors.filter(e=>!(/WebAssembly/.test(e)&&/Content-Security-Policy/.test(e)));
  if(unexpected.length)console.log('Page errors:',unexpected);
  check('no hydration or uncaught extension errors',unexpected.length===0);
  console.log(checks+' '+(firefox?'Firefox':'Chrome')+' sidebar/page-size checks passed.');
 }finally{await closeBrowser(browser);}
})().catch(e=>{console.error(e);process.exitCode=1});
