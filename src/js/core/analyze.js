/**
 * 构筑分析：把一件道具、一整块背包折算成玩家能看懂的数值。
 *
 * 用途：
 *   - 详情面板的伤害引导（这件武器每秒打多少、加成从哪来）
 *   - 商店卡片的 DPS 预览（买之前就知道值不值）
 *   - 背包顶栏的构筑总览
 */

import { synergyBonus } from '../data/synergies.js';

/**
 * 一件道具的最终属性：自身 + 相邻道具给的 aura。
 * 同时记录加成来源，UI 才能说清「为什么这件变强了」。
 */
export function itemEffectiveStats(board, uid) {
  const e = board.get(uid);
  if (!e) return null;
  const stats = { ...(e.item.stats || {}) };
  const sources = [];

  for (const nu of board.neighbors(uid)) {
    const o = board.get(nu);
    const aura = o?.item?.stats?.aura;
    if (!aura) continue;
    for (const [k, v] of Object.entries(aura)) {
      stats[k] = (stats[k] || 0) + v;
      sources.push({ from: o.item.name, stat: k, value: v });
    }
  }
  return { item: e.item, stats, sources };
}

/** 每秒伤害：只有武器有这个概念 */
export function dpsOf(item, stats) {
  if (item.cat !== 'weapon') return null;
  const d = stats.damage || 0;
  const cd = stats.cooldown || 0;
  if (!d || !cd) return null;
  return d / cd;
}

/** 折算护甲后的实际每秒伤害，默认按 20 护甲的假想目标估 */
export function armoredDps(item, stats, targetArmor = 20) {
  const raw = dpsOf(item, stats);
  if (raw == null) return null;
  const reduce = Math.min(0.75, targetArmor / 100);
  return raw * (1 - reduce);
}

/**
 * 整块背包的构筑总览。
 * 武器 DPS 会把联动加成算进去，这样面板数字和战斗里打出来的一致。
 */
export function buildOverview(board) {
  const entries = board.list();
  const { bonus, list } = synergyBonus(board);

  let baseDps = 0;
  let armor = 0;
  let heal = 0;
  const weapons = [];

  for (const e of entries) {
    const a = itemEffectiveStats(board, e.item.uid);
    if (!a) continue;
    if (e.item.cat === 'weapon') {
      const dps = dpsOf(e.item, a.stats);
      if (dps) {
        weapons.push({
          name: e.item.name,
          id: e.item.id,
          dps,
          order: board.orderIndex(e.item.uid),
          damage: a.stats.damage || 0,
          cooldown: a.stats.cooldown || 0,
        });
        baseDps += dps;
      }
    }
    armor += a.stats.armor || 0;
    heal += a.stats.heal || 0;
  }

  const dpsMul = 1 + (bonus.damageMul || 0);
  for (const w of weapons) w.effectiveDps = w.dps * dpsMul;

  return {
    totalDps: baseDps * dpsMul,
    baseDps,
    dpsMul,
    armor,
    heal,
    weaponCount: weapons.length,
    weapons: weapons.sort((a, b) => a.order - b.order),
    synergies: list.map((x) => ({ name: x.synergy.name, count: x.count, desc: x.synergy.desc })),
  };
}

/** 给新手的三步引导：现在该干什么 */
export function nextStep(board, gold, phase) {
  const entries = board.list();
  const weapons = entries.filter((e) => e.item.cat === 'weapon');
  if (!weapons.length) {
    return {
      idx: 1,
      title: '先买一件武器',
      detail: gold > 0 ? `去商店点一件武器（现在有 ${gold} 金）` : '金币不够，先刷新或卖掉一件囤货',
    };
  }
  if (entries.length < 3) {
    return { idx: 2, title: '把背包摆满一点', detail: '拖动道具调整位置，同名同阶相邻会合成' };
  }
  return { idx: 3, title: '可以开打了', detail: '关键武器拖到左上角会更早出手' };
}
