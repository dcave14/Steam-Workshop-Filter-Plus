const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
// Two solid GIF frames, red/blue, looping every 160ms. Served without CORS.
const gif=Buffer.from('R0lGODlhEAAQAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAEAAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAEQAAEALAAAAAAQABAAgQAA/wAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw==','base64');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{const firefox=process.argv.includes('--firefox');const b=await launch(firefox?'firefox':undefined,{presentationPreferences:{reduceMotion:true,freezeAnimatedPreviews:true,disableCardHover:false,pauseHomepageCarousels:false}});try{
 let popup;
 for(const mode of ['Workshop','Collection','Homepage']){
  const p=await b.newPage();await p.setViewport({width:1280,height:1000});await p.setRequestInterception(true);
  let html=fixture(mode==='Collection');
  if(mode!=='Collection')html=html.replace('aria-label="preview"></a>','aria-label="preview"><img id="animated-preview" style="width:100%;height:100%;object-fit:contain" src="https://images.steamusercontent.com/preview"></a>');
  else html=html.replace('class="workshopItemPreviewImage" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="','id="animated-preview" class="workshopItemPreviewImage" src="https://images.steamusercontent.com/preview"');
  p.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:html}):r.respond({status:200,contentType:'image/gif',body:gif}));
  await p.goto(mode==='Collection'?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':mode==='Homepage'?'https://steamcommunity.com/app/294100/workshop/':'https://steamcommunity.com/workshop/browse/?appid=294100');
  await p.waitForSelector('#animated-preview.wshs-frozen-preview');
  const img=await p.$('#animated-preview');const first=Buffer.from(await img.screenshot());await wait(350);const second=Buffer.from(await img.screenshot());
  check(mode+': cross-origin GIF displays a stable still',first.equals(second));
  check(mode+': canvas aligns with image and preserves its link',await p.$eval('#animated-preview',n=>{const c=n.parentElement.querySelector('canvas'),a=n.getBoundingClientRect(),b=c.getBoundingClientRect();return ['left','top','width','height'].every(k=>Math.abs(a[k]-b[k])<1)&&getComputedStyle(c).pointerEvents==='none'&&!!n.closest('a[href*="filedetails"]')&&c.getAttribute('aria-hidden')==='true';}));
  await p.$eval('#animated-preview',n=>{n.src+='?replacement';n.style.width='80px';});await wait(200);
  check(mode+': source changes and resize refresh the still without duplicates',await p.$eval('#animated-preview',n=>n.parentElement.querySelectorAll('canvas').length===1&&Math.abs(n.getBoundingClientRect().width-n.parentElement.querySelector('canvas').getBoundingClientRect().width)<1));
  if(!firefox){
   if(!popup){const target=b.targets().find(t=>t.url().startsWith('chrome-extension://'));popup=await b.newPage();await popup.goto('chrome-extension://'+new URL(target.url()).hostname+'/popup.html');await popup.waitForFunction(()=>!document.querySelector('#reduce-motion').disabled);}
   await popup.bringToFront();await popup.click('#freeze-animated-previews');await p.bringToFront();await p.waitForFunction(()=>!document.querySelector('.wshs-still-preview'));
   const frames=[];for(let i=0;i<5;i++){frames.push(Buffer.from(await img.screenshot()));await wait(110);}
   check(mode+': turning GIF option off restores real animation',frames.some(x=>!x.equals(frames[0])));
   await popup.bringToFront();await popup.click('#freeze-animated-previews');await p.bringToFront();await p.waitForSelector('#animated-preview.wshs-frozen-preview');
   await popup.bringToFront();await popup.click('#reduce-motion');await p.bringToFront();await p.waitForFunction(()=>!document.querySelector('.wshs-still-preview'));
   check(mode+': master off restores images and retains GIF choice',await popup.$eval('#freeze-animated-previews',n=>n.checked)&&await p.$eval('#animated-preview',n=>getComputedStyle(n).opacity==='1'));
   await popup.bringToFront();await popup.click('#reduce-motion');await p.bringToFront();await p.waitForSelector('#animated-preview.wshs-frozen-preview');
  }
  await p.$eval('#animated-preview',n=>n.remove());await wait(100);
  check(mode+': removing a preview cleans up its canvas',await p.$$eval('.wshs-still-preview',ns=>ns.every(c=>c.parentElement.querySelector('img.wshs-frozen-preview'))));
  await p.close();
 }
 console.log(checks+' preview motion checks passed.');
}finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1});
