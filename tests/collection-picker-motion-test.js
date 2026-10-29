const assert=require('assert/strict');
const {launch,closeBrowser,wait,installFrameSampler}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name)}
(async()=>{const browser=await launch(process.argv.includes('--firefox')?'firefox':undefined);try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'load'});await page.waitForSelector('.wshs-sf-input');
 await page.$eval('.subscribeCollection',e=>e.scrollIntoView());await page.hover('.collectionItem .workshopItemAuthorName a');await wait(650);
 const aligned=()=>page.evaluate(()=>{const a=document.querySelector('.collectionItem .workshopItemAuthorName a').getBoundingClientRect(),p=document.querySelector('.wshs-picker').getBoundingClientRect();return Math.abs(p.top+p.height/2-a.top-a.height/2)<.3});
 check('resting controls remain flush with creator text',await aligned());
 await page.evaluate(()=>scrollBy(0,25));await wait(100);check('scrolling wakes resting controls',await aligned());
 await page.hover('.collectionItem .workshopItemAuthorName a');await wait(650);
 await installFrameSampler(page);const maxError=await page.evaluate(async()=>{
  const row=document.querySelector('.collectionItem'),a=row.querySelector('.workshopItemAuthorName a'),p=document.querySelector('.wshs-picker');
  row.style.transition='transform 650ms linear';row.style.transform='translateY(-5px)';let max=0;
  await new Promise(resolve=>{const end=performance.now()+800;function sample(){const x=a.getBoundingClientRect(),y=p.getBoundingClientRect();max=Math.max(max,Math.abs(x.top+x.height/2-y.top-y.height/2));if(performance.now()<end)__wshsAfterFrame(sample);else resolve();}__wshsAfterFrame(sample)});
  row.style.removeProperty('transition');row.style.removeProperty('transform');return max;
 });await wait(100);console.log('Maximum transition offset: '+maxError.toFixed(3)+'px');check('long transitions keep controls attached',maxError<.5);
 await page.setViewport({width:1024,height:1000});await wait(150);check('resizing wakes and realigns controls',await aligned());
 await page.hover('.collectionItem .workshopItemAuthorName a');await wait(650);
 await page.$eval('.collectionItem',e=>e.classList.add('wshs-ratings-filtered'));await wait(100);
 check('filtering the target dismisses resting controls',await page.$eval('.wshs-picker',e=>getComputedStyle(e).display==='none'));
 check('no page errors',errors.length===0);console.log(checks+' collection picker motion checks passed.');
}finally{await closeBrowser(browser)}})().catch(e=>{console.error(e);process.exitCode=1});
