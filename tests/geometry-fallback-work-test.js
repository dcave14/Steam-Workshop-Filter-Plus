// Deterministic fallback geometry work: no live Steam or account requests.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {launch,closeBrowser}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
(async()=>{const browser=await launch();try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 await page.setContent(fixture(false).replace('</style>','#CommunityTemplate{display:block}.fixture-grid{display:flex;flex-wrap:wrap;width:1000px;gap:20px}.fixture-card{box-sizing:border-box;width:235px;flex:none}.hidden-item,.wshs-filtered,.wshs-ratings-filtered,.wshs-review-omit{display:none!important}body{min-height:2500px}</style>'));
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','steam-dom.js'),'utf8')});
 const checks=await page.evaluate(()=>{
  const results=[],ok=(name,value)=>{assert(value,name);results.push(name)},assert=(v,n)=>{if(!v)throw Error(n)};
  const grid=document.querySelector('.fixture-grid'),sample=grid.firstElementChild.cloneNode(true);
  const fragment=document.createDocumentFragment();for(let i=0;i<400;i++){const card=sample.cloneNode(true);card.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='/sharedfiles/filedetails/?id='+(880000000+i));fragment.append(card)}grid.replaceChildren(fragment);
  const dom=WSHSDom,cards=()=>dom.enumerateCards(),geometry=()=>{const g=dom.getCardGeometry();return {width:g.width,gap:g.gap,columns:g.columns,left:g.left,right:g.right,card:g.card}};
  let reads=0,writes=0;const rect=Element.prototype.getBoundingClientRect,add=DOMTokenList.prototype.add,remove=DOMTokenList.prototype.remove;
  Element.prototype.getBoundingClientRect=function(){if(this.matches('.fixture-card'))reads++;return rect.call(this)};
  DOMTokenList.prototype.add=function(...args){writes++;return add.apply(this,args)};DOMTokenList.prototype.remove=function(...args){writes++;return remove.apply(this,args)};
  const same=(a,b)=>['width','gap','columns','left','right'].every(k=>Math.abs(a[k]-b[k])<.1);
  try{
   let initial=geometry();ok('flex fallback measures all four original columns',initial.columns===4&&initial.width===235&&initial.gap===20);
   reads=0;writes=0;let stable=true;for(let i=0;i<30;i++)stable=stable&&same(geometry(),initial);ok('thirty repeated flex geometries are identical',stable);
   ok('repeated fallback reads no card boxes or filter writes',reads===0&&writes===0);
   const picker=document.createElement('div');picker.className='wshs-picker';document.body.append(picker);geometry();reads=0;
   for(let i=0;i<20;i++){picker.style.left=i+'px';geometry()}
   ok('picker pointer-position writes do not invalidate fallback geometry',reads===0);picker.remove();geometry();
   cards().forEach((c,i)=>{if(i%2)c.root.classList.add('wshs-filtered')});reads=0;writes=0;
   ok('partial filtering retains original geometry',same(geometry(),initial));ok('filter changes reuse unfiltered geometry',reads===0&&writes===0);
   cards().forEach(c=>c.root.classList.add('hidden-item'));reads=0;writes=0;
   ok('all-hidden fallback retains four columns',same(geometry(),initial));ok('all-hidden repeated calls do not unhide cards',reads===0&&writes===0);
   grid.style.width='745px';let resized=geometry();ok('all-hidden synchronous width change recalculates three columns',resized.columns===3&&resized.width===235&&resized.gap===20);
   ok('fallback restores every filter after invalidation',cards().every(c=>c.root.classList.contains('hidden-item')));
   reads=0;writes=0;geometry();ok('post-resize fallback is cached again',reads===0&&writes===0);
   grid.style.transform='translateX(37px)';const translated=geometry();ok('ancestor translation updates viewport edges',Math.abs(translated.left-resized.left-37)<.1);reads=0;geometry();ok('translated fallback rests without card reads',reads===0);
   window.scrollTo(0,100);reads=0;ok('vertical scroll preserves fallback geometry without list work',same(geometry(),translated)&&reads===0);
   // A stylesheet edit must invalidate even while all results are invisible.
   const style=document.createElement('style');style.textContent='.fixture-card{width:160px}';document.head.append(style);
   let restyled=geometry();ok('new stylesheet updates hidden-card widths and columns',restyled.width===160&&restyled.columns===4);
   style.textContent='.fixture-card{width:180px}';ok('stylesheet text replacement invalidates synchronously',geometry().width===180);
   const cssomRule=style.sheet.insertRule('.fixture-card{width:175px}',style.sheet.cssRules.length);ok('CSSOM card-width change invalidates without a mutation',geometry().width===175);style.sheet.deleteRule(cssomRule);geometry();
   const gapRule=style.sheet.insertRule('.fixture-grid{column-gap:30px}',style.sheet.cssRules.length);ok('CSSOM gap change invalidates without a mutation',geometry().gap===30);style.sheet.deleteRule(gapRule);geometry();
   const old=cards()[0].root,replacement=old.cloneNode(true);old.replaceWith(replacement);ok('same-ID replacement refreshes representative root',geometry().card===replacement);
   const moved=document.createElement('main');moved.className='fixture-grid';moved.style.width='1000px';grid.after(moved);moved.append(...grid.children);grid.remove();
   const reparented=geometry();ok('reparenting refreshes parent and column count',reparented.columns===5&&reparented.card===replacement);
   moved.style.display='block';moved.style.flowRoot='true';cards().forEach(c=>{c.root.style.cssFloat='left';c.root.style.marginRight='20px'});
   const floated=geometry();ok('non-grid block/float layout remains supported',floated.columns===5&&floated.width===180);
   reads=0;writes=0;for(let i=0;i<20;i++)geometry();ok('block/float repeated work stays bounded',reads===0&&writes===0);
   moved.style.width='800px';const fail=cards()[1].root,original=fail.getBoundingClientRect;fail.getBoundingClientRect=()=>{throw Error('measurement fixture')};let caught=false;try{geometry()}catch(e){caught=e.message==='measurement fixture'}finally{fail.getBoundingClientRect=original}
   ok('failed fallback measurement restores all hidden classes',caught&&cards().every(c=>c.root.classList.contains('hidden-item')));
   // Parent scroll offsets do not move the parent's own border box.
   cards().forEach(c=>c.root.classList.remove('hidden-item','wshs-filtered'));moved.style.cssText='display:flex;flex-wrap:nowrap;width:800px;overflow:auto;gap:20px';geometry();const beforeScroll=geometry();moved.scrollLeft=100;reads=0;const afterScroll=geometry();
   ok('horizontal parent scrolling shifts cached card edges',Math.abs(beforeScroll.left-afterScroll.left-100)<.1&&reads===0);
  }finally{Element.prototype.getBoundingClientRect=rect;DOMTokenList.prototype.add=add;DOMTokenList.prototype.remove=remove}
  return results;
 });checks.forEach(name=>console.log('PASS '+name));console.log(checks.length+' fallback geometry checks passed.');
}finally{await closeBrowser(browser)}})().catch(e=>{console.error(e);process.exitCode=1});





