const assert=require('assert/strict'),path=require('path');
const {launch,closeBrowser,openBrowse,wait,BASE_URL,setWordMode,clickTitleWord}=require('./browser-helpers');
let checks=0;function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch();let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1600,height:1000});
  await openBrowse(page,BASE_URL+'&search_text_target=1&searchtext=workbenches');
  const reference=await page.evaluate(()=>Number(document.body.innerText.match(/([\d,]+) entries matching/)[1].replace(/,/g,'')));
  const target=await page.evaluate(()=>{
   const a=[...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))')].find(a=>/\bworkbenches\b/i.test(a.textContent));
   if(!a)return null;a.dataset.wshsTestWord='true';const words=[...a.textContent.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu)];
   return {index:words.findIndex(w=>/^workbenches$/i.test(w[0]))};
  });
  check('live Steam has a plural Workbenches title',!!target);
  await setWordMode(page,true);
  await clickTitleWord(page,'[data-wshs-test-word]',target.index);
  check('clicked Workbenches becomes Workbench',await page.$eval('.wshs-picker',p=>p.dataset.word.toLowerCase()==='workbench'));
  check('selected underline covers the stem, not the full title or es',await page.evaluate(()=>{
   const h=CSS.highlights.get('wshs-selected-word');return h&&h.size===1&&[...h][0].toString().toLowerCase()==='workbench'&&getComputedStyle(document.querySelector('[data-wshs-test-word]')).textDecorationLine==='none';
  }));
  check('hover underline is limited to the hovered word',await page.evaluate(()=>{
   const h=CSS.highlights.get('wshs-hover-word');return h&&h.size===1&&[...h][0].toString().toLowerCase()==='workbench';
  }));
  await page.mouse.move(5,5);await wait(400);
  check('leaving removes hover underline but retains selected underline and controls',await page.evaluate(()=>!CSS.highlights.has('wshs-hover-word')&&CSS.highlights.has('wshs-selected-word')&&getComputedStyle(document.querySelector('.wshs-picker')).display!=='none'));
  await page.screenshot({path:path.join(__dirname,'out/title-word-workbench.png')});
  await page.click('.wshs-picker [data-action="only"]');await wait(3500);
  check('sidebar saves the singular word',await page.$eval('.wshs-sf-label',e=>e.textContent.toLowerCase()==='workbench'));
  check('singular title search keeps plural title matches',await page.evaluate(reference=>{
   const count=Number(document.body.innerText.match(/([\d,]+) entries matching/)[1].replace(/,/g,''));
   const plural=[...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))')].some(a=>/\bworkbenches\b/i.test(a.textContent));
   return Math.abs(count-reference)<=2&&plural;
  },reference));
  console.log(checks+' live title-word checks passed.');
 }catch(error){if(page)await page.screenshot({path:path.join(__dirname,'out/title-word-failure.png')});throw error}
 finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
