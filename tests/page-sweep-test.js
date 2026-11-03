// Live: every Workshop page type the manifest matches, with and without the
// extension. Pages the extension does not enhance must look exactly native,
// on a fresh load and after Steam's in-page navigation from Browse.
// Usage: node tests/page-sweep-test.js [--steamcmd]
const assert=require('assert/strict');
const puppeteer=require('../perf/node_modules/puppeteer-core');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const APP='294100',BROWSE='https://steamcommunity.com/workshop/browse/?appid='+APP+'&browsesort=trend&section=readytouseitems';
// Pages that must stay untouched by the toolbar, sidebar and card tools.
const NATIVE={
 discussions:'https://steamcommunity.com/workshop/discussions/?appid='+APP,
 about:'https://steamcommunity.com/workshop/about/?appid='+APP,
 home:'https://steamcommunity.com/app/'+APP+'/workshop/',
 itemComments:'https://steamcommunity.com/sharedfiles/filedetails/comments/2023507013',
 itemChangelog:'https://steamcommunity.com/sharedfiles/filedetails/changelog/2023507013'
};
let checks=0;function check(name,value,detail){if(!value&&detail)console.log(detail);assert.ok(value,name);checks++;console.log('PASS '+name);}
async function visit(p,url){const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});if(r&&r.status()===429)throw Error('Steam rate limit (429) on '+url+'. Wait a few minutes and rerun.');await wait(3500);}
// Our own nodes, classes, attributes and custom properties anywhere on the page.
function footprint(){
 // Readiness signals on <html> are invisible; the snapshot diff covers any styling they cause.
 const nodes=[...document.querySelectorAll('*')].filter(n=>[...n.classList].some(c=>c.startsWith('wshs-')||c==='hide-subscribed-button'||c==='star-filter-button')||n!==document.documentElement&&[...n.attributes].some(a=>a.name.startsWith('data-wshs'))||/--wshs/.test(n.getAttribute('style')||''));
 return nodes.slice(0,8).map(n=>n.tagName+'.'+n.className+' '+(n.getAttribute('style')||'').slice(0,60));
}
// Geometry and key styles of visible native controls in the top of the page.
function snapshot(){
 const out=[];for(const n of document.querySelectorAll('a,button,[role="button"],input,h1,h2')){
  const r=n.getBoundingClientRect();if(!r.width||r.top>1100||n.closest('[class*="wshs-"]'))continue;const c=getComputedStyle(n);
  out.push([n.tagName,(n.textContent||n.value||'').trim().slice(0,24),Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height),c.fontSize,c.paddingLeft,c.boxShadow==='none'?'':'shadow',n.getAttribute('style')||''].join('|'));
 }return out;
}
function diff(a,b){const sb=new Set(b),sa=new Set(a);return {missing:a.filter(x=>!sb.has(x)).slice(0,6),extra:b.filter(x=>!sa.has(x)).slice(0,6)};}
(async()=>{
 const steamcmd=process.argv.includes('--steamcmd');
 const plain=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:30000});
 // WSHS_SOURCE_OVERLAY: a folder of older source files, to prove a check catches a regression.
 const b=await launch(undefined,{sourceOverlay:process.env.WSHS_SOURCE_OVERLAY,...(steamcmd?{presentationPreferences:{steamcmdButtons:true}}:{})});
 try{
  const native={};const np=await plain.newPage();await np.setViewport({width:1280,height:900});
  for(const [name,url] of Object.entries(NATIVE)){await visit(np,url);native[name]=await np.evaluate(snapshot);}
  const p=await b.newPage();await p.setViewport({width:1280,height:900});
  for(const [name,url] of Object.entries(NATIVE)){
   await visit(p,url);
   const left=await p.evaluate(footprint);
   check(name+': fresh load has no extension UI, classes or styles',!left.length,JSON.stringify(left));
   const d=diff(native[name],await p.evaluate(snapshot));
   check(name+': native controls match the page without the extension',!d.missing.length&&!d.extra.length,JSON.stringify(d,null,1));
  }
  // Steam's client-side navigation keeps content scripts alive between routes.
  await visit(p,BROWSE);await p.waitForSelector('.wshs-injected-controls',{timeout:30000});await wait(1500);
  const nav=async href=>{const h=await p.evaluateHandle(h=>[...document.querySelectorAll('a')].find(a=>a.href.endsWith(h)&&a.getClientRects().length),href);assert.ok(h.asElement(),'nav link '+href);await h.asElement().click();await wait(3500);};
  await nav('/workshop/about/?appid='+APP);
  check('Browse -> About in-page: toolbar and sort styling removed',!(await p.evaluate(footprint)).length,JSON.stringify(await p.evaluate(footprint)));
  const d=diff(native.about,await p.evaluate(snapshot));
  check('Browse -> About in-page: native controls match a fresh About',!d.missing.length&&!d.extra.length,JSON.stringify(d,null,1));
  await p.goBack({waitUntil:'domcontentloaded'});await wait(3500);
  if(/\/workshop\/browse/.test(p.url())){
   await p.waitForSelector('.wshs-injected-controls',{timeout:20000});
   check('About -> back to Browse: one toolbar returns',await p.$$eval('.wshs-injected-controls',n=>n.length===1)&&await p.$$eval('.hide-subscribed-button',n=>n.length>=3));
  }
  console.log(checks+' page sweep checks passed.');
 }finally{await closeBrowser(b);await plain.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
