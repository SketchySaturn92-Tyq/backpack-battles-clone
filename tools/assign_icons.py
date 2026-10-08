#!/usr/bin/env python3
"""
把 art/packs/ 下生成好的精灵按顺序映射到道具 id，输出到 assets/icons/。

用法：
    python3 tools/assign_icons.py            # 扫描并复制
    python3 tools/assign_icons.py --list     # 只看映射，不复制

映射规则写在 ICON_MAP 里：包名 → [道具 id 顺序]，
顺序与生成时的 requirement 描述顺序一致（同一批 sprite_00..07 按描述从左到右）。
人工核对过就固定，不再依赖自动识别。
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "art" / "packs"
ICONS = ROOT / "assets" / "icons"

# 生成顺序 → 道具 id；未映射到的会落到 _unmapped
ICON_MAP = {
    "weapon": ["dagger", "sword", "bow", "spear", "axe", "firestaff", "crossbow", "greatsword"],
    "armor": ["buckler", "leather", "woodshield", "chainmail", "dragonmail"],
    "food": ["bread", "apple", "mushroom", "feast", "elixir"],
    "gem": ["ruby", "sapphire", "topaz", "emerald", "sagesStone"],
    "trinket": ["charm", "belt", "hourglass", "whetstone", "poisonvial", "thornmail"],
    "fused": ["twinDagger", "steelSword", "towerShield", "gemCrown"],
}


def latest_pack_dir(key: str):
    """一个包名下可能有多次运行，取最新那次。"""
    base = PACKS / key
    if not base.is_dir():
        return None
    subs = [d for d in base.iterdir() if d.is_dir()]
    if not subs:
        return None
    return max(subs, key=lambda d: d.stat().st_mtime)


def collect_sprites(pack_dir: Path):
    """只取编号精灵，排除预览拼图。"""
    sprites = sorted(p for p in pack_dir.glob("sprite_*.png") if p.stem != "sprite_pack_preview")
    return sprites


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="只打印映射结果")
    args = ap.parse_args()

    ICONS.mkdir(parents=True, exist_ok=True)
    report = {"assigned": [], "missing_pack": [], "spare": []}

    for key, ids in ICON_MAP.items():
        pack_dir = latest_pack_dir(key)
        if not pack_dir:
            report["missing_pack"].append(key)
            print(f"[缺] 包 {key} 还没生成")
            continue
        sprites = collect_sprites(pack_dir)
        if not sprites:
            report["missing_pack"].append(key)
            print(f"[缺] 包 {key} 下没有 sprite_*.png")
            continue

        for i, item_id in enumerate(ids):
            if i >= len(sprites):
                print(f"[缺图] {key} 只出了 {len(sprites)} 张，{item_id} 没图")
                continue
            src = sprites[i]
            dst = ICONS / f"{item_id}.png"
            report["assigned"].append({"id": item_id, "from": str(src.relative_to(ROOT))})
            if not args.list:
                shutil.copy2(src, dst)
            print(f"[映射] {item_id:12s} ← {src.name}")

        for extra in sprites[len(ids):]:
            report["spare"].append(str(extra.relative_to(ROOT)))

    if report["spare"]:
        print(f"\n[多余] {len(report['spare'])} 张没被映射，可人工挑选替换")

    if not args.list:
        (ROOT / "art" / "icon_map.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n已写入 {ICONS.relative_to(ROOT)}/ 共 {len(report['assigned'])} 张")
        print(f"映射清单：art/icon_map.json")

    return 0 if not report["missing_pack"] else 1


if __name__ == "__main__":
    sys.exit(main())
