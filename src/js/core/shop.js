/**
 * 商店：按商店等级抽阶位，再抽道具，支持刷新、锁定、升级。
 */

import { ITEMS, ITEM_BY_ID, poolByTier } from '../data/items.js';
import { ECON, SHOP_TIER_WEIGHT } from '../data/constants.js';
import { mulberry32 } from './combat.js';

export class Shop {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.level = 1;
    this.slots = [];
    this.locked = [];
    this.refresh();
  }

  setLevel(lv) {
    this.level = Math.min(ECON.maxShopLevel, Math.max(1, lv));
    this.refresh();
  }

  /** 抽一个阶位 */
  rollTier() {
    const weights = SHOP_TIER_WEIGHT[this.level];
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (const [tier, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) return Number(tier);
    }
    return 1;
  }

  rollItem() {
    for (let attempt = 0; attempt < 12; attempt++) {
      const tier = this.rollTier();
      const pool = poolByTier(tier);
      if (pool.length) return pool[Math.floor(this.rng() * pool.length)];
    }
    return ITEMS[0];
  }

  refresh() {
    const kept = this.locked.filter(Boolean);
    this.slots = [];
    for (let i = 0; i < ECON.shopSlots; i++) {
      if (i < kept.length && kept[i]) {
        this.slots.push({ item: kept[i], sold: false });
      } else {
        this.slots.push({ item: this.rollItem(), sold: false });
      }
    }
    this.locked = this.slots.map(() => false);
  }

  toggleLock(i) {
    if (this.slots[i]) this.locked[i] = !this.locked[i];
    return this.locked[i];
  }

  /** 购买第 i 格；成功返回道具，失败返回 null 并给原因 */
  buy(i, gold) {
    const slot = this.slots[i];
    if (!slot || slot.sold) return { ok: false, reason: '该格已售出' };
    if (gold < slot.item.price) return { ok: false, reason: '金币不足' };
    slot.sold = true;
    this.locked[i] = false;
    return { ok: true, item: slot.item, cost: slot.item.price };
  }

  /** 撤销一次购买：背包放不下时把卡片还回货架，别让玩家白花钱 */
  unsell(i) {
    const slot = this.slots[i];
    if (!slot || !slot.sold) return false;
    slot.sold = false;
    return true;
  }
}

export { ITEM_BY_ID };
