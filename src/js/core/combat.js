/**
 * 自动战斗（v0.2 重写）
 *
 * 两个关键设计：
 *  1. 触发顺序来自背包位置（从上到下、从左到右），顺序越靠后起手越慢。
 *     「把关键道具摆到左上角先出手」是整理玩法的直接收益。
 *  2. 战斗产出的是事件流，不是纯文本日志。
 *     每个事件带 at（时间）、type（斩击/箭矢/火焰…）、from、to，
 *     前端战斗舞台照着事件播动画。逻辑与表现彻底分开。
 */

import { ITEM_BY_ID, chargeSeconds } from '../data/items.js';
import { COMBAT } from '../data/constants.js';
import { cells } from '../data/shapes.js';
import { synergyBonus } from '../data/synergies.js';

/** 可复现随机 */
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
 * 把背包解析成战斗单位。
 * @param {Board} board
 * @param {object} opts { name, hp, classDef, branch, seed }
 */
export function buildUnit(board, { name, hp, classDef = null, branch = null, seed = 1 }) {
  const passive = classDef?.passive?.effect || {};
  const bonus = branch?.bonus || {};

  const unit = {
    name,
    seed,
    maxHp: hp,
    hp,
    armor: 0,
    armorFlatBonus: 0,
    damage: 0,
    crit: 0,
    critMult: 1.6,
    speed: passive.speed || 0,
    globalSpeed: 0,
    regen: passive.regen || 0,
    heal: 0,
    healCooldown: 99,
    thorns: bonus.thorns || 0,
    lifesteal: 0,
    poisonAura: 0,
    burnMultiplier: bonus.burnMultiplier || 1,
    magicDamage: passive.magicDamage || 0,
    rangedDamage: bonus.rangedDamage || 0,
    critMultBonus: bonus.critMult || 0,
    hpPerFuse: bonus.hpPerFuse || 0,
    extraGold: bonus.extraGold || 0,
    goldPerRound: 0,
    armorCap: passive.armorCap || COMBAT.armorCap,
    freeRefresh: !!passive.freeRefresh,
    healMultiplier: bonus.healMultiplier || 1,
    overhealShield: !!bonus.overhealShield,
    thornsFromArmor: bonus.thornsFromArmor || 0,
    chillPerHit: bonus.chillPerHit || 0,
    chillMax: bonus.chillMax || 0,
    poisonPerHit: bonus.poisonPerHit || 0,
    firstWeaponReady: passive.firstWeaponReady || 0,
    rageDamage: bonus.rageDamage || 0,
    weapons: [],
    slots: [],
    order: [],
    synergies: [],
    damageMul: 0,
    hpMul: 0,
    armorMul: 0,
    healMul: 0,
    speedMul: 0,
    critDamageBonus: 0,
    poisonMul: 1,
    burnMul: 1,
    auraMul: 0,
    poisonOnHit: 0,
    chillPerHitBonus: 0,
    chillMaxBonus: 0,
  };

  const entries = board.list();
  const order = board.triggerOrder();
  unit.order = order.slice();

  // 整包联动：攒够同类数量触发的额外效果
  const { bonus: syn, list: synList } = synergyBonus(board);
  unit.synergies = synList.map((s) => ({ id: s.synergy.id, name: s.synergy.name, desc: s.synergy.desc, count: s.count }));

  // 先算每件道具的相邻同类数量（同类协同）
  const sameCatNeighbors = new Map();
  for (const e of entries) {
    let n = 0;
    for (const otherUid of board.neighbors(e.item.uid)) {
      const o = board.get(otherUid);
      if (o && o.item.cat === e.item.cat) n++;
    }
    sameCatNeighbors.set(e.item.uid, n);
  }

  // 再逐件结算：基础属性 + 相邻宝石的 aura
  for (const e of entries) {
    const item = e.item;
    const st = effectiveStats(item, e, board);

    unit.maxHp += st.maxHp || 0;
    unit.armor += st.armor || 0;
    unit.damage += st.damage || 0;
    unit.crit += st.crit || 0;
    if (st.critMult) unit.critMult = Math.max(unit.critMult, st.critMult);
    unit.speed += st.speed || 0;
    unit.globalSpeed += st.globalSpeed || 0;
    unit.regen += st.regen || 0;
    unit.thorns += st.thorns || 0;
    unit.lifesteal += st.lifesteal || 0;
    unit.poisonAura += st.poisonAura || 0;
    unit.goldPerRound += st.goldPerRound || 0;
    if (st.heal) {
      unit.heal += st.heal;
      unit.healCooldown = Math.min(unit.healCooldown, st.healCooldown || 4);
    }

    const idx = order.indexOf(item.uid);
    unit.slots.push({
      uid: item.uid, name: item.name, cat: item.cat, order: idx,
      cell: { x: e.x, y: e.y },
    });

    if (item.slot === 'weapon' && (st.damage || 0) > 0) {
      // 读条时长由占格数决定；同类相邻最多 3 层，每层 -8%
      const stacks = Math.min(3, sameCatNeighbors.get(item.uid) || 0);
      let charge = chargeSeconds(item) * (1 - 0.08 * stacks);
      charge = Math.max(0.35, charge / (1 + unit.globalSpeed));
      // 触发顺序决定起手延迟：越靠后越晚出手
      const startDelay = (idx >= 0 ? idx : 0) * COMBAT.orderStep;
      const isFirst = idx === unit.order[0];
      const readyFactor = isFirst ? unit.firstWeaponReady : 0;
      unit.weapons.push({
        uid: item.uid,
        name: item.name,
        order: idx,
        damage: st.damage || 0,
        charge,
        cooldown: charge,
        timer: startDelay + charge * (1 - readyFactor),
        burn: st.burn || 0,
        poison: (st.poison || 0) + unit.poisonAura,
        pierce: st.pierce || 0,
        armorBreak: st.armorBreak || 0,
        frost: st.frost || 0,
        ranged: !!st.ranged,
        magic: !!st.magic,
        fx: st.fx || 'slash',
        stacks,
        hits: 0,
      });
    }
  }

  unit.hp = unit.maxHp;

  // 联动数值最后统一结算，避免和职业被动混淆
  unit.damageMul += syn.damageMul;
  unit.crit += syn.critMul;
  unit.speed += syn.speedMul;
  unit.critDamageBonus += syn.critDamage;
  unit.thorns += syn.thorns;
  unit.regen += syn.regen;
  unit.healMultiplier *= (1 + syn.healMul);
  unit.rangedDamage += syn.rangedDamage;
  unit.poisonOnHit += syn.poisonOnHit;
  unit.chillPerHitBonus += syn.chillPerHit;
  unit.chillMaxBonus += syn.chillMax;
  unit.burnMul *= syn.burnMul;
  unit.poisonMul *= syn.poisonMul;
  unit.auraMul += syn.auraMul;

  // 生命与护甲的百分比加成放在最后
  unit.maxHp = Math.round(unit.maxHp * (1 + syn.hpMul) * (1 + (unit.hpMul || 0)));
  unit.armor = Math.round(unit.armor * (1 + syn.armorMul) * (1 + (unit.armorMul || 0)));
  unit.hp = unit.maxHp;

  // 武器伤害补上联动倍率
  if (unit.damageMul) {
    for (const w of unit.weapons) {
      w.damage = Math.round(w.damage * (1 + unit.damageMul));
    }
  }
  if (unit.burnMul !== 1) {
    for (const w of unit.weapons) if (w.burn) w.burn = Math.round(w.burn * unit.burnMul);
  }
  if (unit.poisonMul !== 1) {
    for (const w of unit.weapons) if (w.poison) w.poison = Math.round(w.poison * unit.poisonMul);
  }

  return unit;
}

/** 一件道具的最终属性：自身 + 相邻道具给的 aura */
function effectiveStats(item, entry, board) {
  const out = { ...(item.stats || {}) };
  for (const uid of board.neighbors(entry.item.uid)) {
    const o = board.get(uid);
    const aura = o?.item?.stats?.aura;
    if (!aura) continue;
    for (const [k, v] of Object.entries(aura)) {
      out[k] = (out[k] || 0) + v;
    }
    // 箭袋这类只强化远程的，单独处理
    if (o.item.stats.aura.rangedDamage && out.ranged) {
      out.damage = (out.damage || 0) + o.item.stats.aura.rangedDamage;
    }
  }
  return out;
}

/**
 * 模拟一场战斗。
 * @returns {{events:object[], winner:string, duration:number, hpA:number, hpB:number, stats:object}}
 */
export function simulate(unitA, unitB, { seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const A = cloneUnit(unitA, rng);
  const B = cloneUnit(unitB, rng);
  const events = [];
  const push = (type, data) => events.push({ seq: events.length, t: +time.toFixed(2), type, ...data });

  let time = 0;
  let guard = 0;
  const poisoned = new Map();   // uid → { stacks, tickTimer }

  push('start', {
    a: { name: A.name, hp: A.maxHp, weapons: A.weapons.length },
    b: { name: B.name, hp: B.maxHp, weapons: B.weapons.length },
  });

  while (A.hp > 0 && B.hp > 0 && time < COMBAT.timeLimit && guard++ < 40000) {
    time += COMBAT.tick;

    for (const [src, dst, side, foeSide] of [[A, B, 'A', 'B'], [B, A, 'B', 'A']]) {
      if (src.hp <= 0 || dst.hp <= 0) continue;

      for (const w of src.weapons) {
        const slow = src.chill ? 1 - Math.min(src.chillMax, src.chill) * src.chillPerHit : 1;
        w.timer -= COMBAT.tick * (1 + src.speed) * Math.max(0.4, slow);
        if (w.timer > 0) continue;
        w.timer += w.cooldown;

        const hit = resolveHit(src, dst, w, rng, { side, foeSide, time });
        w.hits++;

        push('attack', {
          side, foeSide,
          weaponUid: w.uid, weaponName: w.name,
          order: w.order, fx: w.fx,
          damage: hit.damage, crit: hit.crit,
          targetHpAfter: Math.max(0, dst.hp),
          targetMaxHp: dst.maxHp,
          sourceHpAfter: Math.max(0, src.hp),
          sourceMaxHp: src.maxHp,
        });

        // 吸血
        if (src.lifesteal > 0 && hit.damage > 0) {
          const healed = Math.max(1, Math.round(hit.damage * src.lifesteal));
          src.hp = Math.min(src.maxHp, src.hp + healed);
          push('heal', { side, amount: healed, hpAfter: src.hp, maxHp: src.maxHp, reason: 'lifesteal' });
        }

        // 点燃
        if (w.burn > 0) {
          const burn = Math.round(w.burn * src.burnMultiplier);
          dst.hp -= burn;
          push('burn', { side: foeSide, amount: burn, hpAfter: Math.max(0, dst.hp), maxHp: dst.maxHp });
        }

        // 中毒叠层（联动的 poisonOnHit 也折算进来）
        const poisonAmount = (w.poison || 0) + src.poisonPerHit + (src.poisonOnHit || 0);
        if (poisonAmount > 0) {
          const rec = poisoned.get(dst.name) || { stacks: 0, timer: 1 };
          rec.stacks += poisonAmount;
          poisoned.set(dst.name, rec);
          push('poison', { side: foeSide, stacks: rec.stacks });
        }

        // 冰霜减速（含联动层数上限）
        if (w.frost > 0 || src.chillPerHitBonus > 0) {
          const cap = (dst.chillMax || 5) + (src.chillMaxBonus || 0);
          dst.chill = Math.min(cap, (dst.chill || 0) + 1);
          push('frost', { side: foeSide, chill: dst.chill });
        }

        // 破甲
        if (w.armorBreak > 0) {
          dst.armor = Math.max(0, dst.armor - w.armorBreak);
          push('armorBreak', { side: foeSide, armorAfter: dst.armor, amount: w.armorBreak });
        }

        // 反伤
        const thorns = dst.thorns + (dst.thornsFromArmor ? Math.round(dst.armor * dst.thornsFromArmor) : 0);
        if (thorns > 0 && dst.hp > 0) {
          src.hp -= thorns;
          push('thorns', { side, foeSide, amount: thorns, hpAfter: Math.max(0, src.hp), maxHp: src.maxHp });
        }
      }

      // 治疗与回复
      if (src.hp > 0) {
        if (src.heal > 0 && src.hp < src.maxHp) {
          src.healTimer = (src.healTimer || 0) + COMBAT.tick;
          if (src.healTimer >= src.healCooldown) {
            src.healTimer -= src.healCooldown;
            const amount = Math.round(src.heal * src.healMultiplier);
            src.hp = Math.min(src.maxHp, src.hp + amount);
            push('heal', { side, amount, hpAfter: src.hp, maxHp: src.maxHp, reason: 'item' });
          }
        }
        if (src.regen > 0) {
          src.regenAcc = (src.regenAcc || 0) + src.regen * COMBAT.tick;
          if (src.regenAcc >= 1) {
            const amount = Math.floor(src.regenAcc);
            src.regenAcc -= amount;
            src.hp = Math.min(src.maxHp, src.hp + amount);
            push('regen', { side, amount, hpAfter: src.hp, maxHp: src.maxHp });
          }
        }
      }
    }

    // 中毒结算：每秒掉一次
    for (const [name, rec] of poisoned) {
      const unit = A.name === name ? A : (B.name === name ? B : null);
      if (!unit || unit.hp <= 0) continue;
      rec.timer -= COMBAT.tick;
      if (rec.timer <= 0) {
        rec.timer += 1;
        const dmg = Math.max(1, Math.round(rec.stacks / 3));
        unit.hp -= dmg;
        push('poisonTick', { target: name, amount: dmg, hpAfter: Math.max(0, unit.hp), maxHp: unit.maxHp });
      }
    }
  }

  let winner = 'draw';
  if (A.hp <= 0 && B.hp > 0) winner = 'B';
  else if (B.hp <= 0 && A.hp > 0) winner = 'A';
  else if (A.hp > 0 && B.hp <= 0) winner = 'A';
  else winner = A.hp === B.hp ? 'draw' : (A.hp > B.hp ? 'A' : 'B');

  push('end', {
    winner,
    hpA: Math.max(0, A.hp), hpB: Math.max(0, B.hp),
    maxHpA: A.maxHp, maxHpB: B.maxHp,
  });

  return {
    events,
    winner,
    duration: +time.toFixed(2),
    hpA: Math.max(0, A.hp),
    hpB: Math.max(0, B.hp),
    stats: summarize(events, A, B),
  };
}

function cloneUnit(u, rng) {
  return {
    ...u,
    hp: u.hp,
    chill: 0,
    weapons: u.weapons.map((w) => ({ ...w, timer: w.timer, hits: 0 })),
  };
}

function resolveHit(src, dst, weapon, rng, ctx) {
  let dmg = weapon.damage + src.damage;
  if (weapon.magic) dmg = Math.round(dmg * (1 + src.magicDamage));
  if (weapon.ranged) dmg = Math.round(dmg * (1 + src.rangedDamage));
  // 狂战士：血越少伤害越高
  if (src.rageDamage) {
    const missing = 1 - (src.hp / src.maxHp);
    dmg = Math.round(dmg * (1 + src.rageDamage * missing));
  }
  const critRate = src.crit + (weapon.critBonus || 0);
  const crit = rng() < critRate;
  // 暴击倍率 = 职业基础 × 分支加成 × 联动加成
  const mult = Math.max(src.critMult, src.critMultBonus || 0) + (src.critDamageBonus || 0);
  if (crit) dmg = Math.round(dmg * mult);
  if (weapon.pierce) dmg += weapon.pierce;

  const reduce = Math.min(src.armorCap, dst.armor / 100);
  dmg = Math.max(1, Math.round(dmg * (1 - reduce)));
  dst.hp -= dmg;
  return { damage: dmg, crit };
}

/** 给结算面板用的概览 */
function summarize(events, A, B) {
  const attacks = events.filter((e) => e.type === 'attack');
  const perWeapon = {};
  for (const a of attacks) {
    const k = a.weaponName;
    perWeapon[k] = perWeapon[k] || { hits: 0, damage: 0, crits: 0, fx: a.fx };
    perWeapon[k].hits++;
    perWeapon[k].damage += a.damage;
    if (a.crit) perWeapon[k].crits++;
  }
  return {
    totalAttacks: attacks.length,
    perWeapon,
    firstStrike: attacks.length ? attacks.reduce((m, a) => (a.t < m.t ? a : m), attacks[0]) : null,
  };
}

/** 构筑强度粗算，用于对手匹配与平衡抽样 */
export function unitPower(unit) {
  const dps = unit.weapons.reduce((s, w) => s + w.damage / w.cooldown, 0);
  const defense = unit.maxHp + unit.armor * 2.5 + unit.regen * 25 + unit.thorns * 3;
  return Math.round(dps * 9 + defense);
}

/** 把事件流压成给人看的文本（日志面板用） */
export function eventText(ev, names = { A: '你', B: '对手' }) {
  const who = (s) => names[s] || s;
  switch (ev.type) {
    case 'start': return `${ev.a.name}（${ev.a.hp} 血 / ${ev.a.weapons} 件武器）对上 ${ev.b.name}（${ev.b.hp} 血 / ${ev.b.weapons} 件武器）`;
    case 'attack': return `${who(ev.side)} 的 ${ev.weaponName} 命中 ${who(ev.foeSide)}，造成 ${ev.damage} 点伤害${ev.crit ? '（暴击）' : ''}`;
    case 'heal': return `${who(ev.side)} 回复 ${ev.amount} 点生命`;
    case 'regen': return `${who(ev.side)} 持续回复 ${ev.amount} 点`;
    case 'burn': return `${who(ev.side)} 被点燃，受到 ${ev.amount} 点火焰伤害`;
    case 'poison': return `${who(ev.side)} 中毒加深至 ${ev.stacks} 层`;
    case 'poisonTick': return `中毒发作，${ev.target} 失去 ${ev.amount} 点生命`;
    case 'frost': return `${who(ev.side)} 被减速（${ev.chill} 层）`;
    case 'armorBreak': return `${who(ev.side)} 的护甲被击碎 ${ev.amount} 点`;
    case 'thorns': return `${who(ev.side)} 被反弹 ${ev.amount} 点伤害`;
    case 'end': return `战斗结束：${ev.winner === 'draw' ? '平局' : who(ev.winner) + ' 获胜'}`;
    default: return ev.type;
  }
}
