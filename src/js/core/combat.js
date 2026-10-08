/**
 * 自动战斗：把两边背包解析成战斗单位，按固定步长模拟，产出逐条日志。
 * 确定性：用 mulberry32 种子随机，同一构筑同一种子结果一致。
 */

import { ITEM_BY_ID } from '../data/items.js';
import { COMBAT } from '../data/constants.js';

/** 简单可复现随机数 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把一块背包解析成战斗单位。
 * 规则：
 *  - 基础属性来自场上所有道具累加。
 *  - 宝石与被相邻的道具：宝石的 aura 加成只作用于相邻道具的持有者一次。
 *  - 相邻同类（武器挨武器）提升该武器 10% 攻速，最多 3 层。
 */
export function buildUnit(board, { name, hp, seed }) {
  const entries = board.list();
  const unit = {
    name, seed,
    maxHp: hp, hp,
    armor: 0, damage: 0, crit: 0, critMult: 1.5,
    speed: 0,                // 全局攻速加成
    regen: 0, heal: 0, healCooldown: 4,
    thorns: 0, poisonOnKill: 0,
    weapons: [],
    notes: [],
  };

  // 同类相邻计数：同类别相邻道具数量
  const categoryNeighborCount = new Map();
  for (const e of entries) {
    const n = board.neighbors(e.item.uid);
    let same = 0;
    for (const other of n) {
      const oi = board.get(other);
      if (oi && oi.item.cat === e.item.cat) same++;
    }
    categoryNeighborCount.set(e.item.uid, same);
  }

  for (const e of entries) {
    const it = e.item;
    const sAdjusted = adjustStatsFromAuras(it, e, board);
    unit.maxHp += sAdjusted.maxHp || 0;
    unit.armor += sAdjusted.armor || 0;
    unit.damage += sAdjusted.damage || 0;
    unit.crit += sAdjusted.crit || 0;
    unit.critMult = Math.max(unit.critMult, sAdjusted.critMult || 1.5);
    unit.speed += sAdjusted.speed || 0;
    unit.regen += sAdjusted.regen || 0;
    unit.thorns += sAdjusted.thorns || 0;
    unit.poisonOnKill += sAdjusted.poisonOnKill || 0;
    if (sAdjusted.heal) {
      unit.heal += sAdjusted.heal;
      unit.healCooldown = Math.min(unit.healCooldown, sAdjusted.healCooldown || 4);
    }

    if (it.cat === 'weapon' && sAdjusted.damage) {
      const stacks = Math.min(3, categoryNeighborCount.get(it.uid) || 0);
      const cd = Math.max(0.35, (sAdjusted.cooldown || 1.6) * (1 - 0.1 * stacks));
      unit.weapons.push({
        uid: it.uid, name: it.name, damage: sAdjusted.damage,
        cooldown: cd, timer: cd, burn: sAdjusted.burn || 0,
        pierce: sAdjusted.pierce || 0, stacks,
      });
    }
  }

  unit.hp = unit.maxHp;
  return unit;
}

/** 相邻宝石的 aura 加成，只吃相邻的一次 */
function adjustStatsFromAuras(item, entry, board) {
  const s = { ...(item.stats || {}) };
  const out = { ...s };
  for (const otherUid of board.neighbors(item.uid)) {
    const other = board.get(otherUid);
    if (!other) continue;
    const aura = other.item.stats?.aura;
    if (!aura) continue;
    for (const [k, v] of Object.entries(aura)) {
      out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

/**
 * 模拟一场战斗。
 * @returns {{log:object[], winner:'A'|'B'|'draw', rounds:number}}
 */
export function simulate(unitA, unitB, { seed = Date.now() } = {}) {
  const rng = mulberry32(seed);
  const A = cloneUnit(unitA, rng);
  const B = cloneUnit(unitB, rng);
  const log = [];
  let t = 0;
  let guard = 0;

  const push = (type, text, extra = {}) => log.push({ t: +t.toFixed(2), type, text, ...extra });

  push('start', `${A.name}（${A.maxHp} 血）对上 ${B.name}（${B.maxHp} 血）`);

  while (A.hp > 0 && B.hp > 0 && t < COMBAT.timeLimit && guard++ < 20000) {
    t += COMBAT.tick;
    // 武器冷却
    for (const [side, src, dst] of [[A, A, B], [B, B, A]]) {
      if (src.hp <= 0 || dst.hp <= 0) continue;
      for (const w of src.weapons) {
        w.timer -= COMBAT.tick * (1 + src.speed);
        if (w.timer <= 0) {
          w.timer += w.cooldown;
          const hit = resolveHit(src, dst, w, rng);
          push('attack', `${src.name} 的 ${w.name} 命中 ${dst.name} 造成 ${hit.dmg} 点${hit.crit ? '暴击' : ''}伤害`,
            { side, dmg: hit.dmg, crit: hit.crit, hp: dst.hp });
          if (w.burn) {
            dst.hp -= w.burn;
            push('burn', `${dst.name} 被点燃，额外 ${w.burn} 点伤害`, { side, hp: dst.hp });
          }
        }
      }
    }
    // 回复
    for (const u of [A, B]) {
      if (u.hp <= 0) continue;
      if (u.heal > 0 && u.hp < u.maxHp) {
        u.healTimer = (u.healTimer || 0) + COMBAT.tick;
        if (u.healTimer >= u.healCooldown) {
          u.healTimer -= u.healCooldown;
          u.hp = Math.min(u.maxHp, u.hp + u.heal);
          push('heal', `${u.name} 回复 ${u.heal} 点生命`, { hp: u.hp });
        }
      }
      if (u.regen > 0) {
        u.regenAcc = (u.regenAcc || 0) + u.regen * COMBAT.tick;
        if (u.regenAcc >= 1) {
          const amount = Math.floor(u.regenAcc);
          u.regenAcc -= amount;
          u.hp = Math.min(u.maxHp, u.hp + amount);
        }
      }
    }
  }

  let winner = 'draw';
  if (A.hp <= 0 && B.hp > 0) winner = 'B';
  else if (B.hp <= 0 && A.hp > 0) winner = 'A';
  else if (A.hp > 0 && B.hp <= 0) winner = 'A';
  else winner = A.hp === B.hp ? 'draw' : (A.hp > B.hp ? 'A' : 'B');

  push('end', `战斗结束：${winnerLabel(winner, A, B)}`,
    { winner, hpA: Math.max(0, A.hp), hpB: Math.max(0, B.hp) });

  return { log, winner, rounds: +t.toFixed(2), hpA: Math.max(0, A.hp), hpB: Math.max(0, B.hp) };
}

function cloneUnit(u, rng) {
  return {
    ...u,
    hp: u.hp,
    weapons: u.weapons.map((w) => ({ ...w, timer: w.cooldown * (0.2 + rng() * 0.6) })),
  };
}

function resolveHit(src, dst, weapon, rng) {
  let dmg = weapon.damage + src.damage;
  const roll = rng();
  const crit = roll < src.crit;
  if (crit) dmg = Math.round(dmg * src.critMult);
  if (weapon.pierce) dmg += weapon.pierce;
  const reduce = Math.min(COMBAT.armorCap, dst.armor / 100);
  dmg = Math.max(1, Math.round(dmg * (1 - reduce)));
  dst.hp -= dmg;
  if (dst.thorns > 0 && dst.hp > 0) {
    src.hp -= dst.thorns;
  }
  return { dmg, crit };
}

function winnerLabel(winner, A, B) {
  if (winner === 'draw') return '平局';
  return winner === 'A' ? `${A.name} 获胜` : `${B.name} 获胜`;
}

/** 把构筑强度折算成一个粗略分数，用于校验平衡 */
export function unitPower(unit) {
  const dps = unit.weapons.reduce((s, w) => s + w.damage / w.cooldown, 0);
  return Math.round(dps * 10 + unit.maxHp + unit.armor * 2 + unit.regen * 20);
}
