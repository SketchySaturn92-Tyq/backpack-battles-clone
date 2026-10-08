/**
 * 对手池（v0.2）
 *
 * 对手也遵守同样的规则：不规则形状要真的塞进背包、位置决定触发顺序。
 * 所以对手的构筑是在一个真实网格上「摆放」出来的，而不是凭空给属性。
 */

import { ITEMS, ITEM_BY_ID, poolByTier, RECIPE_MAP } from '../data/items.js';
import { Board } from './grid.js';
import { mulberry32 } from './combat.js';

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
 * 生成第 round 回合的对手。
 * 强度靠三条曲线叠出来：预算、商店等级、血量。
 */
export function makeOpponent(round, seed = round * 977) {
  const rng = mulberry32(seed);
  const nameIdx = Math.min(OPPONENT_NAMES.length - 1, Math.floor((round - 1) / 1.1));
  const name = OPPONENT_NAMES[Math.max(0, nameIdx)];
  const arch = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const shopLevel = Math.min(5, 1 + Math.floor(round / 4));

  // 背包随回合变大一点点，前期小包更能体现整理压力
  const cols = round < 5 ? 5 : 6;
  const rows = round < 5 ? 7 : 8;
  const board = new Board(cols, rows);

  const budget = 5 + round * 3;
  let spent = 0;
  let uidSeq = 0;
  let guard = 0;
  const wanted = PREFER[arch] || ['weapon'];

  while (spent < budget && guard++ < 220) {
    const tier = weightedTier(shopLevel, round, rng);
    const all = poolByTier(tier);
    const preferred = all.filter((i) => wanted.includes(i.cat));
    const pick = (preferred.length && rng() < 0.72 ? preferred : all);
    if (!pick.length) break;
    const base = pick[Math.floor(rng() * pick.length)];
    const inst = { ...base, uid: `ai-${round}-${uidSeq++}` };
    const spot = board.findFreeSpot(inst.shape);
    if (spot && board.place(inst, spot.x, spot.y, inst.shape)) {
      spent += base.price;
    } else {
      // 找不到空位就换个便宜的试，别死循环
      const cheap = all.filter((i) => i.price <= 3 && board.findFreeSpot(i.shape));
      if (!cheap.length) break;
      const alt = cheap[Math.floor(rng() * cheap.length)];
      const altInst = { ...alt, uid: `ai-${round}-${uidSeq++}` };
      const s2 = board.findFreeSpot(altInst.shape);
      if (!s2) break;
      board.place(altInst, s2.x, s2.y, altInst.shape);
      spent += alt.price;
    }
  }

  // 后期对手偶尔会完成一次合成，模拟真人会整理
  if (round >= 6 && rng() < 0.5) {
    tryFuseForAi(board, round, rng);
  }

  const hp = 55 + round * 2;
  return { name: `${name}·${ARCHETYPE_LABEL[arch]}`, board, hp, round, arch };
}

function tryFuseForAi(board, round, rng) {
  for (const e of board.list()) {
    const out = RECIPE_MAP[`${e.item.id}+${e.item.id}`];
    if (!out) continue;
    const partner = board.list().find((o) => o.item.id === e.item.id && o.item.uid !== e.item.uid);
    if (!partner) continue;
    const outItem = ITEM_BY_ID[out];
    board.remove(e.item.uid);
    board.remove(partner.item.uid);
    const inst = { ...outItem, uid: `ai-${round}-fused-${Math.floor(rng() * 1e6)}` };
    const spot = board.findFreeSpot(inst.shape);
    if (spot) board.place(inst, spot.x, spot.y, inst.shape);
    return;
  }
}

function weightedTier(shopLevel, round, rng) {
  const cap = Math.min(4, 1 + Math.floor(round / 4) + (shopLevel - 1));
  const r = rng();
  if (cap >= 4 && r < 0.10) return 4;
  if (cap >= 3 && r < 0.32) return 3;
  if (cap >= 2 && r < 0.65) return 2;
  return 1;
}
