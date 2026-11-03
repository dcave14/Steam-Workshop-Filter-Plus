// Live SteamCMD checks on all three surfaces: Workshop card hover button,
// item page (with a required mod) and a collection, plus the settings toggle.
const assert=require('assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const ITEM='2023507013',HARMONY='2009463077',COLLECTION=process.argv.find(a=>a.startsWith('--collection-id='))?.split('=')[1]||'3826899645';
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
async function popover(p){await p.waitForSelector('.wshs-steamcmd-pop:not([hidden])');return p.$eval('.wshs-steamcmd-pop',n=>({code:n.querySelector('.wshs-steamcmd-code').textContent,deps:n.querySelector('.wshs-steamcmd-deps-line').hidden?null:n.querySelector('.wshs-steamcmd-deps span').textContent,summary:n.querySelector('.wshs-steamcmd-summary').textContent,error:n.querySelector('.wshs-steamcmd-error').hidden?'':n.querySelector('.wshs-steamcmd-error').textContent,copy:n.querySelector('.wshs-steamcmd-copy').textContent,rect:n.getBoundingClientRect().toJSON()}));}
async function visit(p,url){const r=await p.goto(url,{waitUntil:'domcontentloaded'});if(r.status()===429)throw Error('Steam rate limit (429) on '+url+'. Wait a few minutes and rerun.');}
async function clipboard(p){return p.evaluate(()=>navigator.clipboard.readText());}
(async()=>{const b=await launch(undefined,{presentationPreferences:{steamcmdButtons:true}});
const downloads=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-steamcmd-'));
try{
 const ctx=b.defaultBrowserContext();await ctx.overridePermissions('https://steamcommunity.com',['clipboard-read','clipboard-write','clipboard-sanitized-write']);
 // Workshop browse card
 const p=await b.newPage();await p.setViewport({width:1400,height:1000});
 await visit(p,'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems');
 await p.waitForFunction(()=>document.documentElement.getAttribute('data-wshs-page-hydrated')==='1'&&document.querySelector('svg.SVGIcon_MagnifyingGlass'),{timeout:30000});
 const card=await p.evaluateHandle(()=>{const svg=document.querySelector('svg.SVGIcon_MagnifyingGlass');let n=svg;while(n&&!(n.querySelector&&n.querySelector('img')&&n.querySelector('a[href*="filedetails"]')))n=n.parentElement;return n;});
 const cardId=await card.evaluate(n=>/[?&]id=(\d+)/.exec(n.querySelector('a[href*="filedetails"]').href)[1]);
 await card.hover();await p.waitForSelector('.wshs-steamcmd-card');
 check('Card: one button joins the Quick View row, before Quick View',await p.evaluate(()=>{const b=document.querySelectorAll('.wshs-steamcmd-card');const next=b[0].nextElementSibling;return b.length===1&&!!next.querySelector('svg.SVGIcon_MagnifyingGlass');}));
 check('Card: frame, tile and glyph match Quick View, visible on hover',await p.evaluate(()=>{const b=document.querySelector('.wshs-steamcmd-card'),q=b.nextElementSibling;const same=(x,y,glyph)=>{const r=x.getBoundingClientRect(),s=y.getBoundingClientRect();return Math.abs(r.width-s.width)<(glyph?1:0.01)&&(glyph||Math.abs(r.height-s.height)<0.01&&Math.abs(r.top-s.top)<0.01);};return same(b,q)&&same(b.querySelector('svg'),q.querySelector('svg'))&&same(b.querySelector('path'),q.querySelector('svg path'),true)&&getComputedStyle(b.parentElement).opacity==='1';}));
 await p.hover('.wshs-steamcmd-card + * svg');await p.waitForFunction(()=>[...document.querySelectorAll('[popover]')].some(n=>/^Quick View$/.test(n.textContent.trim())&&getComputedStyle(n.firstElementChild).opacity==='1'),{timeout:5000});
 const steamTip=await p.evaluate(()=>{const t=[...document.querySelectorAll('[popover]')].find(n=>/^Quick View$/.test(n.textContent.trim())).firstElementChild.firstElementChild,c=getComputedStyle(t),b=t.getBoundingClientRect(),q=document.querySelector('.wshs-steamcmd-card').nextElementSibling.getBoundingClientRect();return {css:['font','color','background-image','padding','border-radius','box-shadow','text-shadow'].map(k=>c.getPropertyValue(k)).join('|'),gap:b.left-q.right,center:b.top+b.height/2-q.top-q.height/2,h:b.height};});
 await p.hover('.wshs-steamcmd-card');await p.waitForFunction(()=>getComputedStyle(document.querySelector('.wshs-steamcmd-tip')||document.body).opacity==='1'&&document.querySelector('.wshs-steamcmd-tip'),{timeout:5000});
 const ourTip=await p.evaluate(()=>{const t=document.querySelector('.wshs-steamcmd-tip'),c=getComputedStyle(t),b=t.getBoundingClientRect(),q=document.querySelector('.wshs-steamcmd-card').getBoundingClientRect();return {css:['font','color','background-image','padding','border-radius','box-shadow','text-shadow'].map(k=>c.getPropertyValue(k)).join('|'),gap:b.left-q.right,center:b.top+b.height/2-q.top-q.height/2,h:b.height,title:document.querySelector('.wshs-steamcmd-card').hasAttribute('title'),text:t.textContent};});
 const tipOk=ourTip.css===steamTip.css&&Math.abs(ourTip.gap-steamTip.gap)<1&&Math.abs(ourTip.center)<0.5&&Math.abs(steamTip.center)<2.5&&ourTip.h===steamTip.h&&!ourTip.title&&ourTip.text==='Download with SteamCMD';if(!tipOk)console.log(JSON.stringify({ourTip,steamTip}));
 check('Card: hover tooltip matches Steam Quick View tooltip',tipOk);
 await p.mouse.move(5,5);
 check('Card: tooltip hides when the pointer leaves',await p.$eval('.wshs-steamcmd-tip',n=>getComputedStyle(n).display==='none'));
 await card.hover();await p.hover('.wshs-steamcmd-card');
 // Steam mounts Additional Required Items inside the card actions row.
 const dialogSizes=await p.evaluate(()=>{const row=document.querySelector('.wshs-steamcmd-card').parentElement;const make=host=>{const d=document.createElement('dialog');d.innerHTML='<div><div><button style="padding:6px 14px">Subscribe to All</button><svg width="30" height="30"></svg></div></div>';host.appendChild(d);d.showModal();const b=d.querySelector('button').getBoundingClientRect(),s=d.querySelector('svg').getBoundingClientRect(),r=[b.width,b.height,s.width];d.close();d.remove();return r;};const inside=make(row),outside=make(document.body);return {inside,outside};});
 check('Card actions: a dialog inside the row keeps native button and icon sizes',dialogSizes.inside[0]>60&&dialogSizes.inside[1]!==24&&dialogSizes.inside[2]===30||console.log(JSON.stringify(dialogSizes)));
 const href=p.url();await p.click('.wshs-steamcmd-card');let pop=await popover(p);
 check('Card: click opens the popover without navigating',p.url()===href);
 await p.waitForFunction(()=>!/Checking/.test(document.querySelector('.wshs-steamcmd-deps span').textContent),{timeout:30000});pop=await popover(p);
 check('Card: command uses the page app ID and card item',pop.code.includes('+login anonymous +workshop_download_item 294100 '+cardId)&&pop.code.endsWith('+quit'));
 check('Card: required mods are resolved',/required mod|No required mods|could not be checked/.test(pop.deps));
 check('Card: popover fits the viewport',pop.rect.left>=0&&pop.rect.right<=1400&&pop.rect.top>=0);
 await p.click('.wshs-steamcmd-copy');await wait(200);
 check('Card: copy writes the command',(await clipboard(p)).startsWith('steamcmd +login anonymous +workshop_download_item 294100 '+cardId));
 const before=await p.$eval('.wshs-steamcmd-pop',n=>n.style.left+','+n.style.top);
 const away=await p.evaluateHandle(()=>{const icons=document.querySelectorAll('svg.SVGIcon_MagnifyingGlass');let n=icons[2];while(n&&!(n.querySelector&&n.querySelector('img')&&n.querySelector('a[href*="filedetails"]')))n=n.parentElement;return n;});
 await away.hover();await wait(150);await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await wait(100);
 const stay={onCard:await card.evaluate(n=>n.contains(document.querySelector('.wshs-steamcmd-card'))),pop:await p.$eval('.wshs-steamcmd-pop',n=>(n.hidden?'hidden ':'')+n.style.left+','+n.style.top),before};
 // The card itself drops 5px when its hover lift ends; only horizontal moves mean another card.
 check('Card: open popover stays on its card while hovering others',stay.onCard&&!stay.pop.startsWith('hidden')&&stay.pop.split(',')[0]===before.split(',')[0]&&Math.abs(parseFloat(stay.pop.split(',')[1])-parseFloat(before.split(',')[1]))<=5||console.log(JSON.stringify(stay)));
 await card.hover();await p.hover('.wshs-steamcmd-card');
 await p.keyboard.press('Escape');
 check('Card: Escape closes and returns focus',await p.evaluate(()=>document.querySelector('.wshs-steamcmd-pop').hidden&&document.activeElement===document.querySelector('.wshs-steamcmd-card')));
 const other=await p.evaluateHandle(()=>{const icons=document.querySelectorAll('svg.SVGIcon_MagnifyingGlass');let n=icons[1];while(n&&!(n.querySelector&&n.querySelector('img')&&n.querySelector('a[href*="filedetails"]')))n=n.parentElement;return n;});
 await other.hover();await wait(150);
 check('Card: the single button moves to the hovered card',await other.evaluate(n=>n.contains(document.querySelector('.wshs-steamcmd-card'))&&document.querySelectorAll('.wshs-steamcmd-card').length===1));
 // Item page with a required mod
 await visit(p,'https://steamcommunity.com/sharedfiles/filedetails/?id='+ITEM);
 await p.waitForSelector('.wshs-steamcmd-item');
 check('Item: button sits beside Subscribe at the same height',await p.evaluate(()=>{const b=document.querySelector('.wshs-steamcmd-item'),s=document.getElementById('SubscribeItemBtn');const r=b.getBoundingClientRect(),q=s.getBoundingClientRect();return b.nextElementSibling===s&&Math.abs(r.height-q.height)<1&&Math.abs(r.top-q.top)<1&&r.right<=q.left;}));
 await p.click('.wshs-steamcmd-item');await p.waitForFunction(()=>/Include 1 required mod/.test(document.querySelector('.wshs-steamcmd-deps span')?.textContent||''),{timeout:30000});pop=await popover(p);
 check('Item: Harmony is included as a required mod',pop.code.includes('294100 '+ITEM)&&pop.code.includes('294100 '+HARMONY));
 await p.click('.wshs-steamcmd-deps input');pop=await popover(p);
 check('Item: unchecking required mods drops Harmony',!pop.code.includes(HARMONY));
 await p.click('.wshs-steamcmd-deps input');
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await p.click('.wshs-steamcmd-secondary');let bat='';for(let i=0;i<50&&!bat;i++){await wait(100);const f=path.join(downloads,'steamcmd-294100-'+ITEM+'.bat');if(fs.existsSync(f))bat=fs.readFileSync(f,'utf8');}
 check('Item: .bat holds the same command with CRLF lines',bat.startsWith('@echo off\r\n')&&bat.includes('steamcmd +login anonymous +workshop_download_item 294100 '+ITEM+' +workshop_download_item 294100 '+HARMONY+' +quit\r\npause'));
 await p.mouse.click(5,5);
 check('Item: clicking outside closes the popover',await p.$eval('.wshs-steamcmd-pop',n=>n.hidden));
 // Collection
 await visit(p,'https://steamcommunity.com/sharedfiles/filedetails/?id='+COLLECTION);
 await p.waitForSelector('.wshs-steamcmd-collection');
 check('Collection: button joins the native item controls',await p.evaluate(()=>!!document.querySelector('#ItemControls .wshs-steamcmd-ctn > .general_btn.wshs-steamcmd-collection')&&document.querySelectorAll('.wshs-steamcmd-collection').length===1));
 await wait(1500);await p.click('.wshs-steamcmd-collection');pop=await popover(p);
 const rows=await p.$$eval('.collectionItem .collectionItemDetails > a',as=>[...new Set(as.map(a=>/[?&]id=(\d+)/.exec(a.href)[1]))]);
 check('Collection: command covers the collection, no required-mod option',pop.deps===null&&!pop.error&&pop.summary.includes(String(rows.length))&&pop.code.includes('294100 '+rows[0]));
 await p.click('.wshs-steamcmd-copy');await wait(200);const copied=await clipboard(p);
 check('Collection: copied commands list every mod once',rows.every(id=>copied.includes(' '+id+' ')||copied.includes(' '+id+'\n'))&&copied.split('+workshop_download_item').length-1===rows.length);
 // Ferny's Progression Modpack links its Content and Cosmetics parts, which link back.
 await visit(p,'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');
 await p.waitForSelector('.wshs-steamcmd-collection',{timeout:30000});await wait(2500);await p.click('.wshs-steamcmd-collection');
 await p.waitForFunction(()=>!/Checking linked/.test(document.querySelector('.wshs-steamcmd-linked-line span')?.textContent||'Checking linked'),{timeout:90000});
 const ferny=await p.evaluate(()=>({text:document.querySelector('.wshs-steamcmd-linked-line span').textContent,own:document.querySelectorAll('.collectionItem').length}));
 const fernyExtra=Number((/\(\+(\d+) mods/.exec(ferny.text)||[])[1]);
 check('Ferny: both linked parts found and read',/^Include 2 linked collections \(\+\d+ mods/.test(ferny.text)&&fernyExtra>100,ferny);
 await p.click('.wshs-steamcmd-copy');await wait(300);const fernyIds=(await clipboard(p)).match(/(?<=294100 )\d+/g)||[];
 check('Ferny: one list of every mod across the three parts, no repeats',fernyIds.length===new Set(fernyIds).size&&fernyIds.length>=ferny.own+fernyExtra-5&&fernyIds.length<=2500,{count:fernyIds.length,own:ferny.own,extra:fernyExtra});
 await p.keyboard.press('Escape');
 // Settings toggle
 const target=b.targets().find(t=>t.url().startsWith('chrome-extension://'));const popup=await b.newPage();
 await popup.goto('chrome-extension://'+new URL(target.url()).hostname+'/popup.html');await popup.waitForFunction(()=>!document.querySelector('#steamcmd-buttons').disabled);
 check('Settings: toggle shows the stored choice',await popup.$eval('#steamcmd-buttons',n=>n.checked));
 await popup.click('#steamcmd-buttons');await p.bringToFront();await p.waitForFunction(()=>!document.querySelector('.wshs-steamcmd-collection')&&document.querySelector('.wshs-steamcmd-pop').hidden);
 check('Settings: turning off removes buttons and closes the popover',true);
 await popup.bringToFront();await popup.click('#steamcmd-buttons');await p.bringToFront();await p.waitForSelector('.wshs-steamcmd-collection');
 check('Settings: turning on restores the button without reload',true);
 console.log(checks+' SteamCMD checks passed.');
}finally{await closeBrowser(b);fs.rmSync(downloads,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
