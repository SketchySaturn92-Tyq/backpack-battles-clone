#!/usr/bin/env python3
"""
按已人工核对的对照关系，把 art/packs/ 里的精灵复制成 assets/icons/<item_id>.png。

核对方式：tools/contact_sheet.py 生成对照图 → 人眼逐格确认 → 写进下面的 SOURCES。
每行是 (包名, 精灵序号, 道具 id)，精灵序号对应生成时 requirement 的从左到右顺序。

用法：
    python3 tools/assign_icons.py --list    # 只打印，不复制
    python3 tools/assign_icons.py           # 复制并写 art/icon_map.json
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "art" / "packs"
ICONS = ROOT / "assets" / "icons"

# (包名, 序号, 道具 id) —— 已按对照图逐格核对
SOURCES = [
    # 武器：铁匕首、短剑、木弓、长矛、战斧、火焰法杖、十字弩、巨剑
    ("weapon", 0, "dagger"), ("weapon", 1, "sword"), ("weapon", 2, "bow"), ("weapon", 3, "spear"),
    ("weapon", 4, "axe"), ("weapon", 5, "firestaff"), ("weapon", 6, "crossbow"), ("weapon", 7, "greatsword"),
    # 防具：小圆盾、皮甲、木盾、锁子甲、龙鳞甲
    ("armor", 0, "buckler"), ("armor", 1, "leather"), ("armor", 2, "woodshield"),
    ("armor", 3, "chainmail"), ("armor", 4, "dragonmail"),
    # 食物：面包、苹果、蘑菇、大餐、不死药
    ("food", 0, "bread"), ("food", 1, "apple"), ("food", 2, "mushroom"),
    ("food", 3, "feast"), ("food", 4, "elixir"),
    # 宝石：红宝石(菱形红)、蓝宝石、黄玉(水滴)、祖母绿、贤者之石(黑色星芒)
    ("gem", 4, "ruby"), ("gem", 1, "sapphire"), ("gem", 2, "topaz"),
    ("gem", 3, "emerald"), ("gem", 7, "sagesStone"),
    # 饰品：幸运符、腰带、沙漏、磨刀石、毒药瓶、荆棘披风
    ("trinket", 0, "charm"), ("trinket", 1, "belt"), ("trinket", 2, "hourglass"),
    ("trinket", 3, "whetstone"), ("trinket", 4, "poisonvial"), ("trinket", 5, "thornmail"),
    # 合成专属：狮徽大盾
    ("fused", 1, "towerShield"),
    # v0.2 新增武器（weapon2 包，已按对照图逐格核对）
    # 0 长弓、1 双刃斧、2 火焰法杖、3 滴毒匕首、4 方头战锤、5 蓝色符文长剑
    ("weapon2", 0, "longbow"), ("weapon2", 1, "dualAxe"), ("weapon2", 2, "emberStaff"),
    ("weapon2", 3, "venomDagger"), ("weapon2", 4, "hammer"), ("weapon2", 5, "runeblade"),
    # v0.2 新增饰品（trinket2 包）
    # 0 带尖刺的绿披风、1 箭袋、2 红色符文石、3 绿毒瓶、4 金色神像、5 霜冻戒指、6 凤凰羽
    ("trinket2", 0, "thornCloak"), ("trinket2", 1, "quiver"), ("trinket2", 2, "bloodCharm"),
    ("trinket2", 3, "poisonFlask"), ("trinket2", 4, "goldenIdol"),
    ("trinket2", 5, "frostRing"), ("trinket2", 6, "phoenixFeather"),
    # 复用旧包备用张：护甲 5 银甲 → 荆棘重甲、6 蓝色菱形盾 → 神盾
    ("armor", 5, "brambleHide"), ("armor", 6, "aegis"),
    # 食物 7 红瓶药剂 → 小药水；宝石 5 紫色宝石 → 冰晶（颜色偏紫，待重出）
    ("food", 7, "potion"), ("gem", 5, "iceCrystal"),
]

# 输出统一边长（像素风用整数倍缩放 + 固定画布，保证每张图对齐一致）
CANVAS = 96


def latest_pack_dir(key: str):
    base = PACKS / key
    if not base.is_dir():
        return None
    subs = [d for d in base.iterdir() if d.is_dir()]
    return max(subs, key=lambda d: d.stat().st_mtime) if subs else None


def sprite_path(key: str, index: int):
    d = latest_pack_dir(key)
    if not d:
        return None, f"包 {key} 不存在"
    p = d / f"sprite_{index:02d}.png"
    if not p.exists():
        return None, f"{key} 缺少 sprite_{index:02d}.png"
    return p, None


def normalize(src: Path, dst: Path):
    """裁到内容边界后整数倍放大，保持原始宽高比。

    刻意不补成正方形画布：物品图要直接铺进形状框，
    如果四周有透明留白，contain 时会整体缩一圈，看起来又是「小图配大方块」。
    保持内容比例，长条形的武器才能在 1×3 的框里真正撑满。
    """
    im = Image.open(src).convert("RGBA")
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    longest = max(im.size)
    scale = max(1, CANVAS // longest)
    out = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    out.save(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    ICONS.mkdir(parents=True, exist_ok=True)
    done, problems, spare = [], [], []

    used = {}
    for key, idx, item_id in SOURCES:
        used.setdefault(key, set()).add(idx)

    for key, idx, item_id in SOURCES:
        src, err = sprite_path(key, idx)
        if err:
            problems.append(f"{item_id}: {err}")
            print(f"[缺] {item_id:12s} {err}")
            continue
        dst = ICONS / f"{item_id}.png"
        if not args.list:
            normalize(src, dst)
        size = Image.open(src).size if not args.list else Image.open(src).size
        done.append({"id": item_id, "from": str(src.relative_to(ROOT)), "size": size})
        print(f"[映射] {item_id:12s} ← {key}#{idx}  {size}")

    # 报告每个包里没用上的精灵，方便以后补道具
    for key in {k for k, _, _ in SOURCES}:
        d = latest_pack_dir(key)
        if not d:
            continue
        all_idx = sorted(
            int(p.stem.split("_")[1]) for p in d.glob("sprite_*.png")
            if p.stem != "sprite_pack_preview"
        )
        left = [i for i in all_ids(all_idx) if i not in used.get(key, set())]
        for i in left:
            spare.append(f"{key}#{i}")

    if spare:
        print(f"\n[备用] {len(spare)} 张未使用：{'、'.join(spare)}")
        print("        （可留给后续版本的新道具，原始文件仍在 art/packs/ 下）")

    if not args.list:
        (ROOT / "art" / "icon_map.json").write_text(
            json.dumps({"assigned": done, "missing": problems, "spare": spare},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n已生成 {len(done)} 个图标 → assets/icons/")

    if problems:
        print(f"\n有 {len(problems)} 项没配上：")
        for p in problems:
            print("  - " + p)
        return 1
    return 0


def all_ids(idxs):
    return idxs


if __name__ == "__main__":
    sys.exit(main())
