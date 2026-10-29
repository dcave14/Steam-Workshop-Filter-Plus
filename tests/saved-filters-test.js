// saved-filters-test.js
// End-to-end check of the saved keyword/author filters on the live RimWorld
// Workshop browse page, with the real extension in headless Chrome.
//
// Usage: node tests/saved-filters-test.js [--chrome <path>] [--out <dir>]
//        node build.js && node tests/saved-filters-test.js --firefox
// Needs the Puppeteer install in ../perf (cd perf && npm install).
// Writes screenshots to tests/out/ (or --out) and exits 1 on any failure.
//
// Result counts come from live Steam, which drifts by a few items a minute,
// so counts are compared to a reference within COUNT_TOLERANCE.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('../perf/node_modules/puppeteer-core');
const { closeBrowser, clickTitleWord, setWordMode, installFrameSampler } = require('./browser-helpers');

const args = process.argv.slice(2);
const arg = (name, def) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? def : args[i + 1];
};

const FIREFOX = args.includes('--firefox');
const CHROME = arg('chrome', FIREFOX ? 'C:/Program Files/Mozilla Firefox/firefox.exe' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const OUT = path.resolve(arg('out', path.join(__dirname, 'out', FIREFOX ? 'firefox' : 'chrome')));
const EXT_SRC = path.resolve(__dirname, '..');
const BASE_URL = 'https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&section=readytouseitems&days=7';
const PHRASE = 'vanilla';
const COUNT_TOLERANCE = 0.01;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function copyExtension() {
    // Chrome's Extensions.loadUnpacked rejects paths containing spaces.
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_SRC, 'manifest.json'), 'utf8'));
    if (FIREFOX) {
        manifest.browser_specific_settings = JSON.parse(fs.readFileSync(path.join(EXT_SRC, 'dist/firefox/manifest.json'), 'utf8')).browser_specific_settings;
        manifest.background = { scripts: ['api-config.js', 'api-data.js', 'steam-api.js'] };
    }
    const files = new Set(['manifest.json', ...Object.values(manifest.icons || {})]);
    ['steam-api.js','options.html','options.css','options.js','api-config.js','api-data.js'].forEach(f=>files.add(f));
    for (const script of manifest.content_scripts) {
        for (const f of [...(script.js || []), ...(script.css || [])]) files.add(f);
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshs-sf-'));
    for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.copyFileSync(path.join(EXT_SRC, f), path.join(dir, f));
    }
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
    return dir.split(path.sep).join('/');
}

async function count(page) {
    return page.evaluate(() => {
        const m = document.body.innerText.match(/([\d,]+) entries matching/);
        return m ? Number(m[1].replace(/,/g, '')) : null;
    });
}

function near(actual, expected) {
    return actual !== null && expected && Math.abs(actual - expected) <= expected * COUNT_TOLERANCE;
}

async function fetchedCount(page) {
    return page.evaluate(() => Number(document.documentElement.getAttribute('data-wshs-fetched') || 0));
}

// Waits for the hook to report a rewritten Browse response, then for the
// result count to settle.
async function waitForRefetch(page, before, label, expected) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && (await fetchedCount(page)) <= before) {
        if (expected !== undefined && near(await count(page),expected)) break;
        await wait(200);
    }
    const arrived = (await fetchedCount(page)) > before;
    let last = await count(page);
    for (let i = 0; i < 10; i++) {
        await wait(500);
        const now = await count(page);
        if (now === last) break;
        last = now;
    }
    if (!arrived) console.log('  note: no rewritten request seen for ' + label);
    return arrived;
}

async function openBrowse(page, url) {
    await page.goto(url || BASE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.hide-subscribed-button', { timeout: 30000 });
}

async function referenceCount(page, searchtext) {
    for (let attempt=0;attempt<3;attempt++) {
        await page.goto(BASE_URL + '&search_text_target=1&searchtext=' + encodeURIComponent(searchtext), { waitUntil: 'load', timeout: 60000 });
        await wait(2500);
        const n=await count(page);
        const serverError=await page.evaluate(()=>/There was a problem performing that action/.test(document.body.innerText));
        if(n>0&&!serverError)return n;
        if(attempt<2)await wait(2000*(attempt+1));
    }
    throw new Error('Steam reference query failed; cannot validate filters against empty error results');
}

async function searchBoxState(page) {
    return page.evaluate(() => {
        const input = [...document.querySelectorAll('#CommunityTemplate form input')]
            .find(i => /^(text|search)$/i.test(i.getAttribute('type') || 'text') && !i.closest('.wshs-saved-filters'));
        const blankChip = [...document.querySelectorAll('#CommunityTemplate *')].some(el =>
            el.offsetParent !== null && el.children.length === 0 && /"\s*"$/.test(el.textContent.trim()) &&
            el.textContent.trim().length < 60 && !el.closest('.wshs-saved-filters'));
        return { value: input ? input.value : null, url: location.href, blankChip };
    });
}

async function rowCount(page) {
    return page.evaluate(() => document.querySelectorAll('.wshs-sf-list > *').length);
}

async function shot(page, name) {
    const top = await page.evaluate(() => {
        const c = document.querySelector('.wshs-injected-controls');
        return c ? c.getBoundingClientRect().top + window.scrollY - 70 : 0;
    });
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: Math.max(0, top), width: 1600, height: 700 } });
}

async function samplePickerLeave(page, authorHref) {
    await installFrameSampler(page);
    await page.evaluate(href => {
        const range = !href && window.__wshsTestWordRange.cloneRange();
        const anchor = href && [...document.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===href);
        const samples=[];
        window.__pickerLeaveSamples=samples;
        const until=performance.now()+220;
        function sample() {
            const picker=document.querySelector('.wshs-picker');
            if(picker&&getComputedStyle(picker).display!=='none') {
                const a=href?anchor.getBoundingClientRect():range.getBoundingClientRect();
                const p=picker.getBoundingClientRect();
                let card=href?anchor:range.commonAncestorContainer;
                if(card.nodeType!==1)card=card.parentElement;
                while(card&&!card.querySelector('.aspectratio_16x9,.aspectratio_square'))card=card.parentElement;
                const c=card.getBoundingClientRect(),preview=card.querySelector('.aspectratio_16x9,.aspectratio_square').getBoundingClientRect();
                const x=href?a.right+8:Math.max(c.left+8,Math.min(a.left+a.width/2-p.width/2,c.right-p.width-8));
                const y=href?a.top+(a.height-p.height)/2:preview.bottom-p.height-6;
                samples.push({anchorY:a.top,error:Math.max(Math.abs(p.left-x),Math.abs(p.top-y))});
            }
            if(performance.now()<until)__wshsAfterFrame(sample);
        }
        sample();
    },authorHref||null);
    await page.mouse.move(5,5);
    await wait(230);
    return page.evaluate(()=>{
        const samples=window.__pickerLeaveSamples;
        return {frames:samples.length,maxError:Math.max(...samples.map(s=>s.error)),
            movement:Math.max(...samples.map(s=>s.anchorY))-Math.min(...samples.map(s=>s.anchorY))};
    });
}

function steamWasmCsp(message) {
    return /Content-Security-Policy/.test(message) && /WebAssembly/.test(message) &&
        /steamcommunity\.com\/_ssr\/modules\//.test(message) && /wasm-unsafe-eval/.test(message);
}

async function firefoxBaseline() {
    if (!FIREFOX) return false;
    const browser=await puppeteer.launch({browser:'firefox',executablePath:CHROME,headless:true,protocolTimeout:30000});
    let seen=false;
    try {
        const page=await browser.newPage();
        page.on('pageerror',error=>{if(steamWasmCsp(error.message))seen=true});
        await page.goto(BASE_URL,{waitUntil:'load',timeout:60000});
        await wait(500);
    } finally {await closeBrowser(browser);}
    if(seen)console.log('Steam baseline: WebAssembly CSP errors also occur with no extension installed.');
    return seen;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const baselineWasmError=await firefoxBaseline();
    const browser = await puppeteer.launch({
        browser: FIREFOX ? 'firefox' : 'chrome',
        executablePath: CHROME,
        headless: true,
        pipe: true,
        protocolTimeout: 30000,
        enableExtensions: [copyExtension()]
    });
    const errors = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
        page.on('pageerror', e => {
            if(baselineWasmError&&steamWasmCsp(e.message))return;
            errors.push(e.message);
        });
        page.on('console', m => {
            if (m.type() === 'error' && /#418|hydrat|WSHS|saved-filters|search-terms-hook/i.test(m.text())) errors.push(m.text());
        });

        // References straight from Steam, before any filter is saved.
        const refBase = await referenceCount(page, '');
        const refHide = refBase; // Local exclusions preserve Steam's pagination/count.
        const refOnly = await referenceCount(page, '"' + PHRASE + '"');
        console.log('references: base=' + refBase + ' hide=' + refHide + ' only=' + refOnly);

        // 1. Section appears and starts empty.
        await openBrowse(page);
        const section = await page.waitForSelector('.wshs-saved-filters', { timeout: 15000 }).catch(() => null);
        check('sidebar section injected', section);
        check('section starts empty', (await rowCount(page)) === 0);
        const sectionAboveCategories = await page.evaluate(() => {
            const s = document.querySelector('.wshs-saved-filters');
            const next = s && s.nextElementSibling;
            return !!(next && next.querySelector('[role="button"] > svg[viewBox="0 0 14 14"]'));
        });
        check('section sits directly above Categories', sectionAboveCategories);
        check('help button sits after Save',await page.evaluate(()=>{
            const save=document.querySelector('.wshs-sf-save'),help=document.querySelector('.wshs-sf-help');
            return save.nextElementSibling===help&&help.getBoundingClientRect().left>=save.getBoundingClientRect().right;
        }));
        check('Save, phrase input and help have matching heights',await page.evaluate(()=>{
            const r=[...document.querySelector('.wshs-sf-add').children].map(e=>e.getBoundingClientRect());
            return Math.max(...r.map(x=>x.height))-Math.min(...r.map(x=>x.height))<.5&&Math.max(...r.map(x=>x.top))-Math.min(...r.map(x=>x.top))<.5;
        }));
        await page.click('.wshs-sf-help');
        check('help explains title-only matches and the controls',await page.evaluate(()=>{
            const p=document.querySelector('.wshs-sf-help-panel');
            return !p.hidden&&/whole words in titles/.test(p.textContent)&&/Click again to disable/.test(p.textContent)&&p.querySelectorAll('p').length===4&&p.textContent.split(/\s+/).length<60;
        }));
        await page.keyboard.press('Escape');
        check('Escape closes help',await page.$eval('.wshs-sf-help-panel',p=>p.hidden));

        // 2. Exclusions check local titles and leave Steam's count unchanged.
        const sortLabel = () => page.evaluate(() => {
            const b = [...document.querySelectorAll('div[role="button"][tabindex]')]
                .find(x => x.querySelector('svg[viewBox="0 0 32 18"]'));
            return b ? b.textContent.trim() : null;
        });
        const sortBefore = await sortLabel();
        let before = await fetchedCount(page);
        await page.type('.wshs-sf-input', PHRASE);
        await page.click('.wshs-sf-save');
        await waitForRefetch(page, before, 'add phrase',refHide);
        let n = await count(page);
        check('local exclusion preserves Steam result count', near(n, refHide), 'count=' + n + ' expected~' + refHide);
        check('excluded phrase is absent from visible titles',await page.evaluate(phrase=>![...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].filter(a=>!a.querySelector('img')&&a.offsetParent!==null).some(a=>a.textContent.toLowerCase().includes(phrase)),PHRASE));
        check('new row is in "-" state', (await rowCount(page)) === 1);
        let box = await searchBoxState(page);
        check('search box shows no filter text', box.value !== null && box.value.trim() === '', JSON.stringify(box.value));
        check('address bar has no filter text', !/searchtext=[^&]*vanilla/i.test(box.url), box.url);
        check('no blank "Results for" chip', !box.blankChip);
        const sortAfter = await sortLabel();
        check('sort order unchanged by the refetch', sortAfter === sortBefore, sortBefore + ' -> ' + sortAfter);
        await shot(page, 'sf-1-hide');

        // 3. "+" switches the row to show-only.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(1)');
        await waitForRefetch(page, before, 'plus',refOnly);
        n = await count(page);
        check('"+" shows only matches', near(n, refOnly), 'count=' + n + ' expected~' + refOnly);
        check('included phrase is present in every visible title',await page.evaluate(phrase=>{
            const titles=[...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].filter(a=>!a.querySelector('img')&&a.offsetParent!==null);
            return titles.length>0&&titles.every(a=>a.textContent.toLowerCase().includes(phrase));
        },PHRASE));

        // 4. Turning "+" off again leaves the filter saved but inactive.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(1)'); // + off
        await waitForRefetch(page, before, 'plus off',refBase);
        n = await count(page);
        check('turning "+" off restores all results', near(n, refBase), 'count=' + n + ' expected~' + refBase);

        // 5. Persistence and the first-load refetch.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-list > :first-child > :nth-child(2)'); // - on
        await waitForRefetch(page, before, 'minus',refHide);
        for (let reload=1;reload<=3;reload++) {
            await openBrowse(page);
            await page.waitForSelector('.wshs-sf-list > *', { timeout: 15000 }).catch(() => null);
            await waitForRefetch(page, 0, 'first load',refHide);
            n = await count(page);
            check('local filter survives reload '+reload+' without altering Steam count', near(n, refHide), 'count=' + n + ' expected~' + refHide);
            box = await searchBoxState(page);
            check('search box still clean after reload '+reload, box.value !== null && box.value.trim() === '' && !box.blankChip, JSON.stringify(box.value));
        }

        // 6. Delete removes the row and the filter.
        before = await fetchedCount(page);
        await page.click('.wshs-sf-delete');
        await waitForRefetch(page, before, 'delete',refBase);
        n = await count(page);
        check('delete removes the row', (await rowCount(page)) === 0);
        check('delete restores all results', near(n, refBase), 'count=' + n + ' expected~' + refBase);

        // 7. Author picker: hover shows [+][-] beside the name.
        const author = await page.evaluate(() => {
            const link = document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]');
            const href = link.getAttribute('href');
            const m = /\/(id|profiles)\/([^/?#]+)/.exec(href);
            return { href, key: (m[1] + '/' + m[2]).toLowerCase(), name: link.textContent.trim() };
        });
        const authorLink = await page.$('#CommunityTemplate a[href="' + author.href + '"]');
        await authorLink.hover();
        await wait(300);
        const picker = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return p && getComputedStyle(p).display !== 'none'
                ? { buttons: p.querySelectorAll('.wshs-sq').length, hint: p.textContent, help:!!p.querySelector('.wshs-picker-help svg') } : null;
        });
        check('author hover shows [+][-]', picker && picker.buttons === 2, JSON.stringify(picker));
        check('author picker uses a fixed question icon instead of helper text', picker && picker.help && picker.hint === '');
        await page.click('.wshs-picker-help');
        check('card question mark opens a usage explanation',await page.evaluate(()=>{
            const p=document.querySelector('.wshs-picker-guide');return !!p&&p.textContent==='+ Shows only matches\n− Hides matches\n☑ Enables clickable title words\nThe saved filter appears in sidebar';
        }));
        await page.click('.wshs-picker-help');
        check('card question mark closes its explanation',await page.evaluate(()=>!document.querySelector('.wshs-picker-guide')));
        await shot(page, 'sf-2-author-hover');
        await authorLink.hover();
        await wait(300);
        const authorMotion=await samplePickerLeave(page,author.href);
        check('author card moves on hover leave',authorMotion.movement>1,JSON.stringify(authorMotion));
        check('author picker follows every sampled leave frame',authorMotion.frames>3&&authorMotion.maxError<=.75,JSON.stringify(authorMotion));
        await wait(200);
        check('author picker still disappears after its normal leave delay',await page.evaluate(()=>getComputedStyle(document.querySelector('.wshs-picker')).display==='none'));
        await authorLink.hover();
        await wait(300);

        // 8. Card actions keep the original card until a 2.5-second undo window ends.
        await page.click('.wshs-picker .wshs-sq[data-action="hide"]');
        await wait(400);
        async function confirmationState() { return page.evaluate(href => {
            const links = [...document.querySelectorAll('#CommunityTemplate a[href="' + href + '"]')];
            const visible = links.filter(l => l.offsetParent !== null).length;
            const p = document.querySelector('.wshs-picker');
            let card=links[0];
            while(card&&!card.querySelector('.aspectratio_16x9, .aspectratio_square'))card=card.parentElement;
            const c=card?.getBoundingClientRect(),r=p?.getBoundingClientRect();
            return { total: links.length, visible, hint: p ? p.textContent : '',
                shown:!!p&&getComputedStyle(p).display!=='none',
                inside:!!c&&!!r&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom };
        }, author.href); }
        let pending=await confirmationState();
        check('minus keeps the original author cards visible during confirmation',pending.total>0&&pending.visible===pending.total,JSON.stringify(pending));
        check('confirmation fits inside the original card',pending.inside&&pending.hint==='Hiding… click to undo',JSON.stringify(pending));
        check('pending action is not saved to the sidebar yet',(await rowCount(page))===0);
        await page.click('.wshs-picker-hint[data-action="undo"]');
        await wait(2700);
        pending=await confirmationState();
        check('clicking confirmation undo cancels the timer and filter',pending.visible===pending.total&&!pending.shown&&(await rowCount(page))===0,JSON.stringify(pending));
        await authorLink.hover();
        await wait(300);
        await page.click('.wshs-picker .wshs-sq[data-action="hide"]');
        await page.mouse.move(5,5);
        await wait(2100);
        pending=await confirmationState();
        check('confirmation stays on its original card for at least two seconds after leaving',pending.shown&&pending.inside&&pending.visible===pending.total,JSON.stringify(pending));
        await shot(page,'sf-3-author-confirmation');
        await wait(700);
        const afterHide=await confirmationState();
        check('author "-" hides their cards after confirmation', afterHide.total > 0 && afterHide.visible === 0, JSON.stringify(afterHide));
        check('no confirmation transfers to the replacement mod',!afterHide.shown);
        const authorRow = await page.evaluate(() => [...document.querySelectorAll('.wshs-sf-label')].map(l => l.textContent));
        check('author row added to the sidebar', authorRow.some(t => t.startsWith('By ')), JSON.stringify(authorRow));
        await shot(page, 'sf-3-author-hidden');
        const pickerGone = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return !p || getComputedStyle(p).display === 'none';
        });
        check('picker closes after its card is hidden', pickerGone);

        await page.click('.wshs-sf-delete');
        await wait(300);
        await authorLink.hover();
        await wait(300);
        await page.click('.wshs-picker .wshs-sq[data-action="only"]');
        await wait(400);
        check('plus also waits before filtering or saving',await page.evaluate(()=>!document.querySelector('.wshs-filtered'))&&(await rowCount(page))===0);
        await wait(2400);
        check('plus applies after the confirmation and closes the picker',await page.evaluate(href=>{
            const links=[...document.querySelectorAll('#CommunityTemplate a[href*="/myworkshopfiles"]')].filter(l=>l.offsetParent!==null);
            return links.length>0&&links.every(l=>l.getAttribute('href')===href)&&getComputedStyle(document.querySelector('.wshs-picker')).display==='none';
        },author.href));
        await page.click('.wshs-sf-delete');
        await wait(300);

        // 9. Title selection is an explicit opt-in, off on each new page.
        await page.mouse.move(5, 5);
        await wait(400);
        check('word mode is off by default with no sidebar checkbox row',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-title-selection')&&!document.querySelector('.wshs-sf-title-mode')));
        await page.evaluate(()=>{
            const link=[...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].find(a=>!a.querySelector('img')&&a.offsetParent!==null);
            const range=document.createRange();range.selectNodeContents(link);
            const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
            link.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        });
        await wait(100);
        check('ordinary title selection shows no filtering controls',await page.evaluate(()=>getComputedStyle(document.querySelector('.wshs-picker')).display==='none'));
        await page.evaluate(()=>getSelection().removeAllRanges());
        await setWordMode(page,true);
        const urlBefore = page.url();
        const chosen=await clickTitleWord(page,'#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))');
        const sel = await page.evaluate(() => {
            const p = document.querySelector('.wshs-picker');
            return {
                text: window.getSelection().toString(),
                word: p && p.dataset.word,
                picker: p && getComputedStyle(p).display !== 'none' ? p.querySelectorAll('.wshs-sq').length : 0
            };
        });
        check('clicking a title word picks that word without manual selection',sel.word===chosen.word&&sel.text==='',JSON.stringify(sel));
        check('clicking a title word does not open the item', page.url() === urlBefore, page.url());
        check('clicked word shows [+][-]', sel.picker === 2, 'buttons=' + sel.picker);
        check('only the chosen word is highlighted, not the full title',await page.evaluate(word=>{
            const h=CSS.highlights.get('wshs-selected-word'),a=document.querySelector('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))');
            return h&&h.size===1&&[...h][0].toString()===word&&getComputedStyle(a).textDecorationLine==='none';
        },chosen.word));
        await page.mouse.move(5,5);await wait(500);
        check('word controls remain pinned after leaving the title',await page.evaluate(word=>{const p=document.querySelector('.wshs-picker');return getComputedStyle(p).display!=='none'&&p.dataset.word===word},chosen.word));
        const nextWord=await clickTitleWord(page,'#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]:not(:has(img))',1);
        check('clicking another title word moves the pinned filter target',nextWord.word!==chosen.word&&await page.evaluate(word=>document.querySelector('.wshs-picker').dataset.word===word,nextWord.word));
        await shot(page, 'sf-4-title-select');
        const titleMotion=await samplePickerLeave(page);
        check('selected title moves on hover leave',titleMotion.movement>1,JSON.stringify(titleMotion));
        check('title picker follows every sampled leave frame',titleMotion.frames>3&&titleMotion.maxError<=.75,JSON.stringify(titleMotion));

        before=await fetchedCount(page);
        await page.click('.wshs-picker .wshs-sq[data-action="hide"]');
        await wait(400);
        check('title action also waits and shows a bounded confirmation',await page.evaluate(()=>{
            const p=document.querySelector('.wshs-picker');return p.classList.contains('wshs-picker-confirmation')&&p.textContent==='Hiding… click to undo';
        })&&(await fetchedCount(page))===before&&(await rowCount(page))===0);
        await page.click('.wshs-picker-hint[data-action="undo"]');
        await wait(2700);
        check('undo title action sends no filtered request',(await fetchedCount(page))===before&&(await rowCount(page))===0);
        await setWordMode(page,false);
        check('turning title selection off restores normal link dragging',await page.evaluate(()=>!document.documentElement.classList.contains('wshs-title-selection')&&![...document.querySelectorAll('#CommunityTemplate a[href*="sharedfiles/filedetails/?id="]')].some(a=>!a.querySelector('img')&&a.getAttribute('draggable')==='false')));

        check('no page errors from the extension or hydration', errors.length === 0, errors.slice(0, 3).join(' | '));
    } catch (error) {
        check('test ran to completion', false, error && error.stack ? error.stack.split('\n').slice(0, 3).join(' ') : String(error));
    } finally {
        await closeBrowser(browser);
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed. Screenshots: ' + OUT);
    process.exit(failed ? 1 : 0);
})();
