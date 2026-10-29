const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
 let publicRequests=0,apiRequests=0,fail=false;
 const store={},window={};
 const context={window,location:{origin:'https://steamcommunity.com'},URL,AbortSignal,Date,setTimeout,clearTimeout,
  chrome:{storage:{local:{get:async keys=>keys===null?store:Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in store).map(k=>[k,store[k]])),set:async values=>Object.assign(store,values),remove:async()=>{}}},
   runtime:{sendMessage:async message=>message.type==='wshs-api-status'?{configured:true,permitted:true}:fail?{ok:false,message:'API unavailable'}:(apiRequests++,{ok:true,rows:message.ids.filter(id=>id!=='2').map(id=>({id,title:'Fixture',ids:['3809306528'],description:'AI description',size:2048,ratings:15,updated:Date.now()}))})}},
  fetch:async()=>{publicRequests++;throw Error('Unexpected public page request')}};
 for(const file of ['api-client.js','workshop-metadata.js','collection-descriptions.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
 await window.WSHSMetadata.request(['1','2']);await window.WSHSDescriptions.request(['1','2']);
 assert.equal(window.WSHSMetadata.get('1').size,2048);assert.equal(window.WSHSMetadata.get('1').ratings,15);
 assert.equal(window.WSHSDescriptions.get('1'),'AI description');assert.equal(window.WSHSDescriptions.get('2'),null);
 assert.equal(window.WSHSMetadata.get('2'),undefined);assert.equal(publicRequests,0);assert.equal(apiRequests,2);
 fail=true;await window.WSHSMetadata.request(['3']);await window.WSHSDescriptions.request(['3']);
 assert.equal(window.WSHSMetadata.get('3'),undefined);assert.equal(window.WSHSDescriptions.get('3'),null);assert.equal(publicRequests,0);
 console.log('10 API-primary metadata/description checks passed; no public-page fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
