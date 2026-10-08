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

// ============ 1. 选角色页（最上一级） ============
console.log('\n— 选角色页');
ok('标题正确', String(await cdp.eval('document.title')).includes('背包乱斗'));
ok('开局停在选角色页', await cdp.eval('!document.getElementById("page-class").classList.contains("hidden")'));
ok('整理页此时是隐藏的', await cdp.eval('document.getElementById("page-shop").classList.contains("hidden")'));

const pickCards = await cdp.eval('document.querySelectorAll("#pick-list .pick-card").length');
ok('列出 6 个角色', pickCards === 6, `${pickCards} 个`);
const pickCount = await cdp.eval('document.querySelectorAll(".pick-card").length');
ok('默认选中一个角色', pickCount >= 1 && await cdp.eval('document.querySelectorAll(".pick-card.on").length') === 1);

const pickInfo = await cdp.eval(`
  (() => ({
    name: document.getElementById('pick-name').textContent,
    hasArt: !!document.querySelector('#pick-art')?.src,
    stats: document.getElementById('pick-stats').innerText,
    items: document.querySelectorAll('#pick-items .pick-item').length,
    branches: document.querySelectorAll('#pick-branches .pick-branch').length,
  }))()
`);
ok('左侧显示角色名', pickInfo.name.length > 0, pickInfo.name);
ok('左侧显示角色立绘', pickInfo.hasArt);
ok('左侧显示属性表', pickInfo.stats.includes('生命'), pickInfo.stats.slice(0, 40));
ok('右侧显示初始携带', pickInfo.items >= 1, `${pickInfo.items} 件`);
ok('右侧显示可走分支', pickInfo.branches === 2, `${pickInfo.branches} 个`);
// 选角色页：放大立绘 + 角色符号 + 正中开始按钮
const pickLook = await cdp.eval(`
  (() => {
    const art = document.getElementById('pick-art');
    const syms = document.querySelectorAll('#pick-symbols .psym');
    const start = document.getElementById('btn-pick-start');
    if (!art || !start) return null;
    const r = art.getBoundingClientRect(), sr = start.getBoundingClientRect();
    return {
      artW: Math.round(r.width),
      symbols: syms.length,
      symOn: document.querySelectorAll('#pick-symbols .psym.on').length,
      startW: Math.round(sr.width),
      startLeft: Math.round(sr.left), startRight: Math.round(sr.right),
      winW: window.innerWidth,
    };
  })()
`);
ok('选角色立绘放大到 200px 以上', pickLook && pickLook.artW >= 200, `${pickLook?.artW}px`);
ok('每个角色都有一个小符号', pickLook && pickLook.symbols === 6, `${pickLook?.symbols} 个`);
ok('当前角色符号高亮唯一', pickLook && pickLook.symOn === 1, `${pickLook?.symOn} 个`);
ok('开始按钮在画面正中',
  pickLook && Math.abs((pickLook.startLeft + pickLook.startRight) / 2 - pickLook.winW / 2) < 40,
  `按钮中心 ${pickLook && Math.round((pickLook.startLeft + pickLook.startRight) / 2)} / 窗宽 ${pickLook?.winW}`);

await cdp.shot('00-选角色页.png');

// 换选一个角色，左侧要跟着变
const switchOk = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const before = document.getElementById('pick-name').textContent;
    const target = [...document.querySelectorAll('.pick-card')].find(c => c.dataset.class === 'warrior');
    target.click();
    await sleep(250);
    return {
      before,
      after: document.getElementById('pick-name').textContent,
      onCount: document.querySelectorAll('.pick-card.on').length,
    };
  })()
`, true);
ok('点角色卡能切换选中', switchOk.before !== switchOk.after, JSON.stringify(switchOk));
ok('切换后仍只有一个选中', switchOk.onCount === 1, `${switchOk.onCount}`);

// 开局进入整理页
await cdp.eval('document.getElementById("btn-pick-start").click()');
await sleep(600);
ok('点开局进入整理页', await cdp.eval('!document.getElementById("page-shop").classList.contains("hidden")'));
ok('整理页打开后选角色页隐藏', await cdp.eval('document.getElementById("page-class").classList.contains("hidden")'));

// ============ 2. 布局与背包尺寸 ============
console.log('\n— 布局与背包');
const layoutInfo = await cdp.eval(`
  (() => {
    const bag = document.querySelector('.col-bag');
    const rail = document.querySelector('.col-rail');
    const board = document.getElementById('board');
    const wrap = document.getElementById('board-wrap');
    if (!bag || !rail || !board) return null;
    const b = bag.getBoundingClientRect(), r = rail.getBoundingClientRect(), bd = board.getBoundingClientRect();
    // 格子尺寸从 board 的实际列宽读，而不是 CSS 变量（那只是兜底默认值）
    const cols = (board.style.gridTemplateColumns || '').match(/([\\d.]+)px/);
    const box = document.querySelector('.col-box');
    const bx = box ? box.getBoundingClientRect() : null;
    return {
      bagW: Math.round(b.width), railW: Math.round(r.width),
      boardW: Math.round(bd.width), boardH: Math.round(bd.height),
      wrapH: Math.round(wrap.getBoundingClientRect().height),
      cell: cols ? Number(cols[1]) : 0,
      boxW: bx ? Math.round(bx.width) : 0,
      boxRight: bx ? Math.round(bx.right) : 0,
      railLeft: Math.round(r.left),
    };
  })()
`);
ok('左栏没有虚胖（不超过背包太多）',
  layoutInfo && layoutInfo.bagW - layoutInfo.boardW < 40,
  JSON.stringify(layoutInfo));
// 背包格子 64px 是硬要求，左栏因此必然不窄，商店够用即可
ok('商店栏宽度够摆货（>= 380）',
  layoutInfo && layoutInfo.railW >= 380,
  `左 ${layoutInfo?.bagW} vs 右 ${layoutInfo?.railW}`);
ok('储物箱在背包与商店之间',
  layoutInfo && layoutInfo.boxW >= 160 && layoutInfo.boxRight <= layoutInfo.railLeft + 30,
  JSON.stringify({ boxW: layoutInfo?.boxW, boxRight: layoutInfo?.boxRight, railLeft: layoutInfo?.railLeft }));
// 格子锁死 64px 后，舞台高度 = 行数×64，不再随窗口拉伸，竖直居中会留少量边距
ok('背包在竖直方向基本填满可用高度',
  layoutInfo && layoutInfo.boardH >= layoutInfo.wrapH * 0.85,
  `背包高 ${layoutInfo?.boardH} / 可用 ${layoutInfo?.wrapH}`);
ok('格子固定 64px（不随窗口伸缩）',
  layoutInfo && layoutInfo.cell === 64,
  `格子 ${layoutInfo?.cell}px`);

// 只数当前可见页面里的面板（选角色页/战斗页的面板此时是隐藏的）
const panels = await cdp.eval(`
  [...document.querySelectorAll('.panel')].filter(p => p.offsetParent !== null).length
`);
ok('当前页面面板数量收敛到 5 个以内', panels <= 5, `${panels} 个`);

const domNodes = await cdp.eval('document.querySelectorAll("*").length');
ok('DOM 节点总数受控（< 900）', domNodes < 900, `${domNodes} 个`);

const topStats = await cdp.eval('document.querySelectorAll("#stats .stat").length');
ok('顶栏只留 5 项数值', topStats === 5, `${topStats}`);
ok('出售区存在', await cdp.eval('!!document.getElementById("sell-zone")'));
ok('引导条存在', await cdp.eval('!!document.getElementById("guide") && document.getElementById("guide").innerText.length > 4'));

// 布局：背包在左，商店与出售区在最右同一栏
const layout = await cdp.eval(`
  (() => {
    const bag = document.querySelector('.col-bag');
    const rail = document.querySelector('.col-rail');
    if (!bag || !rail) return null;
    const b = bag.getBoundingClientRect(), r = rail.getBoundingClientRect();
    return {
      shopInRail: !!rail.querySelector('#shop'),
      sellInRail: !!rail.querySelector('#sell-zone'),
      railRightOfBag: r.left >= b.right - 30,
    };
  })()
`);
ok('商店与出售区同在最右栏', layout && layout.shopInRail && layout.sellInRail, JSON.stringify(layout));
ok('右栏确实在背包右侧', layout && layout.railRightOfBag, JSON.stringify(layout));

// 一屏展示：整页不滚动
const scrollInfo = await cdp.eval(`
  (() => ({
    docScroll: document.documentElement.scrollHeight,
    winH: window.innerHeight,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }))()
`);
ok('整页不滚动（一屏展示）', scrollInfo.docScroll <= scrollInfo.winH + 4, JSON.stringify(scrollInfo));

ok('升级路径不再是常驻面板', await cdp.eval('!document.getElementById("paths")'));

// 一级/二级页面结构
ok('一级页面存在', await cdp.eval('!!document.getElementById("page-shop")'));
ok('二级页面存在', await cdp.eval('!!document.getElementById("page-battle")'));
ok('开局停在二级页面之外', await cdp.eval('document.getElementById("page-battle").classList.contains("hidden")'));
ok('没有「升级商店」按钮', await cdp.eval('!document.getElementById("btn-upgrade")'));
ok('商店品质自动显示', await cdp.eval('document.getElementById("shop-quality").innerText.length > 2'));
await cdp.shot('01-一屏布局.png');

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
ok('详情条显示每秒伤害', detailText.includes('每秒伤害'), detailText.slice(0, 60));
ok('详情条显示出手顺序与起手时间', detailText.includes('出手顺序') && detailText.includes('起手'));
ok('详情条有卖出按钮', await cdp.eval('!!document.getElementById("btn-sell-one")'));

// 升级路径改成浮窗：点按钮弹出，弹窗里有数值拆解与升级链
const upBtnExists = await cdp.eval('!!document.getElementById("btn-upgrade-info")');
if (upBtnExists) {
  await cdp.eval('document.getElementById("btn-upgrade-info").click()');
  await sleep(300);
  const popText = String(await cdp.eval('document.getElementById("overlay-body").innerText'));
  ok('点升级路径弹出浮窗', await cdp.eval('!document.getElementById("overlay").classList.contains("hidden")'));
  ok('浮窗里有升级说明', popText.includes('升级需要') || popText.includes('最终形态'), popText.slice(0, 60));
  ok('浮窗里有数值与形状', popText.includes('出手顺序') && popText.includes('形状'));
  await cdp.shot('02b-升级浮窗.png');
  await cdp.eval('document.getElementById("ov-close").click()');
  await sleep(200);
} else {
  ok('点升级路径弹出浮窗', false, '按钮不存在');
}

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

// ============ 5. 战斗读条（回归） ============
// 只打一场，重点验证：每件武器有自己的读条、读条会走、跳过能收口。
// 不跑满整局 —— 整局流程已经由 tools/test-core.mjs 在 node 里跑过 146 项。
console.log('\n— 战斗读条');
const battleProbe = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 先把界面推回准备阶段：关掉任何弹窗
    for (let i = 0; i < 20; i++) {
      const ov = document.getElementById('overlay');
      if (ov.classList.contains('hidden')) break;
      const cl = document.querySelector('.class-card[data-class]');
      if (cl) { cl.click(); await sleep(150); continue; }
      const okb = document.getElementById('ov-ok');
      if (okb) { okb.click(); await sleep(120); continue; }
      const st = document.getElementById('ov-start');
      if (st) { st.click(); await sleep(120); continue; }
      break;
    }
    // 前面几步可能把武器卖掉了；这里先确保背包里有一件武器（没有武器不能开战）
    let bought = false;
    for (let i = 0; i < 18; i++) {
      if (document.querySelector('#board .shape-item.cat-weapon')) { bought = true; break; }
      const weaponCard = [...document.querySelectorAll('#shop .shop-card')]
        .find((c) => !c.classList.contains('sold') && c.querySelector('.dps'));
      if (weaponCard) { weaponCard.click(); await sleep(120); continue; }
      const rf = document.getElementById('btn-refresh');
      if (rf && !rf.disabled) { rf.click(); await sleep(120); continue; }
      break;
    }
    // 开战
    const btn = document.getElementById('btn-battle');
    if (btn && !btn.disabled) { btn.click(); await sleep(300); }
    // 买不起武器时至少确认按钮如实给出拒绝理由
    const blockedReason = document.getElementById('toast')?.innerText || '';

    const onBattle = !document.getElementById('page-battle').classList.contains('hidden');
    const bars = [...document.querySelectorAll('.wbar .wb-track i')];
    const widths1 = bars.map(b => b.style.width);
    const transitions = bars.map(b => b.style.transition);
    await sleep(700);
    const widths2 = bars.map(b => b.style.width);
    return {
      onBattle,
      hasWeapon: bought,
      blockedReason,
      barCount: bars.length,
      widths1, widths2, transitions,
      hasWeaponNames: document.querySelectorAll('.wbar .wb-name').length,
    };
  })()
`, true, 90000);

ok('能进入战斗页', battleProbe.onBattle, JSON.stringify(battleProbe).slice(0, 120));
ok('每件武器都有读条', battleProbe.barCount >= 1, `${battleProbe.barCount} 条`);
ok('读条带武器名', battleProbe.hasWeaponNames >= 1, `${battleProbe.hasWeaponNames}`);
ok('读条在走（宽度会变化或已走满）',
  battleProbe.widths1.some((w, i) => w !== battleProbe.widths2[i]) || battleProbe.widths2.some((w) => w === '100%'),
  `第一次 ${JSON.stringify(battleProbe.widths1)} → 第二次 ${JSON.stringify(battleProbe.widths2)}`);
ok('读条带过渡时长（按格数算的秒数）',
  battleProbe.transitions.some((t) => /width [\d.]+s/.test(t || '')),
  JSON.stringify(battleProbe.transitions).slice(0, 120));

// 跳过要能收口到结算弹窗
const skipResult = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const skip = document.getElementById('skip-btn');
    if (skip) skip.click();
    await sleep(500);
    const ov = document.getElementById('overlay');
    return {
      overlayShown: !ov.classList.contains('hidden'),
      text: document.getElementById('overlay-body').innerText.slice(0, 50),
    };
  })()
`, true, 40000);
ok('点跳过能收到结算弹窗', skipResult.overlayShown, JSON.stringify(skipResult).slice(0, 120));
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
