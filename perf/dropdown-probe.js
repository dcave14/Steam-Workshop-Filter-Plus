// Dropdown and settings latency: click-to-paint (Event Timing) for each filter
// dropdown action, and main-thread cost for popup setting changes, with the
// write behind each style recalc over 8ms (Chrome invalidation tracking).
// node perf/dropdown-probe.js --page collection|browseCollections --tag name [--overlay <dir>]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { launch, closeBrowser, extensionWorld, openBrowse, wait } = require(ROOT + '/tests/browser-helpers');
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const pageName = opt('page', 'collection'), tag = opt('tag', 'dropdown');
const OUT = path.join(ROOT, 'tests/out/performance'); fs.mkdirSync(OUT, { recursive: true });
const URLS = {
  collection: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585',
  browseCollections: 'https://steamcommunity.com/workshop/browse/?appid=294100&section=collections&num_per_page=50'
};
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.invalidationTracking'];
const short = url => url ? url.split('/').pop().split('?')[0] || url : '(none)';

function frameKey(st) {
  if (!st || !st.length) return '(no stack)';
  const top = st.find(f => f.url && f.url.startsWith('chrome-extension://')) || st[0];
  return (top.url?.startsWith('chrome-extension://') ? '' : '[page] ') + short(top.url) + ':' + (top.functionName || '(anon)') + ':' + top.lineNumber;
}

function analyze(events) {
  const names = new Map(), work = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  for (const e of events) if (e.ph === 'X' && e.name === 'UpdateLayoutTree' && names.get(e.pid + ':' + e.tid) === 'CrRendererMain') { const k = e.pid + ':' + e.tid; work.set(k, (work.get(k) || 0) + e.dur); }
  const main = [...work].sort((a, b) => b[1] - a[1])[0]?.[0];
  const r = { taskMs: 0, styleMs: 0, layoutMs: 0, paintMs: 0, scriptMs: 0, forced: {}, big: [] };
  if (!main) return r;
  const ev = events.filter(e => e.pid + ':' + e.tid === main).sort((a, b) => a.ts - b.ts);
  let pending = [];
  for (const e of ev) {
    const ms = (e.dur || 0) / 1000;
    if (e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask')) r.taskMs += ms;
    if (e.ph === 'X' && (e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'V8.RunMicrotasks')) r.scriptMs += ms;
    if (e.ph === 'X' && e.name === 'Layout') r.layoutMs += ms;
    if (e.ph === 'X' && /^(Paint|PrePaint|Layerize)$/.test(e.name)) r.paintMs += ms;
    if (e.ph === 'X' && (e.name === 'Layout' || e.name === 'UpdateLayoutTree') && e.args?.beginData?.stackTrace?.length) {
      const k = frameKey(e.args.beginData.stackTrace); const f = r.forced[k] || (r.forced[k] = { ms: 0, n: 0 }); f.ms += ms; f.n++;
    }
    if (/InvalidationTracking$/.test(e.name)) {
      const d = e.args?.data || {};
      pending.push((d.reason || d.changedClass || d.changedAttribute || e.name) + ' @ ' + frameKey(d.stackTrace) + (d.nodeName ? ' <' + d.nodeName.slice(0, 50) + '>' : ''));
    } else if (e.ph === 'X' && e.name === 'UpdateLayoutTree') {
      r.styleMs += ms;
      if (ms > 8) {
        const c = {}; for (const p of pending) c[p] = (c[p] || 0) + 1;
        const rank = s => /:has|inserted|Removed from tree/i.test(s) ? 1 : 0;
        r.big.push({ ms: +ms.toFixed(1), elements: e.args?.elementCount || 0, causes: Object.entries(c).sort((a, b) => rank(b[0]) - rank(a[0]) || b[1] - a[1]).slice(0, 4) });
      }
      pending = [];
    }
  }
  for (const k of ['taskMs', 'styleMs', 'layoutMs', 'paintMs', 'scriptMs']) r[k] = +r[k].toFixed(1);
  r.forced = Object.fromEntries(Object.entries(r.forced).sort((a, b) => b[1].ms - a[1].ms).slice(0, 5).map(([k, v]) => [k, { ms: +v.ms.toFixed(1), n: v.n }]));
  return r;
}

(async () => {
  const b = await launch(undefined, { useConfiguredService: true, protocolTimeout: 60000, sourceOverlay: opt('overlay', null) });
  try { require('os').setPriority(b.process().pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {}
  const result = { page: pageName, at: new Date().toISOString(), actions: [] };
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1780, height: 1050 });
    const errors = []; p.on('pageerror', e => { if (!e.message.includes('WebAssembly')) errors.push(e.message); });
    if (pageName === 'collection') { await p.goto(URLS.collection, { waitUntil: 'load', timeout: 60000 }); await p.waitForSelector('.wshs-design-items', { timeout: 30000 }); }
    else await p.goto(URLS[pageName], { waitUntil: 'load', timeout: 60000 });
    const w = await extensionWorld(p);
    await w("chrome.storage.local.set({pinnedSidebar:true,pinnedWorkshopBar:true,pinnedCollections:true,layoutDensity:'comfortable',sidebarPosition:'right',starFilter:0,minimumRatings:0,hideSubscribed:false,reduceMotion:false})");
    await p.waitForSelector('.star-filter-button', { timeout: 30000 });
    if (pageName === 'collection') await p.waitForFunction(() => document.querySelector('.wshs-collection-sizes')?.getAttribute('aria-busy') === 'false', { timeout: 30000 }).catch(() => {});
    await p.evaluate(() => document.fonts.ready); await wait(3000);
    result.rows = await p.evaluate(() => document.querySelectorAll('.collectionItem').length || document.querySelectorAll('.wshs-collection-browse-card').length);
    await p.evaluate(() => {
      window.__events = [];
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__events.push({ name: e.name, start: e.startTime, duration: e.duration, delay: e.processingStart - e.startTime, handler: e.processingEnd - e.processingStart, target: e.target ? (e.target.className || e.target.tagName) + '' : '' }); }).observe({ type: 'event', durationThreshold: 16, buffered: false });
    });
    async function action(name, fn, settleMs = 700) {
      const trace = path.join(OUT, `${tag}-${pageName}-trace.json`);
      await p.evaluate(() => { window.__events.length = 0; window.__mark = performance.now(); });
      await p.tracing.start({ path: trace, categories: CATS });
      const t = Date.now(); await fn(); await wait(settleMs);
      await p.tracing.stop();
      const events = await p.evaluate(() => window.__events.filter(e => e.start >= window.__mark));
      const clickish = events.filter(e => /pointerdown|pointerup|click|mousedown|mouseup|keydown/.test(e.name));
      const parsed = JSON.parse(fs.readFileSync(trace, 'utf8')); fs.unlinkSync(trace);
      const a = { action: name, clickToPaintMs: clickish.length ? Math.round(Math.max(...clickish.map(e => e.duration))) : '<16', handlerMs: clickish.length ? +Math.max(...clickish.map(e => e.handler)).toFixed(1) : 0, ...analyze(parsed.traceEvents || parsed) };
      result.actions.push(a);
      console.log(name.padEnd(34), 'clickToPaint', String(a.clickToPaintMs).padStart(4), 'task', String(a.taskMs).padStart(6), 'style', String(a.styleMs).padStart(6), 'layout', String(a.layoutMs).padStart(5), 'big', a.big.length);
    }
    const click = sel => p.click(sel);
    await p.$eval('.star-filter-button', n => n.scrollIntoView({ block: 'center' })); await wait(400);
    await action('open Star Rating dropdown', () => click('.star-filter-button'));
    await action('choose 5 Stars Only', () => click('.star-dropdown-content.show [data-stars="5"]'));
    await action('open Star Rating dropdown again', () => click('.star-filter-button'));
    await action('choose 3+ Stars', () => click('.star-dropdown-content.show [data-stars="3"]'));
    await action('open Star Rating dropdown again', () => click('.star-filter-button'));
    await action('choose Show All', () => click('.star-dropdown-content.show [data-stars="0"]'));
    await action('open Ratings dropdown', () => click('.ratings-filter-button'));
    await action('choose 100+ Ratings', () => click('.wshs-ratings-menu.show [data-ratings="100"]'));
    await action('open Ratings dropdown again', () => click('.ratings-filter-button'));
    await action('choose Any number', () => click('.wshs-ratings-menu.show [data-ratings="0"]'));
    await action('Hide Subscribed on', () => click('.hide-subscribed-button:not(.star-filter-button):not(.ratings-filter-button)'));
    await action('Hide Subscribed off', () => click('.hide-subscribed-button:not(.star-filter-button):not(.ratings-filter-button)'));
    await action('close dropdown by outside click', async () => { await click('.star-filter-button'); await wait(300); await p.mouse.click(5, 300); });
    // Popup settings, written the same way popup.js saves them.
    const set = v => () => w('chrome.storage.local.set(' + JSON.stringify(v) + ')');
    await action('setting: sidebar left', set({ sidebarPosition: 'left' }), 1000);
    await action('setting: sidebar right', set({ sidebarPosition: 'right' }), 1000);
    await action('setting: density compact', set({ layoutDensity: 'compact' }), 1000);
    await action('setting: density comfortable', set({ layoutDensity: 'comfortable' }), 1000);
    await action('setting: unpin sidebar', set({ pinnedSidebar: false }), 1000);
    await action('setting: pin sidebar', set({ pinnedSidebar: true }), 1000);
    await action('setting: reduce motion on', set({ reduceMotion: true }), 1000);
    await action('setting: reduce motion off', set({ reduceMotion: false }), 1000);
    result.errors = errors;
  } finally { await closeBrowser(b); }
  const file = path.join(OUT, `${tag}-${pageName}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log('rows ' + result.rows + ', errors ' + JSON.stringify(result.errors) + ', wrote ' + file);
})().catch(e => { console.error(e); process.exitCode = 1; });
