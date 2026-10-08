/**
 * 主入口（v0.2）
 *
 * 装配：职业选择 → 准备（买 + 整理 + 合成）→ 战斗演出 → 结算 → 子职业
 *
 * 整理交互的口径：
 *   按下道具 → 跟随鼠标 → 落点实时高亮（绿可放/红不可放）→ 松手放下
 *   旋转：选中后按 R（正转）或 Shift+R（反转）
 *   卖出：选中后按 Delete
 *   空格点一下也能把选中道具移过去，适合精确落位
 */

import { Run, PHASE } from './core/run.js';
import { CLASSES } from './data/classes.js';
import { ECON, MATCH } from './data/constants.js';
import { progressList } from './data/synergies.js';
import { BattleStage } from './ui/stage.js';
import {
  renderBoard, renderShop, renderDetail, renderStats, renderCapacity,
  pxToCell, cellToPx, iconFor, LAYOUT,
} from './ui/render.js';

let run = null;
let selectedUid = null;
let drag = null;
let hover = null;
let stage = null;
let playing = false;
let autoTimer = null;

const el = {};

boot();

function boot() {
  cacheEls();
  bindStaticEvents();
  renderClassPicker();
}

function cacheEls() {
  el.app = document.getElementById('app');
  el.stats = document.getElementById('stats');
  el.board = document.getElementById('board');
  el.shop = document.getElementById('shop');
  el.detail = document.getElementById('detail');
  el.capacity = document.getElementById('capacity');
  el.stage = document.getElementById('stage-root');
  el.log = document.getElementById('log');
  el.battleLog = document.getElementById('battle-log');
  el.overlay = document.getElementById('overlay');
  el.overlayBody = document.getElementById('overlay-body');
  el.toast = document.getElementById('toast');
  el.btnBattle = document.getElementById('btn-battle');
  el.btnRefresh = document.getElementById('btn-refresh');
  el.btnUpgrade = document.getElementById('btn-upgrade');
  el.btnAuto = document.getElementById('btn-auto');
  el.btnReset = document.getElementById('btn-reset');
  el.btnHelp = document.getElementById('btn-help');
  el.buildList = document.getElementById('build-list');
  el.orderList = document.getElementById('order-list');
  el.synergyList = document.getElementById('synergy-list');
}

// ============ 职业选择 ============

function renderClassPicker() {
  el.overlayBody.innerHTML = `
    <h2>选择职业</h2>
    <p class="lead">职业决定背包尺寸、初始道具与被动。第 ${MATCH.branchRound} 回合可以再选一个子职业分支。</p>
    <div class="class-grid">
      ${CLASSES.map((c) => `
        <button class="class-card" data-class="${c.id}">
          <div class="cc-head">
            <span class="cc-name">${c.name}</span>
            <span class="cc-bag">${c.bag.cols}×${c.bag.rows}</span>
          </div>
          <p class="cc-desc">${c.desc}</p>
          <div class="cc-passive"><b>${c.passive.name}</b>${c.passive.desc}</div>
          <div class="cc-meta">生命 ${c.hp} · 金币 ${c.gold}</div>
          <div class="cc-branches">分支：${c.branches.map((b) => b.name).join(' / ')}</div>
        </button>`).join('')}
    </div>`;
  el.overlay.classList.remove('hidden');
  el.overlayBody.querySelectorAll('.class-card').forEach((b) => {
    b.addEventListener('click', () => {
      el.overlay.classList.add('hidden');
      startRun(b.dataset.class);
    });
  });
}

function startRun(classId, seed = Math.floor(Math.random() * 1e9)) {
  run = new Run({ seed, classId });
  selectedUid = null;
  hover = null;
  playing = false;
  if (stage) { stage.destroy(); stage = null; }
  el.battleLog.innerHTML = '';
  el.stage.innerHTML = '<p class="hint center">开始战斗后这里会播放双方角色与攻击动效。</p>';
  renderAll();
  toast(`已选择 ${run.classDef.name}`);
}

// ============ 渲染 ============

function renderAll() {
  if (!run) return;
  renderStats(el.stats, run);
  renderCapacity(el.capacity, run.board);

  const orderMap = new Map(run.board.triggerOrder().map((uid, i) => [uid, i]));

  renderBoard(el.board, run.board, {
    selectedUid,
    hover,
    orderMap,
    onGrab: onGrab,
  });

  renderShop(el.shop, run.shop, run.header.gold, {
    onBuy: (i) => doBuy(i),
    onLock: (i) => { run.shop.toggleLock(i); renderAll(); },
  });

  renderDetail(el.detail, selectedUid ? run.board.get(selectedUid) : null, run.board);

  renderBuildList();
  renderOrderList();
  renderSynergyList();
  renderLog();

  const prep = run.phase === PHASE.PREPARE && !playing;
  el.btnBattle.disabled = !prep;
  el.btnRefresh.disabled = !prep || run.header.gold < run.refreshCost();
  el.btnUpgrade.disabled = !prep || run.shop.level >= (run.bonus.maxShopLevel || ECON.maxShopLevel);
  el.btnAuto.disabled = !prep;
  el.btnRefresh.textContent = run.refreshCost() === 0 ? '刷新商店（免费）' : `刷新商店（${run.refreshCost()} 金）`;
  el.btnBattle.textContent = playing ? '战斗中…' : '开始战斗';
}

function renderBuildList() {
  const list = run.board.list().slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (!list.length) { el.buildList.innerHTML = '<p class="hint">背包是空的。</p>'; return; }
  el.buildList.innerHTML = list.map((e) => `
    <div class="bl-row ${e.item.cat}">
      <img src="${iconFor(e.item)}" alt="" onerror="this.style.display='none'">
      <span class="bl-name">${e.item.name}</span>
      <span class="bl-shape">${e.shape.map((r) => r.replace(/X/g, '■').replace(/\./g, '·')).join(' / ')}</span>
    </div>`).join('');
}

function renderOrderList() {
  const order = run.board.triggerOrder();
  if (!order.length) { el.orderList.innerHTML = '<p class="hint">暂无。</p>'; return; }
  el.orderList.innerHTML = order.map((uid, i) => {
    const e = run.board.get(uid);
    if (!e) return '';
    return `<div class="od-row">
      <span class="od-idx">${i + 1}</span>
      <img src="${iconFor(e.item)}" alt="" onerror="this.style.display='none'">
      <span class="od-name">${e.item.name}</span>
      <span class="od-pos">第 ${e.x + 1} 列 ${e.y + 1} 行</span>
    </div>`;
  }).join('');
}

function renderLog() {
  const lines = run.log.slice(-80);
  el.log.innerHTML = lines.map((l) => `<div class="lg">${l.text}</div>`).join('');
  el.log.scrollTop = el.log.scrollHeight;
}

/** 组合联动：已激活的高亮，差几件的显示进度 */
function renderSynergyList() {
  if (!el.synergyList) return;
  const list = progressList(run.board);
  const active = list.filter((x) => x.ready);
  const near = list.filter((x) => !x.ready && x.gap <= 2).slice(0, 4);

  if (!active.length && !near.length) {
    el.synergyList.innerHTML = '<p class="hint">暂时没有联动。同类道具攒够数量会触发额外效果。</p>';
    return;
  }

  const row = (x, isActive) => `
    <div class="sy-row ${isActive ? 'on' : ''}">
      <div class="sy-head">
        <span class="sy-name">${x.synergy.name}</span>
        <span class="sy-count">${x.count}/${x.synergy.need}</span>
      </div>
      <div class="sy-desc">${x.synergy.desc}</div>
      ${isActive ? '' : `<div class="sy-gap">还差 ${x.gap} 件</div>`}
    </div>`;

  el.synergyList.innerHTML = `
    ${active.length ? `<div class="sy-title">已激活 ${active.length} 条</div>${active.map((x) => row(x, true)).join('')}` : ''}
    ${near.length ? `<div class="sy-title dim">接近触发</div>${near.map((x) => row(x, false)).join('')}` : ''}`;
}

function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 1800);
}

// ============ 商店 ============

function doBuy(i) {
  if (run.phase !== PHASE.PREPARE || playing) return;
  const res = run.buy(i);
  if (!res.ok) toast(res.reason);
  renderAll();
}

// ============ 整理：拖拽 ============

function onGrab(ev, entry) {
  if (run.phase !== PHASE.PREPARE || playing) return;
  ev.preventDefault();
  selectedUid = entry.item.uid;

  const boardRect = el.board.getBoundingClientRect();
  const cellPixel = cellToPx(entry.x, entry.y);
  drag = {
    uid: entry.item.uid,
    shape: entry.shape,
    grabbedAt: { x: ev.clientX, y: ev.clientY },
    // 抓取点对应形状里的哪一格：让拖拽手感贴合手指按下那块
    anchorOffsetX: ev.clientX - (boardRect.left + cellPixel.left),
    anchorOffsetY: ev.clientY - (boardRect.top + cellPixel.top),
    moved: false,
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderAll();
}

function onPointerMove(ev) {
  if (!drag) return;
  const dist = Math.abs(ev.clientX - drag.grabbedAt.x) + Math.abs(ev.clientY - drag.grabbedAt.y);
  if (dist > 4) drag.moved = true;
  if (!drag.moved) return;

  const boardRect = el.board.getBoundingClientRect();
  // 用抓取偏移换算锚点，拖动时形状跟手
  const anchorPxX = ev.clientX - boardRect.left - drag.anchorOffsetX;
  const anchorPxY = ev.clientY - boardRect.top - drag.anchorOffsetY;
  const x = Math.round(anchorPxX / LAYOUT.STEP);
  const y = Math.round(anchorPxY / LAYOUT.STEP);

  const cellsAbs = run.board.footprint(drag.shape, x, y);
  const ok = run.board.canPlace(drag.shape, x, y, drag.uid);
  hover = { cells: cellsAbs, ok, anchor: { x, y } };

  // 拖拽中的幽灵跟随
  const ghost = document.getElementById('drag-ghost');
  if (ghost) {
    const sz = boardSize(drag.shape);
    ghost.style.left = `${anchorPxX + boardRect.left}px`;
    ghost.style.top = `${anchorPxY + boardRect.top}px`;
    ghost.style.width = `${sz.w * LAYOUT.STEP - LAYOUT.GAP}px`;
    ghost.style.height = `${sz.h * LAYOUT.STEP - LAYOUT.GAP}px`;
    ghost.classList.toggle('bad', !ok);
  }
  renderAll();
}

function onPointerUp(ev) {
  if (!drag) return;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);

  if (drag.moved && hover) {
    const res = run.moveTo(drag.uid, hover.anchor.x, hover.anchor.y);
    if (!res.ok) toast(res.reason);
  }
  const ghost = document.getElementById('drag-ghost');
  if (ghost) ghost.remove();
  drag = null;
  hover = null;
  renderAll();
}

function boardSize(shape) {
  return {
    w: Math.max(...shape.map((r) => r.length)),
    h: shape.length,
  };
}

// ============ 键盘 ============

function bindStaticEvents() {
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    if (!selectedUid || !run) return;
    if (ev.key === 'r' || ev.key === 'R') {
      if (run.phase !== PHASE.PREPARE || playing) return;
      const res = run.rotate(selectedUid, ev.shiftKey ? -1 : 1);
      if (!res.ok) toast(res.reason);
      renderAll();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (run.phase !== PHASE.PREPARE || playing) return;
      const res = run.sell(selectedUid);
      if (res.ok) toast(`卖出 +${res.price} 金`);
      selectedUid = null;
      renderAll();
    } else if (ev.key === 'Escape') {
      selectedUid = null;
      renderAll();
    } else if (ev.key === '[' || ev.key === ']') {
      // [ ] 快速循环选中背包里的道具
      const list = run.board.triggerOrder();
      if (!list.length) return;
      const i = list.indexOf(selectedUid);
      const next = ev.key === ']' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      selectedUid = list[next];
      renderAll();
    }
  });

  el.board.addEventListener('click', (ev) => {
    if (!run || run.phase !== PHASE.PREPARE || playing) return;
    const cell = ev.target.closest('.cellbg');
    if (!cell || !selectedUid) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const res = run.moveTo(selectedUid, x, y);
    if (!res.ok) toast(res.reason);
    renderAll();
  });

  el.btnBattle.addEventListener('click', () => {
    if (!run || playing) return;
    if (run.phase !== PHASE.PREPARE) return;
    const start = run.startBattle();
    if (!start.ok) { toast(start.reason); return; }
    runBattle();
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

  el.btnAuto.addEventListener('click', () => {
    const r = run.autoArrange();
    toast(`自动整理：放回 ${r.placed} 件`);
    renderAll();
  });

  el.btnReset.addEventListener('click', () => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    renderClassPicker();
  });

  el.btnHelp.addEventListener('click', showHelp);
}

// ============ 战斗 ============

function runBattle() {
  const result = run.runBattle();
  run.lastSynergies = (result.synergies || []);
  playing = true;
  renderAll();

  const heroArt = heroArtFor(run);
  const foeArt = `assets/chars/char-${(result.round % 6)}.png`;

  el.stage.innerHTML = '';
  stage = new BattleStage(el.stage, {
    speed: 1.35,
    onEvent: (ev) => {
      if (ev.type === 'end') return;
      appendBattleLog(ev);
    },
    onFinish: () => {
      playing = false;
      showResult(result);
    },
  });

  stage.setup({
    left: { name: '你', cls: run.header.branchName || run.header.className, hp: result.hpA, art: heroArt },
    right: { name: result.oppName, cls: '', hp: result.hpB, art: foeArt },
  });
  stage.play(result.events, {
    weaponsA: run.board.list()
      .filter((e) => e.item.cat === 'weapon')
      .sort((a, b) => run.board.orderIndex(a.item.uid) - run.board.orderIndex(b.item.uid))
      .map((e) => ({ order: run.board.orderIndex(e.item.uid), name: e.item.name })),
    weaponsB: result.foeBuild.filter((i) => i.cat === 'weapon')
      .map((i, idx) => ({ order: idx, name: i.name })),
  });
}

function appendBattleLog(ev) {
  const line = run.lastResult.logLines.find((l) => l.t === ev.t && l.type === ev.type);
  const text = line ? line.text : eventTextShort(ev);
  const d = document.createElement('div');
  d.className = `bl ${ev.type}`;
  d.innerHTML = `<span class="t">${(ev.t ?? 0).toFixed(1)}s</span>${text}`;
  el.battleLog.appendChild(d);
  el.battleLog.scrollTop = el.battleLog.scrollHeight;
}

function eventTextShort(ev) {
  switch (ev.type) {
    case 'attack': return `${ev.side === 'A' ? '你' : '对手'} ${ev.weaponName} → ${ev.damage}${ev.crit ? ' 暴击' : ''}`;
    case 'heal': return `回复 ${ev.amount}`;
    case 'regen': return `持续回复 ${ev.amount}`;
    case 'burn': return `点燃 ${ev.amount}`;
    case 'poison': return `中毒 ${ev.stacks} 层`;
    case 'poisonTick': return `中毒发作 ${ev.amount}`;
    case 'frost': return `减速 ${ev.chill} 层`;
    case 'armorBreak': return `破甲 ${ev.amount}`;
    case 'thorns': return `反伤 ${ev.amount}`;
    default: return ev.type;
  }
}

function showResult(result) {
  run.phase = PHASE.RESULT;
  const win = result.winner === 'A';
  const draw = result.winner === 'draw';
  const title = win ? '胜利' : draw ? '平局' : '失败';
  const st = result.stats || {};
  const perWeapon = Object.entries(st.perWeapon || {})
    .sort((a, b) => b[1].damage - a[1].damage)
    .map(([name, s]) => `<div class="kv"><span>${name}</span><b>${s.hits} 次 · ${s.damage} 伤害${s.crits ? ` · ${s.crits} 暴击` : ''}</b></div>`)
    .join('') || '<p class="hint">这一场没有武器出手。</p>';

  const syn = run.lastSynergies || [];
  const synHtml = syn.length
    ? syn.map((s) => `<div class="kv"><span>${s.name}</span><b>×${s.count}</b></div>`).join('')
    : '<p class="hint">本场没有触发联动。</p>';

  el.overlayBody.innerHTML = `
    <h2>第 ${result.round} 回合 · ${title}</h2>
    <div class="result-grid">
      <div>
        <h4>你的输出</h4>
        ${perWeapon}
      </div>
      <div>
        <h4>双方状态</h4>
        <div class="kv"><span>你</span><b>${Math.round(result.hpA)} 血 · 强度 ${result.myPower}</b></div>
        <div class="kv"><span>${result.oppName}</span><b>${Math.round(result.hpB)} 血 · 强度 ${result.foePower}</b></div>
        <div class="kv"><span>战斗时长</span><b>${result.duration}s</b></div>
        <div class="kv"><span>总出手</span><b>${st.totalAttacks || 0} 次</b></div>
        ${win ? '<p class="good">赢了，+1 金。</p>' : draw ? '<p>平局，不掉血。</p>' : `<p class="bad">输了，掉 ${result.dmgTaken} 点生命。</p>`}
      </div>
      <div>
        <h4>触发的组合联动</h4>
        ${synHtml}
      </div>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="primary" id="ov-ok">继续</button>
    </div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-ok').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    nextRound();
  });
  renderAll();
}

function nextRound() {
  const r = run.nextRound();
  if (r.over) { showGameOver(r.reason); return; }
  if (r.offerBranch) { showBranchPicker(); return; }
  renderAll();
}

function showBranchPicker() {
  const branches = run.availableBranches();
  if (!branches.length) { renderAll(); return; }
  el.overlayBody.innerHTML = `
    <h2>选择子职业分支</h2>
    <p class="lead">${run.classDef.name} 的两个方向，选一个定下本局基调。</p>
    <div class="class-grid two">
      ${branches.map((b) => `
        <button class="class-card branch" data-branch="${b.id}">
          <div class="cc-head"><span class="cc-name">${b.name}</span></div>
          <p class="cc-desc">${b.desc}</p>
          <div class="cc-meta">解锁道具：${(b.unlockItems || []).join('、') || '无'}</div>
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
    <div class="kv"><span>总回合</span><b>${h.round}</b></div>
    <div class="kv"><span>战绩</span><b>${h.wins} 胜 ${h.losses} 负</b></div>
    <div class="kv"><span>剩余生命</span><b>${h.hp}</b></div>
    <div class="kv"><span>合成次数</span><b>${h.fuses}</b></div>
    <div class="kv"><span>总评分</span><b class="big">${run.finalScore()}</b></div>
    <div class="row" style="margin-top:16px">
      <button class="primary" id="ov-again">再来一局</button>
    </div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-again').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
    renderClassPicker();
  });
}

function showHelp() {
  el.overlayBody.innerHTML = `
    <h2>怎么玩</h2>
    <div class="tips">
      <p><b>核心是整理。</b>道具是各种不规则的形状，背包格子有限，怎么塞进去决定你能带多少、能触发什么。</p>
      <p><b>触发顺序按位置定。</b>从上到下、从左到右。越靠前出手越早，关键武器要往左上角摆。</p>
      <p><b>相邻才生效。</b>宝石给相邻道具加属性，同类道具相邻有加成，把宝石塞在武器旁边才有用。</p>
      <p><b>合成。</b>两件同名同阶的道具相邻会自动合成更高阶版本。合成后形状会变，可能要重新整理。</p>
      <p><b>操作。</b>拖动道具调整位置；按 R 旋转（Shift+R 反向）；Delete 卖出；中括号 [ ] 循环选中。</p>
      <p><b>职业。</b>开局选职业决定背包大小与被动；第 ${MATCH.branchRound} 回合起可选子职业分支。</p>
      <p><b>目标。</b>先拿 ${MATCH.winTarget} 胜，或撑满 ${MATCH.maxRounds} 回合不掉光血。</p>
    </div>
    <div class="row" style="margin-top:16px"><button class="primary" id="ov-close">知道了</button></div>`;
  el.overlay.classList.remove('hidden');
  document.getElementById('ov-close').addEventListener('click', () => el.overlay.classList.add('hidden'));
}

function heroArtFor(run) {
  const map = {
    ranger: 1, warrior: 0, mage: 2, rogue: 5, merchant: 6, druid: 7,
  };
  const idx = map[run.classDef.id] ?? 0;
  return `assets/chars/char-${idx}.png`;
}
