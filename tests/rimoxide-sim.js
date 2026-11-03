// Manual harness: a visible test Chrome with this extension loaded (SteamCMD
// downloads on) that behaves like RimOxide's built-in browser. Every page gets
// data-rimoxide-host="1", and links to download.rimoxide.invalid open a
// simulated preview showing the appid, ids and title RimOxide would receive.
// Usage: node tests/rimoxide-sim.js            (RimOxide simulation)
//        node tests/rimoxide-sim.js --plain    (ordinary browser, no marker)
//        node tests/rimoxide-sim.js --verify   (headless self-check, then exit)
const {launch} = require('./browser-helpers');

function preview(url) {
    const u = new URL(url), ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const valid = u.searchParams.get('appid') === '294100' && ids.length > 0 && ids.length <= 2500 && ids.every(id => /^\d+$/.test(id));
    return `<!doctype html><meta charset="utf-8"><title>RimOxide preview (simulated)</title>
<style>body{font:14px Arial;background:#1b2838;color:#c6d4df;margin:30px}h1{color:#fff;font-size:20px}.tag{background:#5c7e10;color:#fff;padding:2px 8px;border-radius:2px}.bad{background:#a33}li{margin:2px 0}a{color:#67c1f5}code{background:#0006;padding:2px 4px}</style>
<h1>RimOxide SteamCMD download preview <span class="tag ${valid ? '' : 'bad'}">${valid ? 'accepted' : 'rejected'}</span></h1>
<p>Simulated by the test harness. RimOxide intercepts this link before any request is made.</p>
<p><b>Title:</b> ${esc(u.searchParams.get('title') || '')}<br><b>App:</b> ${esc(u.searchParams.get('appid'))}<br><b>Mods:</b> ${ids.length}</p>
<ol>${ids.map(id => `<li><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${id}" target="_blank">${id}</a></li>`).join('')}</ol>
<p><b>Raw link:</b> <code>${esc(url)}</code></p>`;
}

// --plain: an ordinary browser (no marker), for Copy command / Save .bat.
const plain = process.argv.includes('--plain');

async function prepare(page) {
    if (!page || page.wshsRimoxide || plain) return;
    page.wshsRimoxide = true;
    // <html> does not exist yet at document start; mark it as soon as it does.
    await page.evaluateOnNewDocument(() => {
        const mark = () => document.documentElement && (document.documentElement.dataset.rimoxideHost = '1');
        // Tab titles say which window this is.
        document.addEventListener('DOMContentLoaded', () => { document.title = '[RimOxide sim] ' + document.title; });
        if (!mark()) new MutationObserver((_, o) => { if (mark()) o.disconnect(); }).observe(document, {childList: true});
    });
    await page.setRequestInterception(true);
    page.on('request', r => {
        if (r.url().startsWith('https://download.rimoxide.invalid/')) r.respond({status: 200, contentType: 'text/html', body: preview(r.url())});
        else r.continue();
    });
    // A new tab may start navigating before interception is ready; load it again.
    const url = page.url();
    if (url.includes('rimoxide.invalid') || url.startsWith('chrome-error://')) await page.goto(url.startsWith('chrome-error://') ? page.wshsPending : url).catch(() => {});
}

(async () => {
    const verify = process.argv.includes('--verify');
    const b = await launch(undefined, {headless: !verify ? false : true, defaultViewport: null, args: ['--start-maximized'], presentationPreferences: {steamcmdButtons: true}});
    b.on('targetcreated', async t => {
        if (t.type() !== 'page') return;
        const page = await t.page().catch(() => null);
        if (page) { page.wshsPending = t.url(); await prepare(page).catch(() => {}); }
    });
    const [first] = await b.pages();
    const pages = [first || await b.newPage(), await b.newPage(), await b.newPage(), await b.newPage()];
    for (const p of pages) await prepare(p);
    await pages[0].goto('https://steamcommunity.com/workshop/browse/?appid=294100&searchtext=Tavern&browsesort=textsearch&section=readytouseitems', {waitUntil: 'domcontentloaded'});
    await pages[1].goto('https://steamcommunity.com/sharedfiles/filedetails/?id=2023507013', {waitUntil: 'domcontentloaded'});
    await pages[2].goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3826899645', {waitUntil: 'domcontentloaded'});
    // Ferny's Progression Modpack: linked Content and Cosmetics parts.
    await pages[3].goto('https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585', {waitUntil: 'domcontentloaded'});
    await pages[3].bringToFront();
    console.log('READY ' + (plain ? 'plain' : 'rimoxide') + ' marker=' + await pages[3].evaluate(() => document.documentElement.dataset.rimoxideHost));
    if (verify) {
        // Headless self-check: item page -> popover -> RimOxide -> simulated preview.
        const p = pages[1];await p.bringToFront();await p.waitForSelector('.wshs-steamcmd-item', {timeout: 30000});await p.click('.wshs-steamcmd-item');
        await p.waitForFunction(() => /Include|No required|could not/.test(document.querySelector('.wshs-steamcmd-deps span')?.textContent || ''), {timeout: 30000});
        console.log('button: ' + await p.$eval('.wshs-steamcmd-rimoxide', n => n.hidden ? 'hidden' : n.textContent));
        const before = new Set(b.targets());
        await p.click('.wshs-steamcmd-rimoxide');
        let tp = null;
        for (let i = 0; i < 40 && !tp; i++) {
            await new Promise(r => setTimeout(r, 250));
            for (const t of b.targets()) if (!before.has(t) && t.type() === 'page') { const pg = await t.page(); if (pg && /rimoxide\.invalid/.test(pg.url())) tp = pg; }
        }if (tp) { await new Promise(r => setTimeout(r, 1500)); console.log('preview: ' + (await tp.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 260)); }
        else console.log('preview: no tab');
        await b.close();
    }
    b.on('disconnected', () => process.exit(0));
})().catch(e => { console.error(e); process.exit(1); });
