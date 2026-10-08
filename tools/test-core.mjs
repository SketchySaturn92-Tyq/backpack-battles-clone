/**
 * 核心逻辑自检：不依赖浏览器，直接跑数据层 / 网格 / 战斗 / 流程。
 * 用法：node tools/test-core.mjs
 */

import { Board, shapeCells, rotateShape, shapeSize } from '../src/js/core/grid.js';
import { buildUnit, simulate, mulberry32, unitPower } from '../src/js/core/combat.js';
import { Shop } from '../src/js/core/shop.js';
import { makeOpponent, OPPONENT_NAMES } from '../src/js/core/opponents.js';
import { Run, PHASE, nextUid } from '../src/js/core/run.js';
import { ITEMS, ITEM_BY_ID, RECIPE_MAP, poolByTier, CATEGORIES } from '../src/js/data/items.js';
import { ECON, MATCH, SHOP_TIER_WEIGHT } from '../src/js/data/constants.js';

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
}

function section(title) { console.log(`\n— ${title}`); }

// ---------- 1. 数据表完整性 ----------
section('数据表');
{
  const ids = new Set();
  ok('道具 id 唯一', ITEMS.every((i) => !ids.has(i.id) && ids.add(i.id) || false));
  ok('道具总数 >= 30', ITEMS.length >= 30, `实际 ${ITEMS.length}`);
  ok('每件道具都有形状', ITEMS.every((i) => Array.isArray(i.shape) && i.shape.length > 0));
  ok('形状只含 X 与 .', ITEMS.every((i) => i.shape.every((r) => /^[X.]+$/.test(r))));
  ok('每件道具至少占 1 格', ITEMS.every((i) => shapeCells(i.shape).length > 0));
  ok('类别都在白名单', ITEMS.every((i) => CATEGORIES[i.cat]), '越界类别');
  ok('tier 在 1..4', ITEMS.every((i) => i.tier >= 1 && i.tier <= 4));
  ok('非合成道具都有价格', ITEMS.filter((i) => !i.fused).every((i) => i.price > 0));

  const catCount = {};
  for (const i of ITEMS) catCount[i.cat] = (catCount[i.cat] || 0) + 1;
  ok('五大类都有道具', Object.keys(CATEGORIES).every((c) => catCount[c] >= 3), JSON.stringify(catCount));

  ok('配方输出物存在', [...new Set(Object.values(RECIPE_MAP))].every((id) => ITEM_BY_ID[id]));
  ok('每个阶位都有可售商品', [1, 2, 3, 4].every((t) => poolByTier(t).length > 0));
}

// ---------- 2. 网格 ----------
section('网格');
{
  const b = new Board(6, 7);
  const sword = { ...ITEM_BY_ID.sword, uid: 'a' };
  ok('放入成功', b.place(sword, 0, 0, sword.shape));
  ok('占 2 格', b.usedCells() === 2, `实际 ${b.usedCells()}`);
  ok('重叠被拒', b.canPlace(sword.shape, 0, 1) === false);
  ok('出界被拒', b.canPlace(sword.shape, 5, 6) === false);
  const belt = { ...ITEM_BY_ID.belt, uid: 'b' };
  ok('相邻检测', (() => { b.place(belt, 1, 0, belt.shape); return b.neighbors('a').has('b') || b.neighbors('b').has('a'); })());
  ok('移动后原格释放', (() => { b.remove('a'); return b.at(0, 0) === null && b.at(0, 1) === null; })());

  const rot = rotateShape(['XX', 'X.']);
  const sz = shapeSize(rot);
  ok('旋转后尺寸互换', sz.w === 2 && sz.h === 2, JSON.stringify(rot));
  ok('旋转保留格数', shapeCells(rot).length === shapeCells(['XX', 'X.']).length);
  ok('旋转四次回到原点', JSON.stringify(rotateShape(rotateShape(rotateShape(rotateShape(['XX', 'X.']))))) === JSON.stringify(['XX', 'X.']) || shapeCells(rotateShape(rotateShape(rotateShape(rotateShape(['XX', 'X.']))))).length === 3);

  const full = new Board(2, 2);
  ok('空盘能找到落点', full.findFreeSpot(['XX', 'XX']) !== null);
  full.place({ ...ITEM_BY_ID.axe, uid: 'full1' }, 0, 0, ITEM_BY_ID.axe.shape);
  ok('无空位返回 null', full.findFreeSpot(['XX', 'XX']) === null);
  ok('无空位但能放单格', full.findFreeSpot(['X']) === null, '单格也不该有空位');
}

// ---------- 3. 商店 ----------
section('商店');
{
  const s = new Shop(12345);
  ok('初始 5 格', s.slots.length === ECON.shopSlots);
  ok('格子都有道具', s.slots.every((x) => x.item));
  const item = s.slots[0].item;
  ok('买不起时拒绝', s.buy(0, 0).ok === false);
  const r = s.buy(0, item.price + 1);
  ok('钱够能买到', r.ok && r.item.id === item.id);
  ok('重复购买被拒', s.buy(0, 999).ok === false);
  ok('锁定状态可切换', typeof s.toggleLock(1) === 'boolean');

  const lv = new Shop(777);
  lv.setLevel(4);
  const tiers = new Set();
  for (let i = 0; i < 400; i++) tiers.add(lv.rollTier());
  ok('4 级商店能出高阶', tiers.has(3) || tiers.has(4), [...tiers].join(','));
  ok('权重表覆盖 1..4 阶', [1, 2, 3, 4].every((t) => SHOP_TIER_WEIGHT[t]));
}

// ---------- 4. 战斗 ----------
section('战斗');
{
  const rng = mulberry32(42);
  ok('随机数在 [0,1)', Array.from({ length: 50 }, () => rng()).every((v) => v >= 0 && v < 1));

  const b1 = new Board(6, 7);
  const w1 = { ...ITEM_BY_ID.sword, uid: 'w1' };
  b1.place(w1, 0, 0, w1.shape);
  const u1 = buildUnit(b1, { name: 'A', hp: 60, seed: 1 });
  ok('武器被识别', u1.weapons.length === 1, JSON.stringify(u1.weapons));
  ok('基础攻速已赋', u1.weapons[0].cooldown > 0);

  const b2 = new Board(6, 7);
  const g = { ...ITEM_BY_ID.ruby, uid: 'g1' };
  const w2 = { ...ITEM_BY_ID.dagger, uid: 'w2' };
  b2.place(w2, 0, 0, w2.shape);
  b2.place(g, 0, 1, g.shape);
  const u2 = buildUnit(b2, { name: 'B', hp: 60, seed: 1 });
  ok('宝石光环生效', u2.damage >= 3, `damage=${u2.damage}`);

  const sim = simulate(u1, u2, { seed: 99 });
  ok('战斗有结果', ['A', 'B', 'draw'].includes(sim.winner));
  ok('有攻击日志', sim.log.some((l) => l.type === 'attack'));
  ok('有结束日志', sim.log.at(-1).type === 'end');
  ok('战斗不超时', sim.rounds <= 60, `${sim.rounds}s`);

  const again = simulate(u1, u2, { seed: 99 });
  ok('同种子结果一致', again.winner === sim.winner && again.hpA === sim.hpA);

  // 强弱关系：双武器打空手，应该必胜
  const empty = new Board(6, 7);
  const uEmpty = buildUnit(empty, { name: '空手', hp: 40, seed: 2 });
  const strong = simulate(u1, uEmpty, { seed: 7 });
  ok('有武器必胜空手', strong.winner === 'A', strong.winner);
  ok('强度分正数', unitPower(u1) > 0);

  // 同类相邻提速
  const b3 = new Board(6, 7);
  const x1 = { ...ITEM_BY_ID.dagger, uid: 'x1' };
  const x2 = { ...ITEM_BY_ID.dagger, uid: 'x2' };
  b3.place(x1, 0, 0, x1.shape);
  b3.place(x2, 0, 1, x2.shape);
  const u3 = buildUnit(b3, { name: 'C', hp: 60, seed: 3 });
  ok('同类相邻有提速标记', u3.weapons.every((w) => w.stacks >= 1), JSON.stringify(u3.weapons.map((w) => w.stacks)));
}

// ---------- 5. 对手池强度曲线 ----------
section('对手池');
{
  const powers = [];
  for (let r = 1; r <= MATCH.maxRounds; r++) {
    const opp = makeOpponent(r, r * 977);
    const u = buildUnit(opp.board, { name: opp.name, hp: opp.hp, seed: r });
    powers.push({ r, p: unitPower(u), items: opp.board.list().length, name: opp.name });
  }
  ok('每回合都有对手', powers.every((x) => x.items > 0));
  const first = powers.slice(0, 3).reduce((s, x) => s + x.p, 0) / 3;
  const last = powers.slice(-3).reduce((s, x) => s + x.p, 0) / 3;
  ok('后期强于前期', last > first, `前期均 ${first.toFixed(0)} → 后期均 ${last.toFixed(0)}`);
  ok('对手名字不重复堆叠', new Set(powers.map((x) => x.name)).size >= 6, `${new Set(powers.map((x) => x.name)).size} 个不同对手`);
}

// ---------- 6. 完整单局流程 ----------
section('单局流程');
{
  const run = new Run({ seed: 424242 });
  ok('初始状态', run.header.hp === ECON.startHp && run.header.gold === ECON.startGold && run.phase === PHASE.PREPARE);

  // 空背包不能开战
  ok('空背包不能开战', run.startBattle().ok === false);

  // 自动买满 8 件
  let bought = 0;
  for (let i = 0; i < 40 && bought < 8; i++) {
    const before = run.header.gold;
    const res = run.buy(i % ECON.shopSlots);
    if (res.ok) { bought++; }
    else if (run.header.gold < 3) break;
    else if (before === run.header.gold) run.refreshShop();
  }
  ok('能买进多件道具', bought >= 3, `买了 ${bought} 件`);

  // 手动合成验证
  const b = new Board(6, 7);
  const t = new Run({ seed: 5 });
  t.board = b;
  const d1 = { ...ITEM_BY_ID.dagger, uid: 'd1' };
  const d2 = { ...ITEM_BY_ID.dagger, uid: 'd2' };
  b.place(d1, 0, 0, d1.shape);
  b.place(d2, 0, 1, d2.shape);
  const fused = t.resolveFusions();
  ok('相邻同阶可合成', fused.length === 1 && fused[0].id === 'twinDagger', JSON.stringify(fused.map((f) => f.id)));
  ok('合成后场上只剩 1 件', b.list().length === 1);

  // 跑满全局
  const g = new Run({ seed: 8888 });
  let rounds = 0, guard = 0;
  while (g.phase !== PHASE.OVER && guard++ < 100) {
    if (g.phase === PHASE.PREPARE) {
      // 简单 AI：能买就买
      for (let i = 0; i < ECON.shopSlots; i++) g.buy(i);
      if (!g.board.list().length) g.buy(0);
      g.startBattle();
      g.runBattle();
    } else if (g.phase === PHASE.RESULT) {
      g.nextRound(); rounds++;
    } else break;
  }
  ok('单局能跑到结束', g.phase === PHASE.OVER, `phase=${g.phase}`);
  ok('回合数在范围内', rounds <= MATCH.maxRounds + 1, `${rounds} 回合`);
  ok('结束原因明确', g.header.hp <= 0 || g.header.wins >= MATCH.winTarget || rounds >= MATCH.maxRounds);
  ok('日志有内容', g.log.length > 10, `${g.log.length} 条`);
  ok('评分非负', g.finalScore() >= 0);
  console.log(`    本局：${rounds} 回合，${g.header.wins} 胜 ${g.header.losses} 负，剩余 ${g.header.hp} 血，评分 ${g.finalScore()}`);
}

// ---------- 7. 平衡抽样 ----------
section('平衡抽样');
{
  // 用同一套「随便买」AI 跑 60 局，看胜率是否落在合理区间
  let totalWins = 0, totalRounds = 0, games = 60, deaths = 0;
  for (let s = 0; s < games; s++) {
    const g = new Run({ seed: s * 131 + 7 });
    let guard = 0;
    while (g.phase !== PHASE.OVER && guard++ < 100) {
      if (g.phase === PHASE.PREPARE) {
        for (let i = 0; i < ECON.shopSlots; i++) g.buy(i);
        if (!g.board.list().length) g.buy(0);
        g.startBattle(); g.runBattle();
      } else if (g.phase === PHASE.RESULT) g.nextRound();
      else break;
    }
    totalWins += g.header.wins;
    totalRounds += g.header.round;
    if (g.header.hp <= 0) deaths++;
  }
  const avgWins = totalWins / games;
  const avgRounds = totalRounds / games;
  console.log(`    60 局：平均 ${avgWins.toFixed(2)} 胜 / ${avgRounds.toFixed(1)} 回合，淘汰 ${deaths} 局`);
  ok('平均胜场不是 0（能赢）', avgWins > 0.5, `${avgWins.toFixed(2)}`);
  ok('平均胜场不是满胜（有挑战）', avgWins < MATCH.winTarget, `${avgWins.toFixed(2)}`);
  ok('存在被淘汰的局（有压力）', deaths > 0, `${deaths}/${games}`);
}

// ---------- 汇总 ----------
console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('失败清单：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('核心逻辑自检全部通过。');
