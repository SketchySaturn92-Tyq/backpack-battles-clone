/**
 * 背包布（Cloth）
 *
 * 机制：
 *   舞台是固定的 9（横）× 7（竖）区域，本身完全透明，只用来定位。
 *   玩家真正能用的是「铺在舞台上的布」—— 只有布覆盖到的格子才能放装备。
 *   布有自己的形状（规则或不规则），可以移动、水平翻转、旋转；
 *   商店卖的也是布，买到更大的或形状更巧的布就等于扩容。
 *
 * 形状写法与道具一致：'X' 占格，'.' 空。
 */

/** 舞台尺寸：横 9 × 竖 7 */
export const STAGE = { cols: 9, rows: 7 };

/** 舞台单格边长（像素）。用户要求至少 64，且固定不缩放 */
export const CELL = 64;

/**
 * 布的定义。
 *   shape  布盖住的格子
 *   price  商店售价；0 表示开局自带
 *   fx     翻转/旋转后形状会变，所以布只存「原始形状 + 变换状态」
 */
export const CLOTHS = [
  {
    id: 'cloth-small', name: '小背包布', price: 0, starter: true,
    shape: [
      'XXXXX',
      'XXXXX',
      'XXXXX',
      'XXXXX',
    ],
    desc: '开局自带的一块布，20 格。',
  },
  {
    id: 'cloth-wide', name: '宽背包布', price: 18,
    shape: [
      'XXXXXXX',
      'XXXXXXX',
      'XXXXXXX',
    ],
    desc: '横着铺开，适合摆长条武器。',
  },
  {
    id: 'cloth-tall', name: '高背包布', price: 18,
    shape: [
      'XXXXX',
      'XXXXX',
      'XXXXX',
      'XXXXX',
      'XXXXX',
    ],
    desc: '竖着更高，方便叠成一列。',
  },
  {
    id: 'cloth-big', name: '大背包布', price: 30,
    shape: [
      'XXXXXX',
      'XXXXXX',
      'XXXXXX',
      'XXXXXX',
      'XXXXXX',
    ],
    desc: '规整的大块，30 格。',
  },
  {
    id: 'cloth-corner', name: '缺角背包布', price: 26,
    shape: [
      'XXXXXX',
      'XXXXXX',
      'XXXXX.',
      'XXXXX.',
    ],
    desc: '右上角缺一块，摆位要顺着它的形状来。',
  },
  {
    id: 'cloth-l', name: 'L 形背包布', price: 32,
    shape: [
      'XXX....',
      'XXX....',
      'XXX....',
      'XXXXXXX',
      'XXXXXXX',
    ],
    desc: '整块 L 形，27 格，拐角处特别能塞。',
  },
  {
    id: 'cloth-cross', name: '十字背包布', price: 34,
    shape: [
      '..XXX..',
      '..XXX..',
      'XXXXXXX',
      'XXXXXXX',
      '..XXX..',
    ],
    desc: '十字形，中段最宽，四角收窄。',
  },
  {
    id: 'cloth-fork', name: '双叉背包布', price: 34,
    shape: [
      'XXX.XXX',
      'XXX.XXX',
      'XXX.XXX',
      'XXXXXXX',
      'XXXXXXX',
    ],
    desc: '中间留一条缝，两块区域各自成形。',
  },
];

export const CLOTH_BY_ID = Object.fromEntries(CLOTHS.map((c) => [c.id, c]));

export const STARTER_CLOTH = CLOTHS.find((c) => c.starter) || CLOTHS[0];

/** 商店里卖的布（排除开局自带那块） */
export function shopCloths() {
  return CLOTHS.filter((c) => !c.starter);
}

/** 一块布占多少格 */
export function clothArea(shape) {
  let n = 0;
  for (const row of shape) for (const ch of row) if (ch === 'X') n++;
  return n;
}

export function clothSize(shape) {
  return { w: Math.max(...shape.map((r) => r.length)), h: shape.length };
}

/** 水平翻转 */
export function flipShape(shape) {
  return shape.map((row) => [...row].reverse().join(''));
}

/** 顺时针旋转 90 度 */
export function rotateShape(shape) {
  const { w, h } = clothSize(shape);
  const grid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (shape[y]?.[x] === 'X' ? 'X' : '.')));
  const out = Array.from({ length: w }, () => Array(h).fill('.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[x][h - 1 - y] = grid[y][x];
  }
  return out.map((r) => r.join(''));
}

/**
 * 把「原始形状 + 变换状态」还原成实际形状。
 * 顺序固定：先翻转，再旋转。
 */
export function resolvedShape(baseShape, { flipped = false, rotation = 0 } = {}) {
  let s = baseShape;
  if (flipped) s = flipShape(s);
  for (let i = 0; i < (rotation % 4 + 4) % 4; i++) s = rotateShape(s);
  return s;
}

/**
 * 布能放下的锚点范围：让布完整落在舞台内。
 */
export function clothFits(cls, shape, x, y) {
  const { w, h } = clothSize(shape);
  return x >= 0 && y >= 0 && x + w <= STAGE.cols && y + h <= STAGE.rows;
}

/** 布居中摆放时建议的锚点 */
export function centeredAnchor(shape) {
  const { w, h } = clothSize(shape);
  return {
    x: Math.max(0, Math.floor((STAGE.cols - w) / 2)),
    y: Math.max(0, Math.floor((STAGE.rows - h) / 2)),
  };
}
