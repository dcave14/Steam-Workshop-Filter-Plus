const assert=require('assert/strict');
const {launch,closeBrowser,extensionWorld,wait,addSavedFilter,clickTitleWord}=require('./browser-helpers');
const {fixture}=require('./filter-fixtures');
const image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"%3E%3Crect width="1200" height="300" fill="%23354b60"/%3E%3C/svg%3E';
function designFixture(){
 const base=fixture(true),content=base.slice(base.indexOf('<body>')+6,base.indexOf('</body>'));
 const awards=Array.from({length:36},(_,i)=>`<div class="review_award" data-reactioncount="${100-i}" onclick="window.nativeCalls.push('award')"><img class="review_award_icon" src='${image}'><span class="review_award_count">${100-i}</span></div>`).join('');
 return base.replace(content,`<div id="ig_bottom" class="smallheader nobg"><div id="mainContentsCollectionTop"><nav class="sharedfiles_tabs_ctn"><a href="?id=3521297585">Description</a><a href="/workshop/filedetails/discussions/3521297585">Discussions</a><a href="/workshop/filedetails/comments/3521297585">Comments</a></nav><div class="collectionTop"><div class="collectionHeader"><div class="workshopItemTitle">An image-heavy collection with a fairly long title</div><div class="ratingSection"><div class="fileRatingDetails"><img src='${image}'></div><div class="numRatings">6,933 ratings</div></div></div></div><div class="collectionControls"><div id="ItemControls"><div class="review_award_ctn">${awards}</div><button class="general_btn" onclick="window.nativeCalls.push('vote')">Rate ↑</button><button class="general_btn" onclick="window.nativeCalls.push('share')">Share</button></div></div><div class="collection"><section class="workshopItemDetails"><div class="workshopItemDescriptionForCollection"><div class="workshopItemDescription" id="highlightContent"><p>Image-rich collection description.</p><img src='${image}'><p>${'Long description content. '.repeat(350)}</p><a href="https://example.com/guide">Author guide</a></div></div></section>${content}<section class="commentthread_comment_text">AI appears in this comment.</section></div></div><aside class="sidebar responsive_local_menu"><div class="panel"><div class="rightDetailsBlock"><div class="collectionItemAuthor"><a href="/profiles/76561198000000000/myworkshopfiles?appid=294100">Fixture Creator</a></div></div></div><div class="panel"><div class="creatorsBlock"><div><a class="friendBlockLinkOverlay" href="/profiles/76561198000000000"></a><div class="friendBlockContent">Fixture Creator<br>Offline</div></div></div></div><div class="panel"><div class="detailsStatLeft">123</div><div class="detailsStatRight">Unique Visitors</div></div></aside></div><script>window.nativeCalls=[];</script><style>body{margin:0}#ig_bottom{width:950px;margin:auto}.collectionHeader{height:auto}.workshopItemDescription{line-height:24px}.subscribeCollection{width:100%}.collectionItem{box-sizing:border-box}.wshs-design-description .workshopItemDescription{line-height:24px}</style>`);
}
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
(async()=>{const firefox=process.argv.includes('--firefox'),b=await launch(firefox?'firefox':undefined);try{
 const p=await b.newPage();await p.setViewport({width:1600,height:1000});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setRequestInterception(true);p.on('request',r=>{
  if(r.isNavigationRequest()){const html=designFixture();return r.respond({status:200,contentType:'text/html',body:r.url().includes('banner=1')?html.replace('<div class="collectionTop">','<div class="collectionTop"><img class="collectionBackgroundImage" src=\''+image+'\'>'):html});}
  if(r.url().includes('GetUGCSummary'))return r.respond({status:200,contentType:'application/json',body:JSON.stringify({data:Array.from({length:8},(_,i)=>({publishedfileid:String(990000001+i),file_size:1000000*(i+1),total_votes:i*50}))})});
  return r.respond({status:200,contentType:'text/html',body:'<div id="RequiredItems"></div>'});
 });
 await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585');await p.waitForSelector('.wshs-design-collection');await wait(120);
 const world=!firefox&&await extensionWorld(p);
 check('collections without banner art retain the neutral header',!await p.$('.wshs-design-banner-art')&&await p.$eval('.wshs-design-hero',n=>!n.classList.contains('wshs-has-banner-art')));
 check('native rows and IDs survive the redesign',await p.$$eval('.wshs-design-items>.collectionItem',ns=>ns.length===8&&ns.every((n,i)=>n.id==='sharedfile_'+(990000001+i))));
 check('two rows of three controls retain native subscription handlers',await p.$eval('.subscribeCollection',n=>n.querySelectorAll(':scope>.general_btn').length===3&&n.querySelector('[onclick*="SubscribeCollection("]')&&n.querySelectorAll('.wshs-collection-controls .hide-subscribed-button').length===3));
 await p.click('#ItemControls button');check('moved native account control keeps its original handler',await p.evaluate(()=>nativeCalls.join()==='vote'));
 check('all awards remain available in one line',await p.$$eval('.wshs-design-awards .review_award',ns=>ns.length===36&&ns.every(n=>Math.abs(n.getBoundingClientRect().top-ns[0].getBoundingClientRect().top)<1)));
 check('actions sit under the byline; statistics keep their order',await p.evaluate(()=>{const c=document.getElementById('ItemControls');return c.parentElement.matches('.wshs-design-info')&&c.previousElementSibling?.matches('.wshs-design-byline')&&document.querySelector('.wshs-design-stats .detailsStatRight').textContent==='Unique Visitors';}));
 check('description starts collapsed with native rich content intact',await p.$eval('#highlightContent',n=>n.hidden&&!!n.querySelector('img')&&!!n.querySelector('a')));
 check('author list and mod authors retain profile links',await p.$$eval('.wshs-design-author-list a,.workshopItemAuthorName a',ns=>ns.length===9&&ns.every(n=>n.href.includes('/profiles/76561198000000000/myworkshopfiles'))));
 await p.click('.wshs-design-description-more');await p.$eval('.wshs-design-description',n=>n.scrollIntoView());await p.evaluate(()=>scrollBy(0,700));
 check('description collapse control stays visible during long content',await p.$eval('.wshs-design-description-toggle',n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}));
 await p.click('.wshs-design-description-toggle');
 check('collapse returns to the visible description and focuses Read full description',await p.$eval('.wshs-design-description-more',n=>n.getBoundingClientRect().top>=0&&n.getBoundingClientRect().bottom<innerHeight&&document.activeElement===n));
 await p.type('.wshs-design-search','station');await wait(150);
 check('search updates rendered counts',await p.$eval('.wshs-design-counts',n=>n.textContent.includes('1 shown')));
 check('search is included in the actual subscription plan',await p.$eval('[data-wshs-subscription-plan]',n=>JSON.parse(n.dataset.wshsSubscriptionPlan).allowed.length===1));
 await p.$eval('.wshs-design-search',n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});await wait(100);
 await addSavedFilter(p,'keyword','AI');await wait(180);
 check('whole-word saved exclusions hide AI and retain rain',await p.$$eval('.collectionItem',ns=>ns.filter(n=>n.classList.contains('wshs-filtered')).length===3&&ns.filter(n=>/Rain|Train/.test(n.textContent)).every(n=>!n.classList.contains('wshs-filtered'))));
 check('saved-filter count updates beside browsing heading',await p.$eval('.wshs-design-counts',n=>n.textContent.includes('3 hidden by saved filters')));
 await p.click('.wshs-sf-inspect');await wait(100);check('inspection uses the existing filter engine',await p.$$eval('.wshs-review-match',ns=>ns.length===3));await p.click('.wshs-review-exit');
 await p.click('.wshs-sf-delete');await wait(100);
 await p.hover('.wshs-design-author-list a');await p.waitForSelector('.wshs-picker',{visible:true});check('author list uses production Workshop controls',await p.$eval('.wshs-picker',n=>n.querySelectorAll('.wshs-sq').length===2&&!!n.querySelector('.wshs-picker-word-toggle + .wshs-picker-help')));
 await p.click('.wshs-picker [data-action="hide"]');await p.click('.wshs-picker [data-action="undo"]');await wait(2700);check('native author-picker undo cancels without hiding mods',await p.$$eval('.collectionItem.wshs-filtered',ns=>ns.length===0));
 await p.hover('.collectionItem .workshopItemAuthorName a');await p.click('.wshs-picker-word-toggle');
 const url=p.url();await clickTitleWord(p,'.collectionItem .workshopItemTitle',0);check('title-word controls use the real shared selection mode',p.url()===url&&await p.$eval('.wshs-picker',n=>!!n.querySelector('[data-action="hide"]')));await p.keyboard.press('Escape');
 await p.$eval('.collectionItem .subscriptionControls .general_btn',n=>{const copy=n.cloneNode(true);copy.classList.remove('toggled');n.replaceWith(copy);});await wait(100);
 check('replaced Steam subscribe buttons refresh cached labels',await p.$eval('.collectionItem .subscriptionControls .general_btn',n=>n.querySelector('.wshs-design-subscribe-label')?.textContent==='Subscribe'));
 await p.$eval('.collectionItem .subscriptionControls .general_btn',n=>n.classList.add('toggled'));await wait(100);
 check('subscription state changes refresh the new button without duplicate metadata',await p.$eval('.collectionItem',n=>n.querySelector('.wshs-design-subscribe-label').textContent==='Subscribed'&&n.querySelectorAll('.wshs-design-row-meta').length===1&&n.querySelectorAll('.wshs-design-row-number').length<=1));
 for(const width of [1600,1200,900,600,420]){
  await p.setViewport({width,height:1000});await wait(100);
  check(width+'px fits without horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(width+'px thumbnail and title remain separate',await p.$eval('.collectionItem',n=>{const image=n.querySelector('.workshopItemPreviewImage').getBoundingClientRect(),title=n.querySelector('.workshopItemTitle').getBoundingClientRect(),sub=n.querySelector('.subscriptionControls').getBoundingClientRect();return image.right<=title.left&&title.right<=sub.left;}));
 }
 if(world){await p.addStyleTag({content:'body{min-height:4000px}'});await p.setViewport({width:1600,height:1000});await world("chrome.storage.local.set({sidebarPosition:'right',pinnedSidebar:true,pinnedCollections:true,layoutDensity:'compact'})");await wait(150);await p.$eval('.subscribeCollection',n=>scrollTo(0,scrollY+n.getBoundingClientRect().top+500));await wait(150);check('popup preferences control collection side, density and pinning',await p.evaluate(()=>document.documentElement.dataset.wshsCollectionSide==='right'&&document.documentElement.classList.contains('wshs-collection-compact')&&!!document.querySelector('.subscribeCollection.wshs-pinned-filter-bar')));await p.click('.ratings-filter-button');check('pinned rating dropdown remains usable',await p.$eval('.wshs-ratings-menu',n=>n.classList.contains('show')));}
 await p.screenshot({path:'tests/out/collection-design-'+(firefox?'firefox':'chrome')+'.png'});
 await p.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585&banner=1');await p.waitForSelector('.wshs-design-banner-art');
 check('native art is preserved as a decorative background',await p.$eval('.wshs-design-banner-art',n=>n.src===document.querySelector('.collectionTop .collectionBackgroundImage').src&&n.alt===''&&n.getAttribute('aria-hidden')==='true'));
 await p.$eval('.wshs-design-banner-art',n=>n.src='data:image/png;base64,bm90LWFuLWltYWdl');await p.waitForFunction(()=>!document.querySelector('.wshs-design-banner-art'));
 check('unavailable art falls back to the neutral header with content intact',await p.$eval('.wshs-design-hero',n=>!n.classList.contains('wshs-has-banner-art')&&!!n.querySelector('.workshopItemTitle')));
 check('no page script errors',!errors.length);console.log(checks+' production collection design checks passed.');
 }finally{await closeBrowser(b);}})().catch(e=>{console.error(e);process.exitCode=1;});
