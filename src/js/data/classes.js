/**
 * 职业与子职业分支。
 *
 * 每个职业给：初始道具、初始血量、被动特性。
 *
 * 背包尺寸对所有角色统一（6×8），角色之间只差「携带的武器与道具」和被动：
 * 同样的格子里，用什么开局决定你往哪个方向堆形状。
 * 子职业在指定回合开放，选一个之后获得该分支的专属加成与专属道具。
 */

export const CLASSES = [
  {
    id: 'ranger',
    name: '游侠',
    desc: '弓箭与轻甲，靠连续攻击叠节奏。',
    bag: { cols: 6, rows: 8 },
    hp: 60,
    gold: 10,
    startItems: ['sword', 'apple'],
    passive: { name: '连射', desc: '每场战斗开始时，第一件武器直接进入半冷却。', effect: { firstWeaponReady: 0.5 } },
    branches: [
      {
        id: 'sharpshooter',
        name: '神射手',
        atRound: 4,
        desc: '远程武器伤害提高，暴击率 +15%。',
        bonus: { rangedDamage: 0.35, crit: 0.15 },
        unlockItems: ['longbow', 'quiver'],
      },
      {
        id: 'beastmaster',
        name: '驯兽师',
        atRound: 4,
        desc: '每次合成后，永久获得 +4 最大生命。',
        bonus: { hpPerFuse: 4 },
        unlockItems: ['boarTusk', 'wolfPelt'],
      },
    ],
  },
  {
    id: 'warrior',
    name: '战士',
    desc: '重甲与巨剑，用护甲换生存，用暴击换爆发。',
    bag: { cols: 6, rows: 8 },
    hp: 70,
    gold: 10,
    startItems: ['sword', 'buckler'],
    passive: { name: '铁壁', desc: '护甲减伤上限提高到 85%。', effect: { armorCap: 0.85 } },
    branches: [
      {
        id: 'berserker',
        name: '狂战士',
        atRound: 4,
        desc: '生命越低伤害越高，最多 +60%。',
        bonus: { rageDamage: 0.6 },
        unlockItems: ['dualAxe', 'bloodCharm'],
      },
      {
        id: 'guardian',
        name: '守卫者',
        atRound: 4,
        desc: '每次受击反弹 3 点伤害给攻击者。',
        bonus: { thorns: 3 },
        unlockItems: ['towerShield', 'thornCloak'],
      },
    ],
  },
  {
    id: 'mage',
    name: '法师',
    desc: '法术伤害高但脆，靠位置保护核心道具。',
    bag: { cols: 6, rows: 8 },
    hp: 55,
    gold: 12,
    startItems: ['firestaff', 'potion'],
    passive: { name: '元素亲和', desc: '点燃与法术伤害提高 25%。', effect: { magicDamage: 0.25 } },
    branches: [
      {
        id: 'pyromancer',
        name: '炎术士',
        atRound: 4,
        desc: '点燃伤害翻倍且可叠加两层。',
        bonus: { burnMultiplier: 2 },
        unlockItems: ['emberStaff', 'lavaOrb'],
      },
      {
        id: 'frostmage',
        name: '冰霜法师',
        atRound: 4,
        desc: '每次命中使目标攻速降低 6%，最多 5 层。',
        bonus: { chillPerHit: 0.06, chillMax: 5 },
        unlockItems: ['frostRing', 'iceCrystal'],
      },
    ],
  },
  {
    id: 'rogue',
    name: '盗贼',
    desc: '双持匕首与毒药，攻速极快但单次伤害低。',
    bag: { cols: 6, rows: 8 },
    hp: 55,
    gold: 11,
    startItems: ['dagger', 'buckler'],
    passive: { name: '疾影', desc: '所有武器基础冷却降低 12%。', effect: { speed: 0.12 } },
    branches: [
      {
        id: 'assassin',
        name: '刺客',
        atRound: 4,
        desc: '暴击伤害提高到 2.2 倍。',
        bonus: { critMult: 2.2 },
        unlockItems: ['venomDagger', 'shadowCloak'],
      },
      {
        id: 'poisoner',
        name: '炼毒师',
        atRound: 4,
        desc: '命中附加中毒，中毒目标每次行动失血。',
        bonus: { poisonPerHit: 2 },
        unlockItems: ['poisonFlask', 'serpentFang'],
      },
    ],
  },
  {
    id: 'merchant',
    name: '商人',
    desc: '起始金币多、背包大，靠滚雪球攒出更强组合。',
    bag: { cols: 6, rows: 8 },
    hp: 60,
    gold: 18,
    startItems: ['dagger', 'charm'],
    passive: { name: '讨价还价', desc: '商店刷新免费，卖出返还 75% 金币。', effect: { freeRefresh: true, sellRatio: 0.75 } },
    branches: [
      {
        id: 'collector',
        name: '收藏家',
        atRound: 4,
        desc: '商店多陈列 2 件（一次 8 件）。',
        bonus: { extraShopSlots: 2 },
        unlockItems: ['goldenIdol', 'merchantSeal'],
      },
      {
        id: 'trader',
        name: '投机商人',
        atRound: 4,
        desc: '每回合额外获得 4 金。',
        bonus: { extraGold: 4 },
        unlockItems: ['tradeLedger', 'silverBar'],
      },
    ],
  },
  {
    id: 'druid',
    name: '德鲁伊',
    desc: '生长与回复，靠时间把优势堆起来。',
    bag: { cols: 6, rows: 8 },
    hp: 65,
    gold: 10,
    startItems: ['mushroom', 'bow'],
    passive: { name: '生生不息', desc: '每秒回复 1 点生命。', effect: { regen: 1 } },
    branches: [
      {
        id: 'grovewarden',
        name: '林地守望',
        atRound: 4,
        desc: '治疗量提高 40%，回复可溢出为护盾。',
        bonus: { healMultiplier: 1.4, overhealShield: true },
        unlockItems: ['lifeBlossom', 'ancientRoot'],
      },
      {
        id: 'thornbeast',
        name: '棘兽',
        atRound: 4,
        desc: '每次受击反弹伤害，数值等于当前护甲的三分之一。',
        bonus: { thornsFromArmor: 0.33 },
        unlockItems: ['brambleHide', 'beastClaw'],
      },
    ],
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

export function branchOf(classId, branchId) {
  const cls = CLASS_BY_ID[classId];
  if (!cls) return null;
  return cls.branches.find((b) => b.id === branchId) || null;
}
