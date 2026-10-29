// Bounded real-page interaction profiling: idle, scrolling, hover and filters.
// No account actions, CPU throttling, stress loops or heap snapshots.
const fs=require('fs'),path=require('path');
const{launch,closeBrowser,extensionWorld,openBrowse,wait}=require('../tests/browser-helpers');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const tag=option('tag','audit').replace(/[^a-z0-9-]/gi,''),only=option('page',null),root=path.resolve(__dirname,'..'),out=path.join(root,'tests/out/performance');fs.mkdirSync(out,{recursive:true});
if(args.includes('--snapshot')){const target=path.join(out,tag+'-source');if(fs.existsSync(target))throw Error('Snapshot already exists');fs.mkdirSync(target);const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),files=new Set(['manifest.json',...m.content_scripts.flatMap(s=>[...(s.js||[]),...(s.css||[])])]);for(const f of files)fs.copyFileSync(path.join(root,f),path.join(target,f));}
const pages={workshop:'https://steamcommunity.com/workshop/browse/?appid=294100&num_per_page=100',browseCollections:'https://steamcommunity.com/workshop/browse/?appid=294100&section=collections&num_per_page=50',collection:'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585'};
function delta(a,b){return{taskMs:+((b.TaskDuration-a.TaskDuration)*1000).toFixed(1),scriptMs:+((b.ScriptDuration-a.ScriptDuration)*1000).toFixed(1),layoutMs:+((b.LayoutDuration-a.LayoutDuration)*1000).toFixed(1),styleMs:+((b.RecalcStyleDuration-a.RecalcStyleDuration)*1000).toFixed(1),layouts:b.LayoutCount-a.LayoutCount,styleRecalcs:b.RecalcStyleCount-a.RecalcStyleCount};}
(async()=>{const results=[];for(const[name,url]of Object.entries(pages)){if(only&&only!==name)continue;const b=await launch(undefined,{useConfiguredService:true,sourceOverlay:option('source-overlay',null)});try{
 const p=await b.newPage();await p.setViewport({width:1780,height:1050});const errors=[];p.on('pageerror',e=>{if(!e.message.includes('WebAssembly'))errors.push(e.message);});
 const started=Date.now();if(name==='collection'){await p.goto(url,{waitUntil:'load',timeout:60000});await p.waitForSelector('.wshs-design-items');}else await openBrowse(p,url);
 const w=await extensionWorld(p);await w("chrome.storage.local.set({pinnedSidebar:true,pinnedWorkshopBar:true,pinnedCollections:true,layoutDensity:'comfortable',sidebarPosition:'right'})");await p.evaluate(()=>document.fonts.ready);await wait(1200);
 if(args.includes('--contain')&&name==='collection')await p.addStyleTag({content:'.wshs-design-items>.collectionItem{content-visibility:auto;contain-intrinsic-size:auto 110px}'});
 const result={page:name,version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,readyMs:Date.now()-started};
 const session=await p.createCDPSession();await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:1000});await session.send('Profiler.start');
 async function phase(name,fn){const a=await p.metrics();const t=Date.now();const extra=await fn();const d=await p.metrics();result[name]={wallMs:Date.now()-t,...delta(a,d),...extra};}
 await phase('idle',()=>wait(1500));
 await phase('scroll',()=>p.evaluate(async()=>{const gaps=[];let last=performance.now();for(let i=0;i<16;i++){scrollTo(0,i<8?(i+1)*300:(15-i)*300);await new Promise(requestAnimationFrame);const now=performance.now();gaps.push(now-last);last=now;}return{maxFrameMs:+Math.max(...gaps).toFixed(1),frames:gaps.length};}));await wait(200);
 const author=name==='collection'?'.collectionItem .workshopItemAuthorName a':name==='browseCollections'?'.wshs-collection-browse-card a[href*="/myworkshopfiles"]':'.wshs-card-author a';
 await phase('hover',async()=>{const ns=await p.$$(author);for(const n of ns.slice(0,4)){await n.hover();await wait(100);}await p.mouse.move(0,0);await wait(150);});
 await phase('filters',async()=>{await p.$eval('[data-stars="5"]',n=>n.click());await wait(150);await p.$eval('[data-stars="0"]',n=>n.click());await wait(150);});
 const{profile}=await session.send('Profiler.stop');await session.detach();const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(const id of profile.samples||[]){const n=nodes.get(id);if(n?.callFrame.url.startsWith('chrome-extension://')){const key=n.callFrame.url.split('/').pop()+':'+n.callFrame.functionName;counts.set(key,(counts.get(key)||0)+1);}}
 result.hotFunctions=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,18);result.errors=errors;fs.writeFileSync(path.join(out,tag+'-'+name+'.cpuprofile'),JSON.stringify(profile));results.push(result);fs.writeFileSync(path.join(out,tag+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(result));
 }finally{await closeBrowser(b);}}})().catch(e=>{console.error(e);process.exitCode=1;});
