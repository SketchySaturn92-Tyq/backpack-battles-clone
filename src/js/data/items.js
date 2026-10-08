/**
 * 道具数据表
 * 所有数值集中在这里，改平衡不动逻辑。
 *
 * shape: 字符网格，每个字符串是一行；'X' 表示占用格，'.' 表示空。
 *        例如 ['XX','XX'] 是 2x2，['X','X'] 是 1 宽 2 高。
 * cooldown: 攻击间隔（秒）。数值越小攻速越快。
 */

export const CATEGORIES = {
  weapon: { name: '武器', color: '#e2604a' },
  armor: { name: '防具', color: '#4a7fe2' },
  food: { name: '食物', color: '#5fbf6a' },
  gem: { name: '宝石', color: '#c05fd0' },
  trinket: { name: '饰品', color: '#e0a63c' },
};

export const RARITY = {
  1: { name: '普通', color: '#9aa4b2' },
  2: { name: '罕见', color: '#4fa3e3' },
  3: { name: '稀有', color: '#b06fe0' },
  4: { name: '传说', color: '#e8b33c' },
};

/** 基础道具表 */
export const ITEMS = [
  // ---------- 武器 ----------
  { id: 'dagger', name: '铁匕首', cat: 'weapon', tier: 1, price: 3, shape: ['X'],
    stats: { damage: 3, cooldown: 1.3 }, art: 'weapon' },
  { id: 'sword', name: '短剑', cat: 'weapon', tier: 1, price: 4, shape: ['X', 'X'],
    stats: { damage: 5, cooldown: 1.7 }, art: 'weapon' },
  { id: 'bow', name: '木弓', cat: 'weapon', tier: 1, price: 4, shape: ['XX'],
    stats: { damage: 3, cooldown: 1.0 }, art: 'weapon' },
  { id: 'spear', name: '长矛', cat: 'weapon', tier: 2, price: 7, shape: ['X', 'X'],
    stats: { damage: 8, cooldown: 2.0 }, art: 'weapon' },
  { id: 'axe', name: '战斧', cat: 'weapon', tier: 2, price: 8, shape: ['XX', 'XX'],
    stats: { damage: 11, cooldown: 2.8 }, art: 'weapon' },
  { id: 'firestaff', name: '火焰法杖', cat: 'weapon', tier: 3, price: 13, shape: ['X', 'X'],
    stats: { damage: 7, cooldown: 1.5, burn: 2 }, art: 'weapon' },
  { id: 'crossbow', name: '十字弩', cat: 'weapon', tier: 3, price: 12, shape: ['XX', 'XX'],
    stats: { damage: 9, cooldown: 1.8, pierce: 3 }, art: 'weapon' },
  { id: 'greatsword', name: '巨剑', cat: 'weapon', tier: 4, price: 20, shape: ['XX', 'XX', 'XX'],
    stats: { damage: 22, cooldown: 3.2 }, art: 'weapon' },

  // ---------- 防具 ----------
  { id: 'buckler', name: '小圆盾', cat: 'armor', tier: 1, price: 3, shape: ['X'],
    stats: { armor: 3 }, art: 'armor' },
  { id: 'leather', name: '皮甲', cat: 'armor', tier: 1, price: 5, shape: ['XX', 'XX'],
    stats: { armor: 6 }, art: 'armor' },
  { id: 'woodshield', name: '木盾', cat: 'armor', tier: 2, price: 7, shape: ['XX'],
    stats: { armor: 9, thorns: 1 }, art: 'armor' },
  { id: 'chainmail', name: '锁子甲', cat: 'armor', tier: 3, price: 13, shape: ['XXX', 'XXX'],
    stats: { armor: 16 }, art: 'armor' },
  { id: 'dragonmail', name: '龙鳞甲', cat: 'armor', tier: 4, price: 22, shape: ['XXX', 'XXX'],
    stats: { armor: 26, regen: 1 }, art: 'armor' },

  // ---------- 食物 ----------
  { id: 'bread', name: '面包', cat: 'food', tier: 1, price: 2, shape: ['X'],
    stats: { heal: 4, healCooldown: 4 }, art: 'food' },
  { id: 'apple', name: '红苹果', cat: 'food', tier: 1, price: 3, shape: ['X'],
    stats: { heal: 6, healCooldown: 6, maxHp: 4 }, art: 'food' },
  { id: 'mushroom', name: '蘑菇', cat: 'food', tier: 2, price: 6, shape: ['X'],
    stats: { regen: 2 }, art: 'food' },
  { id: 'feast', name: '丰盛大餐', cat: 'food', tier: 3, price: 12, shape: ['XX', 'XX'],
    stats: { heal: 14, healCooldown: 5 }, art: 'food' },
  { id: 'elixir', name: '不死药', cat: 'food', tier: 4, price: 20, shape: ['X'],
    stats: { regen: 4, maxHp: 15 }, art: 'food' },

  // ---------- 宝石 ----------
  { id: 'ruby', name: '红宝石', cat: 'gem', tier: 1, price: 4, shape: ['X'],
    stats: { aura: { damage: 3 } }, art: 'gem' },
  { id: 'sapphire', name: '蓝宝石', cat: 'gem', tier: 1, price: 4, shape: ['X'],
    stats: { aura: { speed: 0.15 } }, art: 'gem' },
  { id: 'topaz', name: '黄玉', cat: 'gem', tier: 2, price: 7, shape: ['X'],
    stats: { aura: { armor: 4 } }, art: 'gem' },
  { id: 'emerald', name: '祖母绿', cat: 'gem', tier: 2, price: 7, shape: ['X'],
    stats: { aura: { heal: 3 } }, art: 'gem' },
  { id: 'sagesStone', name: '贤者之石', cat: 'gem', tier: 4, price: 22, shape: ['X'],
    stats: { aura: { damage: 6, speed: 0.2 } }, art: 'gem' },

  // ---------- 饰品 ----------
  { id: 'charm', name: '幸运符', cat: 'trinket', tier: 1, price: 4, shape: ['X'],
    stats: { crit: 0.15, critMult: 1.5 }, art: 'trinket' },
  { id: 'belt', name: '皮革腰带', cat: 'trinket', tier: 2, price: 6, shape: ['XXX'],
    stats: { maxHp: 10 }, art: 'trinket' },
  { id: 'hourglass', name: '沙漏', cat: 'trinket', tier: 3, price: 12, shape: ['X', 'X'],
    stats: { globalSpeed: 0.2 }, art: 'trinket' },
  { id: 'whetstone', name: '磨刀石', cat: 'trinket', tier: 2, price: 6, shape: ['X'],
    stats: { aura: { damage: 2 }, crit: 0.05 }, art: 'trinket' },
  { id: 'poisonvial', name: '毒药瓶', cat: 'trinket', tier: 2, price: 6, shape: ['X'],
    stats: { poisonOnKill: 6 }, art: 'trinket' },
  { id: 'thornmail', name: '荆棘披风', cat: 'trinket', tier: 3, price: 11, shape: ['XX', 'XX'],
    stats: { thorns: 4 }, art: 'trinket' },

  // ---------- 合成专属高阶 ----------
  { id: 'twinDagger', name: '双刃匕首', cat: 'weapon', tier: 2, price: 0, shape: ['X', 'X'],
    stats: { damage: 4, cooldown: 0.8 }, art: 'weapon', fused: true },
  { id: 'steelSword', name: '精钢剑', cat: 'weapon', tier: 3, price: 0, shape: ['X', 'X', 'X'],
    stats: { damage: 14, cooldown: 1.6 }, art: 'weapon', fused: true },
  { id: 'towerShield', name: '塔盾', cat: 'armor', tier: 3, price: 0, shape: ['XX', 'XX'],
    stats: { armor: 20, thorns: 2 }, art: 'armor', fused: true },
  { id: 'gemCrown', name: '宝石王冠', cat: 'trinket', tier: 4, price: 0, shape: ['XXX'],
    stats: { aura: { damage: 4, armor: 4, speed: 0.1 }, crit: 0.1 }, art: 'trinket', fused: true },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** 合成配方：两件同名同阶 → 一件高阶 */
export const RECIPES = [
  { a: 'dagger', b: 'dagger', out: 'twinDagger' },
  { a: 'sword', b: 'sword', out: 'steelSword' },
  { a: 'woodshield', b: 'woodshield', out: 'towerShield' },
  { a: 'charm', b: 'charm', out: 'gemCrown' },
];

export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [`${r.a}+${r.b}`, r.out]));

/** 可按阶位出现的商店池 */
export function poolByTier(tier) {
  return ITEMS.filter((i) => !i.fused && i.tier === tier);
}
