/** 全局常量：改这里就能调整节奏与平衡 */

export const BOARD = {
  cols: 6,
  rows: 7,
  cell: 54,      // 单格像素
  gap: 2,        // 格间留白
};

export const ECON = {
  startGold: 10,
  startHp: 60,
  winGold: 1,
  baseRoundGold: 6,
  roundGoldStep: 1,   // 每回合多给 1 金
  refreshCost: 1,
  shopSlots: 5,
  levelUpCost: 8,
  maxShopLevel: 4,
};

export const MATCH = {
  maxRounds: 16,
  winTarget: 10,       // 先到 10 胜即吃鸡
};

/** 商店等级 → 各阶位出现权重 */
export const SHOP_TIER_WEIGHT = {
  1: { 1: 80, 2: 20, 3: 0, 4: 0 },
  2: { 1: 55, 2: 35, 3: 10, 4: 0 },
  3: { 1: 35, 2: 38, 3: 23, 4: 4 },
  4: { 1: 20, 2: 35, 3: 33, 4: 12 },
};

export const COMBAT = {
  tick: 0.05,          // 模拟步长（秒）
  timeLimit: 45,       // 超时判血
  armorCap: 0.75,      // 护甲减伤上限
};
