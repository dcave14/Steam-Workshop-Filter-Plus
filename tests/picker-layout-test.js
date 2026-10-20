const fs=require('fs'),path=require('path');
const {launch,closeBrowser,openBrowse,wait,clickTitleWord,setWordMode}=require('./browser-helpers');
let checks=0;
function check(name,ok,detail){if(!ok)throw Error(name+' '+JSON.stringify(detail));checks++;console.log('PASS '+name);}
(async()=>{
 const browser=await launch();
 try{
  const page=await browser.newPage();
  await page.setViewport({width:1600,height:1000});await openBrowse(page);
  for(const width of [1600,1280,1024]){
   await page.setViewport({width,height:1000});await wait(300);
   for(const name of ['Rabiosus','A creator with a very long username that needs to be truncated','X'.repeat(200)]){
    await page.mouse.move(5,5);await wait(350);
    await page.evaluate(name=>{
     const a=document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]');a.textContent='By '+name;
    },name);
    await wait(100);
    const author=await page.$('#CommunityTemplate a[href*="/myworkshopfiles"]');await author.hover();await wait(350);
    const state=await page.evaluate(()=>{
     const a=document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]'),p=document.querySelector('.wshs-picker');
     let card=a;while(card&&!card.querySelector('.aspectratio_16x9,.aspectratio_square'))card=card.parentElement;
     const q=card.querySelector('.SVGIcon_MagnifyingGlass').closest('[role="button"]');
     const ar=a.getBoundingClientRect(),pr=p.getBoundingClientRect(),qr=q.getBoundingClientRect(),cr=card.getBoundingClientRect();
     return {gap:qr.left-pr.right,authorGap:pr.left-ar.right,centers:[ar.top+ar.height/2,pr.top+pr.height/2,qr.top+qr.height/2],inside:pr.left>=cr.left&&pr.right<=cr.right,text:p.textContent};
    });
    check(width+'px author controls avoid Quick View, length '+name.length,state.gap>=5&&state.authorGap>=7&&state.inside&&state.text==='',state);
    check(width+'px author, picker and Quick View share a center, length '+name.length,Math.max(...state.centers)-Math.min(...state.centers)<=.5,state);
    await page.click('.wshs-picker-help');
    check(width+'px help fits inside the card',await page.evaluate(()=>{
     const a=document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]');let card=a;while(card&&!card.querySelector('.aspectratio_16x9,.aspectratio_square'))card=card.parentElement;
     const c=card.getBoundingClientRect(),g=document.querySelector('.wshs-picker-guide').getBoundingClientRect();
     return g.left>=c.left&&g.right<=c.right&&getComputedStyle(card.querySelector('.wshs-card-actions')).opacity==='1';
    }));
    if(width===1280&&name.length>100){fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});await page.screenshot({path:path.join(__dirname,'out/picker-long-author.png')});}
    await page.click('.wshs-picker-help');
   }
   await page.mouse.move(5,5);await wait(350);
   await setWordMode(page,true);
   await clickTitleWord(page,'#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))');
   const titleState=await page.evaluate(()=>{
    const p=document.querySelector('.wshs-picker'),r=p.getBoundingClientRect(),a=window.__wshsTestWordRange.commonAncestorContainer.parentElement;
    let card=a;while(card&&!card.querySelector('.aspectratio_16x9,.aspectratio_square'))card=card.parentElement;
    const c=card.getBoundingClientRect(),stars=card.querySelector('.SVGIcon_Star_Filled,.SVGIcon_Star_Empty').parentElement.getBoundingClientRect();
    return {above:r.bottom<stars.top,inside:r.left>=c.left&&r.right<=c.right,text:p.textContent};
   });
   check(width+'px title picker avoids stars and stays inside the card',titleState.above&&titleState.inside&&titleState.text==='',titleState);
   if(width===1280)await page.screenshot({path:path.join(__dirname,'out/picker-title.png')});
   await setWordMode(page,false);
  }
  console.log(checks+' picker layout checks passed.');
 }finally{await closeBrowser(browser)}
})().catch(e=>{console.error(e);process.exitCode=1});
