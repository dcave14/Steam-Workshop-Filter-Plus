const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require('path').join(__dirname,'../search-terms-hook.js'),'utf8');
const attrs=new Map([['data-wshs-terms','"saved phrase"'],['data-wshs-description-search','0']]),calls=[];
const window={location:{href:'https://steamcommunity.com/workshop/browse/?appid=108600',origin:'https://steamcommunity.com'},fetch:(input,init)=>{calls.push({input,init});return Promise.resolve({ok:true});}};
const document={documentElement:{getAttribute:n=>attrs.get(n)||null,setAttribute:(n,v)=>attrs.set(n,v)}};
vm.runInNewContext(source,{window,document,URL,Headers,Request});
let count=0;
(async()=>{
 for(const scope of [0,1,2])for(const query of ['red AND blue','red OR blue','red -blue','(red OR blue) AND room -green','"red room" +blue','AND OR NOT','plain word']){
  const url='https://steamcommunity.com/workshop/browse/?appid=108600&searchtext='+encodeURIComponent(query)+'&search_text_target='+scope;
  for(const asArray of [false,true]){
   const arg={search_text:query,search_text_target:scope,appid:108600};const init={method:'POST',headers:{'x-valve-request-type':'routeAction'},body:JSON.stringify(asArray?[arg]:arg)};
   await window.fetch(url,init);assert.equal(calls.at(-1).input,url);assert.equal(calls.at(-1).init,init);count++;
  }
  const request=new Request(url,{headers:{'x-valve-request-type':'routeData'}});await window.fetch(request);assert.equal(calls.at(-1).input,request);count++;
 }
 for(const scope of ['0','1']){
  attrs.set('data-wshs-description-search',scope);
  await window.fetch('https://steamcommunity.com/workshop/browse/?appid=108600',{method:'POST',headers:{'x-valve-request-type':'routeAction'},body:JSON.stringify([{search_text:' \t ',search_text_target:2}])});
  const arg=JSON.parse(calls.at(-1).init.body)[0];assert.equal(arg.search_text,'"saved phrase"');assert.equal(arg.search_text_target,scope==='1'?0:1);count++;
 }
 const foreign='https://example.com/workshop/browse/?appid=108600';await window.fetch(foreign,{headers:{'x-valve-request-type':'routeData'}});assert.equal(calls.at(-1).input,foreign);count++;
 console.log(count+' native search checks passed: boolean syntax, all three scopes, POST objects/arrays, Request history, and blank-query saved-filter optimization.');
})().catch(e=>{console.error(e);process.exitCode=1});
