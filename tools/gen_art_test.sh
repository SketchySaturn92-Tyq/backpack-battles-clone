#!/usr/bin/env bash
# 美术生成探针：先跑一个包，确认产出结构与成本
set -uo pipefail

cd "$HOME"
set -a
. "$HOME/.env"
set +a

RUNNER="$HOME/agent/skills/game-assets/meowart_api.py"
OUT="$HOME/apps/backpack-battles-clone/art/packs"

mkdir -p "$OUT"

echo "=== balance before ==="
python3 "$RUNNER" credits-balance 2>&1 | tail -12

echo "=== run: weapon pack ==="
python3 "$RUNNER" pixel-gen-run \
  --template-name weapon \
  --requirement "八件奇幻背包乱斗风格的像素武器道具，各自独立摆放：铁剑、匕首、战斧、木弓、法杖、长矛、锤子、飞镖" \
  --aspect-ratio 1:1 \
  --remove-bg-method advanced \
  --output-dir "$OUT/weapon" 2>&1 | tail -40

echo "=== balance after ==="
python3 "$RUNNER" credits-balance 2>&1 | tail -12

echo "=== outputs ==="
find "$OUT/weapon" -type f | head -40
