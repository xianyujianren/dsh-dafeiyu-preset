#!/usr/bin/env bash
# 大肥鱼 / 鲸鱼娘 预设安装脚本（macOS / Linux）
# 用法：bash install.sh [--dsh-home ~/.dsh] [--profile desktop] [--skip-plugin]
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="desktop"
SKIP_PLUGIN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home) DSH_HOME="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --skip-plugin) SKIP_PLUGIN=1; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
step() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

step "DSH 目录：$DSH_HOME   profile：$PROFILE"

# 1. 预设
PRESET_DST="$DSH_HOME/.agent-presets/whale-merge"
if [ -d "$PRESET_DST" ]; then
  mv "$PRESET_DST" "$PRESET_DST.bak-$TS"
  step "旧预设已挪到 $PRESET_DST.bak-$TS"
fi
mkdir -p "$PRESET_DST"
cp -R "$REPO_ROOT/preset/." "$PRESET_DST/"
step "预设已复制：$PRESET_DST（$(find "$PRESET_DST" -maxdepth 1 -type f | wc -l | tr -d ' ') 个文件）"

# 2. 技能
if [ -d "$REPO_ROOT/skills/casual-chat" ]; then
  mkdir -p "$DSH_HOME/skills/casual-chat"
  cp -R "$REPO_ROOT/skills/casual-chat/." "$DSH_HOME/skills/casual-chat/"
  step "技能已复制：$DSH_HOME/skills/casual-chat"
fi

# 3. 注册 dsh-local-presets
PLUGIN_DIR="$REPO_ROOT/plugins/dsh-local-presets"
PKG="$DSH_HOME/profiles/$PROFILE/package.json"
if [ "$SKIP_PLUGIN" = "1" ]; then
  step "跳过插件注册（--skip-plugin）"
elif [ ! -f "$PKG" ]; then
  echo "警告：找不到 $PKG —— 跳过注册（可用 --profile 指定）" >&2
elif ! command -v node >/dev/null 2>&1; then
  echo "警告：没有 node，无法改写 package.json。请手工加入：" >&2
  echo "  dependencies: \"dsh-local-presets\": \"file:$PLUGIN_DIR\"" >&2
  echo "  dsh.profile.bundles: \"dsh-local-presets\"" >&2
else
  cp "$PKG" "$PKG.bak-$TS"
  node - "$PKG" "$PLUGIN_DIR" <<'EOF'
const fs = require("fs");
const [pkgPath, pluginDir] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
j.dependencies = j.dependencies || {};
j.dependencies["dsh-local-presets"] = "file:" + pluginDir;
j.dsh = j.dsh || {};
j.dsh.profile = j.dsh.profile || {};
const bundles = (j.dsh.profile.bundles = j.dsh.profile.bundles || []);
if (!bundles.includes("dsh-local-presets")) bundles.push("dsh-local-presets");
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + "\n");
console.log("bundles=" + bundles.length + " deps=" + Object.keys(j.dependencies).length);
EOF
  step "已注册 dsh-local-presets（package.json 备份为 .bak-$TS）"
fi

echo
step "装完了。接下来："
echo "  1) 完全退出 DSH 再打开"
echo "  2) 新建会话 → 预设选单选「鲸鱼娘（大肥鱼）」"
echo "  3) 自检：node \"$PLUGIN_DIR/selftest.mjs\""
echo
echo "可选插件：dsh-mnemon / dsh-meme / dsh-memewiki / dsh-pet / dsh-cost-meter（见 docs/PREREQUISITES.md）"
