#!/usr/bin/env bash
# 美术资源批量生成：按类别出图，每个包 8 张 64px 独立精灵。
# 结果落在 art/packs/<key>/ 下，后续用 tools/assign_icons.py 按图核对后映射到道具 id。
set -uo pipefail

cd "$HOME"
set -a
. "$HOME/.env"
set +a

RUNNER="$HOME/agent/skills/game-assets/meowart_api.py"
OUT="$HOME/apps/backpack-battles-clone/art/packs"
mkdir -p "$OUT"

run_pack () {
  local key="$1"; local preset="$2"; local desc="$3"
  echo ""
  echo "########## [$key] preset=$preset ##########"
  python3 "$RUNNER" pixel-gen-run \
    --template-name "$preset" \
    --requirement "$desc" \
    --aspect-ratio 1:1 \
    --remove-bg-method advanced \
    --output-dir "$OUT/$key" 2>&1 | tail -25
  echo "########## [$key] 结束 ##########"
}

# 1 武器（已单独跑过，这里保留同一脚本便于复现）
run_pack weapon weapon \
  "八件奇幻冒险风格的独立像素武器：铁匕首、短剑、木弓、长矛、战斧、顶端带火苗的火焰法杖、十字弩、厚重的巨剑。每件单独居中放置，木质与金属质感，干净背景。"

# 2 防具
run_pack armor object \
  "八件奇幻冒险风格的独立像素防具：小圆盾、棕色皮甲、木盾、银灰锁子甲、带红色鳞片的龙鳞甲。每件单独居中放置，金属与皮革质感，干净背景。"

# 3 食物与药剂
run_pack food food \
  "八件独立像素食物与药剂：圆面包、红苹果、棕色蘑菇、摆满烤肉的大餐盘、发光的紫色不死药瓶。每件单独居中放置，暖色、看起来能吃，干净背景。"

# 4 宝石
run_pack gem "矿石" \
  "八颗独立像素宝石：红色红宝石、蓝色蓝宝石、黄色黄玉、绿色祖母绿、发白光的贤者之石。每颗单独居中放置，切面高光、通透，干净背景。"

# 5 饰品
run_pack trinket object_2 \
  "八件独立像素饰品道具：系红绳的幸运符、棕色皮革腰带、沙漏、灰色磨刀石、绿色毒药瓶、带尖刺的荆棘披风。每件单独居中放置，干净背景。"

# 6 合成专属高阶道具
run_pack fused large_portrait \
  "四件传说级像素道具单独居中放置：交叉成 X 形的双刃匕首、泛蓝光的精钢长剑、厚重高大的塔盾、镶满红蓝黄绿宝石的金色王冠。带有金色描边与微光，干净背景。"

echo ""
echo "=== 全部包生成完毕 ==="
python3 "$RUNNER" credits-balance 2>&1 | tail -8
find "$OUT" -maxdepth 2 -name "*.png" | wc -l
