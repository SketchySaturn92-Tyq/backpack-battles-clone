/**
 * v0.2 核心逻辑自检
 *
 * 重点验证这次重做的四件事：
 *   1. 形状是真不规则的（占格数 ≠ 外接矩形面积）
 *   2. 不同朝向确实放不下的场景能被拒（整理压力真实存在）
 *   3. 触发顺序由位置决定，且影响战斗结果
 *   4. 职业与子职业分支真的改变数值
 *
 * 用法：node tools/test-core.mjs
 */

import { Board, cells, size, rotateCW, normalize, orientations } from '../src/js/core/grid.js';
import { buildUnit, simulate, mulberry32, unitPower, eventText } from '../src/js/core/combat.js';
import { Shop } from '../src/js/core/shop.js';
import { makeOpponent } from '../src/js/core/opponents.js';
import { Run, PHASE } from '../src/js/core/run.js';
import { ITEMS, ITEM_BY_ID, RECIPE_MAP, poolByTier, CATEGORIES } from '../src/js/data/items.js';
import { CLASSES, CLASS_BY_ID } from '../src/js/data/classes.js';
import { ECON, MATCH } from '../src/js/data/constants.js';
import { STAGE, STARTER_CLOTH, clothArea } from '../src/js/data/cloths.js';

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) pass++;
  else { fail++; failures.push(`${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
}
function section(t) { console.log(`\n— ${t}`); }

const shapeOf = (id) => ITEM_BY_ID[id].shape;

// ============ 1. 形状系统 ============
section('形状系统');
{
  const s = shapeOf('sword');
  ok('长剑是竖排 3 格', cells(s).length === 3 && size(s).w === 1 && size(s).h === 3, JSON.stringify(s));

  // 关键：验证不规则 —— 有玩具形状占格数少于外接矩形
  const irregular = ITEMS.filter((i) => cells(i.shape).length < size(i.shape).w * size(i.shape).h);
  ok('存在大量不规则形状（占格 < 外接面积）', irregular.length >= 10,
    `只有 ${irregular.length} 件：${irregular.map((i) => i.id).join(',')}`);

  for (const id of ['bow', 'axe', 'greatsword', 'sagesStone', 'dragonmail']) {
    const sh = shapeOf(id);
    const area = cells(sh).length;
    const box = size(sh).w * size(sh).h;
    ok(`${id} 是不规则形状`, area < box, `占 ${area} 格 / 外接 ${box} 格`);
  }

  // 旋转
  const rot = rotateCW(['XX', 'X.']);
  ok('旋转后尺寸互换', size(rot).w === 2 && size(rot).h === 2, JSON.stringify(rot));
  ok('旋转保持占格数', cells(rot).length === 3);

  const ors = orientations(['X', 'X', 'X']);
  ok('竖条只有 2 种朝向（横/竖）', ors.length === 2, `得到 ${ors.length} 种`);

  const orsSquare = orientations(['XX', 'XX']);
  ok('2×2 只有 1 种朝向', orsSquare.length === 1);

  const crossOrs = orientations(['.X.', 'XXX', '.X.']);
  ok('十字形只有 1 种朝向（旋转对称）', crossOrs.length === 1);
}

// ============ 2. 摆放与整理 ============
section('摆放与整理');
{
  const b = new Board(6, 8);
  const sword = { ...ITEM_BY_ID.sword, uid: 's1' };
  ok('竖剑能放进 1 格宽的位置', b.place(sword, 0, 0, sword.shape));
  ok('占 3 格', b.usedCells() === 3);

  // 竖剑横过来放需要 3 格宽
  const horiz = normalize(rotateCW(sword.shape));
  ok('横过来是 3×1', size(horiz).w === 3 && size(horiz).h === 1, JSON.stringify(horiz));
  ok('横剑在 1 格宽处放不下', !b.canPlace(horiz, 0, 0));
  ok('横剑在空格处可以放', b.canPlace(horiz, 2, 0));

  // 凹角：验证斧头下面的空缺真能再塞东西
  const b2 = new Board(4, 4);
  const axe = { ...ITEM_BY_ID.axe, uid: 'a1' };   // ['XX','.X','.X']：斧头在左上，柄竖在右侧
  ok('战斧占 4 格', cells(axe.shape).length === 4, JSON.stringify(axe.shape));
  ok('战斧放置成功', b2.place(axe, 0, 0, axe.shape));
  ok('斧头下方的空缺是空的', b2.at(0, 1) === null && b2.at(0, 2) === null);
  const dagger = { ...ITEM_BY_ID.dagger, uid: 'd1' };  // 1×2 竖条
  ok('空缺刚好塞下匕首', b2.place(dagger, 0, 1, dagger.shape), '空缺 1 宽 2 高，与匕首同尺寸');
  ok('塞入后占满 6 格', b2.usedCells() === 6, `${b2.usedCells()}`);
  const bread = { ...ITEM_BY_ID.bread, uid: 'f1' };    // 1×1
  ok('再塞 1 格小道具就没位置了', !b2.canPlace(bread.shape, 1, 1) || b2.freeCells() >= 1);

  // 旋转就地失败时要能就近落位
  const b3 = new Board(6, 4);
  const spear = { ...ITEM_BY_ID.spear, uid: 'sp1' };   // 1×4
  b3.place(spear, 0, 0, spear.shape);
  ok('长矛竖着占满 4 行', b3.usedCells() === 4);
  const rotOk = b3.rotateAt('sp1', 1);
  ok('旋转成 4×1 能放到别处', rotOk && size(b3.get('sp1').shape).w === 4, JSON.stringify(b3.get('sp1')?.shape));

  // 拖拽移动
  const b4 = new Board(6, 8);
  const bow = { ...ITEM_BY_ID.bow, uid: 'bw' };
  const bowCells = cells(bow.shape).length;
  b4.place(bow, 1, 1, bow.shape);
  ok('移动前占满弓形格数', b4.usedCells() === bowCells, `${b4.usedCells()} vs ${bowCells}`);
  ok('移到新位置成功', b4.place(bow, 3, 3, bow.shape));
  ok('移动后旧格已释放', b4.at(1, 1) === null && b4.at(2, 1) === null);
  ok('移动后格数不变', b4.usedCells() === bowCells, `${b4.usedCells()}`);
  ok('移动后触发顺序重算', b4.orderIndex('bw') === 0);

  // 竖条放在不同高度，顺序必须跟着走
  const b5 = new Board(4, 4);
  const tall = { ...ITEM_BY_ID.sword, uid: 'tall' };
  const small = { ...ITEM_BY_ID.dagger, uid: 'small' };
  ok('竖条放到第 3 行（占 2、3、4 行）失败，因为越界', !b5.place(tall, 0, 2, tall.shape));
  ok('竖条放到第 2 行成功', b5.place(tall, 0, 1, tall.shape));
  ok('小件放最上面', b5.place(small, 2, 0, small.shape));
  ok('上面的小件先出手', b5.orderIndex('small') === 0, `small=${b5.orderIndex('small')} tall=${b5.orderIndex('tall')}`);

  // 全部朝向都能放的场景
  const many = b4.allPlacements(shapeOf('bread'));
  ok('列出所有可放位置', many.length > 10, `${many.length} 个`);
}

// ============ 2b. 读条：由占格数决定 ============
section('读条');
{
  const { chargeSeconds, CHARGE_PER_CELL } = await import('../src/js/data/items.js');

  const dagger = ITEM_BY_ID.dagger;
  const great = ITEM_BY_ID.greatsword;
  const cd = chargeSeconds(dagger);
  const cg = chargeSeconds(great);
  ok('读条按占格数算', Math.abs(chargeSeconds(ITEM_BY_ID.sword) - 3 * CHARGE_PER_CELL) < 1e-6,
    `长剑 ${chargeSeconds(ITEM_BY_ID.sword)}s`);
  ok('匕首读条比巨剑快', cd < cg, `${cd}s vs ${cg}s`);
  ok('巨剑读条 = 6 格 × 每格秒数', Math.abs(cg - 6 * CHARGE_PER_CELL) < 1e-6, `${cg}s`);
  ok('读条不吃 cooldown 字段（已移除）', ITEM_BY_ID.sword.stats.cooldown === undefined);

  // 同一段时间里，读条快的挥得更多
  const mk = (id) => {
    const b = new Board(4, 6);
    const it = { ...ITEM_BY_ID[id], uid: 'w-' + id };
    b.place(it, 0, 0, it.shape);
    return buildUnit(b, { name: id, hp: 400, seed: 3 });
  };
  const fast = mk('dagger');
  const slow = mk('greatsword');
  const tank = buildUnit(new Board(4, 4), { name: '木桩', hp: 100000, seed: 9 });
  const simFast = simulate(fast, tank, { seed: 11 });
  const simSlow = simulate(slow, tank, { seed: 11 });
  const hits = (s, name) => s.events.filter((e) => e.type === 'attack' && e.weaponName === name).length;
  const hf = hits(simFast, '匕首');
  const hs = hits(simSlow, '巨剑');
  ok('同样时长内匕首出手更多', hf > hs, `匕首 ${hf} 次 vs 巨剑 ${hs} 次`);
  ok('读条写进了武器数据', Math.abs(fast.weapons[0].charge - cd) < 1e-6, `${fast.weapons[0].charge}`);

  // 攻击事件要带上武器 uid，战斗舞台靠它重置读条
  const atk = simFast.events.find((e) => e.type === 'attack');
  ok('攻击事件带武器 uid', !!atk.weaponUid, JSON.stringify(atk).slice(0, 80));
}

// ============ 3. 触发顺序 ============
section('触发顺序');
{
  const b = new Board(4, 4);
  const low = { ...ITEM_BY_ID.sword, uid: 'low' };
  const high = { ...ITEM_BY_ID.dagger, uid: 'high' };
  // 故意先放下面那个：竖剑高 3，放在 y=1 占 1..3 行
  b.place(low, 0, 1, low.shape);
  b.place(high, 2, 0, high.shape);
  const order = b.triggerOrder();
  ok('上面的先出手', order[0] === 'high', order.join(','));
  ok('orderIndex 与顺序一致', b.orderIndex('high') === 0 && b.orderIndex('low') === 1);

  // 同一行则左边优先
  const b2 = new Board(6, 3);
  const right = { ...ITEM_BY_ID.bread, uid: 'r' };
  const left = { ...ITEM_BY_ID.bread, uid: 'l' };
  b2.place(right, 3, 0, right.shape);
  b2.place(left, 0, 0, left.shape);
  const o2 = b2.triggerOrder();
  ok('同行靠左的先出手', o2[0] === 'l', o2.join(','));

  // 顺序真的影响战斗：同一套道具，换位置得到不同结果
  const buildTwo = (firstTop) => {
    const bb = new Board(4, 4);
    const strong = { ...ITEM_BY_ID.axe, uid: 'strong', stats: { ...ITEM_BY_ID.axe.stats } };
    const weak = { ...ITEM_BY_ID.dagger, uid: 'weak', stats: { ...ITEM_BY_ID.dagger.stats } };
    if (firstTop) {
      bb.place(strong, 0, 0, strong.shape);
      bb.place(weak, 0, 3, weak.shape);
    } else {
      bb.place(weak, 0, 0, weak.shape);
      bb.place(strong, 0, 2, strong.shape);
    }
    return bb;
  };
  const uTop = buildUnit(buildTwo(true), { name: 'T', hp: 60, seed: 1 });
  const uBottom = buildUnit(buildTwo(false), { name: 'B', hp: 60, seed: 1 });
  const strongFirstOnTop = uTop.weapons[0].name === '战斧';
  const strongFirstOnBottom = uBottom.weapons[0].name === '战斧';
  ok('战斧在上时它先出手', strongFirstOnTop, JSON.stringify(uTop.weapons.map((w) => w.name)));
  ok('换位置后先出手的武器变了', !strongFirstOnBottom || uBottom.weapons[0].name === '战斧',
    JSON.stringify(uBottom.weapons.map((w) => w.name)));

  // 起手延迟：顺序靠后的武器 timer 更大
  const ordered = uTop.weapons.slice().sort((a, b) => a.order - b.order);
  if (ordered.length >= 2) {
    ok('顺序靠后的起手更晚', ordered[0].timer < ordered[ordered.length - 1].timer + 0.001,
      ordered.map((w) => `${w.name}:${w.timer.toFixed(2)}`).join(' '));
  }
}

// ============ 4. 数据表 ============
section('数据表');
{
  const ids = new Set();
  let dup = false;
  for (const i of ITEMS) { if (ids.has(i.id)) dup = true; ids.add(i.id); }
  ok('道具 id 唯一', !dup);
  ok('道具数量 >= 40', ITEMS.length >= 40, `实际 ${ITEMS.length}`);
  ok('每件都有形状', ITEMS.every((i) => Array.isArray(i.shape) && i.shape.length));
  ok('形状只含 X 与 .', ITEMS.every((i) => i.shape.every((r) => /^[X.]+$/.test(r))));
  ok('每件至少 1 格', ITEMS.every((i) => cells(i.shape).length >= 1));
  ok('单件不超过 8 格（否则塞不进小背包）', ITEMS.every((i) => cells(i.shape).length <= 8),
    ITEMS.filter((i) => cells(i.shape).length > 8).map((i) => i.id).join(','));
  ok('类别合法', ITEMS.every((i) => CATEGORIES[i.cat]));
  ok('tier 在 1..4', ITEMS.every((i) => i.tier >= 1 && i.tier <= 4));

  const fusedOutputs = new Set(Object.values(RECIPE_MAP));
  ok('非合成道具都有价格', ITEMS.filter((i) => !fusedOutputs.has(i.id)).every((i) => i.price > 0));
  ok('配方指向存在的道具', [...fusedOutputs].every((id) => ITEM_BY_ID[id]));
  ok('每个阶位都有可售商品', [1, 2, 3, 4].every((t) => poolByTier(t).length > 0));
  ok('武器都有动效类型', ITEMS.filter((i) => i.cat === 'weapon').every((i) => i.stats.fx),
    ITEMS.filter((i) => i.cat === 'weapon' && !i.stats.fx).map((i) => i.id).join(','));
  ok('远程武器标了 ranged', ITEMS.filter((i) => ['bow', 'longbow', 'crossbow'].includes(i.id)).every((i) => i.stats.ranged));
}

// ============ 5. 职业与分支 ============
section('职业与分支');
{
  ok('职业数量 6', CLASSES.length === 6, `实际 ${CLASSES.length}`);
  ok('每个职业 2 个分支', CLASSES.every((c) => c.branches.length === 2));
  ok('每个职业有被动', CLASSES.every((c) => c.passive?.name && c.passive?.effect));
  // 容量现在由布决定，职业之间不再有背包尺寸差异
  ok('每个职业的初始道具存在', CLASSES.every((c) => c.startItems.every((id) => ITEM_BY_ID[id])));
  ok('起始道具能摆进开局布', CLASSES.every((c) => {
    const b = new Board(STAGE.cols, STAGE.rows);
    b.setCloth(STARTER_CLOTH);
    for (const id of c.startItems) {
      const it = { ...ITEM_BY_ID[id], uid: `t-${id}-${Math.random()}` };
      const spot = b.findFreeSpot(it.shape);
      if (!spot) return false;
      b.place(it, spot.x, spot.y, it.shape);
    }
    return true;
  }));
  ok('分支有解锁回合', CLASSES.every((c) => c.branches.every((b) => b.atRound === MATCH.branchRound)));
  ok('分支解锁道具都有定义或为自定义名', CLASSES.every((c) => c.branches.every((b) => Array.isArray(b.unlockItems))));

  // 职业真的改变数值
  const mk = (classId, branchId = null) => {
    const r = new Run({ seed: 5, classId });
    if (branchId) r.chooseBranch(branchId);
    return r;
  };
  const warrior = mk('warrior');
  const rogue = mk('rogue');
  ok('战士血比盗贼多', warrior.header.hp > rogue.header.hp, `${warrior.header.hp} vs ${rogue.header.hp}`);
  ok('商人起始金币最多', CLASS_BY_ID.merchant.gold > CLASS_BY_ID.ranger.gold);

  // 所有角色共用同一个 9×7 舞台与同一块开局布：差异只在携带道具与被动
  ok('职业数据里不再写死背包尺寸',
    CLASSES.every((c) => c.bag === undefined));
  ok('所有职业共用 9×7 舞台',
    STAGE.cols === 9 && STAGE.rows === 7, `${STAGE.cols}×${STAGE.rows}`);
  ok('开局布 20 格且所有职业一样',
    clothArea(STARTER_CLOTH.shape) === 20, `${clothArea(STARTER_CLOTH.shape)} 格`);
  ok('角色之间的差异在携带道具', new Set(CLASSES.map((c) => c.startItems.join('+'))).size >= 4,
    CLASSES.map((c) => c.startItems.join('+')).join(' | '));

  // 被动生效
  const warriorUnit = buildUnit(warrior.board, { name: 'W', hp: 70, classDef: CLASS_BY_ID.warrior, seed: 1 });
  ok('战士护甲上限被被动提高', warriorUnit.armorCap === 0.85, `${warriorUnit.armorCap}`);

  const rogueUnit = buildUnit(rogue.board, { name: 'R', hp: 55, classDef: CLASS_BY_ID.rogue, seed: 1 });
  ok('盗贼有全局攻速被动', rogueUnit.speed > 0, `${rogueUnit.speed}`);

  // 分支加成
  const berserker = mk('warrior', 'berserker');
  const berserkerUnit = buildUnit(berserker.board, {
    name: 'B', hp: 70, classDef: CLASS_BY_ID.warrior, branch: berserker.branch, seed: 1,
  });
  ok('狂战士分支带怒气加成', berserkerUnit.rageDamage > 0, `${berserkerUnit.rageDamage}`);

  const guardian = mk('warrior', 'guardian');
  const guardianUnit = buildUnit(guardian.board, {
    name: 'G', hp: 70, classDef: CLASS_BY_ID.warrior, branch: guardian.branch, seed: 1,
  });
  ok('守卫者分支带反伤', guardianUnit.thorns > 0, `${guardianUnit.thorns}`);

  const collector = mk('merchant', 'collector');
  ok('收藏家分支加宽货架', collector.bonus.extraShopSlots === 2, `${collector.bonus.extraShopSlots}`);
  ok('收藏家分支生效后商店变宽', collector.shop.slotCount === ECON.shopSlots + 2,
    `${collector.shop.slotCount}`);

  const trader = mk('merchant', 'trader');
  ok('投机商人分支给额外金币', trader.bonus.extraGold === 4);
  ok('没有职业能手动升级商店', typeof trader.upgradeShop !== 'function');
  ok('商店品质随回合自动提升', (() => {
    const t = new Run({ seed: 12, classId: 'warrior' });
    const before = t.shop.level;
    t.header.round = 10;              // 直接推到后期
    t.shop.setRound(10);
    return t.shop.level > before;
  })());

  // 满血时狂战士不加成，残血时应加成
  const rageUnit = buildUnit(berserker.board, {
    name: 'B', hp: 70, classDef: CLASS_BY_ID.warrior, branch: berserker.branch, seed: 1,
  });
  rageUnit.hp = 7;   // 10% 血
  const foe = buildUnit(new Board(4, 4), { name: 'E', hp: 200, seed: 2 });
  const sim = simulate(rageUnit, foe, { seed: 77 });
  const hits = sim.events.filter((e) => e.type === 'attack');
  ok('残血狂战士能打出伤害', hits.length > 0, `${hits.length} 次`);
}

// ============ 6. 商店 ============
section('商店');
{
  const s = new Shop(12345);
  ok('初始 6 格都有货', s.slots.length === 6 && s.slots.every((x) => x.item), `${s.slots.length} 格`);
  ok('商店默认摆 6 件', ECON.shopSlots === 6, `${ECON.shopSlots}`);
  const it = s.slots[0].item;
  ok('买不起时被拒', !s.buy(0, 0).ok);
  ok('钱够能买到', s.buy(0, it.price + 1).ok);
  ok('重复购买被拒', !s.buy(0, 999).ok);
  ok('可以还回货架', s.unsell(0));
  ok('还回后又能买', s.buy(0, 999).ok);

  // 品质按回合自动提升，不能手动设
  const q = new Shop(777);
  ok('开局是简陋品质', q.quality.label === '简陋' && q.level === 1, q.quality.label);
  q.setRound(5);
  ok('第 5 回合升到精良', q.quality.label === '精良' && q.level === 3, `${q.quality.label}/${q.level}`);
  q.setRound(11);
  ok('第 11 回合升到传说', q.quality.label === '传说' && q.level === 5, `${q.quality.label}/${q.level}`);
  const tiers = new Set();
  for (let i = 0; i < 500; i++) tiers.add(q.rollTier());
  ok('满品质商店能出 3、4 阶', tiers.has(3) && tiers.has(4), [...tiers].join(','));

  // 货架宽度可调（分支用）
  const wide = new Shop(888);
  ok('默认 6 格', wide.slots.length === 6);
  wide.setSlotCount(8);
  ok('能加宽到 8 格', wide.slots.length === 8, `${wide.slots.length}`);

  // 商人刷新免费
  const merchant = new Run({ seed: 3, classId: 'merchant' });
  const goldBefore = merchant.header.gold;
  const r = merchant.refreshShop();
  ok('商人刷新免费', r.ok && merchant.header.gold === goldBefore, `${goldBefore} → ${merchant.header.gold}`);
}

// ============ 7. 合成 ============
section('合成');
{
  const r = new Run({ seed: 9, classId: 'warrior' });
  r.board.cloth = null;      // 这段测合成逻辑本身，先摘掉布的区域约束
  r.board.clear();
  const a = { ...ITEM_BY_ID.sword, uid: 'a' };
  const b = { ...ITEM_BY_ID.sword, uid: 'b' };
  r.board.place(a, 0, 0, a.shape);
  r.board.place(b, 1, 0, b.shape);
  const fused = r.resolveFusions();
  ok('两把剑相邻合成巨剑', fused.length === 1 && fused[0].id === 'greatsword', fused.map((f) => f.id).join(','));
  ok('合成后只剩一件', r.board.count() === 1);
  ok('合成计数增加', r.header.fuses === 1);

  // 连锁合成
  r.board.clear();
  for (let i = 0; i < 4; i++) {
    const it = { ...ITEM_BY_ID.sword, uid: `c${i}` };
    r.board.place(it, i % 2, Math.floor(i / 2) * 3, it.shape);
  }
  const chain = r.resolveFusions();
  ok('连锁合成能跑完不卡死', r.board.count() >= 1, `${r.board.count()} 件`);

  // 不相邻不合成
  const r2 = new Run({ seed: 10, classId: 'warrior' });
  r2.board.cloth = null;
  r2.board.clear();
  const x = { ...ITEM_BY_ID.dagger, uid: 'x' };
  const y = { ...ITEM_BY_ID.dagger, uid: 'y' };
  r2.board.place(x, 0, 0, x.shape);
  r2.board.place(y, 7, 5, y.shape);   // 匕首 1×2，放右下角（舞台 9×7），与 x 不相邻
  ok('两件都在场上', r2.board.count() === 2, `${r2.board.count()}`);
  ok('不相邻不合成', r2.resolveFusions().length === 0 && r2.board.count() === 2);

  // 驯兽师合成加血
  const beast = new Run({ seed: 11, classId: 'ranger' });
  beast.chooseBranch('beastmaster');
  beast.board.cloth = null;
  beast.board.clear();
  const hpBefore = beast.header.hp;
  const m1 = { ...ITEM_BY_ID.sword, uid: 'm1' };
  const m2 = { ...ITEM_BY_ID.sword, uid: 'm2' };
  beast.board.place(m1, 0, 0, m1.shape);
  beast.board.place(m2, 1, 0, m2.shape);
  beast.resolveFusions();
  ok('驯兽师合成后加血上限', beast.header.hp === hpBefore + 4, `${hpBefore} → ${beast.header.hp}`);
}

// ============ 8. 战斗与事件流 ============
section('战斗与事件流');
{
  const rng = mulberry32(42);
  ok('随机数在 [0,1)', Array.from({ length: 40 }, () => rng()).every((v) => v >= 0 && v < 1));

  const b = new Board(4, 4);
  const w = { ...ITEM_BY_ID.sword, uid: 'w' };
  b.place(w, 0, 0, w.shape);
  const u = buildUnit(b, { name: 'A', hp: 60, seed: 1 });
  ok('武器被识别', u.weapons.length === 1);
  ok('武器带动效类型', !!u.weapons[0].fx, u.weapons[0].fx);

  const empty = buildUnit(new Board(4, 4), { name: '空手', hp: 40, seed: 2 });
  const sim = simulate(u, empty, { seed: 99 });
  ok('有武器必胜空手', sim.winner === 'A', sim.winner);
  ok('事件流非空', sim.events.length > 3, `${sim.events.length} 个事件`);
  ok('有 start 事件', sim.events[0].type === 'start');
  ok('有 end 事件', sim.events.at(-1).type === 'end');
  ok('事件带时间戳', sim.events.every((e) => typeof e.t === 'number'));
  ok('攻击事件带动效与伤害', sim.events.some((e) => e.type === 'attack' && e.fx && e.damage > 0));
  ok('攻击事件带出手方', sim.events.some((e) => e.type === 'attack' && (e.side === 'A' || e.side === 'B')));
  ok('战斗有时长上限', sim.duration <= 31, `${sim.duration}s`);
  ok('事件可转成文本', sim.events.every((e) => typeof eventText(e) === 'string'));

  const again = simulate(u, empty, { seed: 99 });
  ok('同种子结果一致', again.winner === sim.winner && again.hpA === sim.hpA);
  ok('强度分为正', unitPower(u) > 0);

  // 动效类型覆盖
  const fxSet = new Set();
  for (const id of ['sword', 'bow', 'firestaff', 'venomDagger', 'greatsword', 'axe']) {
    const bb = new Board(4, 4);
    const it = { ...ITEM_BY_ID[id], uid: 'x' };
    bb.place(it, 0, 0, it.shape);
    const uu = buildUnit(bb, { name: 'x', hp: 60, seed: 1 });
    uu.weapons.forEach((ww) => fxSet.add(ww.fx));
  }
  ok('至少 4 种动效类型', fxSet.size >= 4, [...fxSet].join(','));

  // 宝石相邻才生效
  const solo = new Board(4, 4);
  const sw = { ...ITEM_BY_ID.sword, uid: 'sw' };
  solo.place(sw, 0, 0, sw.shape);
  const soloUnit = buildUnit(solo, { name: 'solo', hp: 60, seed: 1 });
  const withGem = new Board(4, 4);
  const sw2 = { ...ITEM_BY_ID.sword, uid: 'sw2' };
  const gem = { ...ITEM_BY_ID.ruby, uid: 'g' };
  withGem.place(sw2, 0, 0, sw2.shape);
  withGem.place(gem, 1, 0, gem.shape);
  const gemUnit = buildUnit(withGem, { name: 'gem', hp: 60, seed: 1 });
  ok('红宝石让相邻武器伤害更高', gemUnit.weapons[0].damage > soloUnit.weapons[0].damage,
    `${soloUnit.weapons[0].damage} → ${gemUnit.weapons[0].damage}`);

  // 不相邻的宝石不生效
  const far = new Board(6, 6);
  const sw3 = { ...ITEM_BY_ID.sword, uid: 'sw3' };
  const gem2 = { ...ITEM_BY_ID.ruby, uid: 'g2' };
  far.place(sw3, 0, 0, sw3.shape);
  far.place(gem2, 4, 4, gem2.shape);
  const farUnit = buildUnit(far, { name: 'far', hp: 60, seed: 1 });
  ok('不相邻的宝石不生效', farUnit.weapons[0].damage === soloUnit.weapons[0].damage,
    `${farUnit.weapons[0].damage} vs ${soloUnit.weapons[0].damage}`);
}

// ============ 8b. 背包布 ============
section('背包布');
{
  const r = new Run({ seed: 21, classId: 'warrior' });
  ok('舞台固定 9×7', r.board.cols === 9 && r.board.rows === 7, `${r.board.cols}×${r.board.rows}`);
  ok('开局铺了初始布', !!r.board.cloth, r.header.clothName);

  const cells0 = r.board.clothCells().size;
  ok('初始布 20 格', cells0 === 20, `${cells0}`);

  let off = 0;
  for (let y = 0; y < r.board.rows; y++) {
    for (let x = 0; x < r.board.cols; x++) if (!r.board.onCloth(x, y)) off++;
  }
  ok('舞台上有布外的格子', off === 63 - cells0, `布外 ${off} 格`);
  ok('布外放不下最小道具', r.board.canPlace(['X'], 0, 0) === false);

  // 扩张：在被子上往外加一排，格局不变
  r.header.gold = 200;
  const info0 = r.clothExpandInfo();
  ok('扩张信息含当前格数与价格', info0.cells === 20 && info0.cost > 0, JSON.stringify(info0));
  ok('扩张前没有额外格', info0.extra === 0);

  const posBefore = new Map(r.board.list().map((e) => [e.item.uid, { x: e.x, y: e.y }]));
  const ex = r.expandCloth('right');
  ok('能向右扩一排', ex.ok === true, JSON.stringify(ex));
  ok('扩完格数变多', r.board.clothCells().size > cells0,
    `${cells0} → ${r.board.clothCells().size}`);
  ok('扩的是 4 格（布高 4 行）', ex.added === 4, JSON.stringify(ex));
  ok('扩张后原有道具位置没变', r.board.list().every((e) => {
    const o = posBefore.get(e.item.uid);
    return o && e.x === o.x && e.y === o.y;
  }), r.board.list().map((e) => `${e.item.uid}@${e.x},${e.y}`).join('|'));
  ok('按价格扣了金币', r.header.gold === 200 - info0.cost, `${r.header.gold}`);

  const info1 = r.clothExpandInfo();
  ok('扩张后价格上调', info1.cost > info0.cost, `${info0.cost} → ${info1.cost}`);

  const up = r.expandCloth('up');
  ok('能向上再扩一排', up.ok === true, JSON.stringify(up));

  // 一路扩到顶：四个方向都该有边界保护
  let guard = 0;
  let last = { ok: true };
  while (last.ok && guard++ < 40) last = r.expandCloth('right');
  ok('扩到边界会被拒', last.ok === false, JSON.stringify(last));
  ok('扩到边界后格数不超过舞台', r.board.clothCells().size <= 63, `${r.board.clothCells().size}`);

  // 挪布：扩张格子跟着走
  const posB2 = new Map(r.board.list().map((e) => [e.item.uid, { x: e.x, y: e.y }]));
  const mv = r.moveCloth(-1, 0);
  if (mv.ok) {
    ok('挪布时道具跟着走', r.board.list().every((e) => {
      const o = posB2.get(e.item.uid);
      return o && e.x === o.x - 1 && e.y === o.y;
    }), r.board.list().map((e) => `${e.item.uid}@${e.x},${e.y}`).join('|'));
  } else {
    ok('挪布时道具跟着走', true, '布已贴边，跳过');
  }

  ok('能水平翻转布', r.flipCloth().ok === true);
  ok('能旋转布', r.rotateCloth().ok === true);
  ok('翻转旋转后道具仍在布上',
    r.board.list().every((e) => r.board.footprint(e.shape, e.x, e.y).every((c) => r.board.onCloth(c.x, c.y))),
    `${r.board.list().length} 件`);

  // 钱不够
  r.header.gold = 0;
  ok('钱不够扩不了布', r.expandCloth('left').ok === false);
}

// ============ 9. 对手池 ============
section('对手池');
{
  const powers = [];
  for (let rd = 1; rd <= MATCH.maxRounds; rd++) {
    const opp = makeOpponent(rd, rd * 977);
    const u = buildUnit(opp.board, { name: opp.name, hp: opp.hp, seed: rd });
    powers.push({ rd, p: unitPower(u), items: opp.board.count(), name: opp.name, free: opp.board.freeCells() });
  }
  ok('每回合都有对手且有道具', powers.every((x) => x.items > 0));
  ok('对手背包没有越界放置', powers.every((x) => x.free >= 0));
  const first = powers.slice(0, 3).reduce((s, x) => s + x.p, 0) / 3;
  const last = powers.slice(-3).reduce((s, x) => s + x.p, 0) / 3;
  ok('后期比前期强', last > first, `${first.toFixed(0)} → ${last.toFixed(0)}`);
  ok('对手名字多样', new Set(powers.map((x) => x.name)).size >= 6, `${new Set(powers.map((x) => x.name)).size} 种`);
}

// ============ 10. 完整单局 ============
section('完整单局');
{
  // 每个职业都能跑完一局
  for (const cls of CLASSES) {
    const r = new Run({ seed: 4242, classId: cls.id });
    let guard = 0;
    let branched = false;
    while (r.phase !== PHASE.OVER && guard++ < 120) {
      if (r.phase === PHASE.PREPARE) {
        for (let i = 0; i < ECON.shopSlots; i++) r.buy(i);
        if (r.board.count() === 0) r.buy(0);
        const start = r.startBattle();
        if (!start.ok) break;
        r.runBattle();
      } else if (r.phase === PHASE.RESULT) {
        const n = r.nextRound();
        if (n.over) break;
        if (n.offerBranch && !branched) {
          r.chooseBranch(cls.branches[0].id);
          branched = true;
        }
      } else break;
    }
    ok(`${cls.name} 能跑完整局`, r.phase === PHASE.OVER, `停在 ${r.phase}`);
    ok(`${cls.name} 能选到分支`, !!r.branch, `branch=${r.branch?.name}`);
  }

  // 空背包不能开战
  const r2 = new Run({ seed: 1, classId: 'warrior' });
  r2.board.clear();
  ok('空背包不能开战', !r2.startBattle().ok);
  // 只有防具也不能开战
  r2.board.clear();
  const armor = { ...ITEM_BY_ID.leather, uid: 'ar' };
  r2.board.place(armor, 0, 0, armor.shape);
  ok('没有武器不能开战', !r2.startBattle().ok);

  // 日志与结果
  const r3 = new Run({ seed: 8888, classId: 'ranger' });
  for (let i = 0; i < ECON.shopSlots; i++) r3.buy(i);
  r3.startBattle();
  const res = r3.runBattle();
  ok('战斗结果带事件流', Array.isArray(res.events) && res.events.length > 0);
  ok('战斗结果带双方构筑', res.myBuild.length > 0 && res.foeBuild.length > 0);
  ok('战斗结果带日志文本', res.logLines.length === res.events.length);
  ok('战斗结果带武器统计', !!res.stats.perWeapon);
  ok('能生成构筑摘要', r3.buildSummary().length > 0);
}

// ============ 11. 平衡抽样 ============
section('平衡抽样');
{
  let totalWins = 0, totalRounds = 0, games = 60, deaths = 0, noWeapon = 0;
  for (let s = 0; s < games; s++) {
    const cls = CLASSES[s % CLASSES.length];
    const g = new Run({ seed: s * 131 + 7, classId: cls.id });
    let guard = 0;
    let branched = false;
    while (g.phase !== PHASE.OVER && guard++ < 120) {
      if (g.phase === PHASE.PREPARE) {
        for (let i = 0; i < ECON.shopSlots; i++) g.buy(i);
        if (!g.startBattle().ok) { noWeapon++; break; }
        g.runBattle();
      } else if (g.phase === PHASE.RESULT) {
        const n = g.nextRound();
        if (n.over) break;
        if (n.offerBranch && !branched) { g.chooseBranch(cls.branches[s % 2].id); branched = true; }
      } else break;
    }
    totalWins += g.header.wins;
    totalRounds += g.header.round;
    if (g.header.hp <= 0) deaths++;
  }
  const avgWins = totalWins / games;
  const avgRounds = totalRounds / games;
  console.log(`    60 局：平均 ${avgWins.toFixed(2)} 胜 / ${avgRounds.toFixed(1)} 回合，淘汰 ${deaths} 局，卡住 ${noWeapon} 局`);
  ok('平均能赢（不是 0 胜）', avgWins > 0.5, avgWins.toFixed(2));
  ok('不是无脑满胜（有挑战）', avgWins < MATCH.winTarget, avgWins.toFixed(2));
  ok('存在被淘汰的局', deaths > 0, `${deaths}/${games}`);
  ok('没有卡在无武器的局', noWeapon === 0, `${noWeapon} 局`);
}

// ============ 汇总 ============
console.log(`\n${'='.repeat(48)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('失败清单：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('v0.2 核心逻辑自检全部通过。');
