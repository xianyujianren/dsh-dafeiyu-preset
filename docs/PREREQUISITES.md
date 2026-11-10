# 前置依赖清单

> 版本号 = 这套预设在本机验证时的版本。别的版本大概率也能跑，遇到预设「加载失败」先按本文档对版本。

## 必需

| 组件 | 包名 | 验证版本 | 安装 |
|---|---|---|---|
| DSH 桌面端 | — | 0.2.1-rc.3 / 0.2.2-rc.1 | 官方安装包 |
| 预设注册器 | `dsh-local-presets` | 1.0.0（本仓库内置） | `install.ps1` 自动注册；或手工加 dependencies + bundles |
| 聊天技能 | `casual-chat` | 本仓库内置 | 复制到 `~/.dsh/skills/` |

## 建议（人格里点名用到的能力）

| 组件 | 包名 | 验证版本 | 装它为了什么 |
|---|---|---|---|
| 记忆 | `dsh-mnemon` | 0.5.39 | USER.md / MEMORY.md + `mnemon_recall` / `mnemon_view_route` 等 |
| 表情包 | `dsh-meme` | 0.1.62 | `send_meme` / `meme_list` |
| 梗百科 | `dsh-memewiki` | 0.1.2 | `search_meme_wiki`；源码 https://github.com/thawline/dsh-memewiki |
| 桌面宠物 | `dsh-pet` | 0.3.8 | 桌面上的鲸鱼本体 |
| 费用显示 | `dsh-cost-meter` | 1.9.39 | 每轮花费 |

安装（npm 上的包）：

```bash
dsh plugin --profile desktop add dsh-mnemon@0.5.39
dsh plugin --profile desktop add dsh-meme@0.1.62
dsh plugin --profile desktop add dsh-pet@0.3.8
dsh plugin --profile desktop add dsh-cost-meter@1.9.39
```

`dsh-memewiki` 不在 npm 时，克隆上游仓库后在 profile 里加 `link:<路径>` 依赖 + bundles 项。

## 不需要

- 不需要 `dsh-whale-soul`（macOS 专用运行时，Windows 上初始化必抛错）
- 不需要任何客户端侧补丁（本预设是纯内置 bundle，不注册 `dsh.client`）
