/**
 * 组合联动（synergy）
 *
 * 来自设计稿的核心想法：背包里某一类东西攒够数量，就触发一次联动效果。
 * 「数量」按格子里的道具件数算，不是按占格数 —— 所以小件更容易凑齐联动，
 * 这就给了「小件 vs 大件」一个真实的取舍。
 *
 * 判定方式：整包盘点（不要求相邻），但相邻的光环仍然只作用于邻居。
 * 两类规则分工清楚：相邻 = 精准加成，联动 = 数量奖励。
 */

/** 道具标签：用于判定「火焰系」「治疗系」这类统计口径 */
export const ITEM_TAGS = {
  // 火焰
  firestaff: ['fire'], emberStaff: ['fire'], lavaOrb: ['fire'],
  // 冰霜
  iceCrystal: ['frost'], frostRing: ['frost'],
  // 毒
  poisonFlask: ['poison'], venomDagger: ['poison'],
  // 治疗
  bread: ['heal'], apple: ['heal'], feast: ['heal'], elixir: ['heal'],
  potion: ['heal'], mushroom: ['heal'], lifeBlossom: ['heal'],
  // 护盾
  buckler: ['shield'], leather: ['shield'], woodshield: ['shield'],
  towerShield: ['shield'], chainmail: ['shield'], dragonmail: ['shield'],
  aegis: ['shield'], brambleHide: ['shield'],
  // 锋刃
  sword: ['blade'], dagger: ['blade'], axe: ['blade'], dualAxe: ['blade'],
  greatsword: ['blade'], spear: ['blade'], hammer: ['blade'], runeblade: ['blade'],
  // 远程
  bow: ['ranged'], longbow: ['ranged'], crossbow: ['ranged'], quiver: ['ranged'],
  // 宝石
  ruby: ['gem'], sapphire: ['gem'], topaz: ['gem'], emerald: ['gem'], sagesStone: ['gem'],
  // 暴击
  charm: ['crit'], whetstone: ['crit'],
};

/**
 * 联动定义。
 *  trigger: { tag } 或 { cat } —— 统计口径
 *  need: 需要几件
 *  effect: 数值加成（叠加到战斗单位上）
 *  tier: 显示分级，1 是初级联动，2 是强化联动
 */
export const SYNERGIES = [
  {
    id: 'fireCombo', name: '火焰连击', tier: 1,
    need: 3, trigger: { tag: 'fire' },
    effect: { damageMul: 0.20 },
    desc: '火焰系 3 件：全部伤害 +20%。',
  },
  {
    id: 'fireInferno', name: '烈焰风暴', tier: 2,
    need: 5, trigger: { tag: 'fire' },
    effect: { damageMul: 0.25, burnMul: 1.5 },
    desc: '火焰系 5 件：伤害再 +25%，点燃更强。',
  },
  {
    id: 'bladeMaster', name: '刀锋精通', tier: 1,
    need: 3, trigger: { tag: 'blade' },
    effect: { critMul: 0.08, speedMul: 0.08 },
    desc: '锋刃 3 件：暴击率 +8%，攻速 +8%。',
  },
  {
    id: 'bladeStorm', name: '万刃风暴', tier: 2,
    need: 5, trigger: { tag: 'blade' },
    effect: { critMul: 0.12, speedMul: 0.10, critDamage: 0.3 },
    desc: '锋刃 5 件：暴击与攻速继续提升，暴击伤害 +30%。',
  },
  {
    id: 'fortress', name: '堡垒', tier: 1,
    need: 3, trigger: { tag: 'shield' },
    effect: { armorMul: 0.25, thorns: 2 },
    desc: '护盾系 3 件：护甲 +25%，反伤 +2。',
  },
  {
    id: 'bastion', name: '不落之城', tier: 2,
    need: 5, trigger: { tag: 'shield' },
    effect: { armorMul: 0.30, thorns: 3, hpMul: 0.10 },
    desc: '护盾系 5 件：护甲再 +30%，生命上限 +10%。',
  },
  {
    id: 'regenChain', name: '连续回血', tier: 1,
    need: 3, trigger: { tag: 'heal' },
    effect: { healMul: 0.35, regen: 1 },
    desc: '治疗系 3 件：治疗量 +35%，每秒 +1 回复。',
  },
  {
    id: 'abundance', name: '生生不息', tier: 2,
    need: 5, trigger: { tag: 'heal' },
    effect: { healMul: 0.40, regen: 2, hpMul: 0.08 },
    desc: '治疗系 5 件：治疗量再 +40%，每秒 +2 回复。',
  },
  {
    id: 'toxicCloud', name: '毒云', tier: 1,
    need: 2, trigger: { tag: 'poison' },
    effect: { poisonMul: 1.0, poisonOnHit: 2 },
    desc: '毒系 2 件：中毒效果翻倍，命中额外附毒。',
  },
  {
    id: 'permafrost', name: '永冻', tier: 1,
    need: 2, trigger: { tag: 'frost' },
    effect: { chillPerHit: 0.04, chillMax: 2 },
    desc: '冰霜系 2 件：命中减速，最多叠 2 层。',
  },
  {
    id: 'volley', name: '箭雨', tier: 1,
    need: 2, trigger: { tag: 'ranged' },
    effect: { rangedDamage: 0.25 },
    desc: '远程系 2 件：远程伤害 +25%。',
  },
  {
    id: 'jeweler', name: '珠宝匠', tier: 1,
    need: 3, trigger: { tag: 'gem' },
    effect: { auraMul: 0.5 },
    desc: '宝石 3 件：相邻光环效果 +50%。',
  },
  {
    id: 'executioner', name: '处决者', tier: 1,
    need: 2, trigger: { tag: 'crit' },
    effect: { critMul: 0.10, critDamage: 0.25 },
    desc: '暴击系 2 件：暴击率 +10%，暴击伤害 +25%。',
  },
  {
    id: 'arsenal', name: '全副武装', tier: 1,
    need: 5, trigger: { cat: 'weapon' },
    effect: { damageMul: 0.15 },
    desc: '武器 5 件：全部伤害 +15%。',
  },
  {
    id: 'hoarder', name: '满载而行', tier: 1,
    need: 8, trigger: { any: true },
    effect: { hpMul: 0.12, armorMul: 0.12 },
    desc: '背包里有 8 件以上道具：生命与护甲各 +12%。',
  },
];

/** 给一件道具打上标签 */
export function tagsOf(item) {
  return ITEM_TAGS[item.id] || [];
}

/**
 * 盘点一块背包，返回本次触发的全部联动。
 * @param {Board} board
 * @returns {Array<{synergy:object, count:number}>}
 */
export function evaluateSynergies(board) {
  const entries = board.list();
  const byTag = new Map();
  const byCat = new Map();
  for (const e of entries) {
    for (const t of tagsOf(e.item)) byTag.set(t, (byTag.get(t) || 0) + 1);
    byCat.set(e.item.cat, (byCat.get(e.item.cat) || 0) + 1);
  }

  const hits = [];
  for (const s of SYNERGIES) {
    let count = 0;
    if (s.trigger.any) count = entries.length;
    else if (s.trigger.tag) count = byTag.get(s.trigger.tag) || 0;
    else if (s.trigger.cat) count = byCat.get(s.trigger.cat) || 0;
    if (count >= s.need) hits.push({ synergy: s, count });
  }

  // 同一 id 只保留最高 tier，避免重复叠加
  const best = new Map();
  for (const h of hits) {
    const cur = best.get(h.synergy.id);
    if (!cur || h.synergy.tier > cur.synergy.tier) best.set(h.synergy.id, h);
  }
  return [...best.values()];
}

/** 把联动效果折算成一个数值包，交给 buildUnit 应用 */
export function synergyBonus(board) {
  const out = {
    damageMul: 0, burnMul: 1, critMul: 0, speedMul: 0, critDamage: 0,
    armorMul: 0, thorns: 0, hpMul: 0, healMul: 0, regen: 0,
    poisonMul: 1, poisonOnHit: 0, chillPerHit: 0, chillMax: 0,
    rangedDamage: 0, auraMul: 0,
  };
  const list = evaluateSynergies(board);
  for (const { synergy } of list) {
    const e = synergy.effect;
    out.damageMul += e.damageMul || 0;
    out.critMul += e.critMul || 0;
    out.speedMul += e.speedMul || 0;
    out.critDamage += e.critDamage || 0;
    out.armorMul += e.armorMul || 0;
    out.thorns += e.thorns || 0;
    out.hpMul += e.hpMul || 0;
    out.healMul += e.healMul || 0;
    out.regen += e.regen || 0;
    out.rangedDamage += e.rangedDamage || 0;
    out.poisonOnHit += e.poisonOnHit || 0;
    out.chillPerHit += e.chillPerHit || 0;
    out.chillMax += e.chillMax || 0;
    if (e.burnMul) out.burnMul *= e.burnMul;
    if (e.poisonMul) out.poisonMul *= e.poisonMul;
  }
  return { bonus: out, list };
}

/** 给 UI 用：距离下一档还差几件 */
export function progressList(board) {
  const entries = board.list();
  const byTag = new Map();
  const byCat = new Map();
  for (const e of entries) {
    for (const t of tagsOf(e.item)) byTag.set(t, (byTag.get(t) || 0) + 1);
    byCat.set(e.item.cat, (byCat.get(e.item.cat) || 0) + 1);
  }
  return SYNERGIES.map((s) => {
    let count = 0;
    if (s.trigger.any) count = entries.length;
    else if (s.trigger.tag) count = byTag.get(s.trigger.tag) || 0;
    else if (s.trigger.cat) count = byCat.get(s.trigger.cat) || 0;
    return { synergy: s, count, ready: count >= s.need, gap: Math.max(0, s.need - count) };
  }).sort((a, b) => (b.ready - a.ready) || (a.gap - b.gap));
}
