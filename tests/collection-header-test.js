// Compare the real legacy collection header with Steam's current Workshop header.
// Public pages only; no account actions or saved preferences are changed.
const assert=require('assert/strict');
const {launch,closeBrowser,openBrowse,wait}=require('./browser-helpers');
let checks=0;
function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
async function measure(page,collection){return page.evaluate(collection=>{
 const visible=n=>{const r=n.getBoundingClientRect();return r.width&&r.left>=0&&r.top<300;};
 const leaf=text=>[...document.querySelectorAll('*')].find(n=>!n.children.length&&n.textContent.trim()===text&&visible(n));
 const info=n=>{const range=document.createRange();range.selectNodeContents(n);const r=range.getBoundingClientRect(),s=getComputedStyle(n);return{left:r.left,top:r.top,right:r.right,width:r.width,height:r.height,size:s.fontSize,weight:s.fontWeight,color:s.color};};
 const title=info(collection?document.querySelector('.apphub_AppName'):leaf('RimWorld'));
 const store=leaf('Store Page'),button=collection?store.parentElement:store,r=button.getBoundingClientRect(),s=getComputedStyle(button);
 const menu=['Install Steam','sign in','language'].map(t=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf(t),p=n.parentElement;if(i<0||!p||!visible(p)||p.getBoundingClientRect().top>50)continue;const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+t.length);const r=range.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height};}return null;});
 return{title,menu,nav:['All','Discussions','Screenshots','Artwork','Broadcasts','Videos','Workshop','News','Guides','Reviews'].map(t=>info(leaf(t))),store:{left:r.left,top:r.top,right:r.right,height:r.height,width:r.width,color:s.color,background:s.backgroundColor},client:document.documentElement.clientWidth};
 },collection);}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined);try{
 const p=await b.newPage(),reference=new Map();
 for(const width of [1920,1780,1200]){
  await p.setViewport({width,height:1050});await openBrowse(p,'https://steamcommunity.com/workshop/browse/?appid=294100');await p.evaluate(()=>document.fonts.ready);
  reference.set(width,await measure(p,false));
 }
 await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',{waitUntil:'domcontentloaded'});await p.waitForSelector('.wshs-design-collection');await p.evaluate(()=>document.fonts.ready);
 for(const width of reference.keys()){
  await p.setViewport({width,height:1050});await wait(120);const actual=await measure(p,true),expected=reference.get(width),offset=(actual.client-expected.client)/2;
  check(width+': title uses Workshop inset and typography',Math.abs(actual.title.left-expected.title.left-offset)<1&&Math.abs(actual.title.top-expected.title.top)<1&&actual.title.size===expected.title.size&&actual.title.weight===expected.title.weight);
  check(width+': Store Page matches Workshop position, size and colors',Math.abs(actual.store.right-expected.store.right-offset)<1&&Math.abs(actual.store.top-expected.store.top)<1&&Math.abs(actual.store.width-expected.store.width)<1&&actual.store.height===expected.store.height&&actual.store.color===expected.store.color&&actual.store.background===expected.store.background);
  // Firefox's native inline controls differ by up to two pixels in glyph bounds.
  const menuTolerance=firefox?2.1:1;
  const menuMatches=actual.menu.every((n,i)=>n&&expected.menu[i]&&Math.abs(n.left-expected.menu[i].left-offset)<menuTolerance&&Math.abs(n.top-expected.menu[i].top)<1);
  if(!menuMatches)console.log('Global menu bounds',{actual:actual.menu,expected:expected.menu});
  check(width+': top-right Steam controls match Workshop text positions',menuMatches);
  const navMatches=actual.nav.every((n,i)=>Math.abs(n.left-expected.nav[i].left-offset)<1&&Math.abs(n.top-expected.nav[i].top)<1&&n.size===expected.nav[i].size&&n.weight===expected.nav[i].weight);
  if(!navMatches)console.log('Navigation differences',actual.nav.map((n,i)=>({left:n.left-expected.nav[i].left-offset,top:n.top-expected.nav[i].top,size:n.size,expectedSize:expected.nav[i].size,weight:n.weight,expectedWeight:expected.nav[i].weight})));
  check(width+': navigation matches Workshop text positions and scale',navMatches);
  check(width+': Steam and collection content follow Workshop responsive gutters',await p.evaluate(()=>['#global_header .content','.apphub_HomeHeaderContent','.wshs-design-collection'].every((s,i)=>{const r=document.querySelector(s).getBoundingClientRect(),expected=Math.min(1700,document.documentElement.clientWidth-(i===0?32:48));return Math.abs(r.width-expected)<1&&Math.abs(r.left-(document.documentElement.clientWidth-expected)/2)<1;})));
 }
 await p.setViewport({width:1920,height:1050});await p.screenshot({path:'tests/out/collection-header-'+(firefox?'firefox':'chrome')+'.png'});
 console.log(checks+' live header comparison checks passed.');
 }finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
