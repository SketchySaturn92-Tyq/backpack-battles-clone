/**
 * 渲染层 v0.3
 *
 * 关键改动：拖拽不再重建 DOM。
 *  - renderBoard 只在状态变化时调用一次
 *  - 拖拽期间只做两件小事：移动被拖那一件的 transform、切换少数格子的高亮 class
 *  - 两者都是 O(形状格数)，不再是 O(整个界面)
 */

import { cells, size } from '../data/shapes.js';
import { CATEGORIES, RARITY, chargeSeconds } from '../data/items.js';
import { BOARD, SHOP_QUALITY } from '../data/constants.js';
import { itemEffectiveStats, dpsOf, armoredDps } from '../core/analyze.js';
import { upgradeOf, chainOf } from '../data/recipes.js';

/* 格子尺寸按可用空间自适应：背包要尽量大，但不能溢出屏幕 */
const GAP = BOARD.gap;
const PAD = BOARD.pad;
let CELL = BOARD.cell;
let STEP = CELL + GAP;

export function setCellSize(px) {
  const next = Math.max(26, Math.min(104, Math.round(px)));
  if (next === CELL) return false;
  CELL = next;
  STEP = CELL + GAP;
  return true;
}
export function getCellSize() { return CELL; }
export function getLayout() { return { CELL, GAP, PAD, STEP }; }

export function cellToPx(x, y) {
  return { left: PAD + x * STEP, top: PAD + y * STEP };
}

export function iconFor(item) { return `assets/icons/${item.id}.png`; }
export function catName(cat) { return CATEGORIES[cat]?.name || cat; }
export function tierColor(tier) { return (RARITY[tier] || RARITY[1]).color; }

// ============ 背包 ============

export function renderBoard(root, board, opts = {}) {
  const { selectedUid, draggingUid, onGrab, showOrder = true, orderMap = null } = opts;
  root.innerHTML = '';
  root.style.gridTemplateColumns = `repeat(${board.cols}, ${CELL}px)`;
  root.style.gridTemplateRows = `repeat(${board.rows}, ${CELL}px)`;
  root.style.gap = `${GAP}px`;
  root.style.padding = `${PAD}px`;
  root.style.width = `${board.cols * STEP - GAP + PAD * 2}px`;
  root.style.height = `${board.rows * STEP - GAP + PAD * 2}px`;

  // 缓存格子元素，拖拽时按坐标直接取，不再 querySelector 全表
  const cellEls = new Map();

  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const d = document.createElement('div');
      d.className = 'cellbg';
      if (showOrder && x === 0) d.dataset.row = y + 1;
      root.appendChild(d);
      cellEls.set(`${x},${y}`, d);
    }
  }
  root._cellEls = cellEls;

  const chipEls = new Map();

  for (const entry of board.list()) {
    const el = document.createElement('div');
    el.className = `shape-item cat-${entry.item.cat}`;
    el.dataset.uid = entry.item.uid;
    el.style.left = `${cellToPx(entry.x, entry.y).left}px`;
    el.style.top = `${cellToPx(entry.x, entry.y).top}px`;
    el.style.width = `${entry.w ?? size(entry.shape).w * STEP - GAP}px`;
    el.style.height = `${entry.h ?? size(entry.shape).h * STEP - GAP}px`;

    // 占格轮廓：只留极淡的边界，用于对齐参考；
    // 视觉主体是下面那张物品图，不再是「小图标 + 大方块」。
    for (const c of cells(entry.shape)) {
      const cell = document.createElement('span');
      cell.className = 'sc';
      cell.style.left = `${c.x * STEP}px`;
      cell.style.top = `${c.y * STEP}px`;
      cell.style.width = `${CELL}px`;
      cell.style.height = `${CELL}px`;
      el.appendChild(cell);
    }

    if (entry.item.uid === selectedUid) el.classList.add('selected');
    if (entry.item.uid === draggingUid) el.classList.add('dragging');
    if (board.neighbors(entry.item.uid).size > 0) el.classList.add('linked');

    if (showOrder) {
      const ord = orderMap ? orderMap.get(entry.item.uid) : board.orderIndex(entry.item.uid);
      const badge = document.createElement('span');
      badge.className = 'orderbadge';
      badge.textContent = `${(ord ?? 0) + 1}`;
      el.appendChild(badge);
    }

    const inner = document.createElement('div');
    inner.className = 'inner';
    inner.innerHTML = `
      <img class="art" src="${iconFor(entry.item)}" alt="" onerror="this.style.display='none'">
      <span class="nm">${entry.item.name}</span>`;
    el.appendChild(inner);

    el.addEventListener('pointerdown', (ev) => onGrab?.(ev, entry));
    root.appendChild(el);
    chipEls.set(entry.item.uid, el);
  }

  root._chipEls = chipEls;
}

/** 拖拽时只改这一个函数：给出被拖道具当前该在哪 */
export function moveChip(root, uid, dx, dy) {
  const el = root._chipEls?.get(uid);
  if (!el) return;
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
}

export function resetChip(root, uid) {
  const el = root._chipEls?.get(uid);
  if (el) {
    el.style.transform = '';
    el.classList.remove('dragging');
  }
}

export function setChipDragging(root, uid, on) {
  const el = root._chipEls?.get(uid);
  if (!el) return;
  el.classList.toggle('dragging', on);
  el.style.willChange = on ? 'transform' : '';
}

/** 落点高亮：只碰形状覆盖到的那几格 */
export function setHover(root, hoverCells, ok, anchor) {
  const map = root._cellEls;
  if (!map) return;
  for (const el of map.values()) {
    if (el.classList.contains('hover-ok') || el.classList.contains('hover-bad') || el.classList.contains('hover-anchor')) {
      el.classList.remove('hover-ok', 'hover-bad', 'hover-anchor');
    }
  }
  if (!hoverCells) return;
  for (const c of hoverCells) {
    const el = map.get(`${c.x},${c.y}`);
    if (el) el.classList.add(ok ? 'hover-ok' : 'hover-bad');
  }
  if (anchor) {
    const el = map.get(`${anchor.x},${anchor.y}`);
    if (el) el.classList.add('hover-anchor');
  }
}

/** 出售区高亮 */
export function setSellActive(on) {
  const z = document.getElementById('sell-zone');
  if (z) z.classList.toggle('armed', !!on);
}

// ============ 商店 ============

export function renderShop(root, shop, gold, { onBuy, onLock }) {
  root.innerHTML = '';
  shop.slots.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = 'shop-card';
    if (slot.sold) el.classList.add('sold');
    if (shop.locked[i]) el.classList.add('locked');
    const afford = gold >= slot.item.price;

    const d = slot.item.stats?.damage;
    const charge = slot.item.cat === 'weapon' ? chargeSeconds(slot.item) : 0;
    const dps = d && charge ? d / charge : null;
    const dpsLine = dps ? `<span class="dps">${dps.toFixed(1)}/秒</span>` : '';
    const chargeLine = charge ? `<span class="chg">读条 ${charge.toFixed(1)}s</span>` : '';

    el.innerHTML = `
      <div class="sc-top">
        <span class="lock ${shop.locked[i] ? 'on' : ''}">${shop.locked[i] ? '锁' : '○'}</span>
        <span class="tier" style="color:${tierColor(slot.item.tier)}">T${slot.item.tier}</span>
      </div>
      <div class="mini-shape">${miniShapeSvg(slot.item.shape, slot.item.cat)}</div>
      <img class="ico" src="${iconFor(slot.item)}" alt="" onerror="this.style.display='none'">
      <div class="nm">${slot.item.name}</div>
      <div class="cat">${catName(slot.item.cat)} · ${cells(slot.item.shape).length}格</div>
      ${dpsLine}${chargeLine}
      <div class="pr" style="${afford ? '' : 'color:#e2604a'}">${slot.item.price} 金</div>`;
    el.addEventListener('click', (ev) => {
      if (ev.shiftKey || ev.altKey) { onLock(i); return; }
      onBuy(i);
    });
    el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onLock(i); });
    root.appendChild(el);
  });
}

/** 商店品质（自动提升，玩家不用管） */
export function renderShopQuality(el, shop) {
  const q = shop.quality;
  const next = SHOP_QUALITY.find((s) => s.fromRound > shop.round);
  el.innerHTML = `<span class="q-label">品质</span><span class="q-badge">${q.label}</span>` +
    (next ? `<span class="q-next">第 ${next.fromRound} 回合升到「${next.label}」</span>` : '');
}

/** 商店推荐：告诉玩家买什么能凑出进阶 */
export function renderShopHints(el, hints) {
  if (!hints || !hints.length) { el.innerHTML = ''; return; }
  el.innerHTML = hints.map((h) => `<span class="sh-chip" title="${h.reason}">${h.name} · ${h.reason}</span>`).join('');
}

/**
 * 升级路径面板：把「买两件一样的就能升」讲清楚。
 * 已凑齐的排最前，其次是背包里已有的，最后是能买到的。
 */
export function renderPaths(el, board, recipes) {
  const owned = new Map();
  for (const e of board.list()) owned.set(e.item.id, (owned.get(e.item.id) || 0) + 1);

  const rows = recipes.map((r) => {
    const have = owned.get(r.materialId) || 0;
    return {
      ...r,
      have,
      ready: have >= r.need,
      partial: have === 1,
    };
  });

  const sorted = rows.sort((a, b) => {
    const score = (x) => (x.ready ? 0 : x.partial ? 1 : 2);
    return (score(a) - score(b)) || (a.material.tier - b.material.tier);
  });

  const top = sorted.filter((r) => r.ready || r.partial).concat(sorted.filter((r) => !r.ready && !r.partial)).slice(0, 14);

  el.innerHTML = top.map((r) => `
    <div class="p-row ${r.ready ? 'ready' : r.partial ? 'partial' : ''}">
      <span class="p-mat">${r.material.name}</span>
      <span class="p-count">${r.have}/${r.need}</span>
      <span class="p-arrow">→</span>
      <span class="p-out" style="color:${tierColor(r.output.tier)}">${r.output.name}</span>
      ${r.ready ? '<span class="p-tag">相邻即可合成</span>' : r.partial ? '<span class="p-tag">再买 1 件</span>' : ''}
    </div>`).join('') || '<p class="hint">暂无配方。</p>';
}

/** 战斗页底部数值卡 */
export function renderFighterCard(side, d) {
  const q = (id) => document.getElementById(`fc-${side}-${id}`);
  const nameEl = document.getElementById(`fc-${side}-name`);
  if (nameEl && d.name) nameEl.textContent = d.name;
  const set = (id, val) => { const e2 = q(id); if (e2) e2.textContent = val; };
  set('hp', d.maxHp ? `${Math.round(d.hp)} / ${d.maxHp}` : Math.round(d.hp));
  set('armor', Math.round(d.armor || 0));
  set('dps', `${(d.dps || 0).toFixed(1)}/秒`);
  set('crit', `${Math.round((d.crit || 0) * 100)}% / ${Math.round(d.thorns || 0)}`);
  set('regen', (d.regen || 0).toFixed(1));
  const buildEl = q('build');
  if (buildEl) buildEl.textContent = d.build || '';
}

/** 战斗页顶部的双方构筑速览（保留给以后扩展） */
export function renderBattleOverview(el, result) {
  if (!el) return;
  el.innerHTML = `
    <span class="bo">你 ${result.myStats?.weapons ?? 0} 件武器 · 联动 ${result.myStats?.synergies ?? 0}</span>
    <span class="bo dim">对方 ${result.foeStats?.weapons ?? 0} 件武器 · 联动 ${result.foeStats?.synergies ?? 0}</span>`;
}

export const LAYOUT = { CELL, GAP, PAD, STEP };

export function shapeDots(shape, cls = '') {
  const sz = size(shape);
  const on = new Set(cells(shape).map((c) => `${c.x},${c.y}`));
  let html = `<div class="dots ${cls}" style="grid-template-columns:repeat(${sz.w},1fr)">`;
  for (let y = 0; y < sz.h; y++) {
    for (let x = 0; x < sz.w; x++) {
      html += `<i class="${on.has(`${x},${y}`) ? 'on' : ''}"></i>`;
    }
  }
  return html + '</div>';
}

export function miniShapeSvg(shape, cat = 'weapon', cell = 8) {
  const sz = size(shape);
  const on = new Set(cells(shape).map((c) => `${c.x},${c.y}`));
  const color = CATEGORIES[cat]?.color || '#9aa4b2';
  const pads = 1;
  const w = (sz.w + pads * 2) * cell;
  const h = (sz.h + pads * 2) * cell;
  let rects = '';
  for (let y = 0; y < sz.h; y++) {
    for (let x = 0; x < sz.w; x++) {
      if (!on.has(`${x},${y}`)) continue;
      rects += `<rect x="${(x + pads) * cell + 1}" y="${(y + pads) * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${color}" opacity="0.92"/>`;
    }
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
}

// ============ 详情（紧凑条 + 升级浮窗） ============

/**
 * 底部紧凑条：选中道具时只显示最关键的一行信息。
 * 详细数值与升级路径都收进浮窗，避免常驻面板挤占屏幕。
 */
export function renderDetail(el, entry, board) {
  if (!entry) {
    el.innerHTML = '<span class="hint">点一件道具看它的数值与升级路径；拖动调整位置，R 旋转。</span>';
    return;
  }
  const it = entry.item;
  const a = itemEffectiveStats(board, it.uid);
  const stats = a?.stats || it.stats || {};
  const ord = board.orderIndex(it.uid);
  const up = upgradeOf(it.id);
  const have = board.list().filter((e) => e.item.id === it.id).length;

  const dps = dpsOf(it, stats);
  const parts = [
    `<b class="d-name">${it.name}</b>`,
    `<span class="d-tag" style="color:${tierColor(it.tier)}">T${it.tier}</span>`,
  ];
  if (dps) parts.push(`<span class="d-dps">每秒伤害 ${dps.toFixed(1)}</span>`);
  parts.push(`<span class="d-dim">出手顺序 第 ${ord + 1} 位 · 起手 ${(ord * 0.12).toFixed(2)}s</span>`);
  if (up.canUpgrade) parts.push(`<span class="d-up">升级 ${have}/2 → ${up.output.name}</span>`);

  el.innerHTML = `
    <div class="d-strip">${parts.join('')}</div>
    <div class="d-btns">
      ${up.canUpgrade ? '<button class="sm" id="btn-upgrade-info">升级路径</button>' : ''}
      <button class="sm danger" id="btn-sell-one">卖出</button>
    </div>`;
}

/**
 * 升级浮窗：点武器（或详情里的按钮）时弹出。
 * 内容 = 完整数值拆解 + 这条升级链 + 相邻加成来源。
 */
export function upgradePopupHtml(entry, board) {
  const it = entry.item;
  const a = itemEffectiveStats(board, it.uid);
  const stats = a?.stats || it.stats || {};
  const src = a?.sources || [];
  const up = upgradeOf(it.id);
  const chain = chainOf(it.id);
  const have = board.list().filter((e) => e.item.id === it.id).length;
  const ord = board.orderIndex(it.uid);
  const nb = [...board.neighbors(it.uid)].map((u) => board.get(u)?.item).filter(Boolean);

  // 数值行
  const rows = Object.entries(stats)
    .filter(([k]) => k !== 'fx')
    .map(([k, v]) => `<div class="kv"><span>${statName(k)}</span><b>${fmtStat(k, v)}</b></div>`)
    .join('');

  // 升级链
  const chainHtml = chain.map((c, i) => {
    const me = c.id === it.id;
    return `${i ? '<span class="ch-arrow">›</span>' : ''}
      <span class="ch-node ${me ? 'me' : ''}">${c.name}<i>T${c.tier}</i></span>`;
  }).join('');

  const upBlock = up.canUpgrade ? `
    <div class="up-block">
      <div class="up-title">升级需要 ${up.need} 件 ${up.material.name}</div>
      <div class="up-count ${have >= up.need ? 'ok' : ''}">你现在有 ${have} 件${have >= up.need ? '，放进背包相邻位置即可自动合成' : `，还差 ${up.need - have} 件`}</div>
      <div class="up-chain">${chainHtml}</div>
    </div>` : `
    <div class="up-block">
      <div class="up-title">这是这条升级链的最终形态</div>
      <div class="up-chain">${chainHtml}</div>
    </div>`;

  return `
    <h2>${it.name}
      <span class="tag" style="color:${tierColor(it.tier)}">T${it.tier}</span>
      <span class="tag">${catName(it.cat)}</span>
    </h2>
    <p class="lead">${it.desc || ''}</p>
    <div class="pop-grid">
      <div>
        <h4>数值</h4>
        <div class="kv"><span>出手顺序</span><b>第 ${ord + 1} 位 · 起手 ${(ord * 0.12).toFixed(2)}s</b></div>
        <div class="kv"><span>形状</span><b>${size(it.shape).w}×${size(it.shape).h} · ${cells(it.shape).length} 格</b></div>
        ${rows}
        <div class="kv"><span>相邻</span><b>${nb.length ? nb.map((x) => x.name).join('、') : '无'}</b></div>
      </div>
      <div>
        <h4>升级</h4>
        ${upBlock}
        ${src.length ? `<div class="srcbox"><div class="srctitle">加成来源</div>${src.map((s) => `<div class="kv"><span>${s.from}</span><b>${statName(s.stat)} +${s.value}</b></div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

function statName(k) {
  return {
    damage: '伤害', cooldown: '读条时长', armor: '护甲', heal: '治疗量',
    healCooldown: '治疗间隔', regen: '每秒回复', maxHp: '最大生命',
    crit: '暴击率', critMult: '暴击倍率', speed: '读条提速', globalSpeed: '全局读条提速',
    thorns: '反伤', aura: '相邻光环', burn: '点燃', pierce: '穿透',
    armorBreak: '破甲', poison: '中毒', frost: '冰霜', lifesteal: '吸血',
    poisonAura: '相邻附毒', goldPerRound: '每回合金币', ranged: '远程',
    magic: '法术', oneShot: '一次性',
  }[k] || k;
}

function fmtStat(k, v) {
  if (typeof v === 'object') {
    return Object.entries(v).map(([k2, v2]) => `${statName(k2)} +${v2}`).join('，');
  }
  if (['crit', 'critMult', 'lifesteal', 'speed', 'globalSpeed'].includes(k)) {
    return k === 'critMult' ? `×${v}` : `+${Math.round(v * 100)}%`;
  }
  if (v === true) return '有';
  return `+${v}`;
}

// ============ 顶栏 / 引导 / 构筑总览 ============

export function renderStats(el, run) {
  const h = run.header;
  el.innerHTML = `
    <div class="stat hp"><b>${h.hp}</b><span>生命</span></div>
    <div class="stat gold"><b>${h.gold}</b><span>金币</span></div>
    <div class="stat win"><b>${h.wins}</b><span>胜场</span></div>
    <div class="stat"><b>${h.round}</b><span>回合</span></div>
    <div class="stat cls"><b>${h.branchName || h.className}</b><span>${h.branchName ? '分支' : '职业'}</span></div>`;
}

export function renderCapacity(el, board, totalDps) {
  const dps = totalDps != null ? ` · 总输出 ${totalDps.toFixed(1)}/秒` : '';
  el.textContent = `${board.usedCells()}/${board.capacity()} 格${dps}`;
}

/** 顶部一条新手引导 */
export function renderGuide(el, step) {
  el.innerHTML = `<span class="gd-idx">${step.idx}</span><b>${step.title}</b><span class="gd-detail">${step.detail}</span>`;
}

/**
 * 角色属性面板：对齐官方的行式排版。
 * 每行一个字段，左侧名称右侧数值，用金色小图标区分。
 */
export function renderOverview(el, ov, board) {
  const rows = [
    { ico: '⚔', label: '每秒伤害', value: ov.totalDps.toFixed(1), hi: true },
    { ico: '🛡', label: '护甲', value: ov.armor },
    { ico: '✚', label: '治疗量', value: ov.heal },
    { ico: '🗡', label: '武器件数', value: ov.weaponCount },
    { ico: '✦', label: '已用格数', value: `${board.usedCells()}/${board.capacity()}` },
  ];
  if (ov.dpsMul > 1) {
    rows.push({ ico: '★', label: '联动加成', value: `+${Math.round((ov.dpsMul - 1) * 100)}%` });
  }

  const rowsHtml = rows.map((r) => `
    <div class="sr">
      <span>${r.ico} ${r.label}</span>
      <b ${r.hi ? 'style="color:#175c5c;font-size:13.5px"' : ''}>${r.value}</b>
    </div>`).join('');

  el.innerHTML = `<div class="stat-rows">${rowsHtml}</div>`;
}
