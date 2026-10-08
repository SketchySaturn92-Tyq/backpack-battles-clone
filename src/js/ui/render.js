/**
 * 渲染层：把 Run 状态画成 DOM，并处理拖拽。
 * 所有格子位置由 grid.js 的数据决定，渲染只负责像素与事件。
 */

import { styleFor } from './style.js';

const CELL = 54;
const GAP = 2;
const PAD = 6;

export function cellToPx(x, y) {
  return { left: PAD + x * (CELL + GAP), top: PAD + y * (CELL + GAP) };
}

export function renderBoard(root, board, { onGrab, onDrop, selectedUid, hoverCells, hoverOk }) {
  root.innerHTML = '';
  root.style.gridTemplateColumns = `repeat(${board.cols}, ${CELL}px)`;
  root.style.gridTemplateRows = `repeat(${board.rows}, ${CELL}px)`;

  const hoverSet = new Set((hoverCells || []).map((c) => `${c.x},${c.y}`));

  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const d = document.createElement('div');
      d.className = 'cellbg';
      d.dataset.x = x; d.dataset.y = y;
      if (hoverSet.has(`${x},${y}`)) d.classList.add(hoverOk ? 'hover-ok' : 'hover-bad');
      root.appendChild(d);
    }
  }

  for (const entry of board.list()) {
    const { item, x, y, shape } = entry;
    const size = sizeOfShape(shape);
    const el = document.createElement('div');
    const st = styleFor(item);
    el.className = `chip cat-${item.cat}`;
    el.dataset.uid = item.uid;
    el.style.left = `${cellToPx(x, y).left}px`;
    el.style.top = `${cellToPx(x, y).top}px`;
    el.style.width = `${size.w * CELL + (size.w - 1) * GAP}px`;
    el.style.height = `${size.h * CELL + (size.h - 1) * GAP}px`;
    if (size.w <= 1 || size.h <= 1) el.classList.add('small');
    if (item.uid === selectedUid) el.style.boxShadow = '0 0 0 2px #e8b33c, 0 6px 16px rgba(0,0,0,.5)';

    const synergy = board.neighbors(item.uid).size > 0;
    if (synergy) el.classList.add('synergy');

    el.innerHTML = `
      <span class="tier">${st.tierLabel}</span>
      <img class="ico" src="${st.icon}" alt="" onerror="this.style.visibility='hidden'">
      <span class="nm">${item.name}</span>`;

    el.addEventListener('pointerdown', (ev) => onGrab(ev, entry));
    root.appendChild(el);
  }
}

function sizeOfShape(shape) {
  return {
    w: Math.max(...shape.map((r) => r.length)),
    h: shape.length,
  };
}

export function renderShop(root, shop, gold, { onBuy, onLock }) {
  root.innerHTML = '';
  shop.slots.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = 'shop-card';
    if (slot.sold) el.classList.add('sold');
    if (shop.locked[i]) el.classList.add('locked');
    const st = styleFor(slot.item);
    const afford = gold >= slot.item.price;
    el.innerHTML = `
      <span class="lock ${shop.locked[i] ? 'on' : ''}">${shop.locked[i] ? '锁' : '○'}</span>
      <span class="tier">T${slot.item.tier}</span>
      <img class="ico" src="${st.icon}" alt="" onerror="this.style.visibility='hidden'">
      <span class="nm">${slot.item.name}</span>
      <span class="pr" style="${afford ? '' : 'color:#e2604a'}">${slot.item.price} 金</span>`;
    el.addEventListener('click', (ev) => {
      if (ev.shiftKey || ev.altKey) { onLock(i); return; }
      onBuy(i);
    });
    el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onLock(i); });
    root.appendChild(el);
  });
}

export function renderStats(el, header, shop) {
  el.innerHTML = `
    <div class="stat hp"><b>${header.hp}</b><span>生命</span></div>
    <div class="stat gold"><b>${header.gold}</b><span>金币</span></div>
    <div class="stat win"><b>${header.wins}</b><span>胜场</span></div>
    <div class="stat"><b>${header.round}</b><span>回合</span></div>
    <div class="stat"><b>${shop.level}</b><span>商店</span></div>`;
}

export function renderLog(el, log, limit = 120) {
  const slice = log.slice(-limit);
  el.innerHTML = slice.map((row) => {
    const cls = row.type ? `t-${row.type}` : '';
    const time = row.t !== undefined ? `<span class="time">${String(row.t).padStart(5, ' ')}s</span>` : '';
    return `<div class="${cls}">${time}${escapeHtml(row.text)}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

export function renderDetail(el, entry, board) {
  if (!entry) {
    el.innerHTML = '<p>点道具看详情。相邻同一类道具会给额外加成，同名同阶相邻会自动合成。</p>';
    return;
  }
  const it = entry.item;
  const st = styleFor(it);
  const stats = Object.entries(it.stats || {})
    .map(([k, v]) => `<div class="kv"><span>${statName(k)}</span><b>${typeof v === 'object' ? JSON.stringify(v) : v}</b></div>`)
    .join('');
  const n = board.neighbors(it.uid).size;
  el.innerHTML = `
    <h3>${it.name} <span style="color:${st.rarityColor};font-size:12px">${st.tierLabel}</span></h3>
    <div class="kv"><span>类别</span><b>${st.catName}</b></div>
    <div class="kv"><span>形状</span><b>${it.shape.join(' / ')}</b></div>
    ${stats}
    <div class="kv"><span>相邻道具</span><b>${n} 件</b></div>
    <p style="font-size:11.5px;margin:6px 0 0">R 键旋转，Delete 卖出，拖拽调整位置。</p>`;
}

function statName(k) {
  return {
    damage: '伤害', cooldown: '攻击间隔', armor: '护甲', heal: '治疗量',
    healCooldown: '治疗间隔', regen: '每秒回复', maxHp: '最大生命',
    crit: '暴击率', critMult: '暴击倍率', speed: '攻速加成',
    globalSpeed: '全局攻速', thorns: '反伤', aura: '相邻光环',
    burn: '点燃', pierce: '穿透', poisonOnKill: '击杀施毒',
  }[k] || k;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export const LAYOUT = { CELL, GAP, PAD };
