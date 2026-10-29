// Deterministic picker motion and cached preparation checks; all requests intercepted.
const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait,installFrameSampler}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
let checks=0;const check=(name,value)=>{assert.ok(value,name);console.log('PASS '+name);checks++};
const author='.collectionItem .workshopItemAuthorName a';
(async()=>{const firefox=process.argv.includes('--firefox'),browser=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:{layoutDensity:'compact',sidebarPosition:'right'}}:{});try{
 const page=await browser.newPage();await page.setViewport({width:1600,height:1000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:fixture(true).replace('<body>','<body><div id="ig_bottom"><div class="collectionTop"><div class="collectionHeader"><div class="workshopItemTitle">Picker fixture collection</div></div></div>').replace('</body>','</div><style>body{min-height:2800px}.subscribeCollection,.collectionChildren{width:100%}#ig_bottom{width:1200px;margin:auto}</style></body>')}):r.respond({status:200,contentType:'text/html',body:'<div id="RequiredItems"></div>'}));
 await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');await page.waitForSelector('.wshs-design-collection');await wait(200);
 const world=!firefox&&await extensionWorld(page);
 const align=()=>page.evaluate(()=>{const a=document.querySelector('.collectionItem .workshopItemAuthorName a').getBoundingClientRect(),p=document.querySelector('.wshs-picker').getBoundingClientRect();return Math.abs(a.top+a.height/2-p.top-p.height/2)<.3&&Math.abs(p.left-a.right-4)<.3});
 const hover=async()=>{await page.hover(author);await wait(180)};
 for(const side of (firefox?['right']:['left','right']))for(const density of (firefox?['compact']:['comfortable','compact'])){
  if(world)await world(`chrome.storage.local.set({sidebarPosition:'${side}',layoutDensity:'${density}'})`);

  await wait(100);await page.$eval('.subscribeCollection',e=>e.scrollIntoView());await hover();
  check(side+' '+density+' presentation is active',await page.evaluate((side,density)=>document.documentElement.dataset.wshsCollectionSide===side&&document.documentElement.classList.contains('wshs-collection-compact')===(density==='compact'),side,density));
  check(side+' '+density+' creator controls align after preparation',await align());
  await page.evaluate(()=>scrollBy(0,20));await wait(80);check(side+' '+density+' scroll realigns cached controls',await align());
 }
 await hover();await page.click('.wshs-picker-help');await wait(80);
 check('help content remains visible after preparation',await page.$eval('.wshs-picker-guide',e=>e.textContent.includes('shared with Workshop')&&e.getBoundingClientRect().height>0));
 await page.click('.wshs-picker-help');await page.click('.wshs-picker [data-action="hide"]');await wait(80);
 check('pending confirmation prepares its changed size',await page.$eval('.wshs-picker',e=>e.classList.contains('wshs-picker-confirmation')&&e.textContent.includes('undo')));
 await page.click('.wshs-picker [data-action="undo"]');await hover();check('undo restores creator alignment without applying a filter',await align()&&await page.$$eval('.collectionItem.wshs-filtered',ns=>ns.length===0));
 await page.click('.wshs-picker-word-toggle');
 const wordPoint=await page.$eval('.collectionItem .workshopItemTitle',t=>{const r=document.createRange();r.setStart(t.firstChild,0);r.setEnd(t.firstChild,2);window.__pickerWord=r;const b=r.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}});
 await page.mouse.click(wordPoint.x,wordPoint.y);await wait(100);
 check('pinned title word prepares and positions above its range',await page.evaluate(()=>{const p=document.querySelector('.wshs-picker'),b=p.getBoundingClientRect(),r=window.__pickerWord.getBoundingClientRect();return p.dataset.word.toLowerCase()==='ai'&&Math.abs(b.bottom-r.top+4)<.3}));
 await page.click('.wshs-picker-help');await wait(80);check('pinned word help survives size preparation',!!await page.$('.wshs-picker-guide'));
 await page.click('.wshs-picker-help');await page.click('.wshs-picker-word-toggle');await hover();
 if(world){await world(`(()=>{
  const p=document.querySelector('.wshs-picker'),a=document.querySelector('.collectionItem .workshopItemAuthorName a');globalThis.pickerWork={box:0,font:0,animations:0,writes:0,row:0};
  const rect=Element.prototype.getBoundingClientRect,style=getComputedStyle,animations=Element.prototype.getAnimations,set=CSSStyleDeclaration.prototype.setProperty;
  Element.prototype.getBoundingClientRect=function(){if(this===p)pickerWork.box++;if(this===a.closest('.collectionItem'))pickerWork.row++;return rect.call(this)};
  globalThis.getComputedStyle=function(el,...args){if(el===a)pickerWork.font++;return style.call(this,el,...args)};
  Element.prototype.getAnimations=function(...args){if(new Error().stack.includes('saved-filters.js'))pickerWork.animations++;return animations.apply(this,args)};
  CSSStyleDeclaration.prototype.setProperty=function(...args){if(this===p.style||this===a.parentElement.style)pickerWork.writes++;return set.apply(this,args)};
 })()`);await wait(120);await world('Object.keys(pickerWork).forEach(k=>pickerWork[k]=0)');await wait(150);
 check('resting picker performs no geometry or animation discovery',await world('Object.values(pickerWork).every(n=>n===0)'));
 await page.evaluate(async()=>{for(let i=0;i<20;i++){document.dispatchEvent(new Event('scroll'));await new Promise(requestAnimationFrame)}});await wait(80);
 const counts=await world('pickerWork');console.log('Repeated positioning work: '+JSON.stringify(counts));
 check('repeated stationary positioning reads cached size and font',counts.row>=20&&counts.box===0&&counts.font===0);
 check('repeated stationary positioning avoids animation scans and unchanged writes',counts.animations===0&&counts.writes===0);
 }
 for(const target of ['row','ancestor']){
  await hover();if(world)await world('pickerWork.animations=0');
  await installFrameSampler(page);const motion=await page.evaluate(async target=>{
   const row=document.querySelector('.collectionItem'),a=row.querySelector('.workshopItemAuthorName a'),p=document.querySelector('.wshs-picker'),node=target==='row'?row:row.parentElement;
   node.style.transition='transform 650ms linear';node.style.transform='translateY(-5px)';let max=0,frames=0;
   await new Promise(resolve=>{const end=performance.now()+800;function sample(){const x=a.getBoundingClientRect(),y=p.getBoundingClientRect();max=Math.max(max,Math.abs(x.top+x.height/2-y.top-y.height/2));frames++;if(performance.now()<end)__wshsAfterFrame(sample);else resolve()}__wshsAfterFrame(sample)});
   node.style.removeProperty('transition');node.style.removeProperty('transform');return{max,frames};
  },target);await wait(100);console.log(target+' maximum error '+motion.max);
  check(target+' transform transition tracks through resting frames',motion.frames>10&&motion.max<.5);
  if(world){const scans=await world('pickerWork.animations');console.log(target+' animation discovery calls '+scans+' over '+motion.frames+' frames');check(target+' animation discovery does not run every frame',scans<motion.frames);}
 }
 // A delayed transition starts later than its initiating mutation.
 await hover();const delayed=await page.evaluate(async()=>{
  const row=document.querySelector('.collectionItem'),a=row.querySelector('.workshopItemAuthorName a'),p=document.querySelector('.wshs-picker');row.style.transition='transform 250ms linear 180ms';row.style.transform='translateY(-3px)';
  await new Promise(r=>setTimeout(r,350));const x=a.getBoundingClientRect(),y=p.getBoundingClientRect(),error=Math.abs(x.top+x.height/2-y.top-y.height/2);row.style.removeProperty('transition');row.style.removeProperty('transform');return error;
 });await wait(100);check('delayed transition remains tracked',delayed<.5);
 await hover();await page.evaluate(()=>{const row=document.querySelector('.collectionItem'),next=row.nextElementSibling;next.querySelector('.workshopItemAuthorName').append(row.querySelector('.workshopItemAuthorName a'))});await wait(150);
 check('connected anchor reparenting follows its new row',await page.evaluate(()=>{const as=[...document.querySelectorAll('.collectionItem .workshopItemAuthorName a')],a=as.find(a=>a.parentElement.querySelectorAll('a').length===2),p=document.querySelector('.wshs-picker');if(!a)return false;const x=a.getBoundingClientRect(),y=p.getBoundingClientRect();return Math.abs(x.top+x.height/2-y.top-y.height/2)<.3}));
 // Restore a normal creator target, then verify reused/removed identities dismiss.
 await page.mouse.move(0,0);await wait(400);await hover();await page.$eval(author,a=>a.href=a.href+'&changed=1');await wait(100);
 check('reused author href dismisses cached controls',await page.$eval('.wshs-picker',p=>getComputedStyle(p).display==='none'));
 await hover();await page.$eval(author,a=>a.closest('.collectionItem').replaceWith(a.closest('.collectionItem').cloneNode(true)));await wait(100);
 check('same-row replacement dismisses detached target',await page.$eval('.wshs-picker',p=>getComputedStyle(p).display==='none'));
 await hover();await page.$eval(author,a=>a.closest('.collectionItem').classList.add('wshs-ratings-filtered'));await wait(100);
 check('hidden target dismisses sleeping controls',await page.$eval('.wshs-picker',p=>getComputedStyle(p).display==='none'));
 check('no page errors',errors.length===0);console.log(checks+' picker work checks passed.');
}finally{await closeBrowser(browser)}})().catch(e=>{console.error(e);process.exitCode=1});


