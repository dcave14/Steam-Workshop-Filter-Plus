const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const os=require('os'),puppeteer=require('../perf/node_modules/puppeteer-core');
const {launch,closeBrowser,openBrowse,extensionWorld,wait,BASE_URL,clickTitleWord,setWordMode}=require('./browser-helpers');
const FIREFOX=process.argv.includes('--firefox');
function steamCsp(message){return /Content-Security-Policy/.test(message)&&/WebAssembly/.test(message)&&/steamcommunity\.com\/_ssr\/modules\//.test(message)&&/wasm-unsafe-eval/.test(message);}
async function firefox(extension){
 return puppeteer.launch({browser:'firefox',executablePath:'C:/Program Files/Mozilla Firefox/firefox.exe',headless:true,protocolTimeout:30000,...(extension?{enableExtensions:[extension]}:{})});
}
function firefoxExtension(){
 const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/firefox/manifest.json')));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-qv-firefox-'));
 const files=new Set([...Object.values(manifest.icons)]);
 for(const s of manifest.content_scripts)for(const f of [...(s.js||[]),...(s.css||[])])files.add(f);
 for(const f of files)fs.copyFileSync(path.join(root,f),path.join(dir,f));
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));return dir;
}
let checks=0;
function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 let baselineCsp=false;
 if(FIREFOX){const baseline=await firefox();try{const p=await baseline.newPage();p.on('pageerror',e=>{if(steamCsp(e.message))baselineCsp=true});await p.goto(BASE_URL,{waitUntil:'load',timeout:60000});await wait(300);}finally{await closeBrowser(baseline)}}
 const browser=FIREFOX?await firefox(firefoxExtension()):await launch();let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1600,height:1000});
  const errors=[];page.on('pageerror',e=>{if(!(baselineCsp&&steamCsp(e.message)))errors.push(e.message)});
  await openBrowse(page);const world=!FIREFOX&&await extensionWorld(page);
  const cardCount=()=>FIREFOX?page.$$eval('.wshs-card-author',els=>els.length):world('WSHSDom.enumerateCards().length');
  const baseline=await cardCount();
  async function open(){
   await page.evaluate(()=>document.querySelector('#CommunityTemplate .SVGIcon_MagnifyingGlass').closest('[role=button]').click());
   await page.waitForSelector('dialog[open] .wshs-qv-title');
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>{const img=document.querySelector('dialog[open] img');return img&&img.complete&&img.naturalWidth>0});
   await wait(300);
  }
  async function close(){await page.evaluate(()=>document.querySelector('dialog[open] .SVGIcon_X').closest('[role=button]').click());await wait(350);}
  async function rows(){return page.$$eval('.wshs-sf-list>*',els=>els.length);}
  await open();
  check('Quick View prepares its main title for optional word clicks',!!await page.$('dialog[open] .wshs-qv-title'));
  check('Quick View dependencies remain excluded from browse cards',await cardCount()===baseline&&await page.$$eval('dialog[open] .wshs-card-author',els=>els.length)===0);
  const authors=await page.$$eval('dialog[open] a[href*="/myworkshopfiles"]',as=>as.map(a=>({name:a.textContent,href:a.getAttribute('href')})));
  check('Quick View exposes creators',authors.length>0);
  check('multiple creators wrap within the dialog column',await page.evaluate(()=>{
   const row=document.querySelector('dialog[open] .wshs-qv-creators'),r=row.getBoundingClientRect();
   return row.scrollWidth<=row.clientWidth+1&&[...row.querySelectorAll('a')].every(a=>{const b=a.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;});
  }));
  check('creator names have no empty control gaps at rest',await page.$$eval('dialog[open] .wshs-qv-creators a',as=>as.every(a=>parseFloat(getComputedStyle(a.parentElement).paddingRight)===0)));
  async function hoverAuthor(index=0){await page.mouse.move(5,5);await wait(350);const as=await page.$$('dialog[open] a[href*="/myworkshopfiles"]');await as[index].hover();await wait(150);}
  const beforeHover=await page.$eval('dialog[open] .wshs-qv-creators',e=>e.parentElement.nextElementSibling.getBoundingClientRect().top);
  await hoverAuthor(authors.length-1);
  check('creator hover does not shift the dialog content',Math.abs(await page.$eval('dialog[open] .wshs-qv-creators',e=>e.parentElement.nextElementSibling.getBoundingClientRect().top)-beforeHover)<.5);
  check('only the hovered creator reserves inline control space',await page.$$eval('dialog[open] .wshs-qv-creators a',as=>as.filter(a=>parseFloat(getComputedStyle(a.parentElement).paddingRight)>0).length===1));
  check('last creator remains filterable without clipping',await page.evaluate(()=>{
   const p=document.querySelector('dialog[open] .wshs-picker'),r=p.getBoundingClientRect();return document.elementFromPoint(r.left+7,r.top+7)?.closest('.wshs-picker')===p;
  }));
  await hoverAuthor();
  check('Quick View author hover shows + minus and help in the top layer',await page.evaluate(()=>{
   const p=document.querySelector('dialog[open] .wshs-picker');if(!p||p.querySelectorAll('.wshs-sq').length!==2)return false;
   const r=p.getBoundingClientRect();return document.elementFromPoint(r.left+7,r.top+7)?.closest('.wshs-picker')===p;
  }));
  check('author picker leaves other creator links clear',await page.evaluate(()=>{
   const p=document.querySelector('dialog[open] .wshs-picker').getBoundingClientRect();
   return [...document.querySelectorAll('dialog[open] a[href*="/myworkshopfiles"]')].every(a=>{const r=a.getBoundingClientRect();return p.right<=r.left||p.left>=r.right||p.bottom<=r.top||p.top>=r.bottom;});
  }));
  await page.click('dialog[open] .wshs-picker-help');
  check('Quick View help is centered and explains the compact toggle',await page.evaluate(()=>{
   const g=document.querySelector('dialog[open] .wshs-picker-guide');return !!g&&getComputedStyle(g).textAlign==='center'&&g.textContent.includes('☑ Enables clickable title words');
  }));
  await page.screenshot({path:path.join(__dirname,'out/quick-view-filter-author.png')});
  await page.click('dialog[open] .wshs-picker-help');
  await page.click('dialog[open] .wshs-picker [data-action="hide"]');await wait(300);
  check('Quick View hide waits before saving',await rows()===0);
  check('Quick View confirmation stays clickable inside the dialog',await page.evaluate(()=>{
   const p=document.querySelector('dialog[open] .wshs-picker'),r=p.getBoundingClientRect();return p.textContent==='Hiding… click to undo'&&document.elementFromPoint(r.left+7,r.top+7)?.closest('.wshs-picker')===p;
  }));
  await page.click('dialog[open] .wshs-picker-hint');await wait(2700);
  check('Quick View undo cancels the pending filter',await rows()===0);
  await hoverAuthor(authors.length>1?1:0);
  await page.click('dialog[open] .wshs-picker [data-action="only"]');await wait(2900);
  check('Quick View plus saves the chosen individual creator',await page.$eval('.wshs-sf-label',(e,name)=>e.textContent==='By '+name,authors[authors.length>1?1:0].name));
  check('show only a co-creator keeps the current mod in the grid',await page.evaluate(()=>{
   const title=document.querySelector('dialog[open] .wshs-qv-title');
   return [...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].some(a=>!a.closest('dialog')&&a.getAttribute('href')===title.getAttribute('href')&&a.offsetParent!==null);
  }));
  await close();
  check('closing Quick View removes its floating picker',await page.evaluate(()=>![...document.querySelectorAll('.wshs-picker')].some(p=>getComputedStyle(p).display!=='none'&&p.getBoundingClientRect().width>0)));
  await page.click('.wshs-sf-delete');await wait(200);
  await open();
  const primary=await page.$eval('#CommunityTemplate .wshs-card-author a',a=>({name:a.textContent.trim().replace(/^By\s+/,''),href:a.getAttribute('href')}));
  const primaryIndex=await page.$$eval('dialog[open] a[href*="/myworkshopfiles"]',(as,name)=>as.findIndex(a=>a.textContent.trim()===name),primary.name);
  check('Quick View identifies the grid primary creator',primaryIndex>=0);
  await hoverAuthor(primaryIndex);
  await page.click('dialog[open] .wshs-picker [data-action="hide"]');await wait(2900);
  if(await page.$('dialog[open]'))await close();
  await page.reload({waitUntil:'load',timeout:60000});await page.waitForSelector('.wshs-sf-list>*');await wait(300);
  check('primary creator filters survive reload despite vanity/profile link differences',await page.evaluate(href=>{
   const as=[...document.querySelectorAll('#CommunityTemplate .wshs-card-author a')].filter(a=>a.getAttribute('href')===href);return as.length>0&&as.every(a=>a.offsetParent===null);
  },primary.href));
  await page.click('.wshs-sf-delete');await wait(300);
  await open();
  await setWordMode(page,true,true);
  check('Quick View compact checkbox enables the shared word mode',await page.evaluate(()=>document.documentElement.classList.contains('wshs-title-selection')));
  check('compact word toggle sits immediately after minus',await page.$eval('dialog[open] .wshs-picker-word-toggle',e=>e.previousElementSibling.dataset.action==='hide'&&e.nextElementSibling.classList.contains('wshs-picker-help')));
  const url=page.url();
  const chosen=await clickTitleWord(page,'dialog[open] .wshs-qv-title');
  check('Quick View title word click does not navigate or require selection',page.url()===url&&await page.evaluate(word=>getSelection().toString()===''&&document.querySelector('dialog[open] .wshs-picker').dataset.word===word,chosen.word));
  check('Quick View title word shows clickable filter controls',await page.evaluate(()=>{
   const p=document.querySelector('dialog[open] .wshs-picker');if(!p||p.querySelectorAll('.wshs-sq').length!==2)return false;
   const r=p.getBoundingClientRect();return document.elementFromPoint(r.left+7,r.top+7)?.closest('.wshs-picker')===p;
  }));
  check('only one word is underlined, not the whole Quick View title',await page.evaluate(word=>{
   const h=CSS.highlights.get('wshs-selected-word'),a=document.querySelector('dialog[open] .wshs-qv-title');
   return h&&h.size===1&&[...h][0].toString()===word&&getComputedStyle(a).textDecorationLine==='none'&&getComputedStyle(a,'::highlight(wshs-selected-word)').color==='rgb(230, 196, 81)';
  },chosen.word));
  await hoverAuthor();
  check('hovering a creator does not replace pinned word controls',await page.evaluate(word=>document.querySelector('dialog[open] .wshs-picker').dataset.word===word,chosen.word));
  const nextWord=await clickTitleWord(page,'dialog[open] .wshs-qv-title',1);
  check('clicking a different word retargets the Quick View picker',nextWord.word!==chosen.word&&await page.evaluate(word=>document.querySelector('dialog[open] .wshs-picker').dataset.word===word,nextWord.word));
  for(const selector of ['.wshs-picker-help','.wshs-sq[data-action="only"]','.wshs-picker-help']){
   await page.hover('dialog[open] '+selector);await wait(80);
   check('question icon stays centered during hover '+selector,await page.evaluate(()=>{
    const p=document.querySelector('dialog[open] .wshs-picker'),a=p.querySelector('.wshs-sq svg').getBoundingClientRect(),b=p.querySelector('.wshs-picker-help svg').getBoundingClientRect();return Math.abs(a.top+a.height/2-b.top-b.height/2)<.25;
   }));
  }
  await setWordMode(page,false,true);
  check('untoggling restores the title and removes pinned controls',await page.evaluate(()=>{
   const a=document.querySelector('dialog[open] .wshs-qv-title'),p=document.querySelector('dialog[open] .wshs-picker');return !document.documentElement.classList.contains('wshs-title-selection')&&!CSS.highlights.has('wshs-selected-word')&&!CSS.highlights.has('wshs-hover-word')&&getComputedStyle(p).display==='none';
  }));
  await setWordMode(page,true,true);await clickTitleWord(page,'dialog[open] .wshs-qv-title',1);
  await page.screenshot({path:path.join(__dirname,'out/quick-view-filter-title.png')});
  await page.click('dialog[open] .wshs-picker [data-action="hide"]');await wait(2900);
  check('Quick View title phrase is saved in the sidebar',await rows()===1&&await page.$eval('.wshs-sf-label',e=>!e.textContent.startsWith('By ')));
  check('Quick View keyword uses title-only Steam requests',await page.evaluate(()=>!!document.documentElement.getAttribute('data-wshs-requested-terms')));
  if(await page.$('dialog[open]'))await close();
  await page.click('.wshs-sf-delete');await wait(1000);
  await open();await hoverAuthor();
  await page.click('dialog[open] .wshs-picker [data-action="hide"]');await close();await wait(2700);
  check('closing during confirmation saves the intended creator without leaving an overlay',await rows()===1&&await page.$eval('.wshs-sf-label',e=>e.textContent.startsWith('By '))&&await page.evaluate(()=>![...document.querySelectorAll('.wshs-picker')].some(p=>getComputedStyle(p).display!=='none'&&p.getBoundingClientRect().width>0)));
  await page.click('.wshs-sf-delete');await wait(300);await open();await hoverAuthor();
  // Native next-item navigation reuses the dialog: old controls must not follow it.
  // A synthetic click leaves the cursor on a creator and can legitimately
  // open fresh controls for a different creator under that same position.
  await page.mouse.move(5,5);
  const oldHref=await page.$eval('dialog[open] .wshs-qv-title',e=>e.href);
  const next=await page.evaluate(()=>{const d=document.querySelector('dialog[open]'),buttons=[...d.children[1].children].filter(e=>e.tagName==='BUTTON');const n=buttons.at(-1);if(n&&!n.disabled){n.click();return true}return false});
  if(next){await page.waitForFunction(href=>{const title=document.querySelector('dialog[open] .wshs-qv-title');return title&&title.href!==href},{timeout:15000},oldHref);await wait(100);check('Quick View item navigation dismisses stale picker',await page.evaluate(()=>{const p=document.querySelector('dialog[open] .wshs-picker');return !p||getComputedStyle(p).display==='none'}));}
  check('no extension or hydration page errors',errors.length===0);
  console.log(checks+' Quick View filter checks passed.');
 }catch(error){if(page)await page.screenshot({path:path.join(__dirname,'out/quick-view-filter-failure.png')});throw error}
 finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
