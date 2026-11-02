const assert = require('assert/strict');
const {launch, closeBrowser, extensionWorld, openBrowse, wait} = require('./browser-helpers');
const {toolbarState} = require('./toolbar-layout-helpers');
const sortSelector = '[data-wshs-toolbar-layout] svg[viewBox="0 0 32 18"]';
let checks = 0;
function check(name, value, diagnostic) {
    if (!value && diagnostic) console.log(JSON.stringify(diagnostic));
    assert.ok(value, name); checks++; console.log('PASS ' + name);
}
function popupState() {
    const root = document.querySelector('.wshs-sort-popover');
    if (!root) return null;
    const rect = n => {const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const box=root.firstElementChild, bounds=rect(root), panel=rect(box);
    const sort=document.querySelector('[data-wshs-toolbar-layout] svg[viewBox="0 0 32 18"]').closest('button,[role="button"]');
    const radios=[...root.querySelectorAll('[role="radio"]')];
    const labels=radios.map(n=>n.querySelector('span')).filter(Boolean);
    const styleValues=(n,keys)=>{const s=getComputedStyle(n);return Object.fromEntries(keys.map(k=>[k,s[k]]));};
    const surfaceKeys=['backgroundColor','backgroundImage','backdropFilter','boxShadow','border','borderRadius','fontFamily','fontSize','fontWeight','color','padding','clipPath'];
    // Sort options intentionally use smaller text below underlined headings.
    const optionKeys=['fontFamily','fontWeight','color','lineHeight','padding','backgroundColor','textAlign','cursor'];
    const reference=document.querySelector('.wshs-new-layout-controls .star-dropdown-content');
    const surface=styleValues(box,surfaceKeys),referenceSurface=styleValues(reference,surfaceKeys);
    const option=styleValues(radios[0],optionKeys),referenceOption=styleValues(reference.querySelector('.star-option'),optionKeys);
    const headings=[...root.querySelectorAll('[role="radiogroup"]')].map(n=>n.previousElementSibling);
    const buttonFont=parseFloat(getComputedStyle(sort).fontSize),headingSize=Math.min(11,buttonFont),optionSize=Math.min(10,headingSize-1);
    const headingsFit=headings.every(n=>{const s=getComputedStyle(n);return Math.abs(parseFloat(s.fontSize)-headingSize)<.01&&s.textDecorationLine.includes('underline');});
    const center=n=>{const r=rect(n);return(r.left+r.right)/2;};
    const centerOffsets=[];
    function inkCentered(n,expected){
        // Exclude trailing spaces when measuring visible words on each line.
        const lines=[],walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);
        for(let text=walker.nextNode();text;text=walker.nextNode())for(const word of text.nodeValue.matchAll(/\S+/g)){
            const range=document.createRange();range.setStart(text,word.index);range.setEnd(text,word.index+word[0].length);
            for(const r of range.getClientRects()){let line=lines.find(l=>Math.abs(l.top-r.top)<1);if(!line)lines.push(line={top:r.top,left:r.left,right:r.right});else{line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.right);}}
        }
        const offsets=lines.map(l=>(l.left+l.right)/2-expected);
        if(offsets.some(d=>Math.abs(d)>1))centerOffsets.push({text:n.textContent,offsets});
        return offsets.every(d=>Math.abs(d)<=1);
    }
    const contentCenterOffset=center(box.firstElementChild)-center(sort);
    const singleSection=headings.length===1;
    const sectionCenter=n=>singleSection?center(sort):center(n);
    const singleFullWidth=!singleSection||Math.abs(rect(headings[0].parentElement).width-rect(box.firstElementChild).width)<1;
    const textCentered=singleFullWidth&&Math.abs(contentCenterOffset)<=1&&headings.every(n=>inkCentered(n,sectionCenter(n.parentElement)))&&labels.every(n=>inkCentered(n,sectionCenter(n.closest('[role="radiogroup"]').parentElement)));
    return {
        mode:root.getAttribute('data-wshs-sort-layout'), bounds, button:rect(sort),
        surface,referenceSurface,option,referenceOption,textCentered,contentCenterOffset,centerOffsets,buttonFont,headingSize,optionSize,singleSection,singleFullWidth,
        contentGeometry:{box:rect(box),grid:rect(box.firstElementChild),boxMinWidth:getComputedStyle(box).minWidth,boxDisplay:getComputedStyle(box).display,gridStyle:box.firstElementChild.getAttribute('style'),gridColumns:getComputedStyle(box.firstElementChild).gridTemplateColumns,scrollLeft:box.scrollLeft,scrollWidth:box.scrollWidth,clientWidth:box.clientWidth},
        stylesMatch:surfaceKeys.every(k=>surface[k]===referenceSurface[k])&&optionKeys.every(k=>option[k]===referenceOption[k]),
        viewportFit:bounds.left>=-1&&bounds.right<=innerWidth+1&&bounds.top>=-1&&bounds.bottom<=innerHeight+1,
        horizontalFit:panel.left>=bounds.left-1&&panel.right<=bounds.right+1&&box.scrollWidth<=box.clientWidth+1&&radios.every(n=>{const r=rect(n);return r.left>=panel.left-1&&r.right<=panel.right+1;}),
        labelsFit:headingsFit&&labels.length===radios.length&&labels.every(n=>{const r=rect(n);return r.left>=panel.left-1&&r.right<=panel.right+1&&Math.abs(parseFloat(getComputedStyle(n).fontSize)-optionSize)<.01;}),
        options:radios.map(n=>n.textContent.trim()),
        selected:radios.filter(n=>n.getAttribute('aria-checked')==='true').map(n=>n.textContent.trim())
    };
}
(async()=>{
    const firefox=process.argv.includes('--firefox');
    const comfortable=process.argv.includes('--comfortable');
    const seeded={layoutDensity:comfortable?'comfortable':'compact',sidebarPosition:comfortable?'left':'right'};
    const browser=await launch(firefox?'firefox':undefined,firefox?{presentationPreferences:seeded}:{});
    try {
        const page=await browser.newPage();await page.setViewport({width:1780,height:1000});
        const errors=[],siteDiagnostics=[];page.on('pageerror',e=>{
            // Steam also emits this CSP diagnostic with no extension installed.
            // Firefox reports failed third-party thumbnail decodes as page errors.
            // Keep every other runtime/CSP/hydration error actionable.
            const nativeCsp=firefox&&e.message.startsWith('Content-Security-Policy:')&&e.message.includes('blocked WebAssembly (script-src)')&&e.message.includes('https://steamcommunity.com/_ssr/modules/');
            const nativeImage=firefox&&e.message==='Image corrupt or truncated.';
            (nativeCsp||nativeImage?siteDiagnostics:errors).push(e.message);
        });
        async function openMenu() {
            if (!await page.$('.wshs-sort-popover')) {
                await page.$eval(sortSelector,n=>n.closest('button,[role="button"]').scrollIntoView({block:'center'}));
                await page.$eval(sortSelector,n=>n.closest('button,[role="button"]').click());
            }
            await page.waitForSelector('.wshs-sort-popover');await wait(120);
        }
        for (const surface of ['items','collections']) {
            await page.setViewport({width:1780,height:1000});
            await openBrowse(page,'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend'+(surface==='collections'?'&section=collections':''));
            const world=!firefox&&await extensionWorld(page);
            for (const density of firefox?[seeded.layoutDensity]:['comfortable','compact']) for (const side of firefox?[seeded.sidebarPosition]:['left','right']) {
                if (world) await world('chrome.storage.local.set('+JSON.stringify({layoutDensity:density,sidebarPosition:side,pinnedSidebar:false,pinnedWorkshopBar:false})+')');
                await wait(250);
                for (const width of [1780,1435,1200,900,420,1780]) {
                    await page.setViewport({width,height:1000});await wait(200);await openMenu();
                    const state=await page.evaluate(popupState),name=surface+' '+density+' '+side+' '+width;
                    check(name+': popup width follows its button while open',state&&Math.abs(state.bounds.width-state.button.width)<1,state);
                    check(name+': popup fits, centers its text and matches the other dropdown styles',state.viewportFit&&state.horizontalFit&&state.labelsFit&&state.stylesMatch&&state.textCentered,state);
                    check(name+': narrow sections stack and wide sections use columns',state.mode===(state.button.width>=280?'columns':'stacked'),state);
                    const toolbar=await page.evaluate(toolbarState);
                    check(name+': mirrored search row fits and sort text clears icons',toolbar.searchReset&&toolbar.searchAligned&&toolbar.sortLabelFits,toolbar);
                }
                await page.$$eval('.wshs-sort-popover [role="radio"]',ns=>ns.find(n=>n.textContent.trim()==='Three Months').click());
                await page.waitForFunction(()=>new URL(location.href).searchParams.get('days')==='90');
                await wait(200);check(surface+' '+density+' '+side+': native timeframe callback and relabel survive',await page.$eval(sortSelector,n=>n.closest('button,[role="button"]').textContent.includes('Three Months')));
                await openMenu();check(surface+' '+density+' '+side+': native selected radio survives reopening',(await page.evaluate(popupState)).selected.includes('Three Months'));
                await page.keyboard.press('Escape');
                if (world) {
                    await world('chrome.storage.local.set({pinnedSidebar:true,pinnedWorkshopBar:true})');
                    await page.setViewport({width:1435,height:1000});await page.evaluate(()=>scrollTo(0,1200));
                    await page.waitForSelector('.wshs-pinned-filter-bar');await openMenu();
                    const pinned=await page.evaluate(popupState);
                    check(surface+' '+density+' '+side+': open popup follows the pinned toolbar',pinned.viewportFit&&pinned.labelsFit&&Math.abs(pinned.bounds.width-pinned.button.width)<1,pinned);
                    await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));
                }
            }
            await page.keyboard.press('Escape');
            if(world)await world("chrome.storage.local.set({layoutDensity:'comfortable',sidebarPosition:'left',pinnedSidebar:false,pinnedWorkshopBar:false})");
            await wait(200);
            for(const width of [1100,420]){
                await page.setViewport({width,height:1000});await wait(200);await openMenu();
                const sortLabels=await page.$eval('.wshs-sort-popover [role="radiogroup"]',n=>[...n.querySelectorAll('[role="radio"]')].map(r=>r.textContent.trim()));
                for(const label of sortLabels){
                    await page.$eval('.wshs-sort-popover [role="radiogroup"]',(n,label)=>[...n.querySelectorAll('[role="radio"]')].find(r=>r.textContent.trim()===label).click(),label);
                    await wait(200);await openMenu();
                    const state=await page.evaluate(popupState);
                    check(surface+' '+width+' '+label+': every native sort mode centers its visible sections',state.viewportFit&&state.horizontalFit&&state.labelsFit&&state.stylesMatch&&state.textCentered&&state.selected.includes(label),state);
                }
                await page.$eval('.wshs-sort-popover [role="radiogroup"]',(n,label)=>[...n.querySelectorAll('[role="radio"]')].find(r=>r.textContent.trim()===label).click(),sortLabels[0]);await wait(200);
            }
        }
        if(siteDiagnostics.length)console.log('NOTE '+siteDiagnostics.length+' native Steam Firefox CSP/image diagnostics recorded separately.');
        check('no unexpected dropdown or hydration errors',errors.length===0,errors);
        console.log(checks+' '+(firefox?'Firefox':'Chrome')+' responsive sort popup checks passed.');
    } finally {await closeBrowser(browser);}
})().catch(e=>{console.error(e);process.exitCode=1;});
