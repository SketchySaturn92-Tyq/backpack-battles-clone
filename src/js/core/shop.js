/**
 * 商店（v0.2）
 * 支持免费刷新（商人的被动），支持卖出比例由职业决定。
 */

import { ITEMS, poolByTier } from '../data/items.js';
import { ECON, SHOP_TIER_WEIGHT } from '../data/constants.js';
import { mulberry32 } from './combat.js';

export class Shop {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.level = 1;
    this.maxLevel = ECON.maxShopLevel;
    this.slots = [];
    this.locked = [];
    this.refresh();
  }

  setLevel(lv) {
    this.level = Math.max(1, Math.min(this.maxLevel, lv));
    this.refresh();
  }

  rollTier() {
    const weights = SHOP_TIER_WEIGHT[Math.min(this.level, 6)];
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (const [tier, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) return Number(tier);
    }
    return 1;
  }

  rollItem() {
    for (let i = 0; i < 14; i++) {
      const pool = poolByTier(this.rollTier());
      if (pool.length) return pool[Math.floor(this.rng() * pool.length)];
    }
    return ITEMS[0];
  }

  refresh(keepLocked = true) {
    const kept = keepLocked ? this.locked.slice() : [];
    const old = this.slots.map((s) => s.item);
    this.slots = [];
    for (let i = 0; i < ECON.shopSlots; i++) {
      if (kept[i] && old[i]) this.slots.push({ item: old[i], sold: false });
      else this.slots.push({ item: this.rollItem(), sold: false });
    }
    this.locked = this.slots.map((_, i) => !!kept[i]);
  }

  toggleLock(i) {
    if (!this.slots[i]) return false;
    this.locked[i] = !this.locked[i];
    return this.locked[i];
  }

  buy(i, gold) {
    const slot = this.slots[i];
    if (!slot || slot.sold) return { ok: false, reason: '这格已经卖掉了' };
    if (gold < slot.item.price) return { ok: false, reason: '金币不够' };
    slot.sold = true;
    this.locked[i] = false;
    return { ok: true, item: slot.item, cost: slot.item.price };
  }

  /** 背包放不下时把卡片还回货架 */
  unsell(i) {
    const slot = this.slots[i];
    if (!slot || !slot.sold) return false;
    slot.sold = false;
    return true;
  }

  /** 商店里出现过哪些道具（用于「本局见过」提示） */
  visibleInStock() {
    return this.slots.filter((s) => !s.sold).map((s) => s.item);
  }
}
