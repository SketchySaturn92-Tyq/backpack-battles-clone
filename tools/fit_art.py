#!/usr/bin/env python3
"""
把道具立绘画布归一化到它的占格比例，让图在背包里能正好填满占格。

背景：
  道具在背包里用 object-fit: contain 渲染。设立绘内容比例为 ro、占格外接比例为 rs，
    - ro <= rs：高度方向填满，两侧留空隙，视觉上「填满格子」
    - ro >  rs：宽度方向被占格宽度卡住，高度填不满，看起来就是「立绘比格子小」
  所以只要保证每张图的画布比例等于 rs，且内容比例不超过 rs，立绘就不会显得小。

做法：
  1. 先按不透明像素裁掉四周透明边（内容框）
  2. 再按目标比例补透明边（只补不裁，绝不切掉物体本身）
  3. 内容长边统一放大到 96px（和其它图标同口径）

用法：
  python3 tools/fit_art.py            # 只报告，不改文件
  python3 tools/fit_art.py --write    # 归一化并写回 assets/icons/
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'assets' / 'icons'
BACKUP = ROOT / 'art' / 'icons_before_fit'
LONG_SIDE = 96
TOL = 0.02          # 画布比例允许的误差


def load_shapes():
    """从 items.js 读出每件道具的占格外接比例（用 node 跑，避免重复解析）。"""
    script = """
    import('./src/js/data/items.js').then(m => {
      const out = {};
      for (const it of m.ITEMS) {
        out[it.id] = {
          cols: Math.max(...it.shape.map(r => r.length)),
          rows: it.shape.length,
          area: it.shape.join('').split('X').length - 1,
          irregular: it.shape.join('').includes('.'),
        };
      }
      console.log(JSON.stringify(out));
    });
    """
    res = subprocess.run(['node', '-e', script], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def fit_one(path, target_ratio, write=False):
    """返回 (内容比, 画布比, 是否已达标)"""
    im = Image.open(path).convert('RGBA')
    bb = im.getbbox()
    if not bb:
        return None, None, False
    content = im.crop(bb)
    ro = content.width / content.height

    # 目标画布尺寸：内容长边 = LONG_SIDE，另一维按 target_ratio 补边
    if target_ratio >= 1:      # 横向占格：宽为长边
        w = LONG_SIDE
        h = max(content.height, round(w / target_ratio))
        w = max(w, round(h * target_ratio))
    else:                      # 竖向占格：高为长边
        h = LONG_SIDE
        w = max(content.width, round(h * target_ratio))
        h = max(h, round(w / target_ratio))

    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(content, ((w - content.width) // 2, (h - content.height) // 2))

    rc = canvas.width / canvas.height
    ok = abs(rc - target_ratio) <= TOL and ro <= target_ratio + TOL

    if write and ok:
        BACKUP.mkdir(parents=True, exist_ok=True)
        bak = BACKUP / path.name
        if not bak.exists():
            Image.open(path).save(bak)
        canvas.save(path)
    return ro, rc, ok


def main():
    write = '--write' in sys.argv
    shapes = load_shapes()
    rows, bad = [], []
    for iid, info in shapes.items():
        path = ICONS / f'{iid}.png'
        if not path.exists():
            print(f'缺图 {iid}')
            continue
        rs = info['cols'] / info['rows']
        ro, rc, ok = fit_one(path, rs, write=write)
        rows.append((iid, info, rs, ro, rc, ok))
        if not ok:
            bad.append((iid, info, rs, ro, rc))

    print(f"{'道具':<15}{'占格':<7}{'格数':<5}{'格比':<7}{'内容比':<8}{'画布比':<8}{'状态'}")
    for iid, info, rs, ro, rc, ok in sorted(rows, key=lambda r: r[0]):
        mark = 'OK' if ok else ('内容偏宽' if ro > rs + TOL else '画布待归一')
        print(f"{iid:<15}{str(info['cols'])+'x'+str(info['rows']):<7}{info['area']:<5}"
              f"{rs:<7.2f}{ro:<8.2f}{rc:<8.2f}{mark}")

    print(f"\n合计 {len(rows)} 件，达标 {len(rows)-len(bad)} 件，未达标 {len(bad)} 件")
    if bad:
        print('未达标明细（内容比 > 占格比，说明立绘本身画得太宽，只能重出图）：')
        for iid, info, rs, ro, rc in sorted(bad, key=lambda x: -(x[3] / x[2])):
            print(f"  {iid:<15} 占格 {info['cols']}x{info['rows']} ({rs:.2f})  内容 {ro:.2f}  宽出 {ro/rs:.2f}x")
    if write:
        print(f'\n已写回 assets/icons/，原件备份在 {BACKUP.relative_to(ROOT)}')
    else:
        print('\n（只报告，未改文件；加 --write 才写回）')


if __name__ == '__main__':
    main()
