/** 道具的展示样式：稀有度、类别、图标路径。图标缺失时用色块兜底。 */

import { CATEGORIES, RARITY } from '../data/items.js';

/** 图标按道具 id 命名；缺图时返回内置 SVG 占位。 */
export function iconFor(item) {
  return `assets/icons/${item.id}.png`;
}

export function styleFor(item) {
  return {
    icon: iconFor(item),
    tierLabel: `T${item.tier}`,
    rarityColor: (RARITY[item.tier] || RARITY[1]).color,
    catName: (CATEGORIES[item.cat] || { name: item.cat }).name,
  };
}

export function placeholderSvg(color, letter) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect width="32" height="32" rx="6" fill="${color}"/>
    <text x="16" y="22" font-size="16" text-anchor="middle" fill="#fff">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
