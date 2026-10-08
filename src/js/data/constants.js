/** 全局常量 v0.4 */

export const BOARD = {
  cell: 50,
  gap: 3,
  pad: 8,
};

export const ECON = {
  startGold: 10,
  refreshCost: 1,
  shopSlots: 6,        // 商店一次摆 6 件
  sellRatio: 0.6,
  winGold: 1,
  baseRoundGold: 5,
  roundGoldStep: 1,
};

export const MATCH = {
  maxRounds: 16,
  branchRound: 4,
  winTarget: 10,
};

/**
 * 商店品质：按回合自动提升，玩家不能手动升级。
 * 这样商店永远不会落后于玩家的成长曲线，也不会被玩家提前刷满。
 */
export const SHOP_QUALITY = [
  { fromRound: 1, level: 1, label: '简陋' },
  { fromRound: 3, level: 2, label: '普通' },
  { fromRound: 5, level: 3, label: '精良' },
  { fromRound: 8, level: 4, label: '珍稀' },
  { fromRound: 11, level: 5, label: '传说' },
];

/** 商店等级 → 各阶位出现权重 */
export const SHOP_TIER_WEIGHT = {
  1: { 1: 82, 2: 18, 3: 0, 4: 0 },
  2: { 1: 58, 2: 32, 3: 10, 4: 0 },
  3: { 1: 38, 2: 36, 3: 22, 4: 4 },
  4: { 1: 22, 2: 34, 3: 32, 4: 12 },
  5: { 1: 12, 2: 28, 3: 38, 4: 22 },
};

export function shopQualityFor(round) {
  let q = SHOP_QUALITY[0];
  for (const s of SHOP_QUALITY) if (round >= s.fromRound) q = s;
  return q;
}

export const COMBAT = {
  tick: 0.05,
  timeLimit: 30,
  armorCap: 0.75,
  orderStep: 0.12,
};
