/**
 * 单局流程（v0.2）
 *
 * 与 v0.1 的关键差别：
 *  - 先选职业，再开局；背包尺寸由职业决定
 *  - 第 4 回合开始可选子职业分支
 *  - 合成会给驯兽师加血上限之类的职业联动
 *  - 道具买到手是「进背包第一个能放的位置」，之后全靠玩家整理
 */

import { Board, normalize } from './grid.js';
import { Shop } from './shop.js';
import { buildUnit, simulate, unitPower, eventText } from './combat.js';
import { makeOpponent } from './opponents.js';
import { ECON, MATCH } from '../data/constants.js';
import { RECIPE_MAP, ITEM_BY_ID } from '../data/items.js';
import { CLASS_BY_ID, branchOf } from '../data/classes.js';

export const PHASE = {
  CHOOSE_CLASS: 'choose_class',
  PREPARE: 'prepare',
  BATTLE: 'battle',
  RESULT: 'result',
  BRANCH: 'branch',
  OVER: 'over',
};

let uidSeq = 0;
export function nextUid() { return `p${Date.now().toString(36)}${(uidSeq++).toString(36)}`; }

export class Run {
  constructor({ seed = 20261008, classId = 'ranger' } = {}) {
    const cls = CLASS_BY_ID[classId] || CLASS_BY_ID.ranger;
    this.seed = seed;
    this.classDef = cls;
    this.branch = null;

    this.header = {
      className: cls.name,
      classId: cls.id,
      branchName: null,
      hp: cls.hp,
      gold: cls.gold,
      round: 1,
      wins: 0,
      losses: 0,
      streak: 0,
      fuses: 0,
      expands: 0,
    };

    this.board = new Board(cls.bag.cols, cls.bag.rows);
    this.shop = new Shop(seed);
    this.phase = PHASE.PREPARE;
    this.log = [];
    this.history = [];
    this.lastResult = null;
    this.pendingBranch = false;

    for (const id of cls.startItems) {
      const base = ITEM_BY_ID[id];
      if (!base) continue;
      const inst = { ...base, uid: nextUid() };
      const spot = this.board.findFreeSpot(inst.shape);
      if (spot) this.board.place(inst, spot.x, spot.y, inst.shape);
    }

    this.note(`选择职业：${cls.name}（${cls.passive.name}）`);
    this.note(`背包 ${cls.bag.cols}×${cls.bag.rows}，先买几件道具试着塞进去。`);
  }

  get bonus() { return this.branch?.bonus || {}; }

  note(text) { this.log.push({ round: this.header.round, text, kind: 'note' }); }

  // ---------- 商店 ----------

  refreshCost() {
    return (this.classDef.passive.effect.freeRefresh) ? 0 : (this.shop.level >= 3 ? ECON.refreshCost + 1 : ECON.refreshCost);
  }

  canAfford(item) { return this.header.gold >= item.price; }

  buy(index) {
    const res = this.shop.buy(index, this.header.gold);
    if (!res.ok) return { ok: false, reason: res.reason };

    this.header.gold -= res.cost;
    const inst = { ...res.item, uid: nextUid() };
    const spot = this.board.findFreeSpot(inst.shape);

    if (!spot) {
      this.header.gold += res.cost;
      this.shop.unsell(index);
      return { ok: false, reason: `${inst.name} 塞不下了，先整理背包` };
    }

    this.board.place(inst, spot.x, spot.y, inst.shape);
    this.note(`买入 ${inst.name}（-${res.cost} 金）`);
    this.resolveFusions();
    return { ok: true, item: inst };
  }

  sell(uid) {
    const e = this.board.get(uid);
    if (!e) return { ok: false };
    const ratio = this.classDef.passive.effect.sellRatio || ECON.sellRatio;
    const price = Math.max(1, Math.floor(e.item.price * ratio));
    this.board.remove(uid);
    this.header.gold += price;
    this.note(`卖出 ${e.item.name}（+${price} 金）`);
    return { ok: true, price };
  }

  refreshShop() {
    const cost = this.refreshCost();
    if (this.header.gold < cost) return { ok: false, reason: '金币不够' };
    this.header.gold -= cost;
    this.shop.refresh(true);
    if (cost > 0) this.note(`刷新商店（-${cost} 金）`);
    return { ok: true };
  }

  // ---------- 背包扩容 ----------

  /** 扩容上限：列最多 9，行最多 11 */
  canExpand() {
    return this.board.cols < 9 || this.board.rows < 11;
  }

  /** 扩容花费：越往后越贵 */
  expandCost() {
    return 14 + (this.header.expands || 0) * 6;
  }

  /** 买一次扩容：先加列，列到顶再加行 */
  expandBag() {
    if (!this.canExpand()) return { ok: false, reason: '背包已经扩到最大' };
    const cost = this.expandCost();
    if (this.header.gold < cost) return { ok: false, reason: `需要 ${cost} 金` };
    this.header.gold -= cost;
    this.header.expands = (this.header.expands || 0) + 1;
    if (this.board.cols < 9) this.board.expand(this.board.cols + 1, this.board.rows);
    else this.board.expand(this.board.cols, this.board.rows + 1);
    this.note(`背包扩容到 ${this.board.cols}×${this.board.rows}（-${cost} 金）`);
    return { ok: true, cols: this.board.cols, rows: this.board.rows, cost };
  }

  /** 商店品质由回合自动决定，玩家不再需要手动升级 */
  shopQuality() {
    return this.shop.quality;
  }

  // ---------- 整理 ----------

  moveTo(uid, x, y) {
    const e = this.board.get(uid);
    if (!e) return { ok: false, reason: '道具不存在' };
    if (!this.board.canPlace(e.shape, x, y, uid)) return { ok: false, reason: '这里放不下' };
    this.board.place(e.item, x, y, e.shape);
    this.resolveFusions();
    return { ok: true };
  }

  rotate(uid, dir = 1) {
    if (!this.board.rotateAt(uid, dir)) return { ok: false, reason: '转过来放不下' };
    this.resolveFusions();
    return { ok: true };
  }

  /** 自动整理：同类聚拢 + 尽量贴左上。给玩家一个一键方案，但不如手工精算。 */
  autoArrange() {
    const entries = this.board.list().slice();
    const catOrder = { weapon: 0, gem: 1, trinket: 2, armor: 3, food: 4 };
    entries.sort((a, b) => {
      const ca = catOrder[a.item.cat] ?? 9;
      const cb = catOrder[b.item.cat] ?? 9;
      if (ca !== cb) return ca - cb;
      return b.item.tier - a.item.tier;
    });
    const snap = entries.map((e) => ({ item: e.item, shape: e.shape }));
    this.board.clear();
    let placed = 0;
    for (const s of snap) {
      const spot = this.board.findFreeSpot(s.shape);
      if (spot) {
        this.board.place(s.item, spot.x, spot.y, s.shape);
        placed++;
      } else {
        // 放不下就换个朝向再试
        const rotated = normalize(require_rotate(s.shape));
        const spot2 = this.board.findFreeSpot(rotated);
        if (spot2) {
          this.board.place(s.item, spot2.x, spot2.y, rotated);
          placed++;
        }
      }
    }
    // 保险：没能放回去的退成金币
    const placedUids = new Set(this.board.list().map((e) => e.item.uid));
    for (const s of snap) {
      if (!placedUids.has(s.item.uid)) {
        this.board.remove(s.item.uid);
        this.header.gold += Math.max(1, Math.floor(s.item.price * 0.5));
      }
    }
    this.note(`自动整理完成，放回 ${placed} 件`);
    return { ok: true, placed };
  }

  /** 两件同名同阶相邻即合成；支持连锁 */
  resolveFusions() {
    const results = [];
    const hpPerFuse = this.bonus.hpPerFuse || 0;
    let again = true;
    let guard = 0;
    while (again && guard++ < 40) {
      again = false;
      for (const e of this.board.list()) {
        const outId = RECIPE_MAP[`${e.item.id}+${e.item.id}`];
        if (!outId) continue;
        const partnerUid = [...this.board.neighbors(e.item.uid)].find((u) => {
          const o = this.board.get(u);
          return o && o.item.id === e.item.id;
        });
        if (!partnerUid) continue;
        const partner = this.board.get(partnerUid);
        const outItem = ITEM_BY_ID[outId];
        const keptShape = e.shape;
        this.board.remove(e.item.uid);
        this.board.remove(partner.item.uid);
        const inst = { ...outItem, uid: nextUid() };
        let spot = this.board.findFreeSpot(inst.shape);
        if (!spot) {
          const rot = normalize(require_rotate(inst.shape));
          spot = this.board.findFreeSpot(rot);
          if (spot) this.board.place(inst, spot.x, spot.y, rot);
        } else {
          this.board.place(inst, spot.x, spot.y, inst.shape);
        }
        if (!this.board.has(inst.uid)) {
          // 放不下就还原，不让玩家吃亏
          const s1 = this.board.findFreeSpot(e.shape);
          if (s1) this.board.place({ ...e.item }, s1.x, s1.y, keptShape);
          const s2 = this.board.findFreeSpot(partner.shape);
          if (s2) this.board.place({ ...partner.item, uid: nextUid() }, s2.x, s2.y, partner.shape);
          this.note(`合成 ${outItem.name} 失败：没地方放，配方保留`);
        } else {
          this.header.fuses++;
          if (hpPerFuse > 0) {
            this.header.hp += hpPerFuse;
            this.note(`合成 ${outItem.name}，驯兽师被动：最大生命 +${hpPerFuse}`);
          } else {
            this.note(`合成 ${outId === outItem.id ? '' : ''}${outItem.name}`);
          }
          results.push(outItem);
        }
        again = true;
        break;
      }
    }
    return results;
  }

  // ---------- 战斗 ----------

  startBattle() {
    if (!this.board.count()) return { ok: false, reason: '背包是空的，先买点东西' };
    const hasWeapon = this.board.list().some((e) => e.item.cat === 'weapon');
    if (!hasWeapon) return { ok: false, reason: '至少要有一件武器才能开打' };
    this.phase = PHASE.BATTLE;
    return { ok: true };
  }

  runBattle() {
    const round = this.header.round;
    const opp = makeOpponent(round, this.seed + round * 37);
    const mine = buildUnit(this.board, {
      name: '你',
      hp: this.header.hp,
      classDef: this.classDef,
      branch: this.branch,
      seed: this.seed + round,
    });
    const foe = buildUnit(opp.board, { name: opp.name, hp: opp.hp, seed: this.seed + round + 1 });
    const result = simulate(mine, foe, { seed: this.seed + round * 101 });

    const win = result.winner === 'A';
    const draw = result.winner === 'draw';
    const dmg = win ? 0 : Math.max(4, Math.round((MATCH.maxRounds - round) * 0.6) + 3);
    if (!win) this.header.hp = Math.max(0, this.header.hp - dmg);
    if (win) { this.header.wins++; this.header.streak = Math.max(0, this.header.streak) + 1; this.header.gold += ECON.winGold; }
    else if (!draw) { this.header.losses++; this.header.streak = 0; }

    const gainPerRound = (mine.goldPerRound || 0);
    if (gainPerRound) this.header.gold += gainPerRound;

    /** 把战斗单位折成 UI 要显示的数值卡 */
    const cardOf = (u) => ({
      armor: u.armor,
      dps: u.weapons.reduce((s, w) => s + w.damage / w.cooldown, 0) * (1 + (u.damageMul || 0)),
      crit: u.crit,
      thorns: u.thorns,
      regen: u.regen,
      maxHp: u.maxHp,
      weapons: u.weapons.length,
      synergies: (u.synergies || []).length,
    });

    this.lastResult = {
      round,
      oppName: opp.name,
      winner: result.winner,
      duration: result.duration,
      hpA: result.hpA, hpB: result.hpB,
      maxHpA: mine.maxHp, maxHpB: foe.maxHp,
      myStats: cardOf(mine),
      foeStats: cardOf(foe),
      dmgTaken: win ? 0 : dmg,
      myPower: unitPower(mine),
      foePower: unitPower(foe),
      events: result.events,
      synergies: mine.synergies || [],
      foeSynergies: foe.synergies || [],
      logLines: result.events.map((e) => ({ t: e.t, text: eventText(e, { A: '你', B: opp.name }), type: e.type })),
      myBuild: this.board.list().map((e) => ({ id: e.item.id, name: e.item.name, cat: e.item.cat, tier: e.item.tier, x: e.x, y: e.y, shape: e.shape })),
      foeBuild: opp.board.list().map((e) => ({ id: e.item.id, name: e.item.name, cat: e.item.cat, tier: e.item.tier, x: e.x, y: e.y, shape: e.shape })),
      orderMine: mine.order,
      orderFoe: foe.order,
      stats: result.stats,
      hasWeapon: mine.weapons.length > 0,
    };

    this.history.push(this.lastResult);
    this.phase = PHASE.RESULT;
    this.note(`第 ${round} 回合：${win ? '胜利' : draw ? '平局' : `失败，掉 ${dmg} 血`}`);
    return this.lastResult;
  }

  // ---------- 子职业 ----------

  availableBranches() {
    if (this.branch) return [];
    if (this.header.round < MATCH.branchRound) return [];
    return this.classDef.branches;
  }

  chooseBranch(branchId) {
    const b = branchOf(this.classDef.id, branchId);
    if (!b) return { ok: false, reason: '没有这个分支' };
    this.branch = b;
    this.header.branchName = b.name;
    this.note(`选择分支：${b.name} —— ${b.desc}`);
    // 分支可能加宽货架
    if (b.bonus?.extraShopSlots) {
      this.shop.setSlotCount(ECON.shopSlots + b.bonus.extraShopSlots);
    }
    return { ok: true, branch: b };
  }

  // ---------- 回合推进 ----------

  nextRound() {
    if (this.header.hp <= 0) { this.phase = PHASE.OVER; return { over: true, reason: '生命归零，被淘汰。' }; }
    if (this.header.wins >= MATCH.winTarget) { this.phase = PHASE.OVER; return { over: true, reason: `拿下 ${MATCH.winTarget} 胜，登顶！` }; }
    if (this.header.round >= MATCH.maxRounds) { this.phase = PHASE.OVER; return { over: true, reason: `打满 ${MATCH.maxRounds} 回合，按胜场结算。` }; }

    this.header.round++;
    const extra = this.bonus.extraGold || 0;
    const gain = ECON.baseRoundGold + this.header.round * ECON.roundGoldStep + (this.header.streak >= 2 ? 2 : 0) + extra;
    this.header.gold += gain;

    // 商店品质跟着回合自动走，玩家不用管
    const qualityUp = this.shop.setRound(this.header.round);
    this.shop.refresh(true);
    this.phase = PHASE.PREPARE;
    this.note(`第 ${this.header.round} 回合开始，收入 ${gain} 金`);
    if (qualityUp) {
      this.note(`商店品质提升到「${this.shop.quality.label}」，能出更高阶的道具了`);
    }

    const branches = this.availableBranches();
    if (branches.length) {
      this.pendingBranch = true;
      this.note('可以选子职业了，选一个方向再继续。');
      return { over: false, gain, offerBranch: true, branches, qualityUp, quality: this.shop.quality };
    }
    return { over: false, gain, qualityUp, quality: this.shop.quality };
  }

  finalScore() {
    return Math.max(0, this.header.wins * 10 - this.header.losses * 3 + (this.header.hp > 0 ? 20 : 0) + this.header.fuses * 2);
  }

  /** 玩家可读的构筑摘要 */
  buildSummary() {
    return this.board.list()
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((e) => `${e.item.name}(T${e.item.tier})`);
  }
}

function require_rotate(shape) {
  // 避免循环依赖：这里直接用 shapes 的 rotateCW
  const rows = shape.length;
  const cols = Math.max(...shape.map((r) => r.length));
  const out = Array.from({ length: cols }, () => Array(rows).fill('.'));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      out[x][rows - 1 - y] = shape[y]?.[x] === 'X' ? 'X' : '.';
    }
  }
  return out.map((r) => r.join(''));
}
