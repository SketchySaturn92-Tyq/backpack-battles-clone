/** 全局常量（v0.2） */

export const BOARD = {
  cell: 50,        // 单格像素
  gap: 3,
  pad: 8,
};

export const ECON = {
  startGold: 10,
  refreshCost: 1,
  shopSlots: 5,
  levelUpCost: 8,
  maxShopLevel: 5,
  sellRatio: 0.6,   // 卖出返还比例
  winGold: 1,
  baseRoundGold: 6,
  roundGoldStep: 1,
};

export const MATCH = {
  maxRounds: 16,
  branchRound: 4,     // 第几回合开始能选子职业
  winTarget: 10,
};

/** 商店等级 → 各阶位出现权重 */
export const SHOP_TIER_WEIGHT = {
  1: { 1: 82, 2: 18, 3: 0, 4: 0 },
  2: { 1: 58, 2: 32, 3: 10, 4: 0 },
  3: { 1: 38, 2: 36, 3: 22, 4: 4 },
  4: { 1: 22, 2: 34, 3: 32, 4: 12 },
  5: { 1: 12, 2: 28, 3: 38, 4: 22 },
  6: { 1: 6, 2: 22, 3: 40, 4: 32 },
};

export const COMBAT = {
  tick: 0.05,
  timeLimit: 30,
  armorCap: 0.75,
  /** 触发顺序造成的起手延迟：顺序越靠后，首次出手越晚 */
  orderStep: 0.12,
};
