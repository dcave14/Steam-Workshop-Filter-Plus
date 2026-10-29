// Count real IIFE work in disposable sources; never add production test hooks.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'..');
const {launch,closeBrowser,extensionWorld,wait}=require(path.join(root,'tests/browser-helpers'));
const {fixture}=require(path.join(root,'tests/filter-fixtures'));
const overlay=fs.mkdtempSync(path.join(os.tmpdir(),'wshs-observer-work-'));
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name)}
for(const [file,functions] of Object.entries({
 'saved-filters.js':{applyCollectionFilters:'collectionFilters',applyAuthorFilters:'browseFilters',alignCardActions:'cardDecoration'},
 'workshop-result-count.js':{update:'resultCount'},
 'collection-sizes.js':{render:'sizeRender'},
 'filter-bar-pinning.js':{sync:'pinningSync'}
})){
 let source=fs.readFileSync(path.join(root,file),'utf8');
 for(const [name,key]of Object.entries(functions)){
  const needle='function '+name+'() {';
  if(!source.includes(needle))throw Error('Missing '+file+':'+name);
  source=source.replace(needle,needle+' window.__perfAudit.'+key+'=(window.__perfAudit.'+key+'||0)+1;');
 }
 fs.writeFileSync(path.join(overlay,file),'window.__perfAudit=window.__perfAudit||{};\n'+source);
}
const sort='<div class="fixture-sort"><div role="button" tabindex="0"><svg viewBox="0 0 32 18"></svg>Most Popular<svg viewBox="0 0 12 8"></svg></div></div>';
function html(surface){let h=fixture(surface==='detail');if(surface!=='detail')h=h.replace('<form onsubmit=','<div class="fixture-toolbar"><form onsubmit=').replace('</form><aside>','</form>'+sort+'<div role="combobox">Special Filters</div><button data-accent-color="blue">Filter by Date</button></div><aside>').replace('<main class="fixture-grid">','<span>8 entries matching filters</span><main class="fixture-grid">').replace('</style>','.fixture-toolbar{grid-column:1/-1;display:flex;gap:12px}body{min-height:3000px}</style>');return surface==='collections'?h.replaceAll('aspectratio_16x9','aspectratio_square'):h;}
(async()=>{const b=await launch(undefined,{sourceOverlay:overlay});try{
 const p=await b.newPage();await p.setViewport({width:1600,height:1000});await p.setRequestInterception(true);let body,metadataSize=1000;
 p.on('request',r=>{
  const url=new URL(r.url());
  if(r.isNavigationRequest())return r.respond({status:200,contentType:'text/html',body});
  if(url.pathname==='/sharedfiles/actions'&&url.searchParams.get('q')==='GetUGCSummary')return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:JSON.parse(url.searchParams.get('qp'))[0].map(id=>({publishedfileid:id,file_size:String(metadataSize),total_votes:100}))})});
  r.abort();
 });
 const results=[];
 for(const variant of [{sidebarPosition:'left',layoutDensity:'comfortable'},{sidebarPosition:'right',layoutDensity:'compact'}])for(const surface of (process.argv.includes('--geometry-only')?[]:['items','collections','detail'])){
  body=html(surface).replace('</style>','body{min-height:6000px}</style>');await p.goto(surface==='detail'?'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585':'https://steamcommunity.com/workshop/browse/?appid=294100'+(surface==='collections'?'&section=collections':''));
  await p.waitForSelector('.wshs-sf-input');await wait(600);const w=await extensionWorld(p);
  await w(`(()=>{const old=WSHSDom.getSortButton;WSHSDom.getSortButton=function(){__perfAudit.sortDiscovery=(__perfAudit.sortDiscovery||0)+1;return old()};const rect=Element.prototype.getClientRects;Element.prototype.getClientRects=function(){if(this.matches('.fixture-card'))__perfAudit.cardVisibilityReads=(__perfAudit.cardVisibilityReads||0)+1;return rect.call(this)}})()`);
  await w('chrome.storage.local.set('+JSON.stringify({...variant,pinnedWorkshopBar:false,pinnedCollections:false,'savedFilters:294100':[]})+')');await wait(250);
  const label=surface+' '+variant.sidebarPosition+'/'+variant.layoutDensity;
  async function phase(name,fn){await w('window.__perfAudit={}');await fn();await wait(150);const counts=await w('__perfAudit');results.push({surface,...variant,phase:name,counts});return counts;}
  const noWork=(name,counts)=>check(label+' '+name,Object.values(counts).every(n=>n===0));
  noWork('idle does no list work',await phase('idle',()=>wait(180)));
  noWork('native tooltip text/removal does no list work',await phase('four unrelated native tooltip text changes',async()=>{
   await p.evaluate(()=>{const h=document.createElement('div');h.id='workshop_item_hover';h.style.display='none';document.body.append(h)});await wait(100);await w('window.__perfAudit={}');
   for(let i=0;i<4;i++){await p.evaluate(i=>document.getElementById('workshop_item_hover').textContent='Native tooltip '+i,i);await wait(45)}
   await p.evaluate(()=>document.getElementById('workshop_item_hover').remove());
  }));
  noWork('wrapped tooltip with native-looking data does no list work',await phase('wrapped native tooltip',async()=>{
   await p.evaluate(()=>{const wrap=document.createElement('div');wrap.id='audit-portal';wrap.style.position='fixed';wrap.innerHTML='<div id="workshop_item_hover"><button>Native</button><a href="/sharedfiles/filedetails/?id=123">456 entries matching filters</a></div>';document.body.append(wrap)});await wait(80);await p.$eval('#audit-portal',n=>n.remove());
  }));
  noWork('disabled pinning never syncs or discovers on scroll',await phase('eight scroll wakes with toolbar pinning disabled',async()=>{for(let i=0;i<8;i++){await p.evaluate(()=>dispatchEvent(new Event('scroll')));await wait(35)}}));
  if(surface==='detail'){
   noWork('unrelated row classes do not rerender sizes',await phase('four unrelated row class toggles',async()=>{for(let i=0;i<4;i++){await p.$eval('.collectionItem',n=>n.classList.toggle('audit-native-hover'));await wait(45)}}));
   const sizes=await phase('effective visibility change',()=>p.$$eval('.collectionItem',ns=>ns.forEach(n=>n.classList.add('hidden-item'))));
   check(label+' real visibility changes rerender sizes',sizes.sizeRender>0);
   check(label+' all hidden produces exact zero',await p.$eval('.wshs-size-filtered',n=>n.textContent==='After filters: 0 MB (0 GB)'));
   await p.$$eval('.collectionItem',ns=>ns.forEach(n=>n.classList.remove('hidden-item')));await wait(150);
   const before=await p.$eval('.wshs-collection-sizes',n=>n.dataset.totalBytes);metadataSize++;
   const metadata=await phase('real metadata update',()=>w('WSHSMetadata.request(["990000001"],{fields:["size"],force:true})'));
   check(label+' real metadata updates rerender sizes',metadata.sizeRender>0&&await p.$eval('.wshs-collection-sizes',(n,b)=>n.dataset.totalBytes!==b,before));
  }
  const positive=await phase('real title and author text updates',()=>p.evaluate(surface=>{
   const title=document.querySelector(surface==='detail'?'.workshopItemTitle':'.fixture-card>a');title.firstChild.nodeValue='Updated native title';
   const author=document.querySelector('a[href*="/myworkshopfiles"]');author.textContent='Updated native author';
  },surface));
  check(label+' real title/author edits reevaluate filters',(positive.collectionFilters||positive.browseFilters)>0);
  await w('chrome.storage.local.set({"savedFilters:294100":[{kind:"keyword",value:"Updated",label:"Updated",state:-1}]})');await wait(150);
  const rowSelector=surface==='detail'?'.collectionItem':'.fixture-card';
  check(label+' changed native title participates in active filtering',await p.$eval(rowSelector,n=>n.classList.contains('wshs-filtered')));
  await p.$eval(rowSelector,n=>n.classList.remove('wshs-filtered'));await wait(150);
  check(label+' overwritten filter class is repaired',await p.$eval(rowSelector,n=>n.classList.contains('wshs-filtered')));
  await w('chrome.storage.local.set({"savedFilters:294100":[]})');await wait(150);
  const structure=await phase('real row insertion',()=>p.evaluate(surface=>{const row=document.querySelector(surface==='detail'?'.collectionItem':'.fixture-card'),copy=row.cloneNode(true);copy.id='sharedfile_990000099';copy.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='/sharedfiles/filedetails/?id=990000099');row.parentElement.append(copy)},surface));
  check(label+' real row insertion reevaluates filters',(structure.collectionFilters||structure.browseFilters)>0);
  const identity=await phase('real item identity update',()=>p.$eval(rowSelector,n=>n.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='/sharedfiles/filedetails/?id=990000088')));
  check(label+' real item href edits reevaluate filters',(identity.collectionFilters||identity.browseFilters)>0);
  if(surface!=='detail'){
   check(label+' insertion updates native-page result summary',await p.$eval('.wshs-page-result-count',n=>n.textContent.includes('of 9 shown')));
   await phase('native total anchor replacement',()=>p.evaluate(()=>{const count=[...document.querySelectorAll('#CommunityTemplate span')].find(n=>n.textContent==='8 entries matching filters');const replacement=document.createElement('span');replacement.textContent='9 entries matching filters';count.replaceWith(replacement)}));
   check(label+' native count anchor replacement keeps summary adjacent',await p.$eval('.wshs-page-result-count',n=>n.previousElementSibling.textContent==='9 entries matching filters'));
   await phase('native sidebar replacement',()=>p.$eval('aside',n=>{const replacement=n.cloneNode(true);replacement.querySelectorAll('.wshs-saved-filters').forEach(n=>n.remove());n.replaceWith(replacement)}));
   check(label+' native sidebar replacement restores saved controls',await p.$$eval('.wshs-sf-input',ns=>ns.length===1));
   // A reused, already populated Quick View has no childList mutation on open.
   await p.evaluate(()=>{const d=document.createElement('dialog');d.innerHTML='<div><div><div><h1><a href="/sharedfiles/filedetails/?id=990000001">Native Quick View</a></h1></div><div><div><div><span><a href="/profiles/76561198000000000/myworkshopfiles">Updated native author</a></span></div></div></div></div></div>';document.body.append(d)});await wait(150);
   await p.$eval('dialog',n=>n.showModal());await p.waitForSelector('dialog[open] .wshs-qv-title');
   check(label+' reused Quick View receives title and creator tools',!!await p.$('dialog[open] .wshs-qv-creators'));
   await p.$eval('dialog',n=>n.close());await wait(100);await p.$eval('dialog',n=>n.showModal());await p.waitForSelector('dialog[open] .wshs-qv-title');await p.$eval('dialog',n=>n.remove());await wait(100);
  }
  const key=surface==='detail'?'pinnedCollections':'pinnedWorkshopBar';
  await w('chrome.storage.local.set({'+key+':true})');await wait(200);
  await p.evaluate(()=>scrollTo(0,1100));await p.waitForSelector('.wshs-pinned-filter-bar');await wait(100);
  const cached=await phase('enabled cached scroll',async()=>{for(let i=0;i<4;i++){await p.evaluate(()=>dispatchEvent(new Event('scroll')));await wait(35)}});
  check(label+' enabled scroll uses cached toolbar',cached.pinningSync>0&&!cached.sortDiscovery);
  await p.$eval('.wshs-pinned-filter-bar',n=>{const replacement=n.cloneNode(true);replacement.classList.remove('wshs-pinned-filter-bar');n.replaceWith(replacement)});await wait(200);
  check(label+' toolbar replacement restores pinning',!!await p.$('.wshs-pinned-filter-bar'));
  await p.$eval('.wshs-pinned-filter-bar',n=>{const parent=document.createElement('div');parent.id='audit-pin-parent';n.parentElement.append(parent);parent.append(n)});await wait(150);
  await p.$eval('#audit-pin-parent',n=>scrollTo(0,n.getBoundingClientRect().top+scrollY+200));await p.waitForSelector('.wshs-pinned-filter-bar');
  check(label+' reparenting moves placeholder with toolbar',await p.$eval('.wshs-pinned-filter-bar',n=>document.querySelector('.wshs-filter-bar-placeholder').parentElement===n.parentElement));
  await w('chrome.storage.local.set({'+key+':false})');await wait(100);
  check(label+' disabling removes class placeholder and positioning',await p.evaluate(()=>!document.querySelector('.wshs-pinned-filter-bar,.wshs-filter-bar-placeholder')&&![...document.querySelectorAll('[style]')].some(n=>n.style.getPropertyValue('--wshs-bar-left'))));
 }
 await p.goto('about:blank');
 await p.setContent(fixture(false).replace('</style>','#CommunityTemplate{display:block}.fixture-grid{display:flex;flex-wrap:wrap;width:1000px;gap:20px}.fixture-card{box-sizing:border-box;width:235px;flex:none}</style>'));
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'steam-dom.js'),'utf8')});
 const fallback=await p.evaluate(()=>{
  const grid=document.querySelector('.fixture-grid'),sample=grid.firstElementChild.cloneNode(true),fragment=document.createDocumentFragment();
  for(let i=0;i<400;i++){const card=sample.cloneNode(true);card.querySelectorAll('a[href*="filedetails"]').forEach(a=>a.href='/sharedfiles/filedetails/?id='+(880000000+i));fragment.append(card)}grid.replaceChildren(fragment);
  const rect=Element.prototype.getBoundingClientRect;let reads=0;
  Element.prototype.getBoundingClientRect=function(){if(this.matches('.fixture-card'))reads++;return rect.call(this)};
  try{
   WSHSDom.getCardGeometry();reads=0;WSHSDom.getCardGeometry();const unchangedReads=reads;
   const tip=document.createElement('div');tip.id='workshop_item_hover';tip.textContent='Unrelated fixed overlay';tip.style.cssText='position:fixed;display:none';document.body.append(tip);
   reads=0;WSHSDom.getCardGeometry();const insertionReads=reads;
   tip.remove();reads=0;WSHSDom.getCardGeometry();const removalReads=reads;
   const wrapper=document.createElement('div');wrapper.style.position='fixed';wrapper.innerHTML='<div style="display:contents"><dialog><button>Quick View</button></dialog></div>';document.body.append(wrapper);reads=0;WSHSDom.getCardGeometry();const nestedDialogReads=reads;wrapper.remove();reads=0;WSHSDom.getCardGeometry();const nestedDialogRemovalReads=reads;
   const portalStyle=document.createElement('style');portalStyle.textContent='.audit-fixed{position:fixed}.audit-contents{display:contents}';document.head.append(portalStyle);WSHSDom.getCardGeometry();
   const classWrapper=document.createElement('div');classWrapper.className='audit-fixed';classWrapper.innerHTML='<div class="audit-contents"><dialog><button>Quick View</button></dialog></div>';document.body.append(classWrapper);reads=0;WSHSDom.getCardGeometry();const classPortalReads=reads;classWrapper.remove();reads=0;WSHSDom.getCardGeometry();const classPortalRemovalReads=reads;
   document.body.append(wrapper);WSHSDom.getCardGeometry();wrapper.style.position='static';wrapper.remove();reads=0;WSHSDom.getCardGeometry();const changedPortalReads=reads;
   const sibling=document.createElement('div');sibling.style.height='30px';grid.before(sibling);reads=0;WSHSDom.getCardGeometry();const siblingReads=reads;
   return {surface:'fallback-400-cards',phase:'transient overlays and real layout sibling',counts:{unchangedReads,insertionReads,removalReads,nestedDialogReads,nestedDialogRemovalReads,classPortalReads,classPortalRemovalReads,changedPortalReads,siblingReads}};
  }finally{Element.prototype.getBoundingClientRect=rect}
 });results.push(fallback);
 check('400-card fallback ignores hidden tooltip insertion/removal',!fallback.counts.unchangedReads&&!fallback.counts.insertionReads&&!fallback.counts.removalReads);
 check('400-card fallback ignores nested transient dialog portal',fallback.counts.nestedDialogReads===0);
 check('400-card fallback ignores nested transient dialog portal removal',fallback.counts.nestedDialogRemovalReads===0);
 check('400-card fallback ignores class-styled portal insertion and removal',fallback.counts.classPortalReads===0&&fallback.counts.classPortalRemovalReads===0);
 check('400-card fallback invalidates when a former portal enters normal flow',fallback.counts.changedPortalReads===400);
 check('400-card fallback still invalidates for real in-flow siblings',fallback.counts.siblingReads===400);
 const out=path.join(__dirname,'out','performance');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.argv.includes('--geometry-only')?'observer-geometry-regression.json':'observer-work-regression.json'),JSON.stringify(results,null,2));console.log(checks+' observer work checks passed.');
}finally{await closeBrowser(b)}})().catch(e=>{console.error(e);process.exitCode=1});
