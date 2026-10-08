/**
 * 商店 v0.4
 * 品质由回合自动决定，玩家不能手动升级。
 */

import { ITEMS, poolByTier } from '../data/items.js';
import { ECON, SHOP_TIER_WEIGHT, shopQualityFor } from '../data/constants.js';
import { mulberry32 } from './combat.js';

export class Shop {
  constructor(seed = 1, slotCount = ECON.shopSlots) {
    this.rng = mulberry32(seed);
    this.round = 1;
    this.quality = shopQualityFor(1);
    this.level = this.quality.level;
    this.slotCount = slotCount;
    this.slots = [];
    this.locked = [];
    this.refresh();
  }

  /** 收藏家这类分支会加宽货架 */
  setSlotCount(n) {
    if (n === this.slotCount) return false;
    this.slotCount = Math.max(4, Math.min(9, n));
    this.refresh(true);
    return true;
  }

  /** 回合推进时自动提升品质 */
  setRound(round) {
    this.round = round;
    const q = shopQualityFor(round);
    if (q.level !== this.level) {
      this.level = q.level;
      this.quality = q;
      return true;   // 表示品质刚提升
    }
    this.quality = q;
    return false;
  }

  rollTier() {
    const weights = SHOP_TIER_WEIGHT[Math.min(this.level, 5)];
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
    for (let i = 0; i < this.slotCount; i++) {
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

  unsell(i) {
    const slot = this.slots[i];
    if (!slot || !slot.sold) return false;
    slot.sold = false;
    return true;
  }
}
