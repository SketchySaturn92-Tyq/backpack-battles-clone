/**
 * 主入口：装配玩家操作、渲染与回合流程。
 * 交互约定：
 *   点道具 → 选中；再点空格 → 移动过去
 *   拖拽道具 → 落点高亮，松手放置
 *   R 旋转，Delete 卖出
 *   商店：左键买，右键 / Shift+左键 锁定
 */

import { Run, PHASE } from './core/run.js';
import { shapeCells } from './core/grid.js';
import { ECON, MATCH, BOARD } from './data/constants.js';
import {
  renderBoard, renderShop, renderStats, renderLog, renderDetail, cellToPx, LAYOUT,
} from './ui/render.js';

let run = new Run({ seed: 20261008 });
let selectedUid = null;
let drag = null;          // {uid, offsetX, offsetY, shape, ghost}
let hover = null;         // {cells, ok, x, y}
let battleQueue = [];
let battleTimer = null;
let playing = false;      // 回放期间锁住操作，避免打断动画或重复结算

const el = {
  board: document.getElementById('board'),
  shop: document.getElementById('shop'),
  stats: document.getElementById('stats'),
  log: document.getElementById('log'),
  detail: document.getElementById('detail'),
  toast: document.getElementById('toast'),
  overlay: document.getElementById('overlay'),
  overlayBody: document.getElementById('overlay-body'),
  btnBattle: document.getElementById('btn-battle'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnUpgrade: document.getElementById('btn-upgrade'),
  btnReset: document.getElementById('btn-reset'),
  btnHelp: document.getElementById('btn-help'),
};

boot();

function boot() {
  bindButtons();
  bindBoardEvents();
  bindKeyboard();
  renderAll();
  showHelp(true);
}

// ---------- 渲染 ----------

function renderAll() {
  renderStats(el.stats, run.header, run.shop);
  renderShop(el.shop, run.shop, run.header.gold, {
    onBuy: (i) => doBuy(i),
    onLock: (i) => { run.shop.toggleLock(i); renderAll(); },
  });
  renderBoard(el.board, run.board, {
    onGrab: onGrab,
    onDrop: onDrop,
    selectedUid,
    hoverCells: hover?.cells,
    hoverOk: hover?.ok,
  });
  renderLog(el.log, run.log);
  renderDetail(el.detail, selectedUid ? run.board.get(selectedUid) : null, run.board);
  // 准备阶段用于开战，结算阶段用于推进下一回合，两者都要可点；回放期间锁住
  el.btnBattle.disabled = playing || !(run.phase === PHASE.PREPARE || run.phase === PHASE.RESULT);
  el.btnRefresh.disabled = playing || run.phase !== PHASE.PREPARE || run.header.gold < ECON.refreshCost;
  el.btnUpgrade.disabled = playing || run.phase !== PHASE.PREPARE || run.shop.level >= ECON.maxShopLevel;
  el.btnBattle.textContent = playing ? '战斗中…' : (run.phase === PHASE.RESULT ? '下一回合' : '开始战斗');
}

function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 1600);
}

// ---------- 商店 ----------

function doBuy(i) {
  if (run.phase !== PHASE.PREPARE) return;
  const res = run.buy(i);
  if (!res.ok) { toast(res.reason); }
  renderAll();
}

// ---------- 拖拽 ----------

function onGrab(ev, entry) {
  if (run.phase !== PHASE.PREPARE) return;
  ev.preventDefault();
  selectedUid = entry.item.uid;
  const px = cellToPx(entry.x, entry.y);
  drag = {
    uid: entry.item.uid,
    startX: ev.clientX, startY: ev.clientY,
    grabOffsetX: ev.clientX - (el.board.getBoundingClientRect().left + px.left),
    grabOffsetY: ev.clientY - (el.board.getBoundingClientRect().top + px.top),
    shape: entry.shape,
    moved: false,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderAll();
}

function onPointerMove(ev) {
  if (!drag) return;
  if (Math.abs(ev.clientX - drag.startX) + Math.abs(ev.clientY - drag.startY) > 4) drag.moved = true;
  if (!drag.moved) return;
  const target = pointerToCell(ev);
  const cells = run.board.footprint(drag.shape, target.x, target.y);
  hover = { cells, ok: run.board.canPlace(drag.shape, target.x, target.y, drag.uid), x: target.x, y: target.y };
  renderAll();
}

function onPointerUp(ev) {
  if (!drag) return;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  if (drag.moved) {
    const target = pointerToCell(ev);
    const ok = run.board.canPlace(drag.shape, target.x, target.y, drag.uid);
    if (ok) {
      run.move(drag.uid, target.x, target.y, drag.shape);
    } else {
      toast('这个位置放不下');
    }
  }
  drag = null; hover = null;
  renderAll();
}

function pointerToCell(ev) {
  const r = el.board.getBoundingClientRect();
  const step = LAYOUT.CELL + LAYOUT.GAP;
  const x = Math.round((ev.clientX - r.left - LAYOUT.PAD) / step);
  const y = Math.round((ev.clientY - r.top - LAYOUT.PAD) / step);
  return {
    x: Math.max(0, Math.min(BOARD.cols - 1, x)),
    y: Math.max(0, Math.min(BOARD.rows - 1, y)),
  };
}

// 点空格：把选中的道具移过去
function bindBoardEvents() {
  el.board.addEventListener('click', (ev) => {
    if (run.phase !== PHASE.PREPARE) return;
    const cell = ev.target.closest('.cellbg');
    if (!cell || !selectedUid) return;
    const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
    const entry = run.board.get(selectedUid);
    if (!entry) return;
    if (run.board.canPlace(entry.shape, x, y, selectedUid)) {
      run.move(selectedUid, x, y, entry.shape);
      renderAll();
    } else {
      toast('放不下，换个位置');
    }
  });
}

function onDrop() { /* 拖拽已在 pointerup 处理 */ }

// ---------- 键盘 ----------

function bindKeyboard() {
  window.addEventListener('keydown', (ev) => {
    if (!selectedUid) return;
    if (ev.key === 'r' || ev.key === 'R') {
      if (run.phase === PHASE.PREPARE && run.rotate(selectedUid)) renderAll();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (run.phase === PHASE.PREPARE) { run.sell(selectedUid); selectedUid = null; renderAll(); }
    } else if (ev.key === 'Escape') {
      selectedUid = null; renderAll();
    }
  });
}

// ---------- 按钮 ----------

function bindButtons() {
  el.btnBattle.addEventListener('click', () => {
    if (run.phase === PHASE.RESULT) { nextRound(); return; }
    if (run.phase !== PHASE.PREPARE) return;
    const start = run.startBattle();
    if (!start.ok) { toast(start.reason); return; }
    const result = run.runBattle();
    playBattle(result);
  });

  el.btnRefresh.addEventListener('click', () => {
    const r = run.refreshShop();
    if (!r.ok) toast(r.reason);
    renderAll();
  });

  el.btnUpgrade.addEventListener('click', () => {
    const r = run.upgradeShop();
    if (!r.ok) toast(r.reason);
    renderAll();
  });

  el.btnReset.addEventListener('click', () => {
    run = new Run({ seed: Math.floor(Math.random() * 1e9) });
    selectedUid = null; battleQueue = [];
    renderAll();
    toast('已重开一局');
  });

  el.btnHelp.addEventListener('click', () => showHelp(true));
}

// ---------- 战斗回放 ----------

function playBattle(result) {
  battleQueue = [...result.log];
  playing = true;
  el.log.innerHTML = '';
  clearInterval(battleTimer);
  // 回放总时长压在 6 秒左右：行数多就加快，行数少就放慢，避免长战斗看半天
  const perLine = Math.max(22, Math.min(110, Math.round(6000 / Math.max(1, battleQueue.length))));
  renderAll();
  battleTimer = setInterval(() => {
    if (!battleQueue.length) {
      clearInterval(battleTimer);
      playing = false;
      showResult(result);
      return;
    }
    const row = battleQueue.shift();
    run.log.push(row);
    renderLog(el.log, run.log);
  }, perLine);
}

function showResult(result) {
  run.phase = PHASE.RESULT;
  const win = result.winner === 'A';
  const draw = result.winner === 'draw';
  const title = win ? '胜利' : draw ? '平局' : '失败';
  const listItems = (arr) => arr.map((i) => `${i.name}·T${i.tier}`).join('、') || '（空）';
  el.overlayBody.innerHTML = `
    <h2>第 ${result.round} 回合 · ${title}</h2>
    <p>对手：${result.oppName}　构筑强度 ${result.foePower}　你的强度 ${result.myPower}</p>
    <p>对手带了：${listItems(result.oppItems || [])}</p>
    <p>你带了：${listItems(result.myItems || [])}</p>
    <p>剩余生命：你 ${result.hpA} / 对手 ${result.hpB}</p>
    <p>${win ? '赢了，+1 金。' : draw ? '平局，不掉血。' : `输了，掉 ${result.dmgTaken} 点血。`}</p>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="ov-ok">继续</button>
    </div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-ok').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    renderAll();
  });
  renderAll();
  if (run.header.hp <= 0 || run.header.wins >= MATCH.winTarget) {
    // 让玩家先看完这一回合，继续时再结算
  }
}

function nextRound() {
  const r = run.nextRound();
  if (r.over) {
    showGameOver(r.reason);
    return;
  }
  renderAll();
}

function showGameOver(reason) {
  const h = run.header;
  el.overlayBody.innerHTML = `
    <h2>本局结束</h2>
    <p>${reason}</p>
    <p>总回合 ${h.round}　胜 ${h.wins}　负 ${h.losses}　剩余生命 ${h.hp}</p>
    <p>总评分：<b style="color:#e8b33c">${run.finalScore()}</b></p>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="ov-again">再来一局</button>
    </div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-again').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    run = new Run({ seed: Math.floor(Math.random() * 1e9) });
    selectedUid = null;
    renderAll();
  });
}

function showHelp(force) {
  if (!force) return;
  el.overlayBody.innerHTML = `
    <h2>背包乱斗 · 复刻版</h2>
    <p>在 6×7 的背包里塞进道具，让相邻关系生效，然后跟对手自动打一场。</p>
    <div class="tips">
      <p><b>买</b>：左键商店卡片。右键或按住 Shift 点，可以把卡片锁住不被刷新。</p>
      <p><b>放</b>：拖动道具到背包空格，绿色表示能放，红色表示放不下。</p>
      <p><b>转</b>：选中道具后按 R 旋转形状。</p>
      <p><b>卖</b>：选中后按 Delete，退回一半金币。</p>
      <p><b>合成</b>：两件同名同阶的道具相邻，会自动合成高阶版本。</p>
      <p><b>相邻</b>：宝石给相邻道具加成；同类武器挨在一起会提速，最多三层。</p>
      <p><b>目标</b>：先拿 ${MATCH.winTarget} 胜，或在 ${MATCH.maxRounds} 回合内不掉光血。</p>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="ov-start">开始</button>
    </div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-start').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
  });
}
