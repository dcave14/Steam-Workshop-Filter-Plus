// Refresh only this task's managed unpacked Chrome test copy, retaining storage.
const fs=require('fs'),path=require('path'),os=require('os'),puppeteer=require('../perf/node_modules/puppeteer-core');
(async()=>{
 const statePath=path.join(__dirname,'out/manual-chrome-state.json'),state=JSON.parse(fs.readFileSync(statePath));
 const target=path.resolve(state.extensionPath),temporary=path.resolve(os.tmpdir())+path.sep;
 if(!target.startsWith(temporary)||!path.basename(target).startsWith('wshs-test-'))throw Error('Unexpected manual extension directory');
 const source=path.resolve(__dirname,'../dist/chrome');
 const requested=process.argv.filter(a=>a.startsWith('--collection=')).map(a=>a.slice('--collection='.length));
 if(requested.some(id=>!/^\d{7,20}$/.test(id)))throw Error('Invalid public collection ID');
 fs.cpSync(source,target,{recursive:true});
 const b=await puppeteer.connect({browserWSEndpoint:state.wsEndpoint,defaultViewport:null,protocolTimeout:20000});
 try{
  const extensionId=await b.installExtension(target);
  state.extensionId=extensionId;fs.writeFileSync(statePath,JSON.stringify(state,null,2));
  for(const id of requested.length?requested:process.argv.includes('--browse-only')?[]:['3521297585','3818340638']){
   const url='https://steamcommunity.com/sharedfiles/filedetails/?id='+id;
   const existing=b.targets().find(t=>t.type()==='page'&&t.url()===url),p=existing?await existing.page():await b.newPage();
   await p.bringToFront();await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForSelector('.wshs-design-collection',{timeout:30000});await p.evaluate(()=>scrollTo(0,0));
   console.log('Updated live collection '+id+': '+await p.$eval('.wshs-design-counts',n=>n.textContent));
   if(id==='3818340638')await p.bringToFront();
  }
  // Existing content scripts keep their old code until each browse tab reloads.
  for(const t of b.targets().filter(t=>t.type()==='page'&&t.url().startsWith('https://steamcommunity.com/workshop/browse/')&&!t.url().includes('section=collections'))){
   const p=await t.page();await p.bringToFront();await p.reload({waitUntil:'domcontentloaded',timeout:60000});await p.waitForSelector('.wshs-saved-filters');console.log('Updated Workshop browse tab.');
  }
  if(process.argv.includes('--collections-browse')){
   const url='https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=collections';
   const existing=b.targets().find(t=>t.type()==='page'&&t.url().includes('/workshop/browse/')&&t.url().includes('section=collections'));
   const p=existing?await existing.page():await b.newPage();await p.bringToFront();await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForSelector('.wshs-saved-filters');await p.evaluate(()=>scrollTo(0,0));console.log('Opened updated Workshop Browse Collections.');
  }
  console.log('Chrome test extension updated to '+JSON.parse(fs.readFileSync(path.join(target,'manifest.json'))).version);
 }finally{await b.disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1;});
