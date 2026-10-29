// Deterministic observer and scrolling checks; all navigation/network is intercepted.
const assert = require('assert/strict');
const {launch, closeBrowser, extensionWorld, wait} = require('./browser-helpers');
const {fixture} = require('./filter-fixtures');
const sort = '<div class="fixture-sort"><div role="button" tabindex="0"><svg viewBox="0 0 32 18"></svg>Most Popular<svg viewBox="0 0 12 8"></svg></div></div>';
function browseFixture(collections) {
    let html = fixture(false).replace('<form onsubmit=', '<div class="fixture-toolbar"><div class="fixture-empty"><span></span></div><form onsubmit=')
        .replace('</form><aside>', '</form>'+sort+'<div role="combobox">Special Filters</div><button data-accent-color="blue">Filter by Date</button></div><aside>')
        .replace('</style>', '.fixture-toolbar{grid-column:1/-1;display:flex;gap:12px}.fixture-empty{width:0}.fixture-toolbar form{flex:none}body{min-height:2400px}</style>');
    if (collections) html = html.replaceAll('aspectratio_16x9', 'aspectratio_square');
    return html;
}
let checks = 0;
function check(name, value) { assert.ok(value, name); console.log('PASS '+name); checks++; }
(async () => {
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({width:1600,height:1000});
        await page.setRequestInterception(true);
        let body;
        page.on('request', request => request.isNavigationRequest() ? request.respond({status:200,contentType:'text/html',body}) : request.abort());
        for (const surface of ['items','collections','detail']) {
            body = surface === 'detail' ? fixture(true) : browseFixture(surface === 'collections');
            await page.goto(surface === 'detail' ? 'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585' : 'https://steamcommunity.com/workshop/browse/?appid=294100'+(surface === 'collections' ? '&section=collections' : ''));
            await page.waitForSelector('.hide-subscribed-button');
            await page.waitForSelector('.wshs-sf-input');
            const world = await extensionWorld(page);
            await wait(300);
            await world(`(() => {
                globalThis.domWorkCounts={full:0,width:0,geometry:0};
                globalThis.domWorkReasons=[];const relevant=containsRelevantDom;containsRelevantDom=function(node,selector){const result=relevant(node,selector);if(result)domWorkReasons.push(node.outerHTML?.slice(0,500));return result};
                const apply=applyFiltersIfNeeded;applyFiltersIfNeeded=function(){domWorkCounts.full++;return apply()};
                const sync=widthSync;widthSync=function(){domWorkCounts.width++;domWorkReasons.push(new Error().stack);if(sync)return sync()};
                const geometry=WSHSDom.getCardGeometry;WSHSDom.getCardGeometry=function(){domWorkCounts.geometry++;return geometry()};
            })()`);
            // Exercise realistic Steam hovers (including result-looking links),
            // Quick View in a portal wrapper, and plain text/author UI churn.
            await page.evaluate(() => {
                for (const id of ['workshop_item_hover','global_hover']) {
                    const hover=document.createElement('div');hover.id=id;
                    hover.innerHTML='<div class="workshopItem"><div class="aspectratio_16x9"><a href="/sharedfiles/filedetails/?id=66666666">Hover preview</a></div></div>';
                    document.body.append(hover);hover.append(document.createTextNode('Tooltip'));hover.remove();
                }
                const portal=document.createElement('div');portal.innerHTML='<dialog><div class="aspectratio_square"><a href="/sharedfiles/filedetails/?id=77777777">Dependency</a></div></dialog>';
                document.body.append(portal);portal.remove();
                const card=document.querySelector('.fixture-card,.collectionItem'),picker=document.createElement('div');picker.className='wshs-picker';
                card.append(picker);picker.textContent='Author tools';picker.remove();
                const tip=document.createElement('span');tip.textContent='Plain tooltip';card.append(tip);tip.remove();
            });
            await wait(150);
            if(!await world('domWorkCounts.full===0 && domWorkCounts.width===0 && domWorkCounts.geometry===0'))console.log(await world('({counts:domWorkCounts,reasons:domWorkReasons})'));
            check(surface+': hover and Quick View churn skip full filtering and geometry', await world('domWorkCounts.full===0 && domWorkCounts.width===0 && domWorkCounts.geometry===0'));
            for (const operation of ['insert','remove','replace']) {
                await world('domWorkCounts.full=0');
                await page.evaluate(operation => {
                    const card=document.querySelector('.fixture-card,.collectionItem');
                    if(operation==='insert'){const clone=card.cloneNode(true);clone.dataset.observerClone='1';card.after(clone)}
                    else if(operation==='remove')document.querySelector('[data-observer-clone]').remove();
                    else card.replaceWith(card.cloneNode(true));
                }, operation);
                await wait(120);
                check(surface+': result '+operation+' triggers filtering', await world('domWorkCounts.full>0'));
            }
            if(surface==='detail') continue;
            await page.waitForSelector('.wshs-sidebar-search');
            await world(`(() => {
                globalThis.sidebarCounts={discovery:0,style:0,decoration:0};
                const discover=WSHSDom.getSortButton;WSHSDom.getSortButton=function(){if(new Error().stack.includes('workshop-sidebar.js'))sidebarCounts.discovery++;return discover()};
                const set=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(name,value,...args){if(name.startsWith('--wshs-search-'))sidebarCounts.style++;return set.call(this,name,value,...args)};
                const query=Element.prototype.querySelector;Element.prototype.querySelector=function(selector){if(selector==='.hide-subscribed-button, svg[viewBox="0 0 32 18"]')sidebarCounts.decoration++;return query.call(this,selector)};
            })()`);
            // Synthetic scroll events keep geometry unchanged, so no style writes
            // or structural discovery should be needed even on repeated frames.
            for(let i=0;i<8;i++){await page.evaluate(()=>dispatchEvent(new Event('scroll')));await wait(30)}
            if(!await world('sidebarCounts.discovery===0 && sidebarCounts.decoration===0'))console.log(await world('sidebarCounts'));
            check(surface+': scrolling reuses sidebar anchors and toolbar preparation', await world('sidebarCounts.discovery===0 && sidebarCounts.decoration===0'));
            check(surface+': unchanged sidebar geometry performs no style writes', await world('sidebarCounts.style===0'));
            await page.$eval('.fixture-empty span', node => node.textContent='Native inserted control');
            await page.waitForFunction(()=>!document.querySelector('.fixture-empty').classList.contains('wshs-toolbar-empty'));
            check(surface+': text inserted into a decorated toolbar child becomes visible',true);
            await page.$eval('.fixture-sort', node => node.replaceWith(node.cloneNode(true)));
            await wait(150);
            check(surface+': sort replacement refreshes cached anchors',await world('sidebarCounts.discovery>0'));
            await page.evaluate(()=>{const pane=document.querySelector('.wshs-saved-filters').parentElement;pane.replaceWith(pane.cloneNode(true))});
            await wait(150);
            check(surface+': replacing the sidebar decorates the new connected search',await page.$eval('.wshs-sidebar-search', node=>node.isConnected));
            await world("chrome.storage.local.set({pinnedSidebar:true})");
            await page.waitForSelector('.wshs-sidebar-pane');
            await page.evaluate(()=>scrollTo(0,900));
            await page.waitForSelector('.wshs-search-fixed');
            check(surface+': cached sidebar still pins on actual scroll',true);
            await world("chrome.storage.local.set({pinnedSidebar:false})");
        }
        console.log(checks+' DOM work regression checks passed.');
    } finally { await closeBrowser(browser); }
})().catch(error => { console.error(error); process.exitCode=1; });
