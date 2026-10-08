# 像素角色立绘生成报告（Meowa / game-assets）

日期：2026-10-08
执行者：XiaoBa 子代理（本机）
范围：只为背包管理自走棋生成 8 个 64px 像素角色立绘，未改动任何游戏源码，未提交 git。

## 1. 实际使用的完整命令

用 setsid nohup 后台执行（单条 shell，避免超时被杀）：

```
cd /srv/catsco-agent/apps/backpack-battles-clone && mkdir -p art/logs art/packs/chars && setsid nohup bash -c 'set -a; . "$HOME/.env"; set +a; python3 "$HOME/agent/skills/game-assets/meowart_api.py" pixel-gen-run --template-name general_character_64px --requirement "八名奇幻冒险者像素立绘，各自独立居中站立、面朝右方、全身像：重甲剑士、皮甲弓箭手、长袍法师、双斧狂战士、持大盾的圣骑士、轻装双匕刺客、冰霜女巫、德鲁伊。每名角色风格统一，干净背景。" --aspect-ratio 1:1 --remove-bg-method advanced --output-dir /srv/catsco-agent/apps/backpack-battles-clone/art/packs/chars' > art/logs/chars.log 2>&1 < /dev/null & disown
```

CLI：/srv/catsco-agent/agent/skills/game-assets/meowart_api.py
日志：art/logs/chars.log
Skill 版本告警：安装版 2026.09.29.1，最新 2026.10.06.1（仅告警，命令继续执行，未升级）。

## 2. Job 与产物

- api_job_id：job_abde2fe969264c15b4b7d073bcaa51b3
- status：success（stage=completed progress=100%）
- outputs count=10
- 输出目录：
  /srv/catsco-agent/apps/backpack-battles-clone/art/packs/chars/八名奇幻冒险者像素立绘_各自独立居中站立_面朝右方_全身像_重甲剑士_皮甲弓箭手_03e81f40/
- 生成后余额：总 244 → 224 credits，本次实际消耗 20 credits（低于预估的 32）

## 3. 验收结果（python3 + PIL）

8 个 sprite 全部通过，均为 64x64 / RGBA，四角 alpha=0，抠图干净：

| 文件 | 尺寸 | mode | 非透明像素占比 | 判定 |
|---|---|---|---|---|
| sprite_00.png | 64x64 | RGBA | 0.348 | 通过 |
| sprite_01.png | 64x64 | RGBA | 0.381 | 通过 |
| sprite_02.png | 64x64 | RGBA | 0.382 | 通过 |
| sprite_03.png | 64x64 | RGBA | 0.365 | 通过 |
| sprite_04.png | 64x64 | RGBA | 0.430 | 通过 |
| sprite_05.png | 64x64 | RGBA | 0.275 | 通过 |
| sprite_06.png | 64x64 | RGBA | 0.353 | 通过 |
| sprite_07.png | 64x64 | RGBA | 0.445 | 通过 |

全部落在 0.05~0.8 合理区间；四角像素均为 (255,255,255,0)，说明背景已被 advanced 抠除。
另有 sprite_pack_preview.png（256x256 RGBA）为 2x2 缩略预览，非立绘本体。

## 4. 逐个角色描述（按 sprite_00 → sprite_07 顺序）

- sprite_00：全身银灰板甲，头盔带蓝灰面罩纹，深蓝披风，右手持一把长剑斜指下方。主色调银灰 + 深蓝，典型重甲剑士。
- sprite_01：棕色短发，身穿绿棕色皮甲、披绿色斗篷，双手持一把棕色长弓；背后可见箭袋。主色调棕 + 绿，典型皮甲弓箭手/游侠。
- sprite_02：紫色尖顶法师帽 + 紫色长袍带金色镶边，右手持一根顶端嵌蓝色宝石的橡木法杖，身周有金色星光点缀。主色调紫 + 金，典型长袍法师。
- sprite_03：赤膊上身、露出胸腹肌肉与纹身，红棕色头发与络腮胡，双手各持一把灰色单刃斧，下身棕色短裤、皮靴。主色调肉肤 + 棕 + 钢灰，典型双斧狂战士。
- sprite_04：银白重甲骑士，头顶金色十字盔饰，左手持一面带金色十字纹的大盾，右手握剑，腰披深蓝披风。主色调银白 + 金，典型持盾圣骑士。
- sprite_05：全身黑色忍者装束，黑色头套只露出眼部，双手各持一把深灰弯刀，腰间棕色皮带，无披风。主色调纯黑 + 深灰，典型轻装双匕刺客。
- sprite_06：浅蓝长发女性，穿浅蓝色开衩长袍/长裙，右手托起一枚蓝色冰晶，身周漂浮雪花与冰霜光点。主色调冰蓝 + 白，典型冰霜女巫。
- sprite_07：棕色鹿角头饰，身披棕绿色德鲁伊斗篷，手中持一根缠有红花/红玫瑰的木杖（杖顶有花朵）。主色调棕 + 绿 + 红点缀，典型德鲁伊。

## 5. 六个职业的建议 index 映射

8 张立绘与需求描述顺序高度一致，可一一对应。针对要求的六个职业，建议映射如下：

- 剑士 sword：sprite_00（银灰重甲持长剑）
- 弓箭手 archer：sprite_01（皮甲持长弓 + 箭袋）
- 法师 mage：sprite_02（紫袍尖帽持宝石法杖）
- 狂战士 berserker：sprite_03（赤膊双斧）
- 圣骑士 paladin：sprite_04（重甲持十字大盾）
- 刺客 assassin：sprite_05（黑衣忍者双弯刀）

剩余两张作为扩展职业备用：
- 冰霜女巫 frost_witch：sprite_06
- 德鲁伊 druid：sprite_07

建议映射表（index → 职业）：

```
0 → sword / 剑士
1 → archer / 弓箭手
2 → mage / 法师
3 → berserker / 狂战士
4 → paladin / 圣骑士
5 → assassin / 刺客
6 → frost_witch / 冰霜女巫（扩展）
7 → druid / 德鲁伊（扩展）
```

说明：刺客需求写的是「双匕」，实际 sprite_05 手持的是双弯刀（短刃），造型上可当匕首用，如后续要更贴合可考虑再生成，但本次不追加消耗。

## 6. 备注

- 本次只跑了 1 次生成，符合「只准跑 1 次」的限制。
- 未改动游戏源码，未执行 git 提交。
- 中间校验脚本与放大图放在 tmp/ 下（tmp/inspect_chars.py、tmp/chars-verify.json 等），属临时文件。
