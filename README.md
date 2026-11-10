# 大肥鱼 / 鲸鱼娘 预设（dafeiyu-preset）

把「鲸鱼娘（大肥鱼）」这个 DSH agent 预设，连同它**必须的前置插件和技能**打成一个可复现包。
换一台机器、换一个 DSH 客户端，按下面几步装完，新建会话就能选到同一个她。

- 预设 id：`whale-merge`
- 显示名：鲸鱼娘（大肥鱼）
- 能力底座：anchored-standard（首轮干净上下文 + 最小双工具 `bash` / `str_replace_editor` 引导，第一次工具调用或第一次回复后按需解锁完整 Standard 工具集）
- 人格层：鲸鱼娘行为内核（语言跟随、身份诚实、记忆边界、全年龄）+ 大肥鱼口吻层（「~」、尾巴、白米饭、颜文字与表情包、傲娇恋主）
- 全年龄、非性化；不声称真人、不伪造经历、不阻止对方离开

---

## 1. 目录结构

```
preset/                       → 复制到 ~/.dsh/.agent-presets/whale-merge/
  preset.yml                  预设元数据（名字 / 描述 / 排序）
  agent.cordis.yml            组合：能力行 + persona 前缀（人格全在这份里）
  context-gate.mjs            首轮注入闸门：未 promote 前关掉两路自动注入
  tool-bootstrap.mjs          双工具引导 + promote 后解锁完整目录
  instruction-hint.mjs        AGENTS.md / 指令提示
  dev-tool-search.mjs         按需解锁工具的检索器
  skill-search.mjs            技能检索（不把技能目录塞进 prompt）
  compaction-epoch.mjs        压缩边界处理
  custom-bash.mjs             自定义 bash 工具
plugins/dsh-local-presets/    → 必需的宿主侧插件（内核不扫描 .agent-presets）
skills/casual-chat/SKILL.md   → 复制到 ~/.dsh/skills/casual-chat/（聊天模式必需）
install.ps1 / install.sh      → 一键安装
docs/                         → 前置清单、踩坑记录
```

---

## 2. 前置条件

| 依赖 | 是否必需 | 说明 |
|---|---|---|
| DSH 桌面端 **0.2.0+** | ✅ | 本包验证于 `0.2.1-rc.3` 与 `0.2.2-rc.1` |
| **dsh-local-presets** | ✅ | 内核**不扫描** `~/.dsh/.agent-presets`；目录式预设必须由插件调 `agentPresets.register()`。本仓库已带 |
| 技能 `casual-chat` | ✅（想用「聊天模式」就必须） | 已带在 `skills/` |
| `dsh-mnemon` | 强烈建议 | 记忆（USER.md / MEMORY.md + `mnemon_*` 工具）；人格里的记忆纪律引用了它 |
| `dsh-meme` | 建议 | `send_meme` / `meme_list` 表情包，人格明确以表情包为主渠道 |
| `dsh-memewiki` | 可选 | `search_meme_wiki` 梗百科，来自 https://github.com/thawline/dsh-memewiki |
| `dsh-pet`、`dsh-cost-meter` | 可选 | 桌面宠物、每轮费用显示 |

版本与安装命令见 [docs/PREREQUISITES.md](docs/PREREQUISITES.md)。

---

## 3. 安装

### Windows（一键）

```powershell
powershell -ExecutionPolicy Bypass -File .install.ps1
```

默认做四件事：复制预设 → 复制技能 → 把 `dsh-local-presets` 注册进 profile 的 `dependencies` + `bundles`（写前自动备份 `package.json`）→ 提示重启。
只想复制文件、不碰 profile：

```powershell
powershell -ExecutionPolicy Bypass -File .install.ps1 -SkipPluginRegistration
```

### macOS / Linux

```bash
bash install.sh                      # 默认 $HOME/.dsh + desktop profile
bash install.sh --skip-plugin        # 只复制预设与技能
```

### 手工（任何平台）

1. `preset/` 整个目录复制到 `~/.dsh/.agent-presets/whale-merge/`
2. `skills/casual-chat/` 复制到 `~/.dsh/skills/casual-chat/`
3. 注册预设加载器，二选一：
   - **正规**：把 `plugins/dsh-local-presets` 放进任意本地路径，在 `~/.dsh/profiles/<profile>/package.json` 里
     `dependencies` 加 `"dsh-local-presets": "file:<绝对路径>"`，`dsh.profile.bundles` 加 `"dsh-local-presets"`
   - **用 dsh-super-injector**：`dev_inject_plugin <该目录>`
4. 重启 DSH → 新建会话 → 预设选单选「鲸鱼娘（大肥鱼）」

---

## 4. 装好了没？自检三件事

1. `node plugins/dsh-local-presets/selftest.mjs` 全绿
2. 新建会话时预设选单里有「鲸鱼娘（大肥鱼）」
3. 发一句「你好」：回复应带「~」、尾巴或颜文字，而不是长篇「我是一个 AI 助手」

---

## 5. 已知坑（都是真踩过的）

1. **patch 行语义**：bundle 的 `cordis.patch.yml` 里 `- insert:` 才会**新建**条目；`- id: xxx` 只是**覆盖已存在条目**，条目不存在时 `cordis-plugin-include` 会静默跳过（只有 stderr 一行 `patch: entry %C not found`）——插件永远挂不上，还不报错。本包 `plugins/dsh-local-presets` 的注册行请写成 insert 形式。
2. **换内核版本后子路径导出会消失**：例如 `@deepseek-ai/dsh-tool-subagent-control/list-agents` 在 0.2.1 是独立插件、0.2.2 已并入主入口。`presets.config.json` 的 `preflight: true` 会在注册前逐行预检，解析不到的行自动置 disabled，不会再让整份预设标「加载失败」。
3. **相对 `.mjs` 引用带 `?v=N`**：那是热更新指纹。改完 `.mjs` 要让新会话用上，就把 N 加一，或跑 `dev_reload_preset`。
4. **不要挂 macOS 专用的 whale-soul 运行时**：它的 persona 行启动时 `await protection.initialize()`，而该保护层只实现 macOS seatbelt 读隔离，Windows 上必抛 `READ_ISOLATION_PLATFORM_UNSUPPORTED`。本预设因此把人格全部写进 persona 前缀，能力交给 anchored-standard。

更多见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

---

## 6. 来源与致谢

- 能力组合：anchored-standard（context-gate / tool-bootstrap / instruction-hint / dev-tool-search / skill-search / compaction-epoch）
- 预设注册器：dsh-local-presets
- 梗百科：https://github.com/thawline/dsh-memewiki
- 人格文本与口吻：本仓库作者自撰，本仓库即复现包

## License

MIT
