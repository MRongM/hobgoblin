# Global Font Family Settings Design

## 目标

在 `设置 > 通用` 中新增一个全局字体选择项。默认使用 `Mono` 字体；用户可以切换为内置 `Maple Mono` 字体或系统字体。该设置对普通应用 UI 和应用内终端输出全局生效。

字体选择只解决字体族，不改变现有字号设置。文件区字号、终端字号等已有设置继续独立工作。

## 当前行为

应用当前在 CSS token 中静态定义字体：

- `--font-sans` 使用 `Maple Mono NF CN` 加系统 fallback。
- `--font-mono` 使用 `Maple Mono NF CN, monospace`。
- `html, body, #root` 使用 `var(--font-sans)`。
- Tailwind `font-mono` 和部分内联样式使用 `var(--font-mono)`。

内置 Maple 字体资源已经在 `src/web/styles.css` 中通过 `@font-face` 注册。

终端输出不完全由 CSS token 驱动。`src/web/components/terminal/terminal-geometry.ts` 中的 `TERMINAL_FONT_FAMILY` 当前固定为 `Maple Mono NF CN`，`TerminalSessionView` 创建 xterm 时使用该常量，并用同一字体测量 cell 尺寸。因此只改 CSS 不能让终端可靠跟随。

设置系统已经具备 server-owned 偏好链路：

- shared 定义 settings 类型和默认值。
- server 读取、归一化、持久化 `server-settings.json`。
- web 通过 settings query snapshot 读取运行时投影。
- web write paths 在写入后更新本地 query cache，其他窗口通过 invalidation/refetch 收敛。

## 需求

- 在 `设置 > 通用` 的现有列表中新增 `字体` 行，位置为 `主题`、`外观`、`字体`、`语言`。
- 字体选项固定为 `Mono`、`Maple Mono`、`系统字体`。
- 默认值为 `Mono`。
- `Mono` 表示系统等宽字体栈：`ui-monospace`, `SFMono-Regular`, `SF Mono`, `Menlo`, `Consolas`, `Liberation Mono`, `monospace`。
- `Maple Mono` 表示内置 `Maple Mono NF CN`，并保留合适 fallback。
- `系统字体` 表示系统 UI 无衬线字体栈：`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `PingFang SC`, `Noto Sans SC`, `system-ui`, `sans-serif`。
- 普通 UI 和应用内终端输出都跟随同一个全局字体设置。
- 终端切换字体时不得重启 session。
- 现有字号设置保持不变。
- 不新增系统字体枚举、字体扫描或自定义字体名输入。

## 非目标

- 不列出用户机器上安装的字体。
- 不支持任意字体名称输入。
- 不为终端单独增加字体族设置。
- 不把字体选择绑定到主题预设。
- 不修改终端会话、输入、输出、搜索、链接识别或 scrollback 行为。
- 不改变现有 `terminalFontSize`、`fileTreeFontSize`、`fileTreeTopbarFontSize` 的语义。

## 状态模型

新增共享类型：

```ts
export type FontFamilyPref = 'mono' | 'maple' | 'system'
```

在 `SettingsPrefs` 中新增：

```ts
fontFamily: FontFamilyPref
```

默认值：

```ts
export const DEFAULT_FONT_FAMILY: FontFamilyPref = 'mono'
```

该字段属于 runtime-coherent settings：server 是权威来源，renderer 只持有 query cache 或 DOM/xterm 投影。

为了兼容旧配置，所有读取路径都应在缺少 `fontFamily` 时回退到 `DEFAULT_FONT_FAMILY`。服务端归一化未知值时也回退到 `mono`。

## 字体栈

定义一个共享 web 侧字体模型，避免 CSS、DOM 投影、终端测量分别写死字符串。

建议在 web 侧新增或扩展字体 helper：

```ts
const FONT_FAMILY_STACKS = {
  mono: {
    sans: "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    mono: "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    terminal: "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  maple: {
    sans: "'Maple Mono NF CN', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
    mono: "'Maple Mono NF CN', ui-monospace, monospace",
    terminal: "'Maple Mono NF CN', ui-monospace, monospace",
  },
  system: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
    mono: "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    terminal: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
  },
} as const
```

`system` 模式下，普通 UI 和终端都使用系统 UI 字体。`font-mono` 仍可使用系统等宽栈，以保留路径、commit hash、快捷键等信息的可读性。终端输出按“全局生效”的要求使用系统 UI 字体。

## 架构

### Shared

`src/shared/settings.ts` 定义 `FontFamilyPref`。`SettingsPrefs` 增加 `fontFamily`。

`src/shared/settings-defaults.ts` 增加默认值，并把字段纳入：

- `defaultSettingsPrefs`
- `defaultSettingsSnapshot`
- `initialSettingsFromSnapshot`
- exported defaults

`src/shared/settings-snapshot.ts` 把 `fontFamily` 纳入 runtime snapshot 构建和从 full snapshot 提取 runtime snapshot 的路径。

`src/shared/bootstrap.ts` 的 `InitialSettingsSnapshot` 增加 `fontFamily`，保证首屏 fallback 一致。

### Server

`src/server/modules/settings-source.ts` 增加：

- `fontFamily` 到 `ServerSettingsData`
- `normalizeFontFamilyPref`
- 读取旧配置时的默认回退
- `settingsPrefsFromData`
- `updateServerSettingsPrefs`
- changed 判断和持久化写入

server route 层保持薄边界，不增加业务逻辑。`/api/settings/prefs` 仍接收 settings patch，由 source 层归一化。

### Web Settings Projection

扩展现有运行时字体设置：

- `readRuntimeFontSettings` 返回 `fontFamily`，或新增窄函数 `readRuntimeFontFamilySettings`。
- `useRuntimeFontSettings` 暴露 `fontFamily`。
- `useFontSettingsController` 新增 `setFontFamily(fontFamily)`。
- `settings-client.ts` 增加 `setFontFamily`。
- `settings-write-paths.ts` 增加 `setFontFamilyPreference` 并更新 query cache。

保持现有 runtime facade 边界：组件不直接调用 server client，仍通过 settings runtime/write path。

### Global DOM Projection

新增一个很小的 web 侧投影组件或 hook，例如 `GlobalFontFamilyProjection`：

- 读取 `fontFamily`。
- 在 `document.documentElement` 上设置 `data-font-family`，便于调试和测试当前模式。
- 根据 web 字体 helper 同步设置 CSS custom properties：
  - `--font-sans`
  - `--font-mono`

该组件应放在主窗口根树内，靠近现有 provider 层。它只负责 DOM 投影，不拥有业务状态。

CSS contract 只保留默认 token。三种动态字体栈不在 CSS 中重复定义，避免 CSS 和 TS 两份来源漂移。这样旧 snapshot 或 JS 尚未 hydrate 时仍有稳定默认字体；hydrate 后由 DOM 投影覆盖 CSS custom properties。

### Terminal

终端不从 DOM 反读字体，而是接收同一个 runtime setting：

- `TerminalSessionProvider` 读取 `fontFamily`。
- `TerminalSessionRegistry` 增加 `setFontFamily(fontFamily)` 或 `setFontFamilyStack(stack)`。
- `ManagedTerminalSession` 增加 `setFontFamily(fontFamily)`。
- `TerminalSessionView` 存储当前 `fontFamily` 字符串，创建 xterm 时使用它。
- `measureTerminalGeometry` 接收 `fontFamily`，测量 cell 时使用当前终端字体。

已有终端 session 切换字体时：

1. 更新 `term.options.fontFamily`。
2. 触发字体测量和 `fit`。
3. 保持已有 scrollback 和 session。
4. 不调用 restart。

`document.fonts.ready` 和 `loadingdone` 的 refit 流程可复用现有字体加载后 refit 逻辑。

## UI

在 `src/web/components/settings/pages/GeneralSettings.tsx` 中，在外观和语言之间新增：

```tsx
<SettingsRow
  controlId="settings-font-family"
  label={t('settings.font-family')}
  hint={t('settings.font-family-hint')}
  control={
    <SettingsSelect
      id="settings-font-family"
      value={fontFamily}
      options={fontFamilyOptions}
      onChange={(value) => void setFontFamily(value)}
    />
  }
/>
```

选项顺序：

1. `Mono`
2. `Maple Mono`
3. `系统字体`

建议中文文案：

- `settings.font-family`: `字体`
- `settings.font-family-hint`: `控制应用界面和内置终端使用的字体。`
- `settings.font-family.mono`: `Mono`
- `settings.font-family.maple`: `Maple Mono`
- `settings.font-family.system`: `系统字体`

其他语言字典增加等价文案。若实现阶段没有更自然的本地化，可使用直接、简洁翻译，保持现有字典风格。

不增加字体预览。当前设置页是工作型工具界面，一个选择器足够满足需求。

## 数据流

写入流程：

1. 用户在通用设置选择字体。
2. `GeneralSettings` 调用 `useFontSettingsController().setFontFamily(value)`。
3. web write path 调用 `settings-client.setFontFamily(value)`。
4. client POST `/api/settings/prefs`，body 中包含 `{ settings: { fontFamily: value } }`。
5. server source 归一化并持久化。
6. server 发布 settings invalidation。
7. web write path 用响应值更新 settings query cache。
8. 当前窗口立即更新 DOM token 和终端字体；其他窗口 refetch 后收敛。

读取流程：

1. app boot 从 `InitialSettingsSnapshot` 获得 fallback。
2. settings query 获得 server snapshot。
3. runtime font projection 解析 `fontFamily`。
4. DOM projection 更新根节点字体属性和 CSS custom properties。
5. terminal provider 同步字体族给 registry。
6. registry 同步到现有 session 和后续新建 session。

## 错误处理

写入失败沿用现有 settings 控制器模式：`runSettingsControllerAction()` 捕获异常并 `console.warn`。UI 保持当前 query cache 值，不新增 toast。

服务端收到非法字体值时回退到 `DEFAULT_FONT_FAMILY`。旧 `server-settings.json` 缺少字段时也回退到默认值，并在下一次写入 settings 文件时自然补齐。

读取侧在 snapshot 或 initial settings 缺失字段时回退到 `mono`。这保证旧版本数据和测试 fixture 不会导致运行时 undefined。

终端字体切换时，如果 terminal 尚未创建，只更新 session view 的字体字段，后续创建时使用新字体。如果 terminal 已创建，更新 xterm option 后 refit。如果 cell 测量失败，沿用现有 fallback cell 逻辑，保证终端仍可用。

## 测试

Shared/defaults:

- `defaultSettingsPrefs()` 默认 `fontFamily` 为 `mono`。
- `defaultSettingsSnapshot()` 和 `defaultInitialSettingsSnapshot()` 包含 `fontFamily`。
- `buildRuntimeSettingsSnapshot()` 和 `runtimeSettingsSnapshotFromSettingsSnapshot()` 保留 `fontFamily`。

Server:

- `settings-source` 正常持久化 `mono`、`maple`、`system`。
- 非法值归一化为 `mono`。
- 旧 settings 文件缺字段时返回默认值。
- `applyServerSettingsPrefsWrite` 发布 settings invalidation。

Web settings:

- `readRuntimeFontSettings` 在 snapshot 缺失时回退到 `mono`。
- `setFontFamilyPreference` 用 server 响应更新 query cache。
- `useFontSettingsController().setFontFamily` 调用 write path。

UI:

- `GeneralSettings` 渲染字体选择器。
- 字体选择器位于外观和语言之间。
- 选项顺序为 `Mono`、`Maple Mono`、`系统字体`。
- 选择新值时调用 controller。

CSS contract:

- 默认 CSS token 不依赖 JS 即可工作。
- Maple `@font-face` 资源继续注册。

Web font projection:

- 三种字体模式都能解析出 `sans`、`mono`、`terminal` 字体栈。
- DOM projection 会设置 `data-font-family`。
- DOM projection 会把 `--font-sans` 和 `--font-mono` 更新为当前模式对应值。

Terminal:

- 创建 xterm 时使用当前全局字体族。
- `measureTerminalGeometry` 使用当前字体族测量。
- 运行中切换字体会更新 `term.options.fontFamily` 并 refit。
- 运行中切换字体不调用 restart。
- 字体切换保留 scrollback 和当前 session。

建议验证命令：

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## 实现注意事项

当前工作区已有未提交改动：

- `src/web/components/terminal/TerminalSessionProvider.tsx`
- `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- `src/web/components/terminal/TerminalSessionRegistry.ts`

实现阶段触碰这些文件前需要先重新读取并保留现有改动，不能回退用户改动。

项目运行在 Node.js strip-only mode，不使用 enum、namespace runtime code、parameter properties 或 import aliases。

新增 imports 使用 repo alias，并保留显式 `.ts` / `.tsx` 扩展。

## 设计原则

KISS：用一个固定三选项设置解决需求，不引入字体扫描、自定义输入或预览系统。

YAGNI：不为未来字体管理预留复杂模型；当前只需要全局字体族。

DRY：字体栈集中定义，CSS token、DOM 投影、终端测量和 xterm 初始化共享同一语义。

SOLID：settings 持久化、web 投影、UI 控件、终端渲染各自负责一件事，通过明确设置契约连接。
