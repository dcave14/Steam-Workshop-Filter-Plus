const assert=require('assert/strict');
const {launch,closeBrowser,wait}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
 try{
  const target=await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().endsWith('/steam-api.js'));
  const worker=await target.worker();const base=target.url().replace(/\/steam-api\.js$/, '');
  await worker.evaluate(()=>{
   globalThis.__calls=[];
   chrome.permissions.contains=async()=>true;
   globalThis.fetch=async(url,options)=>{
    __calls.push({url,hasKey:typeof options.headers['x-webapi-key']==='string',credentials:options.credentials});
    return {ok:true,status:200,json:async()=>({response:{publishedfiledetails:[{publishedfileid:'3812510377',result:1,title:'API fixture',num_children:1,children:[{publishedfileid:'3809306528'}]}]}})};
   };
  });
  const page=await browser.newPage();await page.goto(base+'/options.html');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('No key'));
  check('options start with a blank password field',await page.$eval('#api-key',e=>e.type==='password'&&e.value===''));
  await page.evaluate(()=>{chrome.permissions.request=async()=>false;});
  await page.type('#api-key','A'.repeat(32));await page.click('#save');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('not granted'));
  check('denied permission does not save a key',await worker.evaluate(async()=>!(await chrome.storage.local.get('steamWebApiKey')).steamWebApiKey));
  await page.evaluate(()=>{chrome.permissions.request=async()=>true;});await page.click('#save');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('API verified'));
  check('save persists the key only to local extension storage',await worker.evaluate(async()=>!!(await chrome.storage.local.get('steamWebApiKey')).steamWebApiKey&&!(await chrome.storage.sync.get('steamWebApiKey')).steamWebApiKey));
  check('save clears the input immediately',await page.$eval('#api-key',e=>e.value===''));
  check('saved key never appears in rendered page text or markup',await page.evaluate(()=>!document.body.textContent.includes('A'.repeat(32))&&!document.documentElement.outerHTML.includes('A'.repeat(32))));
  check('background requests use a header and never expose the key in URLs',await worker.evaluate(()=>__calls.length===1&&__calls.every(c=>c.hasKey&&c.credentials==='omit'&&!c.url.includes('A'.repeat(32)))));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('A key is saved'));
  check('reload shows only saved-key status',await page.$eval('#api-key',e=>e.value===''));
  await page.click('#test');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('API verified'));
  check('saved-key test reuses the private stored key',await worker.evaluate(()=>__calls.length===2));
  await worker.evaluate(()=>{globalThis.fetch=async()=>({ok:false,status:401});});
  await page.click('#test');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Steam rejected'));
  check('authentication errors are useful without revealing the key',await page.evaluate(()=>!document.querySelector('#status').textContent.includes('A'.repeat(32))));
  await page.evaluate(()=>{chrome.permissions.remove=async()=>true;});await page.click('#remove');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Key removed'));
  check('remove deletes the stored key',await worker.evaluate(async()=>!(await chrome.storage.local.get('steamWebApiKey')).steamWebApiKey));
  await worker.evaluate(()=>{
   globalThis.WSHS_API_CONFIG.serviceUrl='https://service.example';
   globalThis.fetch=async(url,options)=>{
    __calls.push({url,hasKey:!!options.headers['x-webapi-key'],body:options.body});
    return {ok:true,status:200,json:async()=>({ok:true,rows:[{id:'3812510377',title:'Fixture',ids:['3809306528']}]})};
   };
  });
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#service-settings').hidden);
  check('shared-service releases do not prompt users for a key',await page.$eval('#personal-settings',e=>e.hidden)&&await page.$eval('#api-key',e=>e.getBoundingClientRect().width===0));
  await page.click('#service-test');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('API verified'));
  check('shared-service requests contain only item IDs',await worker.evaluate(()=>{const call=__calls.at(-1);return !call.hasKey&&call.url==='https://service.example/v1/items'&&Object.keys(JSON.parse(call.body)).join(',')==='ids'}));
  console.log(checks+' API settings checks passed.');
 }finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
