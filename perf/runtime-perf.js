// Bounded, sequential audit. No stress loops, CPU throttling, or heap snapshots.
// node perf/runtime-perf.js --tag before --runs 1 [--native] [--page collection]
const fs=require('fs'),path=require('path'),os=require('os');
const puppeteer=require('./node_modules/puppeteer-core');
const {closeBrowser,wait}=require('../tests/browser-helpers');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1]};
const tag=option('tag','audit').replace(/[^a-z0-9-]/gi,'');
const runs=Math.min(2,Math.max(1,Number(option('runs',1))||1));
const native=args.includes('--native');
const sourceBefore=args.includes('--source-before');
const scenarios={workshop:'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&days=7',collection:'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585'};
const only=option('page',null),output=path.join(root,'tests/out/performance');fs.mkdirSync(output,{recursive:true});
function extensionCopy(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-perf-')),m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 const files=new Set(['manifest.json',...Object.values(m.icons)]);
 for(const s of m.content_scripts)for(const f of [...(s.js||[]),...(s.css||[])])files.add(f);
 for(const f of files){
  const snapshot=path.join(root,'tests/out/performance/source-before',f);
  fs.copyFileSync(sourceBefore&&fs.existsSync(snapshot)?snapshot:path.join(root,f),path.join(dir,f));
 }return dir;
}
function delta(a,b){return{taskMs: +(1000*(b.TaskDuration-a.TaskDuration)).toFixed(2),scriptMs:+(1000*(b.ScriptDuration-a.ScriptDuration)).toFixed(2),layoutMs:+(1000*(b.LayoutDuration-a.LayoutDuration)).toFixed(2),styleMs:+(1000*(b.RecalcStyleDuration-a.RecalcStyleDuration)).toFixed(2),layouts:b.LayoutCount-a.LayoutCount,styleRecalcs:b.RecalcStyleCount-a.RecalcStyleCount,heapMB:+(b.JSHeapUsedSize/1048576).toFixed(1)}}
async function measure(name,url,run){
 if(os.freemem()<Math.min(os.totalmem()*.08,1024**3))throw Error('Low free memory; skipping browser audit.');
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,...(!native?{enableExtensions:[extensionCopy()]}:{})});
 try{
  try{os.setPriority(browser.process().pid,os.constants.priority.PRIORITY_BELOW_NORMAL)}catch(_){}
  const page=await browser.newPage();await page.setViewport({width:1600,height:1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests=[];page.on('request',r=>{if(/GetUGCSummary|GetPublishedFileDetails/.test(r.url()))requests.push(r.url().split('?')[0]);});
  await page.goto(url,{waitUntil:'load',timeout:60000});
  if(!native){await page.waitForSelector('.wshs-sf-input');if(name==='collection')await page.waitForFunction(()=>document.querySelector('.wshs-collection-sizes')?.getAttribute('aria-busy')==='false',{timeout:30000});}
  await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);await wait(700);
  if((await page.metrics()).JSHeapUsedSize>256*1048576)throw Error('Page heap exceeded audit budget; closing test browser.');
  const cdp=await page.createCDPSession();await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:10000});await cdp.send('Profiler.start');
  const first=await page.metrics();await wait(2500);const second=await page.metrics();
  const result={page:name,run,variant:native?'native':sourceBefore?'before':'extension',idle:delta(first,second),metadataRequests:requests.length,errors};
  if(result.idle.taskMs<1000){
   const selector=name==='collection'?'.collectionItem .workshopItemAuthorName a':'#CommunityTemplate a[href*="/myworkshopfiles"]';
   await page.hover(selector);await wait(350);const a=await page.metrics();await wait(1500);const b=await page.metrics();result.hover=delta(a,b);
   await page.mouse.move(0,0);await wait(400);
   if(!native){
    const a=await page.metrics();await page.$eval('[data-stars="5"]',e=>e.click());await wait(150);await page.$eval('[data-stars="0"]',e=>e.click());await wait(150);const b=await page.metrics();result.starToggle=delta(a,b);
   }
  }else result.skippedHover='Idle load exceeded budget; no further interactions.';
  const {profile}=await cdp.send('Profiler.stop');await cdp.send('Profiler.disable');await cdp.detach();
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();
  for(const id of profile.samples||[]){const n=nodes.get(id);if(n?.callFrame.url.startsWith('chrome-extension://')){const key=n.callFrame.url.split('/').pop()+':'+n.callFrame.functionName;counts.set(key,(counts.get(key)||0)+1);}}
  result.extensionSamples=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12);
  fs.writeFileSync(path.join(output,tag+'-'+name+'-'+run+'.cpuprofile'),JSON.stringify(profile));
  if(!native){await page.$eval(name==='collection'?'.wshs-collection-summary':'.wshs-injected-controls',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,tag+'-'+name+'.png')});}
  console.log(JSON.stringify(result));return result;
 }finally{await closeBrowser(browser);}
}
(async()=>{const results=[];for(let run=1;run<=runs;run++)for(const [name,url]of Object.entries(scenarios))if(!only||only===name)results.push(await measure(name,url,run));fs.writeFileSync(path.join(output,tag+'.json'),JSON.stringify({date:new Date().toISOString(),runs,results},null,2)+'\n');})().catch(e=>{console.error(e);process.exitCode=1});
