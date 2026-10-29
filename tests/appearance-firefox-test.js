// Firefox uses the real packaged content scripts; only local presentation
// preferences are seeded in its disposable test copy (BiDi blocks popup URLs).
const assert = require('assert/strict');
const {launch, closeBrowser, wait} = require('./browser-helpers');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS '+name); }
(async () => {
 const browser = await launch('firefox', {presentationPreferences: {layoutDensity:'compact', reduceMotion:true, disableCardHover:true, pauseHomepageCarousels:true}});
 try {
  const page = await browser.newPage(), errors=[];
  page.on('pageerror', e=>{
   // Steam emits this with no extension installed too; presentation settings
   // never run WebAssembly or alter CSP. Keep every other error actionable.
   if(e.message.startsWith('Content-Security-Policy:')&&e.message.includes('blocked WebAssembly (script-src)')&&e.message.includes('https://steamcommunity.com/_ssr/modules/'))return;
   errors.push(e.stack||e.message);
  });
  await page.setViewport({width:1780,height:1050});
  await page.goto('https://steamcommunity.com/workshop/browse/?appid=108600', {waitUntil:'load',timeout:45000});
  await page.waitForSelector('.wshs-compact-grid');await page.waitForSelector('.wshs-page-size');await wait(150);
  check('Firefox compact uses six columns', await page.$eval('.wshs-compact-grid', n=>getComputedStyle(n).gridTemplateColumns.split(' ').length===6));
  check('Firefox compact titles allow three lines', await page.$eval('.wshs-compact-title',n=>getComputedStyle(n).webkitLineClamp==='3'&&getComputedStyle(n).whiteSpace==='normal'));
  check('Firefox controls match individual card widths and edges', await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.wshs-compact-card')].map(n=>n.getBoundingClientRect());
   const controls=[...document.querySelectorAll('.hide-subscribed-button,.ratings-filter-button,.star-filter-button'),document.querySelector('div[role="button"][tabindex]:has(svg[viewBox="0 0 32 18"])')];
   return controls.length===4 && controls.every(n=>{if(!n)return false;const r=n.getBoundingClientRect();return cards.some(c=>Math.abs(c.left-r.left)<1&&Math.abs(c.width-r.width)<1&&Math.abs(c.right-r.right)<1);});
  }));
  check('Firefox disables selected hover transitions', await page.$eval('.wshs-no-hover-motion',n=>getComputedStyle(n).transitionDuration==='0s'));
  await page.setViewport({width:1100,height:1050});await wait(180);
  check('Firefox compact responds to narrow widths', await page.$eval('.wshs-compact-grid',n=>getComputedStyle(n).gridTemplateColumns.split(' ').length<6));
  await page.goto('https://steamcommunity.com/app/108600/workshop/',{waitUntil:'load'});await page.waitForSelector('.wshs-paused-carousel');
  const initial=await page.$eval('.wshs-paused-carousel',n=>n.scrollLeft);
  await page.$eval('.wshs-paused-carousel',n=>n.scrollLeft+=100);
  await page.waitForFunction(left=>Math.abs(document.querySelector('.wshs-paused-carousel').scrollLeft-left)<1,{},initial);
  check('Firefox prevents unattended homepage movement',true);
  await page.$eval('.wshs-paused-carousel',n=>{let scope=n.parentElement;for(let i=0;scope&&i<4;i++,scope=scope.parentElement){const buttons=[...scope.querySelectorAll('button,[role="button"]')].filter(b=>!n.contains(b)&&!b.textContent.trim()&&b.querySelector('svg'));if(buttons.length>=2){buttons.at(-1).click();return;}}throw Error('Carousel arrows missing');});
  await page.waitForFunction(left=>document.querySelector('.wshs-paused-carousel').scrollLeft>left+20,{},initial);
  check('Firefox manual carousel arrows still work',true);
  if(errors.length) console.error('Firefox appearance page errors:',errors);
  check('Firefox appearance has no page errors',errors.length===0);
  console.log(checks+' Firefox appearance checks passed.');
 } finally {await closeBrowser(browser);}
})().catch(e=>{console.error(e);process.exitCode=1});
