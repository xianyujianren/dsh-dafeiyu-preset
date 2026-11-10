# 踩坑记录

## 1. 预设目录是「哑」的：必须由插件注册

`@deepseek-ai/dsh-agent-preset-registry` 的 Config 只有 `{ default, selectedDefault }`，全 asar 里没有 `readdir` 扫描 `.agent-presets` 的逻辑。
预设必须由某个插件调 `ctx.agentPresets.register()` 声明——这就是 `plugins/dsh-local-presets` 存在的全部理由。

**症状**：把目录复制过去、重启，预设选单里什么都没有。

## 2. `- id:` 不是「新增条目」

`cordis-plugin-include` 的 `applyPatches` 里：

```js
if (insert) { /* 新建条目 */ }
const target = entryMap.get(id);
if (!target) { warn('patch: entry %C not found', id); continue; }  // 静默跳过
```

所以 bundle 的 `cordis.patch.yml` 必须写：

```yaml
- insert:
    - id: my-plugin
      name: 'my-plugin'
```

写成 `- id: my-plugin` 只会在条目**已存在**时覆盖它；不存在就跳过，且 warn 只进 stderr（GUI 看不到）——表现就是「插件装了但像没装」。

## 3. 换版本后子路径导出消失

0.2.1 的 `@deepseek-ai/dsh-tool-subagent-control/list-agents` 是独立插件；0.2.2 起并入主入口，`exports` 里没有 `./list-agents`。
解析失败会让整份预设标「加载失败」，除非有预检兜底（`presets.config.json` → `preflight: true`）。

## 4. macOS 专用运行时在 Windows 上必崩

`dsh-whale-soul` 的 persona 行启动时 `await protection.initialize()`；保护层只实现 macOS seatbelt 读隔离，
Windows 上直接 `READ_ISOLATION_PLATFORM_UNSUPPORTED`。本预设不挂它。

## 5. 相对 .mjs 引用后的 `?v=N`

`agent.cordis.yml` 里 `./context-gate.mjs?v=2` 的 query 是热更新指纹：
改了 `.mjs` 要新会话生效，把 `v` 加一，或调 `dev_reload_preset`。

## 6. 配置文件被「自愈」回滚

如果你同时用了配置守护类插件（如 `dsh-config-guard`），它有「检查点对账」：重启后发现 patch 行数变少、
bundles 变多，会按重启前的检查点还原。手工改完配置如果被还原，先看该插件的 `state/pending.json`。
