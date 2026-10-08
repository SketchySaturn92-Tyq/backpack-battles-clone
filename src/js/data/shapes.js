/**
 * 形状系统：所有道具的占格形状都在这里定义与运算。
 *
 * 形状是字符网格数组，'X' 占格、'.' 空。
 *   ['X','X','X']   竖着的一把剑，1 宽 3 高
 *   ['XX','.X']     L 形，2 宽 2 高，占了 3 格
 *   ['.X.','XXX','.X.'] 十字形，3 宽 3 高，占了 5 格
 *
 * 整理玩法的根本前提：形状不规则、能旋转、格子有限，
 * 所以「怎么摆」本身就是决策，而不是把东西随便丢进去。
 */

/** 把形状展开成相对坐标列表 */
export function cells(shape) {
  const out = [];
  shape.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'X') out.push({ x, y });
    });
  });
  return out;
}

/** 形状占的格数 */
export function area(shape) {
  let n = 0;
  for (const row of shape) for (const ch of row) if (ch === 'X') n++;
  return n;
}

/** 外接尺寸 */
export function size(shape) {
  return {
    w: Math.max(...shape.map((r) => r.length)),
    h: shape.length,
  };
}

/** 顺时针旋转 90 度。旋转是整理的核心手段之一。 */
export function rotateCW(shape) {
  const { w, h } = size(shape);
  const g = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (shape[y]?.[x] === 'X' ? 'X' : '.')));
  const out = Array.from({ length: w }, () => Array(h).fill('.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = g[y][x];
    }
  }
  return out.map((r) => r.join(''));
}

/** 逆时针旋转 90 度 */
export function rotateCCW(shape) {
  return rotateCW(rotateCW(rotateCW(shape)));
}

/**
 * 旋转多少次能回到原样（1/2/4）。
 * 正方形对称形状旋转两次就复原，用来避免 UI 上出现重复朝向。
 */
export function rotationCycle(shape) {
  let s = shape;
  for (let i = 1; i <= 4; i++) {
    s = rotateCW(s);
    if (sameShape(s, shape)) return i;
  }
  return 4;
}

export function sameShape(a, b) {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row === b[i]);
}

/** 规范化为最小外接框，去掉四周空行空列，便于比较与展示 */
export function normalize(shape) {
  const cs = cells(shape);
  if (!cs.length) return ['.'];
  const minX = Math.min(...cs.map((c) => c.x));
  const minY = Math.min(...cs.map((c) => c.y));
  const maxX = Math.max(...cs.map((c) => c.x));
  const maxY = Math.max(...cs.map((c) => c.y));
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  for (const c of cs) grid[c.y - minY][c.x - minX] = 'X';
  return grid.map((r) => r.join(''));
}

/** 生成该形状的全部不同朝向（去重），供 UI 循环旋转 */
export function orientations(shape) {
  const out = [];
  let s = normalize(shape);
  for (let i = 0; i < 4; i++) {
    if (!out.some((o) => sameShape(o, s))) out.push(s);
    s = rotateCW(s);
  }
  return out;
}

/** 画成等宽字符串，用于测试失败时打印 */
export function debugDraw(shape) {
  return '\n' + shape.map((r) => '  ' + r).join('\n');
}
