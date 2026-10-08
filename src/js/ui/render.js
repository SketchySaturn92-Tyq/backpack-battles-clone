/**
 * 渲染层（v0.2）
 *
 * 最重要的变化：道具按真实形状渲染。
 * 每个占用格单独画一个方块，拼出 L 形、十字形、剑形这些不规则轮廓 ——
 * 玩家一眼就能看出「这块塞得进去吗」，而不是看到一个矩形。
 */

import { cells, size } from '../data/shapes.js';
import { CATEGORIES, RARITY } from '../data/items.js';
import { BOARD } from '../data/constants.js';

const CELL = BOARD.cell;
const GAP = BOARD.gap;
const PAD = BOARD.pad;
const STEP = CELL + GAP;

export function cellToPx(x, y) {
  return { left: PAD + x * STEP, top: PAD + y * STEP };
}

export function pxToCell(clientX, clientY, boardEl) {
  const r = boardEl.getBoundingClientRect();
  return {
    x: Math.round((clientX - r.left - PAD) / STEP),
    y: Math.round((clientY - r.top - PAD) / STEP),
  };
}

export function iconFor(item) { return `assets/icons/${item.id}.png`; }

export function catName(cat) { return CATEGORIES[cat]?.name || cat; }
export function tierColor(tier) { return (RARITY[tier] || RARITY[1]).color; }

/**
 * 画背包。
 * @param {HTMLElement} root
 * @param {Board} board
 * @param {object} opts { selectedUid, hover, onGrab, onCellClick, showOrder, orderMap }
 */
export function renderBoard(root, board, opts = {}) {
  const { selectedUid, hover, onGrab, onCellClick, showOrder = true, orderMap = null } = opts;
  root.innerHTML = '';
  root.style.gridTemplateColumns = `repeat(${board.cols}, ${CELL}px)`;
  root.style.gridTemplateRows = `repeat(${board.rows}, ${CELL}px)`;
  root.style.width = `${board.cols * STEP - GAP + PAD * 2}px`;
  root.style.height = `${board.rows * STEP - GAP + PAD * 2}px`;

  // 底层格子 + 触发顺序箭头
  const hoverSet = new Map();
  for (const c of (hover?.cells || [])) hoverSet.set(`${c.x},${c.y}`, hover.ok);

  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const d = document.createElement('div');
      d.className = 'cellbg';
      d.dataset.x = x;
      d.dataset.y = y;
      if (showOrder && x === 0) {
        d.dataset.row = y + 1;
        d.title = `第 ${y + 1} 行：从上往下的触发顺序`;
      }
      const hv = hoverSet.get(`${x},${y}`);
      if (hv === true) d.classList.add('hover-ok');
      else if (hv === false) d.classList.add('hover-bad');
      if (hover?.anchor && hover.anchor.x === x && hover.anchor.y === y) d.classList.add('hover-anchor');
      root.appendChild(d);
    }
  }

  // 道具：按形状逐格画出不规则轮廓
  for (const entry of board.list()) {
    const el = document.createElement('div');
    el.className = `shape-item cat-${entry.item.cat}`;
    el.dataset.uid = entry.item.uid;
    el.style.left = `${cellToPx(entry.x, entry.y).left}px`;
    el.style.top = `${cellToPx(entry.x, entry.y).top}px`;
    const sz = size(entry.shape);
    el.style.width = `${sz.w * STEP - GAP}px`;
    el.style.height = `${sz.h * STEP - GAP}px`;

    // 逐格画块，拼出真实形状
    for (const c of cells(entry.shape)) {
      const cell = document.createElement('span');
      cell.className = 'sc';
      cell.style.left = `${c.x * STEP}px`;
      cell.style.top = `${c.y * STEP}px`;
      cell.style.width = `${CELL}px`;
      cell.style.height = `${CELL}px`;
      el.appendChild(cell);
      // 给每格挂一个可点区域，方便点到形状任意位置都能拿起
      const hit = document.createElement('span');
      hit.className = 'sc-hit';
      hit.style.left = `${c.x * STEP}px`;
      hit.style.top = `${c.y * STEP}px`;
      hit.style.width = `${CELL}px`;
      hit.style.height = `${CELL}px`;
      el.appendChild(hit);
    }

    if (entry.item.uid === selectedUid) el.classList.add('selected');
    if (board.neighbors(entry.item.uid).size > 0) el.classList.add('linked');

    // 触发顺序徽标
    if (showOrder) {
      const order = orderMap ? orderMap.get(entry.item.uid) : board.orderIndex(entry.item.uid);
      const badge = document.createElement('span');
      badge.className = 'orderbadge';
      badge.textContent = `#${(order ?? 0) + 1}`;
      badge.style.left = `${2}px`;
      badge.style.top = `${2}px`;
      el.appendChild(badge);
    }

    // 图标与名称叠在形状中央
    const inner = document.createElement('div');
    inner.className = 'inner';
    const tier = tierColor(entry.item.tier);
    inner.innerHTML = `
      <img class="ico" src="${iconFor(entry.item)}" alt="" onerror="this.style.display='none'">
      <span class="nm" style="color:${tier}">${entry.item.name}</span>`;
    el.appendChild(inner);

    el.addEventListener('pointerdown', (ev) => onGrab?.(ev, entry));
    root.appendChild(el);
  }
}

/** 商店卡片：小尺寸形状预览 + 价格 */
export function renderShop(root, shop, gold, { onBuy, onLock }) {
  root.innerHTML = '';
  shop.slots.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = 'shop-card';
    if (slot.sold) el.classList.add('sold');
    if (shop.locked[i]) el.classList.add('locked');
    const afford = gold >= slot.item.price;
    el.innerHTML = `
      <div class="sc-top">
        <span class="lock ${shop.locked[i] ? 'on' : ''}">${shop.locked[i] ? '锁' : '○'}</span>
        <span class="tier" style="color:${tierColor(slot.item.tier)}">T${slot.item.tier}</span>
      </div>
      <div class="mini-shape">${miniShapeSvg(slot.item.shape, slot.item.cat)}</div>
      <img class="ico" src="${iconFor(slot.item)}" alt="" onerror="this.style.display='none'">
      <div class="nm">${slot.item.name}</div>
      <div class="cat">${catName(slot.item.cat)} · ${cells(slot.item.shape).length}格</div>
      <div class="pr" style="${afford ? '' : 'color:#e2604a'}">${slot.item.price} 金</div>
      <div class="shapedots">${shapeDots(slot.item.shape)}</div>`;
    el.addEventListener('click', (ev) => {
      if (ev.shiftKey || ev.altKey) { onLock(i); return; }
      onBuy(i);
    });
    el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onLock(i); });
    root.appendChild(el);
  });
}

/** 用小方块矩阵表示形状，商店卡片和详情面板都用它 */
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

/** SVG 版形状缩略图，用于商店卡片 */
export function miniShapeSvg(shape, cat = 'weapon', cell = 9) {
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
      rects += `<rect x="${(x + pads) * cell + 1}" y="${(y + pads) * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${color}" opacity="0.9"/>`;
    }
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
}

/** 详情面板 */
export function renderDetail(el, entry, board) {
  if (!entry) {
    el.innerHTML = `
      <p class="hint">点道具看详情。拖动调整位置，按 R 旋转。</p>
      <p class="hint">背包每行从上往下即为触发顺序，摆得越靠前出手越早。</p>`;
    return;
  }
  const it = entry.item;
  const nb = [...board.neighbors(it.uid)].map((u) => board.get(u)?.item).filter(Boolean);
  const statLines = Object.entries(it.stats || {})
    .filter(([k]) => k !== 'fx')
    .map(([k, v]) => `<div class="kv"><span>${statName(k)}</span><b>${fmtStat(k, v)}</b></div>`)
    .join('');
  el.innerHTML = `
    <h3>${it.name}
      <span class="tag" style="color:${tierColor(it.tier)}">T${it.tier}</span>
      <span class="tag">${catName(it.cat)}</span>
    </h3>
    <div class="detail-shape">${shapeDots(it.shape, 'lg')}<span class="sz">${size(it.shape).w}×${size(it.shape).h} · ${cells(it.shape).length} 格</span></div>
    <p class="hint">${it.desc || ''}</p>
    ${statLines}
    <div class="kv"><span>触发顺序</span><b>第 ${board.orderIndex(it.uid) + 1} 位</b></div>
    <div class="kv"><span>相邻道具</span><b>${nb.length ? nb.map((x) => x.name).join('、') : '无'}</b></div>
    <p class="hint">R 旋转 · Delete 卖出 · 拖到任意格调整</p>`;
}

function statName(k) {
  return {
    damage: '伤害', cooldown: '攻击间隔', armor: '护甲', heal: '治疗量',
    healCooldown: '治疗间隔', regen: '每秒回复', maxHp: '最大生命',
    crit: '暴击率', critMult: '暴击倍率', speed: '攻速加成', globalSpeed: '全局攻速',
    thorns: '反伤', aura: '相邻光环', burn: '点燃', pierce: '穿透',
    armorBreak: '破甲', poison: '中毒', frost: '冰霜', lifesteal: '吸血',
    poisonAura: '相邻附毒', goldPerRound: '每回合金币', ranged: '远程',
    magic: '法术', oneShot: '一次性',
  }[k] || k;
}

function fmtStat(k, v) {
  if (typeof v === 'object') {
    return Object.entries(v).map(([k2, v2]) => `${statName(k2)} +${fmtPct(k2, v2)}`).join('，');
  }
  if (['crit', 'critMult', 'lifesteal', 'speed', 'globalSpeed'].includes(k)) {
    return k === 'critMult' ? `×${v}` : `+${Math.round(v * 100)}%`;
  }
  if (v === true) return '有';
  return `+${v}`;
}

function fmtPct(k, v) {
  if (['speed', 'globalSpeed'].includes(k)) return `${Math.round(v * 100)}%`;
  return `${v}`;
}

/** 顶栏状态 */
export function renderStats(el, run) {
  const h = run.header;
  el.innerHTML = `
    <div class="stat hp"><b>${h.hp}</b><span>生命</span></div>
    <div class="stat gold"><b>${h.gold}</b><span>金币</span></div>
    <div class="stat win"><b>${h.wins}</b><span>胜场</span></div>
    <div class="stat"><b>${h.round}</b><span>回合</span></div>
    <div class="stat"><b>${run.shop.level}</b><span>商店</span></div>
    <div class="stat cls"><b>${h.branchName || h.className}</b><span>${h.branchName ? '分支' : '职业'}</span></div>`;
}

/** 背包占用提示 */
export function renderCapacity(el, board) {
  el.textContent = `已用 ${board.usedCells()} / ${board.capacity()} 格（空 ${board.freeCells()}）`;
}

export const LAYOUT = { CELL, GAP, PAD, STEP };
