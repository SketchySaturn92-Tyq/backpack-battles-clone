/**
 * 单局流程：准备阶段 → 战斗阶段 → 结算 → 下一回合。
 * 只维护状态与规则，不直接渲染。
 */

import { Board, shapeCells } from './grid.js';
import { Shop } from './shop.js';
import { buildUnit, simulate, unitPower } from './combat.js';
import { makeOpponent } from './opponents.js';
import { ECON, MATCH } from '../data/constants.js';
import { RECIPE_MAP, ITEM_BY_ID } from '../data/items.js';

export const PHASE = {
  PREPARE: 'prepare',
  BATTLE: 'battle',
  RESULT: 'result',
  OVER: 'over',
};

let uidSeq = 0;
export function nextUid() { return `p${Date.now().toString(36)}-${uidSeq++}`; }

export class Run {
  constructor({ seed = 20261008 } = {}) {
    this.header = { name: '游侠', hp: ECON.startHp, gold: ECON.startGold, round: 1, wins: 0, losses: 0, streak: 0 };
    this.board = new Board(6, 7);
    this.shop = new Shop(seed);
    this.phase = PHASE.PREPARE;
    this.log = [];
    this.history = [];
    this.lastResult = null;
    this.seed = seed;
    this.note('开局：60 血、10 金，先买几件道具塞进背包。');
  }

  note(text) { this.log.push({ round: this.header.round, text }); }

  // ---------- 准备阶段动作 ----------

  canAfford(item) { return this.header.gold >= item.price; }

  buy(index) {
    const res = this.shop.buy(index, this.header.gold);
    if (!res.ok) { this.note(`购买失败：${res.reason}`); return { ok: false, reason: res.reason }; }
    this.header.gold -= res.cost;
    const item = { ...res.item, uid: nextUid() };
    const spot = this.board.findFreeSpot(item.shape);
    if (!spot) {
      // 放不下就退钱并把卡片还回货架，避免玩家吃暗亏
      this.header.gold += res.cost;
      this.shop.unsell(index);
      this.note(`背包放不下 ${item.name}，已退款。`);
      return { ok: false, reason: '背包放不下，已退款' };
    }
    this.board.place(item, spot.x, spot.y, item.shape);
    this.note(`买入 ${item.name}（-${res.cost} 金）`);
    return { ok: true, item };
  }

  sell(uid) {
    const entry = this.board.get(uid);
    if (!entry) return { ok: false };
    const price = Math.max(1, Math.floor(entry.item.price / 2));
    this.board.remove(uid);
    this.header.gold += price;
    this.note(`卖出 ${entry.item.name}（+${price} 金）`);
    return { ok: true, price };
  }

  move(uid, x, y, shape) {
    const entry = this.board.get(uid);
    if (!entry) return false;
    const ok = this.board.place(entry.item, x, y, shape || entry.shape);
    if (ok) this.resolveFusions();
    return ok;
  }

  rotate(uid) {
    const entry = this.board.get(uid);
    if (!entry) return false;
    const rotated = rotateShapeLocal(entry.shape);
    // 原地优先，再找最近可放位置
    if (this.board.canPlace(rotated, entry.x, entry.y, uid)) {
      this.board.place(entry.item, entry.x, entry.y, rotated);
      this.resolveFusions();
      return true;
    }
    // 尝试向右下微调
    for (let d = 1; d <= 3; d++) {
      for (const [dx, dy] of [[d, 0], [0, d], [-d, 0], [0, -d]]) {
        const nx = entry.x + dx, ny = entry.y + dy;
        if (this.board.canPlace(rotated, nx, ny, uid)) {
          this.board.place(entry.item, nx, ny, rotated);
          this.resolveFusions();
          return true;
        }
      }
    }
    this.note(`${entry.item.name} 旋转后放不下。`);
    return false;
  }

  /** 两件同名同阶相邻即可合成，自动结算 */
  resolveFusions() {
    let fusedAny = true;
    const results = [];
    while (fusedAny) {
      fusedAny = false;
      const entries = this.board.list();
      for (const e of entries) {
        for (const otherUid of this.board.neighbors(e.item.uid)) {
          const other = this.board.get(otherUid);
          if (!other) continue;
          const outId = RECIPE_MAP[`${e.item.id}+${other.item.id}`];
          if (!outId) continue;
          const out = ITEM_BY_ID[outId];
          const base = e.item;
          this.board.remove(e.item.uid);
          this.board.remove(other.item.uid);
          const fused = { ...out, uid: nextUid() };
          const spot = this.board.findFreeSpot(fused.shape);
          if (spot) {
            this.board.place(fused, spot.x, spot.y, fused.shape);
            this.note(`合成成功：${base.name} × 2 → ${fused.name}`);
            results.push(fused);
          } else {
            // 放不下就退回两件原物
            const s1 = this.board.findFreeSpot(base.shape);
            if (s1) this.board.place({ ...base }, s1.x, s1.y, base.shape);
            const s2 = this.board.findFreeSpot(base.shape);
            if (s2) this.board.place({ ...base, uid: nextUid() }, s2.x, s2.y, base.shape);
            this.note(`合成 ${fused.name} 失败：放不下，配方保留。`);
          }
          fusedAny = true;
          break;
        }
        if (fusedAny) break;
      }
    }
    return results;
  }

  refreshShop() {
    if (this.header.gold < ECON.refreshCost) return { ok: false, reason: '金币不足' };
    this.header.gold -= ECON.refreshCost;
    this.shop.refresh();
    this.note(`刷新商店（-${ECON.refreshCost} 金）`);
    return { ok: true };
  }

  upgradeShop() {
    if (this.shop.level >= ECON.maxShopLevel) return { ok: false, reason: '商店已满级' };
    const cost = ECON.levelUpCost + (this.shop.level - 1) * 6;
    if (this.header.gold < cost) return { ok: false, reason: `需要 ${cost} 金` };
    this.header.gold -= cost;
    this.shop.setLevel(this.shop.level + 1);
    this.note(`商店升级到 ${this.shop.level} 级（-${cost} 金）`);
    return { ok: true };
  }

  // ---------- 战斗 ----------

  startBattle() {
    if (!this.board.list().length) {
      this.note('背包是空的，先买点东西再打。');
      return { ok: false, reason: '背包为空' };
    }
    this.phase = PHASE.BATTLE;
    return { ok: true };
  }

  /** 执行本回合战斗（同步，UI 再按日志做动画） */
  runBattle() {
    const round = this.header.round;
    const opp = makeOpponent(round, this.seed + round * 37);
    const mine = buildUnit(this.board, { name: '你', hp: this.header.hp, seed: this.seed + round });
    const foe = buildUnit(opp.board, { name: opp.name, hp: opp.hp, seed: this.seed + round + 1 });
    const result = simulate(mine, foe, { seed: this.seed + round * 101 });

    const win = result.winner === 'A';
    const draw = result.winner === 'draw';
    const dmg = win ? 0 : Math.max(4, Math.round((MATCH.maxRounds - round) * 0.6) + 3);
    if (!win) this.header.hp = Math.max(0, this.header.hp - dmg);
    if (win) { this.header.wins++; this.header.streak = Math.max(0, this.header.streak) + 1; this.header.gold += ECON.winGold; }
    else if (!draw) { this.header.losses++; this.header.streak = 0; }

    this.lastResult = {
      round, oppName: opp.name, ...result, dmgTaken: win ? 0 : dmg,
      myPower: unitPower(mine), foePower: unitPower(foe),
      // 把对手构筑带出来，结算面板要能让玩家看清输在哪
      oppItems: opp.board.list().map((e) => ({ id: e.item.id, name: e.item.name, cat: e.item.cat, tier: e.item.tier })),
      myItems: this.board.list().map((e) => ({ id: e.item.id, name: e.item.name, cat: e.item.cat, tier: e.item.tier })),
    };
    this.history.push(this.lastResult);
    this.phase = PHASE.RESULT;
    this.note(`第 ${round} 回合：${win ? '胜' : draw ? '平' : `负，掉 ${dmg} 血`}`);
    return this.lastResult;
  }

  nextRound() {
    const p = MATCH;
    if (this.header.hp <= 0) { this.phase = PHASE.OVER; return { over: true, reason: '血量归零，被淘汰。' }; }
    if (this.header.wins >= p.winTarget) { this.phase = PHASE.OVER; return { over: true, reason: `拿下 ${p.winTarget} 胜，吃鸡！` }; }
    if (this.header.round >= p.maxRounds) { this.phase = PHASE.OVER; return { over: true, reason: `打满 ${p.maxRounds} 回合，按胜场结算。` }; }

    this.header.round++;
    const gain = ECON.baseRoundGold + this.header.round * ECON.roundGoldStep + (this.header.streak >= 2 ? 2 : 0);
    this.header.gold += gain;
    this.shop.refresh();
    this.phase = PHASE.PREPARE;
    this.note(`第 ${this.header.round} 回合开始，获得 ${gain} 金。`);
    return { over: false, gain };
  }

  /** 结算用总评 */
  finalScore() {
    return Math.max(0, this.header.wins * 10 - this.header.losses * 3 + (this.header.hp > 0 ? 20 : 0));
  }
}

function rotateShapeLocal(shape) {
  const rows = shape.length;
  const cols = Math.max(...shape.map((r) => r.length));
  const out = Array.from({ length: cols }, () => Array(rows).fill('.'));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      out[x][rows - 1 - y] = shape[y][x] || '.';
    }
  }
  return out.map((r) => r.join(''));
}

export { shapeCells };
