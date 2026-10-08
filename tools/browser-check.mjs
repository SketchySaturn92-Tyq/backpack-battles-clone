/**
 * 无头浏览器验收（v0.2）
 *
 * 覆盖这次重做的关键路径：
 *   1. 职业选择 → 开局
 *   2. 形状渲染：道具按真实不规则形状画出多个格子（不是矩形）
 *   3. 整理交互：拖拽、旋转（形状真的变了）、卖出
 *   4. 触发顺序面板随位置变化
 *   5. 战斗舞台：角色立绘 + 攻击动效 + 事件流日志
 *   6. 子职业分支弹窗
 *   7. 全程无 JS 报错
 *
 * 用法：
 *   node tools/browser-check.mjs                    本地跑（起 8849）
 *   REMOTE_URL=https://... node tools/browser-check.mjs   在公网地址上跑
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
if (REMOTE_URL) {
  console.log(`远端验收模式：${REMOTE_URL}`);
} else {
  await new Promise((r) => server.listen(PORT, r));
  console.log(`静态服务已起：http://localhost:${PORT}`);
}

const profileDir = join(OUT, 'chrome-profile');
await rm(profileDir, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`,
  '--window-size=1500,1100', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path) {
  const r = await fetch(`http://127.0.0.1:9333${path}`);
  return r.json();
}
async function waitForDevtools(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { return await fetchJson('/json/version'); } catch { await sleep(400); }
  }
  throw new Error('DevTools 没起来');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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
}

const version = await waitForDevtools();
console.log(`Chrome: ${version.Browser}`);

const targets = await fetchJson('/json/list');
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('about:blank'))
  || targets.find((t) => t.type === 'page');

const cdp = await CDP.connect(page.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Log.enable');

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

// ============ 1. 加载与职业选择 ============
console.log('\n— 页面加载与职业选择');
ok('标题正确', String(await cdp.eval('document.title')).includes('背包乱斗'));
ok('职业选择弹窗出现', await cdp.eval('!document.getElementById("overlay").classList.contains("hidden")'));
const classCount = await cdp.eval('document.querySelectorAll(".class-card[data-class]").length');
ok('列出 6 个职业', classCount === 6, `${classCount} 个`);
ok('每个职业显示分支', String(await cdp.eval('document.querySelector(".class-card").innerText')).includes('分支'));
await cdp.shot('01-职业选择.png');

// 选战士
await cdp.eval('document.querySelector(".class-card[data-class=\\"warrior\\"]").click()');
await sleep(500);
ok('选完职业弹窗关闭', await cdp.eval('document.getElementById("overlay").classList.contains("hidden")'));
const statsCount = await cdp.eval('document.querySelectorAll("#stats .stat").length');
ok('顶栏显示职业与状态', statsCount === 6, `${statsCount} 个`);

// ============ 2. 形状渲染 ============
console.log('\n— 不规则形状渲染');
const boardCells = await cdp.eval('document.querySelectorAll("#board .cellbg").length');
ok('背包渲染出 48 格（6×8）', boardCells === 48, `${boardCells} 格`);

const shapeInfo = await cdp.eval(`
  (() => {
    const items = [...document.querySelectorAll('.shape-item')];
    return items.map(el => ({
      uid: el.dataset.uid,
      cells: el.querySelectorAll('.sc').length,
      w: el.style.width, h: el.style.height,
      name: el.querySelector('.nm')?.textContent || '',
    }));
  })()
`);
ok('初始就有道具（职业起始装备）', shapeInfo.length >= 2, `${shapeInfo.length} 件`);
ok('道具按形状画出多个格子', shapeInfo.every((s) => s.cells >= 1));
ok('存在多格道具', shapeInfo.some((s) => s.cells > 1), JSON.stringify(shapeInfo.map((s) => s.cells)));
await cdp.shot('02-开局背包.png');

// ============ 3. 买道具 + 整理 ============
console.log('\n— 购买与整理');
const shopSlots = await cdp.eval('document.querySelectorAll("#shop .shop-card").length');
ok('商店 5 格', shopSlots === 5, `${shopSlots}`);

const bought = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let n = 0;
    for (let round = 0; round < 10; round++) {
      const cards = [...document.querySelectorAll('#shop .shop-card')];
      for (const c of cards) {
        if (!c.classList.contains('sold')) { c.click(); n++; await sleep(40); }
      }
      const rf = document.getElementById('btn-refresh');
      if (!rf.disabled) { rf.click(); await sleep(60); }
    }
    return n;
  })()
`, true);
await sleep(400);
const chipCount = await cdp.eval('document.querySelectorAll("#board .shape-item").length');
ok('能买进多件道具', chipCount >= 4, `${chipCount} 件（点击 ${bought} 次）`);

// 旋转：验证形状真的变了（宽高互换），并且同一件道具的格数不变。
// 注意必须按 uid 比对：旋转可能让两件同名道具贴上并自动合成，
// 按 DOM 顺序取元素会取到另一件，看起来像「丢了格子」。
const rotResult = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 挑一件背包里唯一的道具，避免旋转后触发合成干扰判断
    const all = [...document.querySelectorAll('#board .shape-item')];
    const counts = {};
    all.forEach(el => { const n = el.querySelector('.nm').textContent; counts[n] = (counts[n] || 0) + 1; });
    const target = all.find(el => counts[el.querySelector('.nm').textContent] === 1) || all[0];
    const uid = target.dataset.uid;
    const before = { w: target.style.width, h: target.style.height, cells: target.querySelectorAll('.sc').length };

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await sleep(150);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    await sleep(250);

    const after = document.querySelector('#board .shape-item[data-uid="' + uid + '"]');
    return {
      uid,
      before,
      after: after ? { w: after.style.width, h: after.style.height, cells: after.querySelectorAll('.sc').length } : null,
    };
  })()
`, true);
ok('旋转后形状发生变化',
  rotResult.after && (rotResult.before.w !== rotResult.after.w || rotResult.before.h !== rotResult.after.h),
  JSON.stringify(rotResult));
ok('旋转不丢格子（同一件道具）',
  rotResult.after && rotResult.before.cells === rotResult.after.cells,
  `${rotResult.before.cells} → ${rotResult.after?.cells}`);

// 拖拽：真实鼠标事件移动道具
const dragResult = await cdp.eval(`
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector('#board .shape-item');
    const before = { left: el.style.left, top: el.style.top, uid: el.dataset.uid };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    await sleep(60);
    for (let i = 1; i <= 6; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + i * 16, clientY: y + i * 12 }));
      await sleep(30);
    }
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 96, clientY: y + 72 }));
    await sleep(250);
    const el2 = document.querySelector('#board .shape-item[data-uid="' + before.uid + '"]');
    return { before, after: el2 ? { left: el2.style.left, top: el2.style.top } : null };
  })()
`, true);
ok('拖拽改变了道具位置',
  dragResult.after && (dragResult.before.left !== dragResult.after.left || dragResult.before.top !== dragResult.after.top),
  JSON.stringify(dragResult));

// 顺序面板
const orderRows = await cdp.eval('document.querySelectorAll("#order-list .od-row").length');
ok('出场顺序面板列出全部道具', orderRows === chipCount, `${orderRows} vs ${chipCount}`);

// 详情面板
await cdp.eval(`
  (() => {
    const el = document.querySelector('#board .shape-item');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  })()
`);
await sleep(250);
const detailText = String(await cdp.eval('document.getElementById("detail").innerText'));
ok('详情面板显示形状与格数', detailText.includes('格'), detailText.slice(0, 50));
ok('详情面板显示触发顺序', detailText.includes('触发顺序'));
await cdp.shot('03-整理后.png');

// ============ 4. 战斗舞台 ============
console.log('\n— 战斗与动效');
await cdp.eval('document.getElementById("btn-battle").click()');
await sleep(600);
const stageInfo = await cdp.eval(`
  (() => ({
    hasStage: !!document.querySelector('.stage'),
    fighters: document.querySelectorAll('.fighter').length,
    portraits: document.querySelectorAll('.fighter .portrait img').length,
    weaponChips: document.querySelectorAll('.weaponline .wchip').length,
    fightersLocked: document.getElementById('btn-battle').disabled,
    btnText: document.getElementById('btn-battle').textContent,
  }))()
`);
ok('战斗舞台已创建', stageInfo.hasStage);
ok('左右两侧角色都渲染', stageInfo.fighters === 2, `${stageInfo.fighters}`);
ok('角色立绘加载', stageInfo.portraits === 2, `${stageInfo.portraits} 张`);
ok('显示双方武器列表', stageInfo.weaponChips >= 1, `${stageInfo.weaponChips} 个`);
ok('战斗中锁定按钮', stageInfo.fightersLocked === true, stageInfo.btnText);
await sleep(900);
await cdp.shot('04-战斗动效.png');

// 等待结算
let sawFx = false;
let sawLog = false;
for (let i = 0; i < 90; i++) {
  await sleep(400);
  const st = await cdp.eval(`
    (() => ({
      fx: document.querySelectorAll('.fx, .projectile, .dmg').length,
      log: document.querySelectorAll('#battle-log .bl').length,
      overlay: !document.getElementById('overlay').classList.contains('hidden'),
    }))()
  `);
  if (st.fx > 0) sawFx = true;
  if (st.log > 2) sawLog = true;
  if (st.overlay) break;
}
ok('战斗中播过特效元素', sawFx, '未捕获到 .fx/.projectile/.dmg');
ok('事件流日志有内容', sawLog);

const overlayText = String(await cdp.eval('document.getElementById("overlay-body").innerText'));
ok('结算弹窗出现', overlayText.includes('回合'), overlayText.slice(0, 60));
ok('结算含输出统计', overlayText.includes('输出') || overlayText.includes('双方状态'));
await cdp.shot('05-战斗结算.png');

// ============ 5. 回合推进 + 分支 ============
console.log('\n— 回合推进与分支');
await cdp.eval('document.getElementById("ov-ok").click()');
await sleep(500);

// 连打若干回合，直到出现分支弹窗
let branchShown = false;
for (let i = 0; i < 30; i++) {
  const state = await cdp.eval(`
    (() => ({
      overlay: !document.getElementById('overlay').classList.contains('hidden'),
      body: document.getElementById('overlay-body').innerText.slice(0, 40),
      branchCards: document.querySelectorAll('.class-card[data-branch]').length,
      battleDisabled: document.getElementById('btn-battle').disabled,
    }))()
  `);
  if (state.branchCards > 0) { branchShown = true; break; }
  if (state.overlay) {
    await cdp.eval(`(() => { const b = document.getElementById('ov-ok'); if (b) b.click(); })()`);
    await sleep(300);
    continue;
  }
  if (!state.battleDisabled) {
    await cdp.eval('document.getElementById("btn-battle").click()');
    // 等战斗演出结束
    for (let j = 0; j < 60; j++) {
      await sleep(300);
      const done = await cdp.eval(`!document.getElementById('overlay').classList.contains('hidden')`);
      if (done) break;
    }
    await sleep(200);
  } else {
    await sleep(300);
  }
}
ok('能推进到选择子职业分支', branchShown);
if (branchShown) {
  await cdp.shot('06-子职业分支.png');
  const branchCount = await cdp.eval('document.querySelectorAll(".class-card[data-branch]").length');
  ok('每个职业 2 个分支', branchCount === 2, `${branchCount}`);
  await cdp.eval('document.querySelector(".class-card[data-branch]").click()');
  await sleep(400);
  const cls = String(await cdp.eval('document.querySelector("#stats .stat.cls b").textContent'));
  ok('选完分支后顶栏显示分支名', cls.length > 0, cls);
}

// ============ 6. 联动面板 ============
console.log('\n— 联动与状态');
const capText = String(await cdp.eval('document.getElementById("capacity").textContent'));
ok('显示背包占用', capText.includes('已用'), capText);

// ============ 7. 健康度 ============
console.log('\n— 运行健康度');
const realErrors = errors.filter((e) => !/favicon|net::ERR_FILE|404|Failed to load resource/i.test(e));
ok('全程无 JS 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await writeFile(join(OUT, 'report.json'), JSON.stringify({
  chrome: version.Browser, pass, fail, errors, shapeInfo, rotResult, dragResult, stageInfo,
}, null, 2));

console.log(`\n${'='.repeat(48)}`);
console.log(`浏览器验收：通过 ${pass}，失败 ${fail}`);
console.log(`截图与报告：${OUT}`);

chrome.kill('SIGTERM');
server.close();
process.exit(fail ? 1 : 0);
