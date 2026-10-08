/**
 * 升级与合成路径
 *
 * 玩家一直反馈「不知道东西怎么升级」，所以把路径单独抽成数据，
 * UI 直接照着画：每件道具现在能升成什么、还差几件、材料叫什么。
 */

import { ITEM_BY_ID, RECIPES } from './items.js';

/** 正向表：id → 它能合成出的产物 */
const FORWARD = new Map();
/** 反向表：id → 它由哪件道具合成而来 */
const BACKWARD = new Map();

for (const r of RECIPES) {
  if (!FORWARD.has(r.a)) FORWARD.set(r.a, []);
  FORWARD.get(r.a).push({ need: 2, from: r.a, out: r.out });
  BACKWARD.set(r.out, { material: r.a, need: 2 });
}

/** 这条路径通向的最终产物（一路往上追溯） */
function finalOf(id, seen = new Set()) {
  if (seen.has(id)) return id;
  seen.add(id);
  const outs = FORWARD.get(id);
  if (!outs || !outs.length) return id;
  return finalOf(outs[0].out, seen);
}

/** 某件道具的完整升级链：原料 → … → 顶级 */
export function chainOf(id) {
  // 先退到最底层的原料
  let root = id;
  const guard = new Set();
  while (BACKWARD.has(root) && !guard.has(root)) {
    guard.add(root);
    root = BACKWARD.get(root).material;
  }
  // 再一路往上
  const chain = [];
  let cur = root;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push({ id: cur, name: ITEM_BY_ID[cur]?.name || cur, tier: ITEM_BY_ID[cur]?.tier ?? 1 });
    const outs = FORWARD.get(cur);
    cur = outs && outs.length ? outs[0].out : null;
  }
  return chain;
}

/** 这件道具升级需要什么、会变成什么 */
export function upgradeOf(id) {
  const outs = FORWARD.get(id);
  if (!outs || !outs.length) {
    const back = BACKWARD.get(id);
    return { canUpgrade: false, madeFrom: back || null };
  }
  const out = ITEM_BY_ID[outs[0].out];
  return {
    canUpgrade: true,
    need: 2,
    material: ITEM_BY_ID[id],
    output: out,
    final: ITEM_BY_ID[finalOf(id)],
    chain: chainOf(id),
  };
}

/**
 * 给玩家看的升级提示：背包里现在有几件、还差几件。
 * @returns {null|{name, have, need, outputName, ready}}
 */
export function progressFor(board, itemId) {
  const entry = upgradeOf(itemId);
  if (!entry.canUpgrade) return null;
  const have = board.list().filter((e) => e.item.id === itemId).length;
  return {
    materialId: itemId,
    name: ITEM_BY_ID[itemId].name,
    have,
    need: entry.need,
    outputId: entry.output.id,
    outputName: entry.output.name,
    outputTier: entry.output.tier,
    ready: have >= entry.need,
    canReach: !!entry.final && entry.final.id !== itemId,
    finalName: entry.final?.name,
  };
}

/** 全部配方，供「合成图鉴」面板展示 */
export function allRecipes() {
  return RECIPES.map((r) => ({
    material: ITEM_BY_ID[r.a],
    materialId: r.a,
    output: ITEM_BY_ID[r.out],
    outputId: r.out,
    need: 2,
  }));
}

/** 按材料阶位排序，前期的排前面 */
export function recipesByTier() {
  return allRecipes().sort((a, b) => (a.material.tier - b.material.tier) || a.material.price - b.material.price);
}

/**
 * 本次商店里能买到的、与背包已有道具构成进阶关系的推荐。
 * 用来回答「我该买什么」。
 */
export function shopHints(board, shopItems) {
  const hints = [];
  const owned = new Map();
  for (const e of board.list()) owned.set(e.item.id, (owned.get(e.item.id) || 0) + 1);

  for (const it of shopItems) {
    const ownedCount = owned.get(it.id) || 0;
    const entry = upgradeOf(it.id);
    if (ownedCount >= 1 && entry.canUpgrade) {
      hints.push({ itemId: it.id, name: it.name, reason: `已有 ${ownedCount} 件，再买 1 件可合成 ${entry.output.name}` });
    } else if (entry.canUpgrade && entry.output.tier >= 3) {
      hints.push({ itemId: it.id, name: it.name, reason: `可升级为 ${entry.output.name}` });
    }
  }
  return hints.slice(0, 3);
}
