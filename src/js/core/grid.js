/**
 * 背包网格：占位、合法性、上下架、相邻关系。
 * 纯逻辑，不碰 DOM。
 */

/**
 * 把一个道具的 shape 展开成相对坐标集合。
 * @param {string[]} shape
 * @returns {{x:number,y:number}[]}
 */
export function shapeCells(shape) {
  const cells = [];
  shape.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'X') cells.push({ x, y });
    });
  });
  return cells;
}

export function shapeSize(shape) {
  const w = Math.max(...shape.map((r) => r.length));
  const h = shape.length;
  return { w, h };
}

/** 顺时针旋转 90 度 */
export function rotateShape(shape) {
  const { w, h } = shapeSize(shape);
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  shape.forEach((row, y) => [...row].forEach((ch, x) => { grid[y][x] = ch; }));
  const out = Array.from({ length: w }, () => Array(h).fill('.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = grid[y][x];
    }
  }
  return out.map((r) => r.join(''));
}

export class Board {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** @type {(null|string)[]} 每格存放 item.uid */
    this.cells = new Array(cols * rows).fill(null);
    /** @type {Map<string, {item:object, x:number, y:number, shape:string[]}>} */
    this.items = new Map();
  }

  idx(x, y) { return y * this.cols + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
  at(x, y) {
    if (!this.inBounds(x, y)) return undefined;
    return this.cells[this.idx(x, y)];
  }

  /** 给定道具与落点，返回所有绝对占用格 */
  footprint(shape, x, y) {
    return shapeCells(shape).map((c) => ({ x: x + c.x, y: y + c.y }));
  }

  /** 是否可放：边界内 + 目标格为空 + 自重叠允许（移动自身时） */
  canPlace(shape, x, y, ignoreUid = null) {
    const cells = this.footprint(shape, x, y);
    for (const c of cells) {
      if (!this.inBounds(c.x, c.y)) return false;
      const occ = this.at(c.x, c.y);
      if (occ && occ !== ignoreUid) return false;
    }
    return true;
  }

  get(uid) { return this.items.get(uid); }

  list() { return [...this.items.values()]; }

  place(item, x, y, shape) {
    if (!this.canPlace(shape, x, y, item.uid)) return false;
    this.remove(item.uid);
    for (const c of this.footprint(shape, x, y)) {
      this.cells[this.idx(c.x, c.y)] = item.uid;
    }
    this.items.set(item.uid, { item, x, y, shape: [...shape] });
    return true;
  }

  remove(uid) {
    const entry = this.items.get(uid);
    if (!entry) return false;
    for (const c of this.footprint(entry.shape, entry.x, entry.y)) {
      if (this.at(c.x, c.y) === uid) this.cells[this.idx(c.x, c.y)] = null;
    }
    this.items.delete(uid);
    return true;
  }

  clear() {
    this.cells.fill(null);
    this.items.clear();
  }

  /** 返回与指定 uid 正交相邻的其它 uid 集合 */
  neighbors(uid) {
    const entry = this.items.get(uid);
    if (!entry) return new Set();
    const out = new Set();
    for (const c of this.footprint(entry.shape, entry.x, entry.y)) {
      const probes = [
        { x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 },
      ];
      for (const p of probes) {
        const other = this.at(p.x, p.y);
        if (other && other !== uid) out.add(other);
      }
    }
    return out;
  }

  /** 找第一个能放下该形状的位置；找不到返回 null */
  findFreeSpot(shape) {
    for (let y = 0; y <= this.rows - shape.length; y++) {
      for (let x = 0; x <= this.cols; x++) {
        if (this.canPlace(shape, x, y)) return { x, y };
      }
    }
    return null;
  }

  /** 已用格数 */
  usedCells() {
    let n = 0;
    for (const v of this.cells) if (v) n++;
    return n;
  }
}
