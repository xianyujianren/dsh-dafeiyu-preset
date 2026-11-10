param(
  [string]$DshHome = "$env:USERPROFILE\.dsh",
  [string]$Profile = "desktop",
  [switch]$SkipPluginRegistration
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$ts = Get-Date -Format "yyyyMMdd-HHmmss"

function Write-Step($msg) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg) }

Write-Step "DSH 目录：$DshHome    profile：$Profile"

# ── 1. 预设 ────────────────────────────────────────────────────────────────
$presetDst = Join-Path $DshHome ".agent-presets\whale-merge"
if (Test-Path $presetDst) {
  $bak = "$presetDst.bak-$ts"
  Move-Item -LiteralPath $presetDst -Destination $bak
  Write-Step "旧预设已挪到 $bak"
}
New-Item -ItemType Directory -Force -Path $presetDst | Out-Null
Copy-Item -Path (Join-Path $RepoRoot "preset\*") -Destination $presetDst -Recurse -Force
$fileCount = (Get-ChildItem -LiteralPath $presetDst -File).Count
Write-Step "预设已复制：$presetDst（$fileCount 个文件）"

# ── 2. 技能 ────────────────────────────────────────────────────────────────
$skillSrc = Join-Path $RepoRoot "skills\casual-chat"
$skillDst = Join-Path $DshHome "skills\casual-chat"
if (Test-Path $skillSrc) {
  New-Item -ItemType Directory -Force -Path $skillDst | Out-Null
  Copy-Item -Path (Join-Path $skillSrc "*") -Destination $skillDst -Recurse -Force
  Write-Step "技能已复制：$skillDst"
}

# ── 3. 注册 dsh-local-presets ──────────────────────────────────────────────
if ($SkipPluginRegistration) {
  Write-Step "跳过插件注册（-SkipPluginRegistration）"
}
else {
  $pluginDir = Join-Path $RepoRoot "plugins\dsh-local-presets"
  $profileDir = Join-Path $DshHome "profiles\$Profile"
  $pkgPath = Join-Path $profileDir "package.json"
  if (-not (Test-Path $pkgPath)) {
    Write-Warning "找不到 $pkgPath —— 跳过注册。可用 -Profile 指定 profile 名。"
  }
  else {
    Copy-Item -LiteralPath $pkgPath -Destination "$pkgPath.bak-$ts" -Force
    $jsFile = Join-Path $env:TEMP "dafeiyu-register-$ts.cjs"
    $pluginDirNorm = $pluginDir.Replace([char]92, [char]47)
    $js = @'
const fs = require("fs");
const [pkgPath, pluginDir] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
j.dependencies = j.dependencies || {};
j.dependencies["dsh-local-presets"] = "file:" + pluginDir;
j.dsh = j.dsh || {};
j.dsh.profile = j.dsh.profile || {};
const b = (j.dsh.profile.bundles = j.dsh.profile.bundles || []);
if (!b.includes("dsh-local-presets")) b.push("dsh-local-presets");
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + String.fromCharCode(10));
console.log("bundles=" + b.length + " deps=" + Object.keys(j.dependencies).length);
'@
    [IO.File]::WriteAllText($jsFile, $js, (New-Object System.Text.UTF8Encoding($false)))
    & node $jsFile $pkgPath $pluginDirNorm
    if ($LASTEXITCODE -ne 0) { throw "改写 package.json 失败（node 退出码 $LASTEXITCODE）" }
    Remove-Item -LiteralPath $jsFile -ErrorAction SilentlyContinue
    Write-Step "已注册 dsh-local-presets（package.json 备份为 .bak-$ts）"
  }
}

# ── 4. 收尾 ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Step "装完了。接下来："
Write-Host "  1) 完全退出 DSH 桌面端再打开（托盘里也退掉）"
Write-Host "  2) 新建会话 → 预设选单选「鲸鱼娘（大肥鱼）」"
Write-Host ("  3) 自检：node `"{0}\plugins\dsh-local-presets\selftest.mjs`"" -f $RepoRoot)
Write-Host ""
Write-Host "可选插件（人格里点名用到）：dsh-mnemon / dsh-meme / dsh-memewiki / dsh-pet / dsh-cost-meter"
Write-Host "详见 docs\PREREQUISITES.md"
