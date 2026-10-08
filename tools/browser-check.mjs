/**
 * 无头浏览器验收 v0.3
 *
 * 覆盖这一轮的四项改动：
 *   1. 页面精简：面板数量收敛，DOM 节点数受控
 *   2. 丝滑拖拽：拖拽期间不重建 DOM、用 transform、rAF 节流
 *   3. 伤害引导：商店 DPS、详情 DPS 拆解、构筑总览、新手引导条
 *   4. 背包出售：拖到出售区卖出、详情按钮卖出
 *
 * 用法：
 *   node tools/browser-check.mjs
 *   REMOTE_URL=http://218.13.157.146:19991/ node tools/browser-check.mjs
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = 8849;
const OUT = join(ROOT, 'art', 'verify');
const CHROME = process.env.CHROME_PATH
  || join(process.env.HOME, '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const REMOTE_URL = process.env.REMOTE_URL || '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let p = join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname === '/') p = join(ROOT, 'index.html');
    if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

await mkdir(OUT, { recursive: true });
const PAGE_URL = REMOTE_URL || `http://localhost:${PORT}/`;
if (REMOTE_URL) console.log(`远端验收模式：${REMOTE_URL}`);
else { await new Promise((r) => server.listen(PORT, r)); console.log(`本地服务：http://localhost:${PORT}`); }

const profileDir = join(OUT, 'chrome-profile');
await rm(profileDir, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`,
  '--window-size=1500,1100', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (p) => (await fetch(`http://127.0.0.1:9333${p}`)).json();
async function waitForDevtools(t = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { return await fetchJson('/json/version'); } catch { await sleep(400); } }
  throw new Error('DevTools 没起来');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { resolve, reject } = c.pending.get(m.id);
        c.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    return c;
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时 ${method}`)); } }, timeoutMs);
    });
  }
  async eval(expr, awaitPromise = false, timeoutMs = 30000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, timeoutMs);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(OUT, name), Buffer.from(r.data, 'base64'));
  }
  async metrics() {
    return this.send('Performance.getMetrics');
  }
}

const version = await waitForDevtools();
console.log(`Chrome: ${version.Browser}`);
const targets = await fetchJson('/json/list');
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('about:blank')) || targets.find((t) => t.type === 'page');
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Log.enable');
await cdp.send('Performance.enable');

const errors = [];
cdp.ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push('未捕获异常: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error: ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('log.error: ' + m.params.entry.text + ' @ ' + (m.params.entry.url || ''));
  }
});

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

await cdp.send('Page.navigate', { url: PAGE_URL });
await sleep(2000);

// ============ 1. 页面精简 ============
console.log('\n— 页面精简');
ok('标题正确', String(await cdp.eval('document.title')).includes('背包乱斗'));
ok('职业弹窗出现', await cdp.eval('!document.getElementById("overlay").classList.contains("hidden")'));
await cdp.eval('document.querySelector(".class-card[data-class=\\"warrior\\"]").click()');
await sleep(500);

const panels = await cdp.eval('document.querySelectorAll(".panel").length');
ok('面板数量收敛到 7 个以内', panels <= 7, `${panels} 个`);

const domNodes = await cdp.eval('document.querySelectorAll("*").length');
ok('DOM 节点总数受控（< 700）', domNodes < 700, `${domNodes} 个`);

const topStats = await cdp.eval('document.querySelectorAll("#stats .stat").length');
ok('顶栏只留 5 项数值', topStats === 5, `${topStats}`);
ok('出售区存在', await cdp.eval('!!document.getElementById("sell-zone")'));
ok('引导条存在', await cdp.eval('!!document.getElementById("guide") && document.getElementById("guide").innerText.length > 4'));

// 一级/二级页面结构
ok('一级页面存在', await cdp.eval('!!document.getElementById("page-shop")'));
ok('二级页面存在', await cdp.eval('!!document.getElementById("page-battle")'));
ok('开局停在二级页面之外', await cdp.eval('document.getElementById("page-battle").classList.contains("hidden")'));
ok('没有「升级商店」按钮', await cdp.eval('!document.getElementById("btn-upgrade")'));
ok('商店品质自动显示', await cdp.eval('document.getElementById("shop-quality").innerText.length > 2'));
await cdp.shot('01-精简后的页面.png');

// ============ 2. 伤害引导 ============
console.log('\n— 伤害引导');
const guideText = String(await cdp.eval('document.getElementById("guide").innerText'));
ok('引导条给出下一步动作', guideText.includes('武器') || guideText.includes('摆'), guideText);

// 商店里未必每次都刷出武器，刷新几轮确认「武器卡片会显示每秒伤害」
const shopDps = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 12; i++) {
      const n = document.querySelectorAll('#shop .dps').length;
      if (n > 0) return n;
      const rf = document.getElementById('btn-refresh');
      if (rf && !rf.disabled) rf.click();
      await sleep(120);
    }
    return document.querySelectorAll('#shop .dps').length;
  })()
`, true);
ok('商店卡片显示每秒伤害', shopDps >= 1, `${shopDps} 张`);

// 商店一次摆 6 件
const shopCount = await cdp.eval('document.querySelectorAll("#shop .shop-card").length');
ok('商店一次陈列 6 件', shopCount === 6, `${shopCount} 件`);

// 买一件武器，检查详情里的 DPS 拆解
const boughtWeapon = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 12; i++) {
      const cards = [...document.querySelectorAll('#shop .shop-card')];
      const w = cards.find(c => c.querySelector('.dps') && !c.classList.contains('sold'));
      if (w) { w.click(); await sleep(150); return true; }
      const rf = document.getElementById('btn-refresh');
      if (rf && !rf.disabled) rf.click();
      await sleep(120);
    }
    return false;
  })()
`, true);
ok('能买到武器', boughtWeapon);
await sleep(300);
// 选中背包里的武器（pointerup 要派发在元素上：v0.4 用 pointer capture，事件不再走 window）
await cdp.eval(`
  (() => {
    const el = document.querySelector('#board .shape-item.cat-weapon') || document.querySelector('#board .shape-item');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 9 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 9 }));
    return true;
  })()
`);
await sleep(350);
const detailText = String(await cdp.eval('document.getElementById("detail").innerText'));
ok('详情显示每秒伤害', detailText.includes('每秒伤害'), detailText.slice(0, 60));
ok('详情解释伤害构成', detailText.includes('基础伤害') || detailText.includes('÷'), detailText.slice(0, 80));
ok('详情显示出手顺序与起手时间', detailText.includes('出手顺序') && detailText.includes('起手'));
ok('详情有卖出按钮', await cdp.eval('!!document.getElementById("btn-sell-one")'));

const ovText = String(await cdp.eval('document.getElementById("overview").innerText'));
ok('角色属性面板显示每秒伤害', ovText.includes('每秒伤害'), ovText.slice(0, 60));
ok('角色属性面板显示护甲与武器数', ovText.includes('护甲') && ovText.includes('武器件数'));
await cdp.shot('02-伤害引导.png');

// ============ 3. 拖拽丝滑度 ============
console.log('\n— 拖拽');

// 先记录拖拽前的 DOM 节点身份，验证拖拽期间没有重建
const dragTest = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const board = document.getElementById('board');
    const all = [...board.querySelectorAll('.shape-item')];
    if (!all.length) return { error: 'no items' };

    // 挑一件能移动的（形状 1 格或 2 格的更宽松）
    const el = all[0];
    const uid = el.dataset.uid;
    el.dataset.marker = 'before-drag';

    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;

    // 记录拖拽过程中该元素是否被替换（标记还在 = 没重建）
    const samples = [];
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    await sleep(50);

    for (let i = 1; i <= 10; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + i * 10, clientY: y + i * 8, pointerId: 1 }));
      await sleep(16);
    }

    const during = document.querySelector('#board .shape-item[data-uid="' + uid + '"]');
    samples.push({
      markerKept: during?.dataset.marker === 'before-drag',
      transform: during?.style.transform || '',
      hasDraggingClass: during?.classList.contains('dragging') || false,
      itemCount: board.querySelectorAll('.shape-item').length,
    });

    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 100, clientY: y + 80, pointerId: 1 }));
    await sleep(200);
    return { uid, samples };
  })()
`, true);
ok('拖拽能找到道具', !dragTest.error, JSON.stringify(dragTest));
if (!dragTest.error) {
  const s = dragTest.samples[0];
  ok('拖拽期间不重建 DOM（元素标记保留）', s.markerKept, JSON.stringify(s));
  ok('拖拽用 transform 移动', s.transform.includes('translate3d'), s.transform);
  ok('拖拽中带 dragging 状态类', s.hasDraggingClass);
}

// 悬停高亮只影响少数格子
const hoverTest = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const board = document.getElementById('board');
    const el = board.querySelector('.shape-item');
    if (!el) return { error: 'none' };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const cellsBefore = board.querySelectorAll('.cellbg').length;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 2 }));
    await sleep(40);
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 60, clientY: y + 60, pointerId: 2 }));
    await sleep(60);
    const highlighted = board.querySelectorAll('.cellbg.hover-ok, .cellbg.hover-bad').length;
    const cellsAfter = board.querySelectorAll('.cellbg').length;
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 60, clientY: y + 60, pointerId: 2 }));
    await sleep(200);
    return { highlighted, cellsBefore, cellsAfter };
  })()
`, true);
if (!hoverTest.error) {
  ok('拖拽高亮只覆盖形状那么多格', hoverTest.highlighted > 0 && hoverTest.highlighted <= 8, JSON.stringify(hoverTest));
  ok('拖拽期间格子数不变（没重建整块网格）', hoverTest.cellsBefore === hoverTest.cellsAfter,
    `${hoverTest.cellsBefore} → ${hoverTest.cellsAfter}`);
}

// 帧率抽样：连续 pointermove 期间的帧间隔
const fpsTest = await cdp.eval(`
  (async () => {
    const board = document.getElementById('board');
    const el = board.querySelector('.shape-item');
    if (!el) return { error: 'none' };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const frames = [];
    let last = performance.now();
    let stop = false;
    const tick = (t) => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 3 }));
    for (let i = 0; i < 40; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + (i % 8) * 12, clientY: y + (i % 6) * 10, pointerId: 3 }));
      await new Promise(r2 => setTimeout(r2, 12));
    }
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 3 }));
    stop = true;
    await new Promise(r2 => setTimeout(r2, 60));
    const gaps = frames.slice(2);
    const avg = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
    const worst = Math.max(...gaps, 0);
    return { count: gaps.length, avg, worst, sample: gaps.slice(0, 8).map(v => +v.toFixed(1)) };
  })()
`, true);
if (!fpsTest.error) {
  ok('拖拽期间平均帧间隔正常（< 40ms）', fpsTest.avg < 40, `平均 ${fpsTest.avg?.toFixed(1)}ms`);
  ok('无严重掉帧（最坏 < 150ms）', fpsTest.worst < 150, `最坏 ${fpsTest.worst?.toFixed(1)}ms`);
  console.log(`    帧间隔：平均 ${fpsTest.avg?.toFixed(1)}ms，最坏 ${fpsTest.worst?.toFixed(1)}ms，样本 ${fpsTest.count}`);
}

// ============ 4. 出售 ============
console.log('\n— 背包出售');
const sellByDrag = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const board = document.getElementById('board');
    const zone = document.getElementById('sell-zone');
    const before = board.querySelectorAll('.shape-item').length;
    if (!before) return { error: 'no items' };
    const el = board.querySelector('.shape-item');
    const uid = el.dataset.uid;
    const r = el.getBoundingClientRect();
    const zr = zone.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const zx = zr.left + zr.width / 2, zy = zr.top + zr.height / 2;

    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 4 }));
    await sleep(40);
    for (let i = 1; i <= 6; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerId: 4,
        clientX: x + (zx - x) * i / 6, clientY: y + (zy - y) * i / 6,
      }));
      await sleep(20);
    }
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: zx, clientY: zy, pointerId: 4 }));
    await sleep(300);
    const after = board.querySelectorAll('.shape-item').length;
    return { uid, before, after, gone: !board.querySelector('.shape-item[data-uid="' + uid + '"]') };
  })()
`, true);
if (!sellByDrag.error) {
  ok('拖到出售区能卖出', sellByDrag.gone && sellByDrag.after < sellByDrag.before,
    JSON.stringify(sellByDrag));
}

// 详情按钮卖出
const goldBefore = await cdp.eval('Number(document.querySelector("#stats .stat.gold b").textContent)');
await cdp.eval(`
  (() => {
    const el = document.querySelector('#board .shape-item');
    if (!el) return;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  })()
`);
await sleep(250);
const hasSellBtn = await cdp.eval('!!document.getElementById("btn-sell-one")');
if (hasSellBtn) {
  const cntBefore = await cdp.eval('document.querySelectorAll("#board .shape-item").length');
  await cdp.eval('document.getElementById("btn-sell-one").click()');
  await sleep(300);
  const cntAfter = await cdp.eval('document.querySelectorAll("#board .shape-item").length');
  const goldAfter = await cdp.eval('Number(document.querySelector("#stats .stat.gold b").textContent)');
  ok('详情按钮能卖出', cntAfter < cntBefore, `${cntBefore} → ${cntAfter}`);
  ok('卖出后金币增加', goldAfter > goldBefore, `${goldBefore} → ${goldAfter}`);
} else {
  ok('详情按钮能卖出', false, '按钮没出现');
}
await cdp.shot('03-出售与总览.png');

// ============ 5. 完整一局（回归） ============
console.log('\n— 完整一局回归');
const finished = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 260; i++) {
      const overlay = document.getElementById('overlay');
      if (!overlay.classList.contains('hidden')) {
        if (document.getElementById('ov-again')) return 'over:' + document.getElementById('overlay-body').innerText.slice(0, 60);
        const branch = document.querySelector('.class-card[data-branch]');
        if (branch) { branch.click(); await sleep(120); continue; }
        const okb = document.getElementById('ov-ok');
        if (okb) { okb.click(); await sleep(120); continue; }
        const st = document.getElementById('ov-start');
        if (st) { st.click(); await sleep(120); continue; }
        const cl = document.querySelector('.class-card[data-class]');
        if (cl) { cl.click(); await sleep(150); continue; }
      }
      const btn = document.getElementById('btn-battle');
      // 战斗在二级页面演出，直接点「跳过」加速回归
      const battlePage = !document.getElementById('page-battle').classList.contains('hidden');
      if (battlePage) {
        const skip = document.getElementById('skip-btn');
        if (skip) skip.click();
        await sleep(150);
        continue;
      }
      if (btn && !btn.disabled) {
        const cards = [...document.querySelectorAll('#shop .shop-card')];
        for (const c of cards) { if (!c.classList.contains('sold')) c.click(); }
        await sleep(60);
        btn.click();
        await sleep(300);
      } else await sleep(150);
    }
    return 'timeout';
  })()
`, true, 170000);
ok('能自动跑到本局结束', String(finished).startsWith('over:'), String(finished).slice(0, 80));
await cdp.shot('04-结算.png');

// ============ 6. 健康度 ============
console.log('\n— 运行健康度');
const realErrors = errors.filter((e) => !/favicon|net::ERR_FILE|404|Failed to load resource/i.test(e));
ok('全程无 JS 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

const m = await cdp.metrics();
const metric = (n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
console.log(`    Layout ${metric('LayoutCount')} 次 · RecalcStyle ${metric('RecalcStyleCount')} 次 · 节点 ${metric('Nodes')}`);

await writeFile(join(OUT, 'report.json'), JSON.stringify({
  chrome: version.Browser, pass, fail, errors, dragTest, hoverTest, fpsTest, sellByDrag,
  layoutCount: metric('LayoutCount'), recalcCount: metric('RecalcStyleCount'), nodes: metric('Nodes'),
}, null, 2));

console.log(`\n${'='.repeat(48)}`);
console.log(`浏览器验收：通过 ${pass}，失败 ${fail}`);
console.log(`截图与报告：${OUT}`);

chrome.kill('SIGTERM');
server.close();
process.exit(fail ? 1 : 0);
