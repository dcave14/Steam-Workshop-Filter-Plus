const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
 const window={},stored={},batches=[];let fetches=0,complete=true,listener;
 const context={window,location:{origin:'https://steamcommunity.com'},Date,URL,AbortSignal,setTimeout:()=>0,clearTimeout:()=>{},
  chrome:{storage:{local:{get:async keys=>Object.fromEntries((keys||Object.keys(stored)).filter(k=>k in stored).map(k=>[k,stored[k]])),set:async u=>Object.assign(stored,u),remove:async()=>{}},onChanged:{addListener(fn){listener=fn}}},
   runtime:{sendMessage:async message=>{
    if(message.type==='wshs-api-status')return {configured:true,permitted:true};
    batches.push(message.ids);
    return complete?{ok:true,rows:message.ids.map(id=>({id,title:'Fixture',ids:id==='1'?['3809306528']:[],updated:Date.now()}))}:{ok:false,message:'Steam rejected the API key.'};
   }}},fetch:async()=>{fetches++;return {ok:false,status:503,text:async()=>''};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-dependencies.js'),'utf8'),context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 window.WSHSDependencies.request(Array.from({length:205},(_,i)=>String(i+1)));await settle();
 assert.equal(batches.length,3);assert.ok(batches.every(b=>b.length<=100));
 assert.equal(window.WSHSDependencies.get('1')[0],'3809306528');assert.equal(window.WSHSDependencies.get('205').length,0);assert.equal(fetches,0);
 assert.ok(!window.WSHSDependencies.pending('1'));
 window.WSHSDependencies.request(['1','205']);await settle();assert.equal(batches.length,3);
 complete=false;window.WSHSDependencies.request(['999']);await settle();
 assert.equal(window.WSHSDependencies.get('999'),null);assert.equal(fetches,0);assert.ok(window.WSHSDependencies.message().includes('Retry'));
 complete=true;listener({steamWebApiRevision:{}},'local');window.WSHSDependencies.request(['999']);await settle();assert.equal(window.WSHSDependencies.get('999').length,0);
 console.log('11 dependency API batching/cache/fallback checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
