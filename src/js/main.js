/**
 * 主入口 v0.4
 *
 * 页面结构：
 *   一级页面（#page-shop）：买 + 整理背包。左侧背包与角色，中间商店与升级路径，右侧详情。
 *   二级页面（#page-battle）：战斗演出 + 双方背包对照 + 底部数值卡。
 *
 * 拖拽的性能要点：
 *   1. 拖拽期间绝不重建 DOM，只改被拖那一件的 transform 与少数格子的高亮 class
 *   2. pointer capture 把事件收在元素自己身上，不挂 window 全局监听
 *   3. pointermove 只记录坐标，写入放到 requestAnimationFrame，一帧最多一次
 *   4. 移动用 translate3d（合成层），不改 left/top（会触发布局）
 */

import { Run, PHASE } from './core/run.js';
import { CLASSES, CLASS_BY_ID } from './data/classes.js';
import { ECON, MATCH } from './data/constants.js';
import { ITEM_BY_ID, chargeSeconds } from './data/items.js';
import { buildOverview, nextStep } from './core/analyze.js';
import { shopHints, progressFor } from './data/recipes.js';
import { BattleStage } from './ui/stage.js';
import {
  renderBoard, renderShop, renderDetail, renderStats, renderCapacity, renderGuide,
  renderOverview, renderShopQuality, renderShopHints, upgradePopupHtml,
  renderFighterCard, moveChip, resetChip, setChipDragging, setHover, setSellActive,
  cellToPx, setCellSize, getLayout, getCellSize,
} from './ui/render.js';

let run = null;
let selectedUid = null;
let playing = false;
let stage = null;
let speed = 1.4;
let guidesDone = { bought: false, moved: false };
let drag = null;

const el = {};

// 注意：启动调用放在文件末尾。
// 模块顶层的 const/let 有暂时性死区，若在这里就调用 boot()，
// 后面声明的 HERO_ART、pickedClassId 会直接抛 ReferenceError。

function boot() {
  cacheEls();
  bindStaticEvents();
  showClassPage();
}

function cacheEls() {
  el.pageClass = document.getElementById('page-class');
  el.pageShop = document.getElementById('page-shop');
  el.pageBattle = document.getElementById('page-battle');
  el.boardWrap = document.getElementById('board-wrap');
  el.pickArt = document.getElementById('pick-art');
  el.pickName = document.getElementById('pick-name');
  el.pickDesc = document.getElementById('pick-desc');
  el.pickStats = document.getElementById('pick-stats');
  el.pickList = document.getElementById('pick-list');
  el.pickItems = document.getElementById('pick-items');
  el.pickBranches = document.getElementById('pick-branches');
  el.btnPickStart = document.getElementById('btn-pick-start');
  el.stats = document.getElementById('stats');
  el.guide = document.getElementById('guide');
  el.board = document.getElementById('board');
  el.capacity = document.getElementById('capacity');
  el.sellZone = document.getElementById('sell-zone');
  el.shop = document.getElementById('shop');
  el.shopQuality = document.getElementById('shop-quality');
  el.shopHints = document.getElementById('shop-hints');
  el.detail = document.getElementById('detail');
  el.overview = document.getElementById('overview');
  el.log = document.getElementById('log');
  el.heroArt = document.getElementById('hero-art');
  el.heroClass = document.getElementById('hero-class');
  el.stageRoot = document.getElementById('stage-root');
  el.battleLog = document.getElementById('battle-log');
  el.battleTimer = document.getElementById('battle-timer');
  el.battleRound = document.getElementById('battle-round');
  el.foeName = document.getElementById('foe-name');
  el.speedBtn = document.getElementById('speed-btn');
  el.skipBtn = document.getElementById('skip-btn');
  el.overlay = document.getElementById('overlay');
  el.overlayBody = document.getElementById('overlay-body');
  el.toast = document.getElementById('toast');
  el.btnBattle = document.getElementById('btn-battle');
  el.btnRefresh = document.getElementById('btn-refresh');
  el.btnAuto = document.getElementById('btn-auto');
  el.btnExpand = document.getElementById('btn-expand');
  el.expandInfo = document.getElementById('expand-info');
  el.btnBack = document.getElementById('btn-back');
  el.btnRecipes = document.getElementById('btn-recipes');
  el.btnReset = document.getElementById('btn-reset');
  el.btnHelp = document.getElementById('btn-help');
}

// ============ 页面切换 ============

/** 三个页面：选角色 → 整理/购买 → 战斗 */
function showPage(which) {
  el.pageClass.classList.toggle('hidden', which !== 'class');
  el.pageShop.classList.toggle('hidden', which !== 'shop');
  el.pageBattle.classList.toggle('hidden', which !== 'battle');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============ 选角色页面（最上一级） ============

/** 角色立绘索引：六个职业各一张 */
const HERO_ART = { ranger: 1, warrior: 0, mage: 2, rogue: 5, merchant: 6, druid: 7 };
function heroArtIndex(classId) { return HERO_ART[classId] ?? 0; }

let pickedClassId = 'ranger';

function showClassPage() {
  pickedClassId = 'ranger';
  renderClassPage();
  showPage('class');
}

function renderClassPage() {
  const cls = CLASS_BY_ID[pickedClassId] || CLASSES[0];

  // 左：立绘 + 属性
  el.pickArt.src = `assets/chars/char-${heroArtIndex(cls.id)}.png`;
  el.pickName.textContent = cls.name;
  el.pickDesc.textContent = cls.desc;
  el.pickStats.innerHTML = [
    ['生命', cls.hp],
    ['起始金币', cls.gold],
    ['背包', `${cls.bag.cols}×${cls.bag.rows}`],
    ['被动', cls.passive.name],
  ].map(([k, v]) => `<div class="sr"><span>${k}</span><b>${v}</b></div>`).join('')
    + `<div class="sr"><span>效果</span><b style="font-size:10.5px">${cls.passive.desc}</b></div>`;

  // 中：角色卡（背包尺寸统一，所以卡片上不再列尺寸）
  el.pickList.innerHTML = CLASSES.map((c) => `
    <button class="pick-card ${c.id === pickedClassId ? 'on' : ''}" data-class="${c.id}">
      <div class="pc-top">
        <img class="pc-art" src="assets/chars/char-${heroArtIndex(c.id)}.png" alt="">
        <div>
          <div class="pc-name">${c.name}</div>
          <div class="pc-meta">生命 ${c.hp} · 金币 ${c.gold}</div>
        </div>
      </div>
      <div class="pc-passive"><b>${c.passive.name}</b> ${c.passive.desc}</div>
    </button>`).join('');
  el.pickList.querySelectorAll('.pick-card').forEach((b) => {
    b.addEventListener('click', () => {
      pickedClassId = b.dataset.class;
      renderClassPage();
    });
  });

  // 右：初始携带与分支
  el.pickItems.innerHTML = cls.startItems.map((id) => {
    const it = ITEM_BY_ID[id];
    if (!it) return '';
    return `<div class="pick-item">
      <img src="assets/icons/${it.id}.png" alt="" onerror="this.style.visibility='hidden'">
      <span>${it.name}</span>
    </div>`;
  }).join('') || '<p class="hint">空手开局</p>';

  el.pickBranches.innerHTML = cls.branches.map((b) => `
    <div class="pick-branch"><b>${b.name}</b>　${b.desc}</div>`).join('');
}

function startRun(classId, seed = Math.floor(Math.random() * 1e9)) {
  run = new Run({ seed, classId });
  selectedUid = null;
  drag = null;
  playing = false;
  guidesDone = { bought: false, moved: false };
  if (stage) { stage.destroy(); stage = null; }
  el.battleLog.innerHTML = '';
  el.stageRoot.innerHTML = '<p class="hint center">点「开始战斗」后这里会播放双方角色与攻击动效。</p>';
  showPage('shop');
  renderAll();
  // 让背包先占满可用高度，再按结果定格子尺寸
  requestAnimationFrame(() => { fitBoard(); fitBoard(); });
}

// ============ 渲染 ============

function renderAll() {
  if (!run) return;
  const ov = buildOverview(run.board);
  const orderMap = new Map(run.board.triggerOrder().map((uid, i) => [uid, i]));

  renderStats(el.stats, run);
  renderCapacity(el.capacity, run.board, ov.totalDps);
  renderGuide(el.guide, nextStep(run.board, run.header.gold, run.phase));

  renderBoard(el.board, run.board, {
    selectedUid,
    draggingUid: drag?.uid || null,
    orderMap,
    onGrab,
  });

  renderShop(el.shop, run.shop, run.header.gold, {
    onBuy: doBuy,
    onLock: (i) => { run.shop.toggleLock(i); renderAll(); },
  });
  renderShopQuality(el.shopQuality, run.shop);
  renderShopHints(el.shopHints, shopHints(run.board, run.shop.slots.filter((s) => !s.sold).map((s) => s.item)));

  renderDetail(el.detail, selectedUid ? run.board.get(selectedUid) : null, run.board);
  bindDetailButtons();
  renderOverview(el.overview, ov, run.board);

  el.heroClass.textContent = run.header.branchName
    ? `${run.header.className} · ${run.header.branchName}`
    : run.header.className;
  el.heroArt.src = heroArtFor(run);

  const sellBtn = document.getElementById('btn-sell-one');
  if (sellBtn && selectedUid) sellBtn.addEventListener('click', () => doSell(selectedUid));

  renderLog();

  const prep = run.phase === PHASE.PREPARE && !playing;
  el.btnBattle.disabled = !prep;
  el.btnRefresh.disabled = !prep || run.header.gold < run.refreshCost();
  el.btnAuto.disabled = !prep;
  const canExp = run.canExpand();
  const expCost = run.expandCost();
  el.btnExpand.disabled = !prep || !canExp || run.header.gold < expCost;
  el.expandInfo.textContent = canExp
    ? `${expCost} 金 · 现在 ${run.board.cols}×${run.board.rows}`
    : `已扩到最大 ${run.board.cols}×${run.board.rows}`;
  el.btnRefresh.textContent = run.refreshCost() === 0 ? '刷新（免费）' : `刷新（${run.refreshCost()} 金）`;
}

function renderLog() {
  el.log.innerHTML = run.log.slice(-40).map((l) => `<div class="lg">${l.text}</div>`).join('');
  el.log.scrollTop = el.log.scrollHeight;
}

/** 详情条上的两个按钮：升级路径浮窗 / 卖出 */
function bindDetailButtons() {
  const upBtn = document.getElementById('btn-upgrade-info');
  if (upBtn && selectedUid) {
    upBtn.addEventListener('click', () => openUpgradePopup(selectedUid));
  }
  const sellBtn = document.getElementById('btn-sell-one');
  if (sellBtn && selectedUid) {
    sellBtn.addEventListener('click', () => doSell(selectedUid));
  }
}

/** 升级浮窗：点武器或详情里的按钮弹出，不再常驻占屏 */
function openUpgradePopup(uid) {
  const entry = run.board.get(uid);
  if (!entry) return;
  el.overlayBody.innerHTML = upgradePopupHtml(entry, run.board) +
    '<div class="row mt"><button class="primary" id="ov-close">知道了</button></div>';
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-close').addEventListener('click', () => el.overlay.classList.add('hidden'));
}

/**
 * 按可用空间给背包定格子尺寸。
 * 关键是两个约束一起算：
 *   - 高度：左栏剩下的高度（这是真正的瓶颈）
 *   - 宽度：左栏允许的最大宽度（防止格子撑爆左栏）
 * 取两者较小值，背包就能填满面板而不是缩在中间一小块。
 */
const MAX_BAG_W = 482;

function fitBoard() {
  if (!run || !el.boardWrap) return;
  const box = el.boardWrap;
  const cols = run.board.cols;
  const rows = run.board.rows;
  const layout = getLayout();

  const availH = box.clientHeight - 4;
  if (availH <= 0) return;

  const cellByH = (availH - rows * layout.GAP) / rows;
  const cellByW = (MAX_BAG_W - layout.PAD * 2 - cols * layout.GAP) / cols;
  const cell = Math.min(cellByH, cellByW);
  if (setCellSize(cell)) renderAll();
}

function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 1900);
}

// ============ 商店与卖出 ============

function doBuy(i) {
  if (run.phase !== PHASE.PREPARE || playing) return;
  const res = run.buy(i);
  if (!res.ok) { toast(res.reason); return; }
  if (!guidesDone.bought) {
    guidesDone.bought = true;
    const p = progressFor(run.board, res.item.id);
    toast(p && p.ready ? `凑齐了！相邻摆放即可合成 ${p.outputName}` : '买好了，拖动它调整位置');
  }
  renderAll();
}

function doExpand() {
  if (!run || playing || run.phase !== PHASE.PREPARE) return;
  const res = run.expandBag();
  if (!res.ok) { toast(res.reason); return; }
  toast(`背包扩大到 ${res.cols}×${res.rows}`);
  renderAll();
  // 网格变大后重新按可用空间定格子尺寸
  requestAnimationFrame(() => { fitBoard(); fitBoard(); });
}

function doSell(uid) {
  if (run.phase !== PHASE.PREPARE || playing) return;
  const res = run.sell(uid);
  if (!res.ok) return;
  toast(`卖出 +${res.price} 金`);
  if (selectedUid === uid) selectedUid = null;
  renderAll();
}

// ============ 拖拽（性能关键路径） ============

function onGrab(ev, entry) {
  if (run.phase !== PHASE.PREPARE || playing || drag) return;
  ev.preventDefault();
  selectedUid = entry.item.uid;

  const boardRect = el.board.getBoundingClientRect();
  const anchor = cellToPx(entry.x, entry.y);

  drag = {
    uid: entry.item.uid,
    shape: entry.shape,
    // 抓取点相对「形状左上角」的偏移：保证拖起来跟手
    offX: ev.clientX - (boardRect.left + anchor.left),
    offY: ev.clientY - (boardRect.top + anchor.top),
    // 这件道具的静态 left/top，位移按它的增量算（关键：不是绝对坐标）
    originLeft: anchor.left,
    originTop: anchor.top,
    startX: ev.clientX,
    startY: ev.clientY,
    boardRect,
    moved: false,
    raf: 0,
  };

  // pointer capture 能少挂全局监听，但合成事件里没有活跃指针会抛错，所以包一层；
  // 同时仍在 window 上挂监听，两条路径都能收到事件。
  try { ev.target.setPointerCapture?.(ev.pointerId); } catch { /* 合成事件忽略 */ }
  setChipDragging(el.board, entry.item.uid, true);

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);

  renderAll();
}

function onDragMove(ev) {
  if (!drag) return;
  if (Math.abs(ev.clientX - drag.startX) + Math.abs(ev.clientY - drag.startY) > 3) drag.moved = true;
  if (!drag.moved) return;
  drag.pending = { x: ev.clientX, y: ev.clientY };
  if (drag.raf) return;
  drag.raf = requestAnimationFrame(applyDragFrame);
}

function applyDragFrame() {
  drag.raf = 0;
  if (!drag || !drag.pending) return;
  const { x: cx, y: cy } = drag.pending;

  const rect = drag.boardRect;
  // 目标位置（相对背包左上角）
  const targetLeft = cx - rect.left - drag.offX;
  const targetTop = cy - rect.top - drag.offY;
  // 关键：translate 用「目标 - 原始锚点」的增量，
  // 因为元素本身的 left/top 已经停在原始锚点上了。
  const dx = targetLeft - drag.originLeft;
  const dy = targetTop - drag.originTop;

  moveChip(el.board, drag.uid, dx, dy);

  const L = getLayout();
  const gx = Math.round(targetLeft / L.STEP);
  const gy = Math.round(targetTop / L.STEP);
  const ok = run.board.canPlace(drag.shape, gx, gy, drag.uid);
  setHover(el.board, run.board.footprint(drag.shape, gx, gy), ok, { x: gx, y: gy });
  setSellActive(isOverSellZone(cx, cy));
}

function onDragEnd(ev) {
  if (!drag) return;
  const root = el.board;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  if (drag.raf) cancelAnimationFrame(drag.raf);

  const session = drag;
  drag = null;

  const rect = session.boardRect;
  const targetLeft = ev.clientX - rect.left - session.offX;
  const targetTop = ev.clientY - rect.top - session.offY;
  const L = getLayout();
  const gx = Math.round(targetLeft / L.STEP);
  const gy = Math.round(targetTop / L.STEP);

  setHover(root, null);
  setSellActive(false);
  resetChip(root, session.uid);

  if (!session.moved) { renderAll(); return; }

  if (isOverSellZone(ev.clientX, ev.clientY)) { doSell(session.uid); return; }

  const res = run.moveTo(session.uid, gx, gy);
  if (!res.ok) toast(res.reason);
  else if (!guidesDone.moved) {
    guidesDone.moved = true;
    toast('摆好了。同名同阶相邻会自动合成，宝石要贴着武器放');
  }
  renderAll();
}

function isOverSellZone(cx, cy) {
  if (!el.sellZone) return false;
  const r = el.sellZone.getBoundingClientRect();
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
}

// ============ 键盘与静态事件 ============

function bindStaticEvents() {
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || !selectedUid || !run) return;
    if (el.pageShop.classList.contains('hidden')) return;
    if (ev.key === 'r' || ev.key === 'R') {
      if (run.phase !== PHASE.PREPARE || playing) return;
      const res = run.rotate(selectedUid, ev.shiftKey ? -1 : 1);
      if (!res.ok) toast(res.reason);
      renderAll();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (run.phase !== PHASE.PREPARE || playing) return;
      doSell(selectedUid);
    } else if (ev.key === 'Escape') {
      selectedUid = null;
      renderAll();
    } else if (ev.key === '[' || ev.key === ']') {
      const list = run.board.triggerOrder();
      if (!list.length) return;
      const i = list.indexOf(selectedUid);
      selectedUid = list[ev.key === ']' ? (i + 1) % list.length : (i - 1 + list.length) % list.length];
      renderAll();
    }
  });

  el.board.addEventListener('click', (ev) => {
    if (!run || run.phase !== PHASE.PREPARE || playing) return;
    const cell = ev.target.closest('.cellbg');
    if (!cell || !selectedUid) return;
    const all = [...el.board.querySelectorAll('.cellbg')];
    const idx = all.indexOf(cell);
    const x = idx % run.board.cols;
    const y = Math.floor(idx / run.board.cols);
    const res = run.moveTo(selectedUid, x, y);
    if (!res.ok) toast(res.reason);
    renderAll();
  });

  el.btnBattle.addEventListener('click', () => {
    if (!run || playing || run.phase !== PHASE.PREPARE) return;
    const start = run.startBattle();
    if (!start.ok) { toast(start.reason); return; }
    runBattle();
  });

  el.btnBack.addEventListener('click', () => {
    if (playing) { stage?.skip(); playing = false; }
    showPage('shop');
    renderAll();
  });

  el.btnRefresh.addEventListener('click', () => {
    const r = run.refreshShop();
    if (!r.ok) toast(r.reason);
    renderAll();
  });

  el.btnAuto.addEventListener('click', () => {
    const r = run.autoArrange();
    toast(`自动整理：放回 ${r.placed} 件`);
    renderAll();
  });

  el.speedBtn.addEventListener('click', () => {
    speed = speed >= 2 ? 1 : +(speed + 0.5).toFixed(1);
    el.speedBtn.textContent = `${speed}×`;
    if (stage) stage.speed = speed;
  });

  el.skipBtn.addEventListener('click', () => { stage?.skip(); });

  el.btnExpand.addEventListener('click', doExpand);
  el.btnRecipes.addEventListener('click', showRecipes);
  el.btnReset.addEventListener('click', showClassPage);
  el.btnHelp.addEventListener('click', showHelp);
  el.btnPickStart.addEventListener('click', () => startRun(pickedClassId));

  // 视口变化时重新给背包定尺寸（含手机横竖屏切换）
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitBoard(), 120);
  });
  window.addEventListener('orientationchange', () => setTimeout(() => fitBoard(), 260));

  // 双击道具直接打开升级浮窗
  el.board.addEventListener('dblclick', (ev) => {
    const chip = ev.target.closest('.shape-item');
    if (chip) openUpgradePopup(chip.dataset.uid);
  });
}

// ============ 战斗（二级页面） ============

function runBattle() {
  const result = run.runBattle();
  run.lastSynergies = result.synergies || [];
  playing = true;

  showPage('battle');
  el.battleRound.textContent = `第 ${result.round} 回合`;
  el.foeName.textContent = result.oppName;
  el.battleLog.innerHTML = '';
  el.stageRoot.innerHTML = '';

  // 底部双方数值卡
  renderFighterCard('a', {
    name: '你',
    build: (run.header.branchName || run.header.className),
    hp: result.hpA, maxHp: result.maxHpA ?? result.hpA,
    armor: result.myStats?.armor ?? 0,
    dps: result.myStats?.dps ?? 0,
    crit: result.myStats?.crit ?? 0,
    thorns: result.myStats?.thorns ?? 0,
    regen: result.myStats?.regen ?? 0,
  });
  renderFighterCard('b', {
    name: result.oppName,
    build: result.foeBuild.map((i) => i.name).slice(0, 2).join(' + '),
    hp: result.hpB, maxHp: result.maxHpB ?? result.hpB,
    armor: result.foeStats?.armor ?? 0,
    dps: result.foeStats?.dps ?? 0,
    crit: result.foeStats?.crit ?? 0,
    thorns: result.foeStats?.thorns ?? 0,
    regen: result.foeStats?.regen ?? 0,
  });

  stage = new BattleStage(el.stageRoot, {
    speed,
    onEvent: (ev) => appendBattleLog(ev),
    onFinish: () => { playing = false; showResult(result); },
  });

  stage.setup({
    left: { name: '你', cls: run.header.branchName || run.header.className, hp: result.hpA, art: heroArtFor(run) },
    right: { name: result.oppName, cls: '', hp: result.hpB, art: `assets/chars/char-${result.round % 6}.png` },
  });
  stage.play(result.events, {
    weaponsA: run.board.list()
      .filter((e) => e.item.cat === 'weapon')
      .sort((a, b) => run.board.orderIndex(a.item.uid) - run.board.orderIndex(b.item.uid))
      .map((e) => ({
        uid: e.item.uid,
        order: run.board.orderIndex(e.item.uid),
        name: e.item.name,
        charge: chargeSeconds(e.item),
      })),
    weaponsB: result.foeBuild.filter((i) => i.cat === 'weapon')
      .map((i, idx) => ({
        uid: `foe-${idx}`,
        order: idx,
        name: i.name,
        charge: ITEM_BY_ID[i.id] ? chargeSeconds(ITEM_BY_ID[i.id]) : 1.6,
      })),
  });
}

function appendBattleLog(ev) {
  const line = run.lastResult.logLines.find((l) => l.t === ev.t && l.type === ev.type);
  const d = document.createElement('div');
  d.className = `bl ${ev.type}`;
  d.innerHTML = `<span class="t">${(ev.t ?? 0).toFixed(1)}s</span>${line ? line.text : ev.type}`;
  el.battleLog.appendChild(d);
  el.battleLog.scrollTop = el.battleLog.scrollHeight;
  if (ev.t !== undefined) el.battleTimer.textContent = `${ev.t.toFixed(1)}s`;
}

function showResult(result) {
  run.phase = PHASE.RESULT;
  const win = result.winner === 'A';
  const draw = result.winner === 'draw';
  const st = result.stats || {};
  const perWeapon = Object.entries(st.perWeapon || {})
    .sort((a, b) => b[1].damage - a[1].damage)
    .map(([name, s]) => `<div class="kv"><span>${name}</span><b>${s.hits} 次 · ${s.damage} 伤害${s.crits ? ` · ${s.crits} 暴击` : ''}</b></div>`)
    .join('') || '<p class="hint">这一场没有武器出手。</p>';
  const syn = (run.lastSynergies || []).length
    ? run.lastSynergies.map((s) => `<div class="kv"><span>${s.name}</span><b>×${s.count}</b></div>`).join('')
    : '<p class="hint">本场没有触发联动。</p>';

  el.overlayBody.innerHTML = `
    <h2>第 ${result.round} 回合 · ${win ? '胜利' : draw ? '平局' : '失败'}</h2>
    <div class="result-grid">
      <div><h4>每件武器的输出</h4>${perWeapon}</div>
      <div>
        <h4>结果</h4>
        <div class="kv"><span>你</span><b>${Math.round(result.hpA)} 血</b></div>
        <div class="kv"><span>${result.oppName}</span><b>${Math.round(result.hpB)} 血</b></div>
        <div class="kv"><span>时长</span><b>${result.duration}s</b></div>
        ${win ? '<p class="good">赢了，+1 金。</p>' : draw ? '<p>平局，不掉血。</p>' : `<p class="bad">输了，掉 ${result.dmgTaken} 点生命。</p>`}
      </div>
      <div><h4>触发的联动</h4>${syn}</div>
    </div>
    <div class="row mt"><button class="primary" id="ov-ok">继续</button></div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-ok').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    nextRound();
  });
}

function nextRound() {
  const r = run.nextRound();
  if (r.over) { showGameOver(r.reason); return; }
  if (r.qualityUp) toast(`商店品质提升：${r.quality.label}`);
  if (r.offerBranch) { showBranchPicker(); return; }
  showPage('shop');
  renderAll();
}

function showBranchPicker() {
  const branches = run.availableBranches();
  if (!branches.length) { showPage('shop'); renderAll(); return; }
  el.overlayBody.innerHTML = `
    <h2>选择分支</h2>
    <p class="lead">${run.classDef.name} 的两个方向，选定本局基调。</p>
    <div class="class-grid two">
      ${branches.map((b) => `
        <button class="class-card branch" data-branch="${b.id}">
          <div class="cc-head"><span class="cc-name">${b.name}</span></div>
          <p class="cc-desc">${b.desc}</p>
        </button>`).join('')}
    </div>`;
  el.overlay.classList.remove('hidden');
  el.overlayBody.querySelectorAll('.class-card').forEach((b) => {
    b.addEventListener('click', () => {
      const res = run.chooseBranch(b.dataset.branch);
      if (!res.ok) { toast(res.reason); return; }
      el.overlay.classList.add('hidden');
      run.pendingBranch = false;
      toast(`分支：${res.branch.name}`);
      showPage('shop');
      renderAll();
    });
  });
}

function showGameOver(reason) {
  const h = run.header;
  el.overlayBody.innerHTML = `
    <h2>本局结束</h2>
    <p class="lead">${reason}</p>
    <div class="kv"><span>职业</span><b>${h.className}${h.branchName ? ' · ' + h.branchName : ''}</b></div>
    <div class="kv"><span>回合</span><b>${h.round}</b></div>
    <div class="kv"><span>战绩</span><b>${h.wins} 胜 ${h.losses} 负</b></div>
    <div class="kv"><span>合成</span><b>${h.fuses} 次</b></div>
    <div class="kv"><span>评分</span><b class="big">${run.finalScore()}</b></div>
    <div class="row mt"><button class="primary" id="ov-again">再来一局</button></div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-again').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    showClassPage();
  });
}

/** 合成图鉴：把全部配方按材料阶位列清楚 */
function showRecipes() {
  const rows = recipesByTier().map((r) => `
    <div class="rc-row">
      <span class="rc-pair">${r.material.name} ×2</span>
      <span class="rc-arrow">→</span>
      <span class="rc-out" style="color:${r.output.tier >= 4 ? '#e8b33c' : r.output.tier >= 3 ? '#b06fe0' : '#4fa3e3'}">${r.output.name}</span>
      <span class="rc-tag">T${r.output.tier}</span>
    </div>`).join('');
  el.overlayBody.innerHTML = `
    <h2>合成图鉴</h2>
    <p class="lead">两件<b>同名同阶</b>的道具放在背包里<b>相邻</b>，就会自动合成更高阶版本。
    合成后形状通常会变大，需要重新整理背包。</p>
    <div class="rc-list">${rows}</div>
    <div class="row mt"><button class="primary" id="ov-close">知道了</button></div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-close').addEventListener('click', () => el.overlay.classList.add('hidden'));
}

function showHelp() {
  el.overlayBody.innerHTML = `
    <h2>怎么玩</h2>
    <div class="tips">
      <p><b>页面分两层。</b>一级页面买东西、整理背包；点「开始战斗」进入二级页面看战斗。</p>
      <p><b>核心是整理。</b>道具是不规则形状，背包格子有限，怎么塞决定你能带多少。</p>
      <p><b>位置决定出手顺序。</b>从上到下、从左到右。关键武器摆左上角更早出手。</p>
      <p><b>相邻才生效。</b>宝石只给相邻道具加成，要贴着武器放。</p>
      <p><b>升级靠合成。</b>两件同名同阶相邻会自动合成，右侧「升级路径」面板会告诉你还差几件。</p>
      <p><b>商店品质自动提升。</b>不用手动升级，打到后面自然能买到高阶道具。</p>
      <p><b>操作。</b>拖动调整位置；R 旋转（Shift+R 反向）；拖到右侧出售区或按 Delete 卖出。</p>
      <p><b>目标。</b>先拿 ${MATCH.winTarget} 胜，或撑满 ${MATCH.maxRounds} 回合不掉光血。</p>
    </div>
    <div class="row mt"><button class="primary" id="ov-close">知道了</button></div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-close').addEventListener('click', () => el.overlay.classList.add('hidden'));
}

function heroArtFor(run) {
  return `assets/chars/char-${heroArtIndex(run.classDef.id)}.png`;
}

// 全部声明就绪后再启动，避免顶层 const/let 的暂时性死区
boot();
