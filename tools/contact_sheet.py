#!/usr/bin/env python3
"""把每个美术包拼成一张对照图，方便人眼核对顺序与内容。"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "art" / "packs"
OUT = ROOT / "art" / "contact-sheet.png"

CELL = 96
PAD = 8
LABEL_H = 16

ORDER = ["weapon", "armor", "food", "gem", "trinket", "fused"]


def latest(key):
    base = PACKS / key
    subs = [d for d in base.iterdir() if d.is_dir()] if base.is_dir() else []
    return max(subs, key=lambda d: d.stat().st_mtime) if subs else None


rows = []
for key in ORDER:
    d = latest(key)
    if not d:
        continue
    sprites = sorted(p for p in d.glob("sprite_*.png") if p.stem != "sprite_pack_preview")
    rows.append((key, sprites))

max_cols = max((len(s) for _, s in rows), default=1)
W = PAD + max_cols * (CELL + PAD)
H = PAD + len(rows) * (CELL + LABEL_H + PAD)
sheet = Image.new("RGBA", (W, H), (24, 26, 34, 255))
dr = ImageDraw.Draw(sheet)

for r, (key, sprites) in enumerate(rows):
    y = PAD + r * (CELL + LABEL_H + PAD)
    for c, p in enumerate(sprites):
        x = PAD + c * (CELL + PAD)
        im = Image.open(p).convert("RGBA")
        im.thumbnail((CELL, CELL), Image.NEAREST)
        # 棋盘底，方便看透明区
        tile = Image.new("RGBA", (CELL, CELL), (60, 62, 72, 255))
        for ty in range(0, CELL, 16):
            for tx in range(0, CELL, 16):
                if (tx // 16 + ty // 16) % 2 == 0:
                    ImageDraw.Draw(tile).rectangle([tx, ty, tx + 15, ty + 15], fill=(78, 80, 92, 255))
        tile.alpha_composite(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
        sheet.alpha_composite(tile, (x, y))
        dr.text((x + 2, y + CELL + 2), f"{key[0]}{c}", fill=(230, 230, 240, 255))
    # 行标签
    dr.text((W - 70, y + 2), key, fill=(232, 179, 60, 255))

# 铺满背景，消除透明
flat = Image.new("RGB", sheet.size, (24, 26, 34))
flat.paste(sheet, mask=sheet.split()[3])
flat.save(OUT)
print(f"已生成 {OUT}  尺寸 {flat.size}")

for key, sprites in rows:
    print(f"{key}: {len(sprites)} 张")
