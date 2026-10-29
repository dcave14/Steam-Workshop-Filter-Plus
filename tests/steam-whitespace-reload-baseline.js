const p=require('../perf/node_modules/puppeteer-core');const {closeBrowser,wait}=require('./browser-helpers');
(async()=>{const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{const page=await b.newPage();await page.setViewport({width:1600,height:1000});page.on('pageerror',e=>console.log('BASELINE ERROR: '+e.message));
await page.goto('https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems&p=1&num_per_page=30&days=7',{waitUntil:'load'});await wait(1000);
await page.evaluate(()=>{const input=[...document.querySelectorAll('#CommunityTemplate form input')].find(i=>/^(text|search)$/i.test(i.getAttribute('type')||'text'));window.__baselineInput=input;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,' \t');input.dispatchEvent(new Event('input',{bubbles:true}));});await wait(100);
await page.evaluate(()=>window.__baselineInput.form.requestSubmit());await wait(1500);console.log('NATIVE SEARCH',await page.evaluate(()=>({value:window.__baselineInput.value,url:location.href,storageKeys:Object.keys(localStorage),sessionKeys:Object.keys(sessionStorage)})));
await page.reload({waitUntil:'load'});await wait(2000);console.log('Baseline whitespace reload complete');
}finally{await closeBrowser(b)}})().catch(e=>{console.error(e);process.exitCode=1});
