/**
 * 道具数据表（v0.2 重写）
 *
 * 关键变化：形状全部换成真正的不规则形状。
 * 玩家买到手之后必须自己整理 —— 这是核心玩法，不是点缀。
 *
 * 形状写法见 shapes.js：'X' 占格，'.' 空。
 * slot 说明：
 *   trigger  道具放在背包里就持续生效（被动/光环/触发）
 *   weapon   会在战斗时间轴上周期性出手，needLine 表示必须与背包顶边相连
 *
 * 数值口径：cooldown 是秒；damage 是单次基础伤害。
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

/** 触发动效类型，战斗舞台按这个播动画 */
export const FX = {
  slash: '斩击',
  thrust: '刺击',
  heavy: '重劈',
  arrow: '箭矢',
  magic: '法术',
  burn: '火焰',
  heal: '治疗',
  shield: '护盾',
  poison: '中毒',
  frost: '冰霜',
  shock: '闪电',
};

export const ITEMS = [
  // ============ 武器 ============
  {
    id: 'sword', name: '长剑', cat: 'weapon', tier: 1, price: 4,
    shape: ['X', 'X', 'X'],           // 竖着 3 格，像插在包里的剑
    stats: { damage: 7, cooldown: 1.6, fx: 'slash' },
    slot: 'weapon',
    desc: '最基础的近战武器，占 3 格竖排。',
  },
  {
    id: 'dagger', name: '匕首', cat: 'weapon', tier: 1, price: 2,
    shape: ['X', 'X'],
    stats: { damage: 3, cooldown: 0.9, fx: 'thrust' },
    slot: 'weapon',
    desc: '短小，可以塞进缝里，攻速快。',
  },
  {
    id: 'bow', name: '短弓', cat: 'weapon', tier: 1, price: 4,
    shape: ['.X.', 'X.X', '.X.'],      // 弓形，四角被切掉，占 4 格
    stats: { damage: 4, cooldown: 1.1, fx: 'arrow', ranged: true },
    slot: 'weapon',
    desc: '弓形占 4 格但外接是 3×3，摆位很吃形状。',
  },
  {
    id: 'longbow', name: '长弓', cat: 'weapon', tier: 3, price: 12,
    shape: ['.X.', '.X.', 'X.X', '.X.', 'X.X'],
    stats: { damage: 9, cooldown: 1.4, fx: 'arrow', ranged: true, pierce: 4 },
    slot: 'weapon',
    desc: '细长五格，几乎只能竖着放。',
  },
  {
    id: 'spear', name: '长矛', cat: 'weapon', tier: 2, price: 6,
    shape: ['X', 'X', 'X', 'X'],
    stats: { damage: 9, cooldown: 2.0, fx: 'thrust' },
    slot: 'weapon',
    desc: '四格长条，能贯穿背包。',
  },
  {
    id: 'axe', name: '战斧', cat: 'weapon', tier: 2, price: 7,
    shape: ['XX', 'X.', 'X.'],          // L 形，斧头带柄
    stats: { damage: 11, cooldown: 2.4, fx: 'heavy' },
    slot: 'weapon',
    desc: 'L 形，拐角处最能塞。',
  },
  {
    id: 'dualAxe', name: '双持斧', cat: 'weapon', tier: 3, price: 14,
    shape: ['XX', 'XX', '.X'],          // T 形
    stats: { damage: 13, cooldown: 1.7, fx: 'heavy' },
    slot: 'weapon',
    desc: 'T 形五格，攻速比重战斧快。',
  },
  {
    id: 'greatsword', name: '巨剑', cat: 'weapon', tier: 4, price: 20,
    shape: ['.X.', 'XXX', '.X.', '.X.'],  // 剑形，占 6 格
    stats: { damage: 24, cooldown: 3.0, fx: 'heavy' },
    slot: 'weapon',
    desc: '剑形六格，最强也最难塞。',
  },
  {
    id: 'firestaff', name: '火焰法杖', cat: 'weapon', tier: 2, price: 8,
    shape: ['X', 'X', 'X', 'X'],
    stats: { damage: 5, cooldown: 1.7, burn: 4, fx: 'burn', magic: true },
    slot: 'weapon',
    desc: '命中后持续点燃目标。',
  },
  {
    id: 'emberStaff', name: '余烬之杖', cat: 'weapon', tier: 3, price: 15,
    shape: ['.X', 'XX', '.X'],
    stats: { damage: 6, cooldown: 1.6, burn: 9, fx: 'burn', magic: true },
    slot: 'weapon',
    desc: 'S 形四格，点燃更狠。',
  },
  {
    id: 'venomDagger', name: '毒刃', cat: 'weapon', tier: 3, price: 13,
    shape: ['X', 'X', 'X'],
    stats: { damage: 5, cooldown: 0.9, poison: 3, fx: 'poison' },
    slot: 'weapon',
    desc: '快速叠毒。',
  },
  {
    id: 'crossbow', name: '十字弩', cat: 'weapon', tier: 3, price: 13,
    shape: ['XXX', '.X.', '.X.'],       // 十字形下半截
    stats: { damage: 10, cooldown: 1.6, pierce: 5, fx: 'arrow', ranged: true },
    slot: 'weapon',
    desc: '无视部分护甲。',
  },
  {
    id: 'hammer', name: '战锤', cat: 'weapon', tier: 3, price: 14,
    shape: ['XXX', '.X.', '.X.'],
    stats: { damage: 16, cooldown: 2.6, armorBreak: 4, fx: 'heavy' },
    slot: 'weapon',
    desc: '每次命中削弱目标护甲。',
  },

  // ============ 防具 ============
  { id: 'buckler', name: '小圆盾', cat: 'armor', tier: 1, price: 3, shape: ['XX'],
    stats: { armor: 4 }, slot: 'trigger', desc: '两块并排，最好贴着武器放。' },
  { id: 'leather', name: '皮甲', cat: 'armor', tier: 1, price: 5, shape: ['XX', 'XX'],
    stats: { armor: 7 }, slot: 'trigger', desc: '方正 2×2。' },
  { id: 'woodshield', name: '木盾', cat: 'armor', tier: 2, price: 7,
    shape: ['XXX', 'X.X'],
    stats: { armor: 10, thorns: 1 }, slot: 'trigger', desc: '凹字形，包住一格。' },
  { id: 'towerShield', name: '塔盾', cat: 'armor', tier: 3, price: 14,
    shape: ['.X.', 'XXX', 'XXX'],
    stats: { armor: 20, thorns: 3 }, slot: 'trigger', desc: 'T 形七格，极硬。' },
  { id: 'chainmail', name: '锁子甲', cat: 'armor', tier: 3, price: 13,
    shape: ['XXX', 'XXX'],
    stats: { armor: 17 }, slot: 'trigger', desc: '横向 3×2。' },
  { id: 'dragonmail', name: '龙鳞甲', cat: 'armor', tier: 4, price: 22,
    shape: ['XXX', 'X.X', 'XXX'],
    stats: { armor: 28, regen: 1 }, slot: 'trigger', desc: '镂空 3×3，八格。' },
  { id: 'brambleHide', name: '荆棘皮甲', cat: 'armor', tier: 3, price: 15,
    shape: ['X.X', 'XXX', 'X.X'],
    stats: { armor: 16, thorns: 6 }, slot: 'trigger', desc: 'X 形，反弹伤害。' },

  // ============ 食物 ============
  { id: 'bread', name: '面包', cat: 'food', tier: 1, price: 2, shape: ['X'],
    stats: { heal: 5, healCooldown: 3.5 }, slot: 'trigger', desc: '只占一格，前期主力补给。' },
  { id: 'apple', name: '红苹果', cat: 'food', tier: 1, price: 3, shape: ['XX'],
    stats: { heal: 7, healCooldown: 5, maxHp: 3 }, slot: 'trigger', desc: '兼顾补血与加血上限。' },
  { id: 'mushroom', name: '蘑菇', cat: 'food', tier: 2, price: 5,
    shape: ['X', 'X'],
    stats: { regen: 2 }, slot: 'trigger', desc: '持续回血，越久越强。' },
  { id: 'feast', name: '大餐', cat: 'food', tier: 3, price: 11,
    shape: ['XXX', 'X.X'],
    stats: { heal: 16, healCooldown: 5 }, slot: 'trigger', desc: '凹字形五格。' },
  { id: 'elixir', name: '不死药', cat: 'food', tier: 4, price: 20,
    shape: ['X', 'X'],
    stats: { regen: 4, maxHp: 12 }, slot: 'trigger', desc: '回血与加血上限都强。' },
  { id: 'potion', name: '小药水', cat: 'food', tier: 1, price: 3, shape: ['X'],
    stats: { heal: 8, healCooldown: 6, oneShot: true }, slot: 'trigger', desc: '一次性大回血。' },

  // ============ 宝石 ============
  { id: 'ruby', name: '红宝石', cat: 'gem', tier: 1, price: 4, shape: ['X'],
    stats: { aura: { damage: 4 } }, slot: 'trigger', desc: '给相邻道具 +4 伤害。' },
  { id: 'sapphire', name: '蓝宝石', cat: 'gem', tier: 1, price: 4, shape: ['X'],
    stats: { aura: { speed: 0.15 } }, slot: 'trigger', desc: '给相邻道具 +15% 攻速。' },
  { id: 'topaz', name: '黄玉', cat: 'gem', tier: 2, price: 6, shape: ['X'],
    stats: { aura: { armor: 5 } }, slot: 'trigger', desc: '给相邻道具 +5 护甲。' },
  { id: 'emerald', name: '祖母绿', cat: 'gem', tier: 2, price: 6, shape: ['X'],
    stats: { aura: { heal: 4 } }, slot: 'trigger', desc: '给相邻道具 +4 治疗量。' },
  { id: 'iceCrystal', name: '冰晶', cat: 'gem', tier: 3, price: 11, shape: ['XX'],
    stats: { aura: { speed: 0.1, frost: 1 } }, slot: 'trigger', desc: '相邻提速并附带冰霜减速。' },
  { id: 'sagesStone', name: '贤者之石', cat: 'gem', tier: 4, price: 22,
    shape: ['.X.', 'XXX', '.X.'],      // 十字形，5 格
    stats: { aura: { damage: 6, speed: 0.2, armor: 6 } }, slot: 'trigger',
    desc: '十字形五格，给四周全部加成。' },

  // ============ 饰品 ============
  { id: 'charm', name: '幸运符', cat: 'trinket', tier: 1, price: 4, shape: ['X', 'X'],
    stats: { crit: 0.15, critMult: 1.6 }, slot: 'trigger', desc: '提高暴击率。' },
  { id: 'belt', name: '腰带', cat: 'trinket', tier: 2, price: 6,
    shape: ['XXX', 'X..'],
    stats: { maxHp: 12 }, slot: 'trigger', desc: 'L 形四格。' },
  { id: 'hourglass', name: '沙漏', cat: 'trinket', tier: 3, price: 12,
    shape: ['XX', '.X'],
    stats: { globalSpeed: 0.2 }, slot: 'trigger', desc: '全部武器提速 20%。' },
  { id: 'whetstone', name: '磨刀石', cat: 'trinket', tier: 1, price: 3,
    shape: ['XX'],
    stats: { aura: { damage: 3 }, crit: 0.05 }, slot: 'trigger', desc: '给相邻武器加伤。' },
  { id: 'thornCloak', name: '荆棘披风', cat: 'trinket', tier: 3, price: 11,
    shape: ['X.X', '.X.', 'X.X'],
    stats: { thorns: 7 }, slot: 'trigger', desc: 'X 形四角，反弹很高。' },
  { id: 'quiver', name: '箭袋', cat: 'trinket', tier: 2, price: 7,
    shape: ['X', 'X'],
    stats: { aura: { rangedDamage: 4 } }, slot: 'trigger', desc: '强化相邻远程武器。' },
  { id: 'bloodCharm', name: '血符', cat: 'trinket', tier: 3, price: 12,
    shape: ['XX', 'XX'],
    stats: { lifesteal: 0.15 }, slot: 'trigger', desc: '造成伤害的 15% 转为治疗。' },
  { id: 'poisonFlask', name: '毒瓶', cat: 'trinket', tier: 2, price: 6,
    shape: ['X'],
    stats: { poisonAura: 2 }, slot: 'trigger', desc: '相邻武器命中附加中毒。' },
  { id: 'goldenIdol', name: '黄金神像', cat: 'trinket', tier: 4, price: 20,
    shape: ['XXX', '.X.'],
    stats: { aura: { damage: 5, armor: 5 }, goldPerRound: 2 }, slot: 'trigger',
    desc: '每回合额外 2 金。' },
  { id: 'frostRing', name: '霜戒', cat: 'trinket', tier: 3, price: 10,
    shape: ['X'],
    stats: { aura: { frost: 2 } }, slot: 'trigger', desc: '相邻武器附带减速。' },

  // ---------- 第四阶：商店可售的顶级货（不与合成产出重复） ----------
  { id: 'runeblade', name: '符文剑', cat: 'weapon', tier: 4, price: 21,
    shape: ['XX', '.X', '.X'],        // 4 格不规则
    stats: { damage: 17, cooldown: 1.9, fx: 'shock', crit: 0.1 },
    slot: 'weapon', desc: '四格不规则，命中带雷击追加伤害。' },
  { id: 'aegis', name: '神盾', cat: 'armor', tier: 4, price: 21,
    shape: ['XX', 'XX', 'XX'],        // 3×2 六格
    stats: { armor: 24, thorns: 4 }, slot: 'trigger', desc: '六格厚盾，反弹也不低。' },
  { id: 'phoenixFeather', name: '凤凰羽', cat: 'trinket', tier: 4, price: 20,
    shape: ['X', 'X'],
    stats: { regen: 5, maxHp: 18 }, slot: 'trigger', desc: '只占两格，持续回血很强。' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** 合成配方：两件同名同阶相邻即可合成 */
export const RECIPES = [
  { a: 'sword', b: 'sword', out: 'greatsword' },
  { a: 'dagger', b: 'dagger', out: 'venomDagger' },
  { a: 'bow', b: 'bow', out: 'longbow' },
  { a: 'axe', b: 'axe', out: 'dualAxe' },
  { a: 'buckler', b: 'buckler', out: 'woodshield' },
  { a: 'woodshield', b: 'woodshield', out: 'towerShield' },
  { a: 'leather', b: 'leather', out: 'chainmail' },
  { a: 'chainmail', b: 'chainmail', out: 'dragonmail' },
  { a: 'firestaff', b: 'firestaff', out: 'emberStaff' },
  { a: 'bread', b: 'bread', out: 'apple' },
  { a: 'apple', b: 'apple', out: 'feast' },
  { a: 'mushroom', b: 'mushroom', out: 'elixir' },
  { a: 'charm', b: 'charm', out: 'hourglass' },
  { a: 'whetstone', b: 'whetstone', out: 'bloodCharm' },
  { a: 'thornCloak', b: 'thornCloak', out: 'goldenIdol' },
  { a: 'ruby', b: 'ruby', out: 'sagesStone' },
];

export const RECIPE_MAP = Object.fromEntries(
  RECIPES.flatMap((r) => [[`${r.a}+${r.b}`, r.out], [`${r.b}+${r.a}`, r.out]]),
);

/** 商店池：按阶位取非合成产物 */
export function poolByTier(tier) {
  const fusedOnly = new Set(RECIPES.map((r) => r.out));
  return ITEMS.filter((i) => i.tier === tier && !fusedOnly.has(i.id));
}
