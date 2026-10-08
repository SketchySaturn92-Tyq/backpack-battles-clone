#!/usr/bin/env bash
# 补生成 v0.2 新增道具的图标（两批）
set -uo pipefail

cd "$HOME"
set -a
. "$HOME/.env"
set +a

RUNNER="$HOME/agent/skills/game-assets/meowart_api.py"
OUT="$HOME/apps/backpack-battles-clone/art/packs"
mkdir -p "$OUT" "$HOME/apps/backpack-battles-clone/art/logs"

run_pack () {
  local key="$1"; local preset="$2"; local desc="$3"
  echo ""
  echo "########## [$key] ##########"
  python3 "$RUNNER" pixel-gen-run \
    --template-name "$preset" \
    --requirement "$desc" \
    --aspect-ratio 1:1 \
    --remove-bg-method advanced \
    --output-dir "$OUT/$key" 2>&1 | tail -8
  echo "########## [$key] 结束 ##########"
}

# 1 新武器：长弓、双持斧、余烬之杖、毒刃、战锤、符文剑
run_pack weapon2 weapon \
  "六件奇幻像素武器各自独立居中放置：一把高瘦的长弓、一把双刃斧、一根顶端燃烧橙色火焰的深色法杖、一把滴着绿色毒液的短刃匕首、一把方头重锤、一把刃上带蓝色闪电纹的符文长剑。木质与金属质感，干净背景。"

# 2 新饰品与道具：荆棘披风、箭袋、血符、毒瓶、黄金神像、霜戒、凤凰羽
run_pack trinket2 object_2 \
  "七件奇幻像素道具各自独立居中放置：一件带尖刺的深绿披风、一个装满箭的棕色皮革箭袋、一块暗红色发光符文石、一个小玻璃毒药瓶、一座金色小神像、一枚淡蓝色霜冻戒指、一根发光的橙红色凤凰羽毛。干净背景。"

echo ""
echo "=== 补图完成 ==="
python3 "$RUNNER" credits-balance 2>&1 | tail -8
