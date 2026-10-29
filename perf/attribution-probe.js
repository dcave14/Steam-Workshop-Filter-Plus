// Style-recalc attribution: per-phase trace + CPU profile, extension vs native.
// Names the write (file:function:line) behind each recalc over 8ms, using
// Chrome invalidation tracking, plus forced layouts and extension JS time.
// node perf/attribution-probe.js --page collection|workshop --mode ext|native --tag name [--overlay <dir>]
// --overlay copies matching files from <dir> into the disposable extension copy.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { launch, closeBrowser, extensionWorld, openBrowse, wait } = require(ROOT + '/tests/browser-helpers');
const puppeteer = require('puppeteer-core');
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const pageName = opt('page', 'collection'), mode = opt('mode', 'ext'), tag = opt('tag', 'probe');
const OUT = path.join(ROOT, 'tests/out/performance'); fs.mkdirSync(OUT, { recursive: true });
const URLS = {
  workshop: 'https://steamcommunity.com/workshop/browse/?appid=294100&num_per_page=100',
  collection: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585'
};
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'v8.execute', 'blink.user_timing', 'disabled-by-default-devtools.timeline.invalidationTracking'];

function short(url) { return url ? url.split('/').pop().split('?')[0] || url : '(none)'; }

function analyzeTrace(events) {
  // Main page renderer = CrRendererMain thread with most style work.
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  const work = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !['UpdateLayoutTree', 'Layout'].includes(e.name)) continue;
    const k = e.pid + ':' + e.tid; if (names.get(k) !== 'CrRendererMain') continue;
    work.set(k, (work.get(k) || 0) + (e.dur || 0));
  }
  const main = [...work].sort((a, b) => b[1] - a[1])[0]?.[0];
  const r = { styleMs: 0, layoutMs: 0, paintMs: 0, styleCount: 0, layoutCount: 0, forcedStyleMs: 0, forcedLayoutMs: 0, forcedBy: {}, rafCallbacks: {}, observerMs: 0, longestTaskMs: 0 };
  if (!main) return r;
  for (const e of events) {
    if (e.pid + ':' + e.tid !== main || e.ph !== 'X') continue;
    const ms = (e.dur || 0) / 1000;
    if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') r.longestTaskMs = Math.max(r.longestTaskMs, ms);
    if (e.name === 'UpdateLayoutTree') { r.styleMs += ms; r.styleCount++; }
    if (e.name === 'Layout') { r.layoutMs += ms; r.layoutCount++; }
    if (e.name === 'Paint' || e.name === 'PrePaint' || e.name === 'Layerize') r.paintMs += ms;
    if (e.name === 'UpdateLayoutTree' || e.name === 'Layout') {
      const st = e.args?.beginData?.stackTrace;
      if (st && st.length) {
        if (e.name === 'Layout') r.forcedLayoutMs += ms; else r.forcedStyleMs += ms;
        const top = st.find(f => f.url && f.url.startsWith('chrome-extension://')) || st[0];
        const key = (top.url?.startsWith('chrome-extension://') ? '' : '[page] ') + short(top.url) + ':' + (top.functionName || '(anon)') + ':' + top.lineNumber;
        const b = r.forcedBy[key] || (r.forcedBy[key] = { ms: 0, n: 0 });
        b.ms += ms; b.n++;
      }
    }
  }
  for (const k of ['styleMs', 'layoutMs', 'paintMs', 'forcedStyleMs', 'forcedLayoutMs', 'longestTaskMs']) r[k] = +r[k].toFixed(1);
  r.forcedBy = Object.fromEntries(Object.entries(r.forcedBy).sort((a, b) => b[1].ms - a[1].ms).slice(0, 15).map(([k, v]) => [k, { ms: +v.ms.toFixed(1), n: v.n }]));
  // Big recalcs and the invalidations (with writer stack) that preceded each.
  const mainEv = events.filter(e => e.pid + ':' + e.tid === main).sort((a, b) => a.ts - b.ts);
  let pending = [];
  r.bigRecalcs = [];
  for (const e of mainEv) {
    if (/InvalidationTracking$/.test(e.name)) {
      const d = e.args?.data || {}; const st = d.stackTrace || [];
      const top = st.find(f => f.url && f.url.startsWith('chrome-extension://')) || st[0];
      pending.push((d.reason || d.changedClass || d.changedAttribute || e.name) + ' @ ' + (top ? (top.url?.startsWith('chrome-extension://') ? '' : '[page] ') + short(top.url) + ':' + (top.functionName || '(anon)') + ':' + top.lineNumber : '(no stack)') + (d.nodeName ? ' <' + d.nodeName.slice(0, 40) + '>' : ''));
    } else if (e.name === 'UpdateLayoutTree' && e.ph === 'X') {
      const count = e.args?.elementCount || 0, ms = (e.dur || 0) / 1000;
      if (ms > 8) {
        const causes = {}; for (const c of pending) causes[c] = (causes[c] || 0) + 1;
        r.bigRecalcs.push({ ms: +ms.toFixed(1), elements: count, causes: Object.entries(causes).sort((a, b) => (/:has|inserted|Removed from tree|Node was/i.test(b[0]) - /:has|inserted|Removed from tree|Node was/i.test(a[0])) || b[1] - a[1]).slice(0, 6) });
      }
      pending = [];
    }
  }
  return r;
}

function analyzeProfile(profile) {
  // Self time per extension file/function, plus inclusive time per file
  // (sample counted once for each extension file anywhere on its stack).
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const dt = profile.timeDeltas || [], self = {}, incl = {};
  let total = 0;
  (profile.samples || []).forEach((id, i) => {
    const ms = (dt[i + 1] ?? dt[i] ?? 1000) / 1000;
    const n = nodes.get(id); if (!n) return;
    const fn = n.callFrame;
    if (fn.url.startsWith('chrome-extension://')) { const k = short(fn.url) + ':' + (fn.functionName || '(anon)'); self[k] = (self[k] || 0) + ms; }
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const u = nodes.get(cur).callFrame.url;
      if (u.startsWith('chrome-extension://')) seen.add(short(u));
    }
    for (const f of seen) incl[f] = (incl[f] || 0) + ms;
    if (seen.size) total += ms;
  });
  const top = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]));
  return { extensionJsMs: +total.toFixed(1), inclusiveByFile: top(incl, 20), selfByFunction: top(self, 20) };
}

(async () => {
  const b = mode === 'native'
    ? await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, protocolTimeout: 60000 })
    : await launch(undefined, { useConfiguredService: true, protocolTimeout: 60000, sourceOverlay: opt('overlay', null) });
  try { require('os').setPriority(b.process().pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {}
  const result = { page: pageName, mode, at: new Date().toISOString(), phases: {} };
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1780, height: 1050 });
    const errors = []; p.on('pageerror', e => { if (!e.message.includes('WebAssembly')) errors.push(e.message); });
    const url = URLS[pageName];
    if (mode === 'ext') {
      if (pageName === 'workshop') await openBrowse(p, url);
      else { await p.goto(url, { waitUntil: 'load', timeout: 60000 }); await p.waitForSelector('.wshs-design-items', { timeout: 30000 }); }
      const w = await extensionWorld(p);
      await w("chrome.storage.local.set({pinnedSidebar:true,pinnedWorkshopBar:true,pinnedCollections:true,layoutDensity:'comfortable',sidebarPosition:'right'})");
      if (pageName === 'collection') await p.waitForFunction(() => document.querySelector('.wshs-collection-sizes')?.getAttribute('aria-busy') === 'false', { timeout: 30000 }).catch(() => {});
    } else {
      await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    }
    await p.evaluate(() => document.fonts.ready); await wait(3000);
    result.rows = await p.evaluate(() => document.querySelectorAll('.collectionItem').length || document.querySelectorAll('#CommunityTemplate a[href*="/myworkshopfiles"]').length);

    const cdp = await p.createCDPSession();
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    async function phase(name, fn) {
      const traceFile = path.join(OUT, `${tag}-${pageName}-${mode}-${name}.trace.json`);
      await cdp.send('Profiler.start');
      await p.tracing.start({ path: traceFile, categories: CATS });
      const a = await p.metrics(), t = Date.now();
      const extra = await fn();
      const d = await p.metrics();
      await p.tracing.stop();
      const { profile } = await cdp.send('Profiler.stop');
      const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
      result.phases[name] = {
        wallMs: Date.now() - t,
        metrics: { taskMs: +((d.TaskDuration - a.TaskDuration) * 1000).toFixed(1), scriptMs: +((d.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1), styleMs: +((d.RecalcStyleDuration - a.RecalcStyleDuration) * 1000).toFixed(1), layoutMs: +((d.LayoutDuration - a.LayoutDuration) * 1000).toFixed(1), styleRecalcs: d.RecalcStyleCount - a.RecalcStyleCount, layouts: d.LayoutCount - a.LayoutCount },
        trace: analyzeTrace(trace.traceEvents || trace),
        js: analyzeProfile(profile), ...(extra || {})
      };
      fs.unlinkSync(traceFile);
    }
    await phase('idle', () => wait(1500));
    await phase('scroll', () => p.evaluate(async () => { const gaps = []; let last = performance.now(); for (let i = 0; i < 16; i++) { scrollTo(0, i < 8 ? (i + 1) * 300 : (15 - i) * 300); await new Promise(requestAnimationFrame); const now = performance.now(); gaps.push(now - last); last = now; } return { maxFrameMs: +Math.max(...gaps).toFixed(1) }; }));
    await wait(300);
    const authorSel = pageName === 'collection'
      ? '.collectionItem .workshopItemAuthorName a'
      : (mode === 'ext' ? '.wshs-card-author a' : '#CommunityTemplate a[href*="/myworkshopfiles"]');
    await phase('hover', async () => {
      const ns = await p.$$(authorSel);
      for (const n of ns.slice(0, 4)) { await n.hover(); await wait(100); }
      await p.mouse.move(0, 0); await wait(150);
      return { hovered: Math.min(4, ns.length) };
    });
    // Mouse sweep across rows: approximates real cursor travel, where Steam's
    // native hover popup follows the pointer.
    await phase('sweep', async () => {
      const box = await p.evaluate(() => { const r = (document.querySelector('.collectionItem') || document.querySelector('#CommunityTemplate a[href*="/myworkshopfiles"]')).getBoundingClientRect(); return { x: r.left + Math.min(200, r.width / 2), y: Math.max(20, r.top) }; });
      for (let i = 0; i < 40; i++) { await p.mouse.move(box.x + (i % 10) * 15, box.y + i * 12); await wait(16); }
      await p.mouse.move(0, 0); await wait(150);
    });
    if (mode === 'ext') {
      await phase('filters', async () => { await p.$eval('[data-stars="5"]', n => n.click()); await wait(300); await p.$eval('[data-stars="0"]', n => n.click()); await wait(300); });
    }
    result.errors = errors;
  } finally { await closeBrowser(b); }
  const file = path.join(OUT, `${tag}-${pageName}-${mode}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log('wrote ' + file);
})().catch(e => { console.error(e); process.exitCode = 1; });
