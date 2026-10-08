/**
 * 对手池 v0.4
 *
 * 上一版的问题：我方中期战力崩坏，无脑玩平均 9.9 胜。
 * 根因是对手预算按 5 + round×3 线性给，而玩家的金币是**累加**的
 * （每回合收入都在涨，还带连胜奖励），两者曲线根本不在一个量级。
 *
 * 这一版改成三条同步曲线：
 *   1. 预算跟着「玩家到这一回合的累计收入」走，再乘一个效率系数
 *   2. 道具件数设上限，逼对手也面对背包空间压力
 *   3. 阶位供给跟着回合走，逾期不再靠低价堆量
 *
 * DIFFICULTY 是唯一的总旋钮，平衡抽样就是围绕它调的。
 */

import { ITEM_BY_ID, poolByTier, RECIPE_MAP } from '../data/items.js';
import { ECON } from '../data/constants.js';
import { Board } from './grid.js';
import { mulberry32 } from './combat.js';

/** 总难度旋钮：调这一个数就能整体加压/减压 */
export const DIFFICULTY = {
  budgetRatio: 0.92,      // 对手预算 / 玩家累计收入
  countCap: 14,           // 对手最多摆几件
  hpBase: 52,             // 起始血量
  hpPerRound: 3.4,        // 每回合加血
  fuseChanceFrom: 5,      // 从第几回合起可能完成合成
  fuseChance: 0.55,
};

export const OPPONENT_NAMES = [
  '新手佣兵', '流浪拾荒者', '蘑菇贩子', '宝石匠学徒', '毒刃刺客',
  '铁盾卫士', '酒馆打手', '披风猎人', '符文学者', '双刃舞者',
  '龙裔骑士', '贤者学徒', '荆棘行者', '冰霜女巫', '传说冒险家', '冠军·福西法',
];

const ARCHETYPES = ['blade', 'guard', 'poison', 'gem', 'feast', 'mage'];
const ARCHETYPE_LABEL = {
  blade: '双刃流', guard: '铁壁流', poison: '毒系流',
  gem: '宝石流', feast: '饱食流', mage: '法术流',
};
const PREFER = {
  blade: ['weapon'],
  guard: ['armor', 'trinket'],
  poison: ['trinket', 'weapon'],
  gem: ['gem', 'weapon'],
  feast: ['food', 'armor'],
  mage: ['weapon', 'gem'],
};

/**
 * 玩家到第 round 回合为止的累计收入估算。
 * 收入口径：起始金币 + 每回合 (baseRoundGold + round + 连胜约 1.5 金)
 */
export function expectedPlayerIncome(round) {
  let gold = ECON.startGold;
  for (let r = 1; r < round; r++) {
    gold += ECON.baseRoundGold + r * ECON.roundGoldStep + 1.5;
  }
  return gold;
}

/** 这一回合的对手预算 */
export function opponentBudget(round) {
  return expectedPlayerIncome(round) * DIFFICULTY.budgetRatio;
}

/** 这一回合对手的阶位上限 */
export function opponentTierCap(round) {
  if (round >= 12) return 4;
  if (round >= 8) return 3;
  if (round >= 5) return 2;
  return 1;
}

export function opponentHp(round) {
  return Math.round(DIFFICULTY.hpBase + round * DIFFICULTY.hpPerRound);
}

/**
 * 生成第 round 回合的对手。
 * 在真实 Board 上摆道具，遵守和玩家一样的形状与空间规则。
 */
export function makeOpponent(round, seed = round * 977) {
  const rng = mulberry32(seed);
  const nameIdx = Math.min(OPPONENT_NAMES.length - 1, Math.floor((round - 1) / 1.1));
  const name = OPPONENT_NAMES[Math.max(0, nameIdx)];
  const arch = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];

  // 背包随回合长大，但一直比玩家略小，保证对手也要「挤」
  const cols = round < 4 ? 5 : 6;
  const rows = round < 4 ? 6 : (round < 9 ? 7 : 8);
  const board = new Board(cols, rows);
  // 对手背包利用率：越后期越会填满，前期留有空位
  const fillTarget = 0.55 + Math.min(0.3, round * 0.02);
  const cellBudget = Math.floor(cols * rows * fillTarget);

  let spent = 0;
  const budget = opponentBudget(round);
  const tierCap = opponentTierCap(round);
  const wanted = PREFER[arch] || ['weapon'];
  let uidSeq = 0;
  let usedCells = 0;
  let guard = 0;

  while (spent < budget && board.count() < DIFFICULTY.countCap
         && usedCells < cellBudget && guard++ < 260) {
    const tier = pickTier(round, tierCap, rng);
    const all = poolByTier(tier);
    if (!all.length) break;
    const preferred = all.filter((i) => wanted.includes(i.cat));
    const pick = (preferred.length && rng() < 0.7) ? preferred : all;

    // 在能放下的候选中挑一个，放不下就换更小的
    const fits = pick.filter((i) => {
      const cells = countCells(i.shape);
      return usedCells + cells <= cellBudget && board.findFreeSpot(i.shape);
    });
    if (!fits.length) {
      const small = all.filter((i) => {
        const cells = countCells(i.shape);
        return cells <= 2 && usedCells + cells <= cellBudget && board.findFreeSpot(i.shape);
      });
      if (!small.length) break;
      const alt = small[Math.floor(rng() * small.length)];
      placeOne(board, alt, `ai-${round}-${uidSeq++}`);
      spent += alt.price;
      usedCells += countCells(alt.shape);
      continue;
    }

    const base = fits[Math.floor(rng() * fits.length)];
    placeOne(board, base, `ai-${round}-${uidSeq++}`);
    spent += base.price;
    usedCells += countCells(base.shape);
  }

  // 后期对手也会合成，模拟真人会整理
  if (round >= DIFFICULTY.fuseChanceFrom && rng() < DIFFICULTY.fuseChance) {
    tryFuseForAi(board, round, rng);
  }

  return {
    name: `${name}·${ARCHETYPE_LABEL[arch]}`,
    board,
    hp: opponentHp(round),
    round,
    arch,
  };
}

function placeOne(board, item, uid) {
  const inst = { ...item, uid };
  const spot = board.findFreeSpot(inst.shape);
  if (!spot) return false;
  return board.place(inst, spot.x, spot.y, inst.shape);
}

function pickTier(round, cap, rng) {
  // 越接近上限的阶位出现得越多，让对手强度平滑上涨
  const r = rng();
  if (cap >= 4 && r < 0.14) return 4;
  if (cap >= 3 && r < 0.38) return 3;
  if (cap >= 2 && r < 0.68) return 2;
  return 1;
}

function countCells(shape) {
  let n = 0;
  for (const row of shape) for (const ch of row) if (ch === 'X') n++;
  return n;
}

function tryFuseForAi(board, round, rng) {
  for (const e of board.list()) {
    const out = RECIPE_MAP[`${e.item.id}+${e.item.id}`];
    if (!out) continue;
    const partner = board.list().find((o) => o.item.id === e.item.id && o.item.uid !== e.item.uid);
    if (!partner) continue;
    const outItem = ITEM_BY_ID[out];
    const uid = `ai-${round}-fused-${Math.floor(rng() * 1e6)}`;
    board.remove(e.item.uid);
    board.remove(partner.item.uid);
    const spot = board.findFreeSpot(outItem.shape);
    if (spot) {
      placeOne(board, outItem, uid);
      return true;
    }
    // 放不下就还原
    placeOne(board, e.item, e.item.uid);
    placeOne(board, partner.item, partner.item.uid);
    return false;
  }
  return false;
}
