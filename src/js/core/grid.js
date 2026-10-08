/**
 * 背包网格（v0.2）
 *
 * 这一层是「整理玩法」的地基，只做四件事：
 *   1. 用不规则形状判定能不能放
 *   2. 支持拿起、放下、旋转、换位
 *   3. 给出相邻关系（宝石光环、同类协同都靠它）
 *   4. 给出触发顺序（从上到下、从左到右），位置本身就是策略
 *
 * 不碰 DOM，可在 node 里裸跑测试。
 */

import { cells, area, size, rotateCW, normalize, orientations, debugDraw } from '../data/shapes.js';
import { resolvedShape, clothSize, clothFits, centeredAnchor, STAGE } from '../data/cloths.js';

export { cells, area, size, rotateCW, normalize, orientations, debugDraw };

export class Board {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** @type {(string|null)[]} 每格存 item.uid */
    this.cells = new Array(cols * rows).fill(null);
    /** @type {Map<string, {item:object, x:number, y:number, shape:string[]}>} */
    this.items = new Map();
    this._order = null;   // 触发顺序缓存，任何变更后失效
    /**
     * 铺在舞台上的布：{ cloth: 布定义, x, y, flipped, rotation }
     * 为 null 时不限制可放置区域（部分单元测试与对手构筑用这种「裸网格」）；
     * 正式对局由 Run 铺一块布，物品只能落在布上。
     */
    this.cloth = null;
  }

  idx(x, y) { return y * this.cols + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
  at(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.cells[this.idx(x, y)];
  }

  /** 形状锚点落在 (x,y) 时的全部绝对占用格 */
  footprint(shape, x, y) {
    return cells(shape).map((c) => ({ x: x + c.x, y: y + c.y }));
  }

  /**
   * 能否放置。
   * @param {string[]} shape
   * @param {number} x 锚点
   * @param {number} y 锚点
   * @param {string|null} ignoreUid 移动自身时忽略自己占的格
   */
  canPlace(shape, x, y, ignoreUid = null) {
    for (const c of this.footprint(shape, x, y)) {
      if (!this.inBounds(c.x, c.y)) return false;
      if (!this.onCloth(c.x, c.y)) return false;      // 只有布覆盖到的格子能放
      const occ = this.at(c.x, c.y);
      if (occ && occ !== ignoreUid) return false;
    }
    return true;
  }

  // ---------- 布 ----------

  /** 当前布的实际形状（已应用翻转与旋转） */
  clothShape() {
    if (!this.cloth) return null;
    return resolvedShape(this.cloth.cloth.shape, this.cloth);
  }

  /** 布覆盖的格子集合；返回 null 表示不限制 */
  clothCells() {
    const shape = this.clothShape();
    if (!shape) return null;
    const set = new Set();
    for (const c of cells(shape)) set.add(`${this.cloth.x + c.x},${this.cloth.y + c.y}`);
    return set;
  }

  /** 这一格是否在布上（无布时一律算在） */
  onCloth(x, y) {
    const set = this.clothCells();
    if (!set) return true;
    return set.has(`${x},${y}`);
  }

  /** 铺一块布；不传锚点就居中 */
  setCloth(clothDef, anchor = null) {
    const a = anchor || centeredAnchor(clothDef.shape);
    this.cloth = { cloth: clothDef, x: a.x, y: a.y, flipped: false, rotation: 0 };
    this._order = null;
    return this.returnItemsToCloth();
  }

  /** 布整体平移，布上的道具跟着一起走（相对位置不变） */
  moveCloth(dx, dy) {
    if (!this.cloth) return { ok: false, reason: '还没有铺布' };
    const shape = this.clothShape();
    const nx = this.cloth.x + dx, ny = this.cloth.y + dy;
    if (!clothFits(this.cloth.cloth, shape, nx, ny)) return { ok: false, reason: '布会超出背包范围' };

    const moved = this.list().map((e) => ({
      item: e.item, x: e.x + dx, y: e.y + dy, shape: [...e.shape],
    }));
    for (const e of moved) {
      for (const c of this.footprint(e.shape, e.x, e.y)) {
        if (!this.inBounds(c.x, c.y)) return { ok: false, reason: '道具会被推出背包' };
      }
    }
    this.items.clear();
    this.cells.fill(null);
    this.cloth.x = nx;
    this.cloth.y = ny;
    this._order = null;
    for (const e of moved) this.place(e.item, e.x, e.y, e.shape);
    return { ok: true };
  }

  /** 水平翻转布 */
  flipCloth() {
    return this.transformCloth({ flipped: !this.cloth?.flipped });
  }

  /** 顺时针旋转布 */
  rotateCloth() {
    return this.transformCloth({ rotation: ((this.cloth?.rotation || 0) + 1) % 4 });
  }

  transformCloth(patch) {
    if (!this.cloth) return { ok: false, reason: '还没有铺布' };
    const trial = { ...this.cloth, ...patch };
    const shape = resolvedShape(this.cloth.cloth.shape, trial);
    if (!clothFits(this.cloth.cloth, shape, trial.x, trial.y)) {
      const a = centeredAnchor(shape);
      if (!clothFits(this.cloth.cloth, shape, a.x, a.y)) {
        return { ok: false, reason: '这个方向放不下这块布' };
      }
      trial.x = a.x;
      trial.y = a.y;
    }
    this.cloth = trial;
    this._order = null;
    return { ok: true, dropped: this.returnItemsToCloth() };
  }

  /**
   * 把落到布外的道具搬回布上。
   * 搬不回去的返回给上层处理（Run 会把它们折成金币）。
   */
  returnItemsToCloth() {
    if (!this.cloth) return [];
    const dropped = [];
    for (const e of this.list()) {
      const inside = this.footprint(e.shape, e.x, e.y).every((c) => this.onCloth(c.x, c.y));
      if (inside) continue;
      this.remove(e.item.uid);
      const spot = this.findFreeSpot(e.shape);
      if (spot) this.place(e.item, spot.x, spot.y, e.shape);
      else dropped.push(e.item);
    }
    return dropped;
  }

  /** 列出所有能放下该形状的锚点，供 UI 提示「可以放哪」 */
  allPlacements(shape, ignoreUid = null) {
    const out = [];
    const { w, h } = size(shape);
    for (let y = 0; y <= this.rows - h; y++) {
      for (let x = 0; x <= this.cols - w; x++) {
        if (this.canPlace(shape, x, y, ignoreUid)) out.push({ x, y });
      }
    }
    return out;
  }

  findFreeSpot(shape, ignoreUid = null) {
    return this.allPlacements(shape, ignoreUid)[0] || null;
  }

  get(uid) { return this.items.get(uid); }
  has(uid) { return this.items.has(uid); }
  list() { return [...this.items.values()]; }
  count() { return this.items.size; }

  place(item, x, y, shape) {
    const s = normalize(shape);
    if (!this.canPlace(s, x, y, item.uid)) return false;
    this.remove(item.uid);
    for (const c of this.footprint(s, x, y)) {
      this.cells[this.idx(c.x, c.y)] = item.uid;
    }
    this.items.set(item.uid, { item, x, y, shape: [...s] });
    this._order = null;
    return true;
  }

  remove(uid) {
    const e = this.items.get(uid);
    if (!e) return false;
    for (const c of this.footprint(e.shape, e.x, e.y)) {
      if (this.at(c.x, c.y) === uid) this.cells[this.idx(c.x, c.y)] = null;
    }
    this.items.delete(uid);
    this._order = null;
    return true;
  }

  clear() {
    this.cells.fill(null);
    this.items.clear();
    this._order = null;
  }

  /**
   * 扩容：把网格改成更大的尺寸，原有道具保持原坐标。
   * 只变大不移动坐标，所以已摆好的布局不会被打乱。
   */
  expand(cols, rows) {
    if (cols === this.cols && rows === this.rows) return false;
    if (cols < this.cols || rows < this.rows) return false;   // 只允许变大
    const kept = this.list().map((e) => ({ item: e.item, x: e.x, y: e.y, shape: [...e.shape] }));
    this.cols = cols;
    this.rows = rows;
    this.cells = new Array(cols * rows).fill(null);
    this.items.clear();
    this._order = null;
    for (const e of kept) this.place(e.item, e.x, e.y, e.shape);
    return true;
  }

  /** 就地旋转；原地放不下就就近找位置。返回是否成功 */
  rotateAt(uid, dir = 1) {
    const e = this.items.get(uid);
    if (!e) return false;
    let shape = e.shape;
    for (let i = 0; i < (dir > 0 ? 1 : 3); i++) shape = rotateCW(shape);
    shape = normalize(shape);
    if (this.canPlace(shape, e.x, e.y, uid)) {
      this.place(e.item, e.x, e.y, shape);
      return true;
    }
    // 螺旋就近搜索，让旋转尽量少破坏已有布局
    for (let r = 1; r <= Math.max(this.cols, this.rows); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = e.x + dx;
          const ny = e.y + dy;
          if (this.canPlace(shape, nx, ny, uid)) {
            this.place(e.item, nx, ny, shape);
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 正交四邻的 uid 集合 */
  neighbors(uid) {
    const e = this.items.get(uid);
    if (!e) return new Set();
    const out = new Set();
    for (const c of this.footprint(e.shape, e.x, e.y)) {
      for (const p of [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]) {
        const other = this.at(p.x, p.y);
        if (other && other !== uid) out.add(other);
      }
    }
    return out;
  }

  /** 与背包顶边相连（有些道具要求挂在最上排） */
  touchesTop(uid) {
    const e = this.items.get(uid);
    if (!e) return false;
    return cells(e.shape).some((c) => e.y + c.y === 0);
  }

  /**
   * 触发顺序：从上到下、从左到右。
   * 排序键用道具左上角所在行，再列；这样「谁先出手」由玩家摆放决定。
   */
  triggerOrder() {
    if (this._order) return this._order;
    const arr = this.list().slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    this._order = arr.map((e) => e.item.uid);
    return this._order;
  }

  orderIndex(uid) {
    return this.triggerOrder().indexOf(uid);
  }

  usedCells() {
    let n = 0;
    for (const v of this.cells) if (v) n++;
    return n;
  }

  capacity() { return this.cols * this.rows; }

  freeCells() { return this.capacity() - this.usedCells(); }

  /** 导出纯数据，便于存档与测试 */
  snapshot() {
    return this.list().map((e) => ({
      id: e.item.id, uid: e.item.uid, x: e.x, y: e.y, shape: [...e.shape],
    }));
  }

  /** 用快照还原（道具实例由外部提供） */
  restore(snapshot, itemFactory) {
    this.clear();
    for (const s of snapshot) {
      const item = itemFactory(s);
      if (item) this.place(item, s.x, s.y, s.shape);
    }
  }

  /** 文本渲染，调试与测试用 */
  toText() {
    const grid = Array.from({ length: this.rows }, () => Array(this.cols).fill('.'));
    let seq = 0;
    const seqOf = new Map();
    for (const uid of this.triggerOrder()) {
      seqOf.set(uid, seq++);
    }
    const glyphs = '0123456789abcdefghijklmnopqrstuvwxyz';
    for (const e of this.list()) {
      const g = glyphs[seqOf.get(e.item.uid) % glyphs.length];
      for (const c of this.footprint(e.shape, e.x, e.y)) {
        if (this.inBounds(c.x, c.y)) grid[c.y][c.x] = g;
      }
    }
    return grid.map((r) => r.join('')).join('\n');
  }
}
