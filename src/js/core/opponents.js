/**
 * 对手池：按回合生成越来越强的 AI 构筑，并逐回合提供表演用名字与头像风格。
 * 设计目标：第 1 回合对手约等于新手，第 16 回合对手是成型 build。
 */

import { ITEMS, ITEM_BY_ID, poolByTier } from '../data/items.js';
import { Board } from './grid.js';
import { mulberry32 } from './combat.js';

export const OPPONENT_NAMES = [
  '新手游侠', '流浪佣兵', '拾荒者', '蘑菇贩子', '宝石匠',
  '毒刃刺客', '铁盾卫士', '酒馆老板', '披风猎人', '符文学者',
  '双刃舞者', '龙裔骑士', '贤者学徒', '荆棘行者', '传说冒险家', '冠军·福西法',
];

const ARCHETYPES = ['blade', 'guard', 'poison', 'gem', 'feast'];
const ARCHETYPE_LABEL = {
  blade: '双刃流', guard: '铁壁流', poison: '毒系流', gem: '宝石流', feast: '饱食流',
};

/**
 * 生成第 round 回合的对手。
 * 强度曲线：可买道具数 ≈ 3 + round，商店等级随回合提升。
 */
export function makeOpponent(round, seed = round * 977) {
  const rng = mulberry32(seed);
  const idx = Math.min(OPPONENT_NAMES.length - 1, Math.floor((round - 1) / 1.1));
  const name = OPPONENT_NAMES[Math.max(0, idx)];
  const arch = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const shopLevel = Math.min(4, 1 + Math.floor(round / 5));

  const board = new Board(6, 7);
  const budget = 4 + round * 3;
  let spent = 0;
  let uidSeq = 0;
  const wanted = preferFor(arch);

  let guard = 0;
  while (spent < budget && guard++ < 200) {
    const tier = weightedTier(shopLevel, round, rng);
    const pool = poolByTier(tier).filter((i) => wanted.includes(i.cat) || rng() < 0.35);
    const item = (pool.length ? pool : poolByTier(tier))[Math.floor(rng() * Math.max(1, (pool.length ? pool : poolByTier(tier)).length))];
    if (!item) break;
    const instance = { ...item, uid: `ai-${round}-${uidSeq++}` };
    const spot = board.findFreeSpot(instance.shape);
    if (spot && board.place(instance, spot.x, spot.y, instance.shape)) {
      spent += item.price;
    } else {
      break;
    }
  }

  // 血量随回合略增，避免一回合被秒
  const hp = 55 + round * 2;
  return { name: `${name}·${ARCHETYPE_LABEL[arch]}`, board, hp, round, arch };
}

function preferFor(arch) {
  switch (arch) {
    case 'blade': return ['weapon'];
    case 'guard': return ['armor'];
    case 'poison': return ['trinket', 'food'];
    case 'gem': return ['gem', 'weapon'];
    case 'feast': return ['food', 'armor'];
    default: return ['weapon'];
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
