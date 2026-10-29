// Queue/cooldown logic without network traffic; browser tests cover real DOM parsing.
const assert = require('assert/strict'), vm = require('vm'), fs = require('fs'), path = require('path');
(async () => {
    let calls = 0;
    const window = {}, storage = {};
    const context = {window, location:{origin:'https://steamcommunity.com'}, AbortSignal, URL, Date,
        setTimeout:()=>0, clearTimeout:()=>{},
        chrome:{storage:{local:{get:async()=>storage,set:async values=>Object.assign(storage,values),remove:async()=>{}}}},
        fetch:async()=>{calls++;return {ok:false,status:429,text:async()=>"You've made too many requests recently."};}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-dependencies.js'),'utf8'),context);
    const ids=Array.from({length:20},(_,i)=>String(i+1));
    window.WSHSDependencies.request(ids);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,2,'at most two requests start before rate-limit responses stop the queue');
    assert.ok(ids.every(id=>!window.WSHSDependencies.pending(id)),'queued items leave pending state after cooldown');
    assert.ok(ids.every(id=>window.WSHSDependencies.get(id)===null),'rate-limit pages are never cached as empty dependency lists');
    window.WSHSDependencies.request(ids);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,2,'automatic renders do not retry during cooldown');
    window.WSHSDependencies.request(ids,true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,4,'explicit retry starts a new bounded attempt');
    console.log('5 dependency queue checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
