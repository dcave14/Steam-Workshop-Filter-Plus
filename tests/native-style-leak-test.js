// Steam mounts dialogs and popovers inside the cards and rows the extension
// decorates (Additional Required Items lives in a card's actions row). Put a
// probe dialog and popover in every decorated native element and require
// them to render exactly as they do at <body>: no extension rule may reach
// Steam content nested inside its own containers.
const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
const F=require('./steamcmd-fixtures');
let checks=0;function check(name,value,detail){if(!value&&detail)console.log(detail);assert.ok(value,name);checks++;console.log('PASS '+name);}
const cards=Array.from({length:8},(_,i)=>({id:String(990300001+i),title:'Leak probe mod '+(i+1)}));
const collectionIds=Array.from({length:6},(_,i)=>String(990310001+i));

// Runs in the page: measure the probe at <body>, then inside each decorated
// native element (one that carries a wshs- class next to Steam's own).
// Dialogs open modal, as Steam opens them, so the host never sizes them.
function probeAll(){
 const html='<div class="probe-body" style="all:initial;display:block;font:16px Arial;color:#000;background:#fff;padding:8px">'+
  '<button type="button" style="font:13px Arial;padding:6px 14px;transition:opacity .25s">Subscribe to All</button>'+
  '<div role="button" tabindex="0" style="display:inline-block;font:13px Arial;padding:4px 8px">Role button</div>'+
  '<a href="#probe" style="font:13px Arial">Probe link</a><span style="font:13px Arial">Text</span>'+
  '<svg width="30" height="30" viewBox="0 0 30 30"><rect width="30" height="30"></rect></svg>'+
  '<img width="40" height="20" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div>';
 function measure(host,kind){
  const shell=kind==='dialog'?document.createElement('dialog'):document.createElement('div');
  if(kind==='popover')shell.setAttribute('popover','manual');
  shell.innerHTML=html;host.appendChild(shell);kind==='dialog'?shell.showModal():shell.showPopover();
  const out=[...shell.querySelectorAll('.probe-body,.probe-body *')].map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);return [n.tagName,Math.round(r.width*10)/10,Math.round(r.height*10)/10,c.fontSize,c.padding,c.margin,c.display,c.transitionDuration,c.opacity,c.textDecorationLine,c.cursor].join('|');});
  kind==='dialog'?shell.close():shell.hidePopover();shell.remove();return out;
 }
 // Steam containers only: not our own controls, not void or unrendered elements.
 const dialogOrOurs='dialog,[popover],.wshs-injected-controls,.wshs-toolbar-reset-slot,.wshs-saved-filters,.wshs-collection-filters,.wshs-collection-summary,.wshs-picker,.wshs-steamcmd-pop,.wshs-steamcmd-tip,.wshs-steamcmd-card,.wshs-steamcmd-ctn,.wshs-steamcmd-item';
 const hosts=[...document.querySelectorAll('*')].filter(n=>n!==document.documentElement&&n!==document.body&&[...n.classList].some(c=>c.startsWith('wshs-'))&&[...n.classList].some(c=>!c.startsWith('wshs-'))&&n.getClientRects().length&&!/^(IMG|INPUT|SVG|svg|CANVAS|VIDEO|BR|HR)$/.test(n.tagName)&&!n.closest(dialogOrOurs));
 const result={hosts:hosts.length,leaks:[]};
 for(const kind of ['dialog','popover']){
  const base=measure(document.body,kind);
  for(const host of hosts){const got=measure(host,kind);const bad=got.map((g,i)=>g!==base[i]?base[i]+'  =>  '+g:null).filter(Boolean);
   if(bad.length)result.leaks.push({kind,host:host.tagName+'.'+[...host.classList].join('.'),bad:bad.slice(0,4)});}
 }
 return result;
}

async function page(b,url,routes){
 const p=await b.newPage();await p.setViewport({width:1400,height:1000});await p.setRequestInterception(true);
 p.on('request',r=>{const u=r.url();if(r.isNavigationRequest())return r.respond({status:200,contentType:'text/html',body:routes(u)});r.respond({status:200,contentType:'text/html',body:''});});
 await p.goto(url,{waitUntil:'domcontentloaded'});await wait(1200);return p;
}

(async()=>{
 const variants=[
  {name:'Compact, reduced motion, SteamCMD, collection overhaul',prefs:{layoutDensity:'compact',reduceMotion:true,disableCardHover:true,steamcmdButtons:true,collectionOverhaul:true}},
  {name:'Comfortable, classic collection',prefs:{layoutDensity:'comfortable',collectionOverhaul:false}}
 ];
 for(const v of variants){
  // WSHS_SOURCE_OVERLAY: a folder of older source files, to prove the guard catches a regression.
  const b=await launch(undefined,{sourceOverlay:process.env.WSHS_SOURCE_OVERLAY,presentationPreferences:v.prefs});
  try{
   const browse=await page(b,'https://steamcommunity.com/workshop/browse/?appid='+F.APP,()=>F.browse(cards));
   // Decorations that appear on hover (card picker, SteamCMD button) count too.
   const first=await browse.$('.card');await first.hover();await wait(400);
   if(v.prefs.steamcmdButtons)await browse.waitForSelector('.wshs-steamcmd-card');
   let r=await browse.evaluate(probeAll);
   check(v.name+': Workshop cards decorated ('+r.hosts+' native elements)',r.hosts>=3);
   check(v.name+': dialogs and popovers inside Workshop cards keep native styles',!r.leaks.length,JSON.stringify(r.leaks,null,1));
   const coll=await page(b,'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',u=>/id=3521297585/.test(u)?F.collection('3521297585',collectionIds):F.item('1','x',[]));
   await coll.waitForSelector('.wshs-injected-controls, .wshs-collection-summary',{timeout:15000}).catch(()=>{});await wait(800);
   r=await coll.evaluate(probeAll);
   check(v.name+': collection page decorated ('+r.hosts+' native elements)',r.hosts>=1);
   check(v.name+': dialogs and popovers inside collection rows and controls keep native styles',!r.leaks.length,JSON.stringify(r.leaks,null,1));
  }finally{await closeBrowser(b);}
 }
 console.log(checks+' native style leak checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
