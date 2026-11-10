/**
 * dsh-local-presets — 让 `~/.dsh/.agent-presets/<id>/` 里的"目录式预设"真正出现在 DSH 预设选单里
 * ============================================================================================
 *
 * 为什么需要这个插件（2026-10-11 实测结论）
 * ----------------------------------------
 * 多个预设仓库（anchored-standard、dsh-routing-suite 等）的 README 都写「把预设目录复制到
 * `~/.dsh/.agent-presets/` 再重启即可」。这在 DSH 0.2.0-rc.2 上**不成立**：
 *
 *   1. `@deepseek-ai/dsh-agent-preset-registry` 的 Config 只有 `{ default, selectedDefault }`，
 *      没有任何目录/扫描项；
 *   2. 全 app.asar 搜 `agent-presets` 只命中 5 处字符串（一个插件名 + 两个客户端 UI section id），
 *      **没有任何 readdir / 扫描逻辑**；
 *   3. 注册表源码写明 `register(definition)` 的参数是
 *      "Parsed configuration supplied by **the declaring plugin**" —— 预设必须由**插件显式声明**；
 *   4. dsh-super-injector 对 `.agent-presets/` 只读不注册，它只给 `.mjs` 引用打 `?v=N` 指纹（热更新用）。
 *
 * 所以目录本身是"哑"的：它是**热更新指纹的落点**，不是注册源。以前 expert-mode / liangshen /
 * preset-plus 能用，是因为它们各自的 npm 插件在注册；插件一卸，就只剩空壳目录（本插件不碰它们）。
 *
 * 本插件就是补上那个缺失的 "declaring plugin"：读 `preset.yml`（元数据）+ `agent.cordis.yml`
 * （组合），调 `ctx.agentPresets.register()`。与 `@deepseek-ai/dsh-agent-preset` 做的事完全一致：
 *
 *     Config = z.object({ id: required, name, description, order, plugins: array(any).required() })
 *     Service.init() → ctx.agentPresets.register(config)
 *
 * 两处实现细节（都对着 loader / 注册表源码写的）
 * --------------------------------------------
 * ① **相对引用要绝对化**。`@deepseek-ai/cordis-plugin-loader` 的解析是
 *        if (name.startsWith(".")) import(new URL(name, this.ctx.baseUrl).href)
 *    而 `register()` 是直接喂数组、没有文件上下文，`baseUrl` 只会是我们这个插件的位置 ——
 *    于是 `./router-bootstrap-v34.mjs?v=89` 会被解析到错误的目录。做法：注册前把这类 `name`
 *    按**预设目录**为基准改写为 `new URL(name, 'file:///…/<preset>/').href`（保留 ?v= 查询串）。
 * ② **`!!js` 要在进程内求值**。组合文件里有 2~5 处 `!!js`，实测全部是
 *    `process.platform === 'win32'`、`process.env.DSH_CWD ?? process.cwd()` 这类平凡表达式，
 *    用 `new Function(...)` 求值即可（只需要全局 `process`）。这里给 js-yaml 注册一个
 *    `tag:yaml.org,2002:js` 标量类型来完成。
 *
 * 可配置项（注入时传 config）
 * --------------------------
 *   presetsRoot  : 预设根目录，默认 `<DSH_HOME|~/.dsh>/.agent-presets`
 *   presets      : 要注册的预设 id 数组；缺省 = 自动发现根目录下所有含 agent.cordis.yml 的子目录
 *   orderOffset  : 统一给 order 加偏移（想让这些预设排在内置之后时用），默认 0
 *
 * 撤销：dev_uninject_plugin dsh-local-presets（dispose 时会自动注销已注册的预设）。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const LOG = '[dsh-local-presets]';
const DEFAULT_ORDER = 100;

/** DSH 家目录：优先环境变量，退回 ~/.dsh。 */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

/**
 * 自动发现：预设根目录下所有"含 agent.cordis.yml 的一级子目录"（跳过 . 开头的）。
 * 可用 config.presets 显式覆盖——传名字数组即只注册那些。
 */
export function discoverPresets(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && !entry.name.startsWith('.')
        && existsSync(join(root, entry.name, 'agent.cordis.yml')))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * 找到 js-yaml。
 * 依次尝试：常规解析（注入器会把包 junction 进 profile 的 node_modules，通常这一步就中）
 * → 插件自身位置 → 几个已知 profile / cwd 作为 require 基准。
 */
export async function loadYaml() {
  try {
    const m = await import('js-yaml');
    return m.default ?? m;
  } catch { /* fall through */ }

  const require = createRequire(import.meta.url);
  try { return require('js-yaml'); } catch { /* fall through */ }

  const home = dshHome();
  const bases = [
    join(home, 'profiles', 'desktop'),
    join(home, 'profiles', 'web'),
    process.cwd(),
  ];
  for (const base of bases) {
    try { return createRequire(join(base, '__noop__.js'))('js-yaml'); } catch { /* next */ }
  }
  throw new Error('js-yaml 不可解析：无法读取预设组合文件');
}

/** 求值一个 `!!js` 表达式（实测只需要全局 process）。 */
export function evalJs(source) {
  const code = String(source);
  try {
    return new Function(`return (${code});`)();
  } catch (err) {
    throw new Error(`!!js 求值失败：${code.slice(0, 120)} → ${err.message}`);
  }
}

/** 给 js-yaml 加上 DSH 的 `!!js` 标量类型。 */
export function buildSchema(yaml) {
  const JsType = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    construct: (data) => evalJs(data),
  });
  return yaml.DEFAULT_SCHEMA.extend([JsType]);
}

/**
 * 递归把组合里以 `./` 或 `../` 开头的 `name` 改写成以 dirUrl 为基准的绝对 file:// URL。
 * 同时收集改写记录，便于日志核对。就地修改并返回。
 */
export function absolutize(node, dirUrl, changed) {
  if (Array.isArray(node)) {
    for (const item of node) absolutize(item, dirUrl, changed);
    return node;
  }
  if (!node || typeof node !== 'object') return node;

  for (const [key, value] of Object.entries(node)) {
    if (key === 'name' && typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) {
      const absolute = new URL(value, dirUrl).href;
      node[key] = absolute;
      changed.push(`${value} → ${absolute}`);
    } else {
      absolutize(value, dirUrl, changed);
    }
  }
  return node;
}

/**
 * 兼容垫片：`@deepseek-ai/dsh-persona` 的 schema 已从 `{ text }` 改为
 * `{ prefix(必填), suffix, complete, includeRuntimeContext }`。
 *
 * 而 router-standard / router-spec 是照旧版写的 `config: { text: >- ... }`，直接注册会得到：
 *     persona (@deepseek-ai/dsh-persona): invalid config: $.prefix missing required value
 * 于是整个预设被标成 broken。这里把 `text` 平移到 `prefix`（语义一致：都是整段 persona 前缀），
 * 并删除失效的旧键。只动"有 text 且没有 prefix"的 persona 行，其它一律不碰。
 */
export function shimPersonaConfig(plugins, applied) {
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (
      typeof node.name === 'string' && node.name.includes('dsh-persona') &&
      node.config && typeof node.config === 'object'
    ) {
      const config = node.config;
      if ('text' in config && !('prefix' in config)) {
        config.prefix = config.text;
        delete config.text;
        applied.push(String(node.id ?? 'persona'));
      }
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(plugins);
}

export const DEFAULT_DISABLE_ROWS = ['tool-workflow', 'tool-ralph', 'workflow-worker-thread'];

/**
 * 兼容垫片②：把"这一版根本没能力启动"的行直接置 disabled，避免整份预设被标 broken。
 *
 * 已知两类（2026-10 实测）：
 *   1. 没有 `workflowEngine` 服务（`@deepseek-ai/dsh-workflow-ptc` 在根面就是 disabled/no-fiber）
 *      → `@deepseek-ai/dsh-tool-workflow` / `@deepseek-ai/dsh-tool-ralph` 永远
 *      "waiting for workflowEngine"；
 *   2. `workflow-worker-thread` 那一行连包都不在安装目录里 —— 2026-10-17 换到 D:\harness 后
 *      实测 app.asar 里 `dsh-workflow-worker-thread` 出现 **0 次**（只剩 dsh-workflow-ptc /
 *      dsh-workflow-guest），于是报 "never started"，把 6 份预设全标成加载失败。
 *
 * 这些行反正挂载不上（行为与禁用完全一致），置 `disabled: true` 让诊断干净；内置预设也这么处理。
 * 可用 config.disableRows / presets.config.json 的 disableRows 覆盖（传 [] 表示不干预）。
 */
export function shimUnavailableRows(plugins, ids, applied) {
  const wanted = new Set(ids);
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && wanted.has(node.id) && node.disabled !== true) {
      node.disabled = true;
      applied.push(node.id);
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(plugins);
}

/**
 * 兼容垫片③（2026-11-10 新增）：**按真实 loader 预检每一行的模块解析**，解析不了的自动置 disabled。
 *
 * 为什么需要：预设文件是照某个 DSH 版本写的，`name` 可以是某个版本的子路径导出
 * （如 `@deepseek-ai/dsh-tool-subagent-control/list-agents`）。一旦宿主版本变了、这个子路径
 * 不再存在于 `exports` 里，`cordis-plugin-loader` 的 `Entry._init()` 只会 `logger.error()` 然后
 * `return`，**fiber 永远是 undefined**；注册表 `auditRows()` 把它读成 "never started"，
 * 整份预设于是被标成「加载失败」——而报错行本身其实可有可无。
 *
 * 修复思路：注册前先用 loader 自己的解析器（`loader.internal.resolveSync`，与 mount 时同一套
 * exports/条件导出规则，**不执行模块、无副作用**）试解析每行 `name`；解析失败的行就地
 * `disabled: true`。行为等价于「这一行本来也起不来」，但诊断干净、预设可用。
 *
 * 跳过：`disabled: true` 的整枝（本来就不挂载）、非字符串 name（include 等行）。
 * 失败开放：resolve 不可用 / 抛异常时什么都不改，绝不因为预检本身让预设注册失败。
 *
 * 同时顺带兜住 `workflow-worker-thread` 这类「包根本不在安装目录」的行 ——
 * 以后版本再删包/并包，不用再手工维护 disableRows。
 */
export function preflightRows(plugins, resolve, applied) {
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (typeof node.name === 'string' && node.disabled !== true) {
      let failure = null;
      try {
        resolve(node.name);
      } catch (err) {
        failure = err;
      }
      if (failure) {
        node.disabled = true;
        const code = failure.code || failure.name || 'ERROR';
        applied.push(`${String(node.id ?? node.name)} (${node.name}): ${code}`);
        // 整枝禁用：父行都起不来，子行无所谓了。
        return;
      }
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(plugins);
}

/**
 * 本版已移除的旧 API 表。命中即**整份预设跳过**（fail closed）——
 * 宁可少一个预设出现在选单里，也不要注册出一个必然显示「加载失败」的预设。
 *
 * 2026-10-17 换装后新增：`@deepseek-ai/dsh-tool-subagent` 不再接受 inline `persona`，
 * 报 `tool-subagent: persona is no longer supported; configure persona and tool plugins in an
 * Agent Preset and select it with agentPreset (spawn only)`。expert-mode 靠 17 个带 persona 的
 * 子代理行实现，在新的模型下必须改写成「每个专家 = 一份 Agent Preset」，不能就地补丁。
 */
const UNSUPPORTED_RULES = [
  {
    module: 'dsh-tool-subagent',
    configKey: 'persona',
    reason: '本版 dsh-tool-subagent 已移除 inline persona（改用 agentPreset 引用）',
  },
];

/** 扫描组合里命中 UNSUPPORTED_RULES 的行，返回人类可读的原因列表。 */
export function findUnsupportedRows(plugins) {
  const hits = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (typeof node.name === 'string' && node.config && typeof node.config === 'object') {
      for (const rule of UNSUPPORTED_RULES) {
        if (node.name.includes(rule.module) && rule.configKey in node.config) {
          hits.push(`${String(node.id ?? node.name)}: ${rule.reason}`);
        }
      }
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(plugins);
  return hits;
}

/**
 * 读插件包根目录的 `presets.config.json`（可选，改它不用碰代码）。
 * 放 D 盘的插件包里而不是 C 盘家目录，与其它本地插件资产同处一地。
 *
 * 支持的键：presets / presetsRoot / orderOffset / disableRows / exclude / enabled。
 * 注入时传的 config 优先于本文件；两边都没写的键用 DEFAULT_*。
 */
export function loadLocalConfig() {
  try {
    const file = new URL('../presets.config.json', import.meta.url);
    if (!existsSync(file)) return {};
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err) {
    console.warn(`${LOG} presets.config.json 读取失败（忽略）：${err?.message ?? err}`);
    return {};
  }
}

/**
 * 读一个预设目录，产出可直接喂给 `agentPresets.register()` 的 definition。
 * 纯函数（除读文件外无副作用），供 selftest.mjs 单独调用。
 *
 * @returns {{ id: string, name: string, description?: string, order: number, plugins: any[], changed: string[], shims: string[] }}
 */
export function parsePresetDir(dir, id, yaml, { orderOffset = 0, disableRows = DEFAULT_DISABLE_ROWS } = {}) {
  const compositionFile = join(dir, 'agent.cordis.yml');
  if (!existsSync(compositionFile)) throw new Error(`缺 agent.cordis.yml：${compositionFile}`);

  const schema = buildSchema(yaml);
  const presetFile = join(dir, 'preset.yml');
  const meta = existsSync(presetFile)
    ? (yaml.load(readFileSync(presetFile, 'utf8'), { schema }) || {})
    : {};

  const plugins = yaml.load(readFileSync(compositionFile, 'utf8'), { schema });
  if (!Array.isArray(plugins)) throw new Error('组合文件顶层不是数组（应为 YAML 列表）');

  const dirUrl = `${pathToFileURL(dir).href}/`;
  const changed = [];
  absolutize(plugins, dirUrl, changed);

  const shims = [];
  shimPersonaConfig(plugins, shims);
  shimUnavailableRows(plugins, disableRows, shims);

  return {
    id,
    name: meta.name ?? id,
    description: meta.description,
    order: (Number(meta.order) || DEFAULT_ORDER) + orderOffset,
    plugins,
    changed,
    shims,
  };
}

export const name = 'dsh-local-presets';
/** 必须等到注册表服务就绪再注册。 */
export const inject = ['agentPresets'];

export function apply(ctx, config = {}) {
  const local = loadLocalConfig();

  if (local.enabled === false) {
    console.log(`${LOG} presets.config.json 里 enabled=false —— 本插件不注册任何预设`);
    return;
  }

  const pickArray = (key, fallback) => (
    Array.isArray(config[key]) ? config[key]
      : Array.isArray(local[key]) ? local[key]
        : fallback
  );
  const pickFlag = (key, fallback) => (
    typeof config[key] === 'boolean' ? config[key]
      : typeof local[key] === 'boolean' ? local[key]
        : fallback
  );
  const preflightEnabled = pickFlag('preflight', true);
  const disableRows = pickArray('disableRows', DEFAULT_DISABLE_ROWS);
  const exclude = pickArray('exclude', []);
  const presets = pickArray('presets', []);

  const root = config.presetsRoot || local.presetsRoot || join(dshHome(), '.agent-presets');
  const orderOffset = Number(config.orderOffset ?? local.orderOffset ?? 0) || 0;

  const excluded = new Set(exclude);
  const wanted = (presets.length > 0 ? presets : discoverPresets(root))
    .filter((id) => {
      if (excluded.has(id)) {
        console.log(`${LOG} 跳过 ${id}：在 exclude 列表里`);
        return false;
      }
      return true;
    });

  let disposed = false;
  const disposers = [];

  ctx.effect(() => () => {
    disposed = true;
    for (const dispose of disposers) {
      try { dispose?.(); } catch { /* 注销失败不应阻断卸载 */ }
    }
    disposers.length = 0;
  });

  void (async () => {
    let yaml;
    try {
      yaml = await loadYaml();
    } catch (err) {
      console.warn(`${LOG} 无法加载 js-yaml，放弃注册：${err.message}`);
      return;
    }

    for (const id of wanted) {
      try {
        const dir = join(root, id);
        if (!existsSync(dir)) {
          console.warn(`${LOG} 跳过 ${id}：目录不存在（${dir}）`);
          continue;
        }

        // 注意：changed / shims 是本地诊断字段，不能混进 register() 的 definition
        const { changed, shims, ...definition } = parsePresetDir(dir, id, yaml, { orderOffset, disableRows });

        const unsupported = findUnsupportedRows(definition.plugins);
        if (unsupported.length > 0) {
          console.warn(
            `${LOG} 跳过 ${id}：${unsupported.length} 行用了本版已移除的 API —— ${unsupported[0]}`,
          );
          continue;
        }

        // 预检：用 loader 自己的解析器逐行试解析（不执行模块），解析不了的行置 disabled。
        // 这是「换版本后预设整体加载失败」这类问题的通用兜底。
        const preflightApplied = [];
        if (preflightEnabled) {
          try {
            const loader = (typeof ctx.get === 'function' ? ctx.get('loader') : null) ?? ctx.loader;
            const resolveSync = loader?.internal?.resolveSync;
            const baseUrl = typeof ctx.baseUrl === 'string' ? ctx.baseUrl : undefined;
            if (typeof resolveSync === 'function' && baseUrl) {
              preflightRows(
                definition.plugins,
                (specifier) => resolveSync(baseUrl, { specifier, attributes: {} }),
                preflightApplied,
              );
            }
          } catch (err) {
            console.warn(`${LOG} ${id}：预检不可用（跳过，不影响注册）—— ${err?.message ?? err}`);
          }
          if (preflightApplied.length > 0) {
            console.warn(
              `${LOG} ${id}：预检自动禁用 ${preflightApplied.length} 行（本版解析不到）—— ` +
              preflightApplied.join('; '),
            );
          }
        }

        const dispose = await ctx.agentPresets.register(definition);

        if (disposed) {
          try { dispose?.(); } catch { /* 插件已在注册过程中被卸载 */ }
          continue;
        }
        disposers.push(dispose);
        console.log(
          `${LOG} 已注册 ${id}（${definition.name}）· order=${definition.order} · ` +
          `${definition.plugins.length} 行 · 绝对化 ${changed.length} 个相对引用` +
          (shims.length ? ` · 兼容垫片 ${shims.length} 处（${shims.join(', ')}）` : ''),
        );
      } catch (err) {
        console.warn(`${LOG} 注册 ${id} 失败：${err?.message ?? err}`);
      }
    }
  })();
}
