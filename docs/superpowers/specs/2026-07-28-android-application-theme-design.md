# Android 应用主题设计

## 目标

Android 设置页支持与 Web 一致的应用外观模式和 12 套配色预设。保存后整个 Android 原生界面立即应用新主题，并在重启后恢复。

## 范围

- 外观模式：跟随系统、浅色、深色。
- 配色预设：macOS、Mono、GitHub、Claude、Cursor、Airbnb、BMW、Signal、Forge、Catppuccin、Solarized、Tokyo Night。
- 默认设置：macOS + 跟随系统，与 Web 默认值一致。
- 主题只作用于 Android 原生应用表面。
- Android 终端继续使用现有独立的浅色/深色偏好；主题设置不改变 ANSI 色板、终端背景或终端输入区。
- Android 主题不与 Web、Desktop 或服务端同步。

## 方案选择

采用 Android 本地静态主题映射：在 Kotlin 中定义稳定的主题标识和每个预设的浅色/深色 `ColorScheme`，色值取自 `src/web/theme/themes/*.css` 的对应语义 token。

未采用运行时解析 CSS。Android 不执行 Web CSS，打包时复制或解析 CSS 会制造额外构建耦合，且不会带来运行时价值。未采用服务端同步，因为该设置仅属于设备本地展示状态。

## 架构

### 主题模型

- `AndroidAppearancePreference` 表达 `System`、`Light`、`Dark`。
- `AndroidColorTheme` 表达 12 个稳定的 Web 预设标识。
- `AndroidApplicationTheme` 组合外观偏好与配色预设。
- 未知或缺失的持久化值分别回退到 `System` 和 `Macos`，保证升级与损坏数据安全。

### 持久化

新增单一职责的 `AndroidApplicationThemeStore`，使用 Android `SharedPreferences` 保存两个稳定字符串。它与 `TerminalSettingsStore` 分离，防止应用外观和终端运行设置继续耦合。

该状态属于 restorable state：需要跨重启恢复，但不需要窗口间或服务端实时一致性。

### 全局应用

`MainActivity` 在 Compose 根节点加载持久化主题并持有当前值。`HobgoblinTheme` 根据外观偏好和系统暗色状态解析明暗模式，再选择对应配色。设置保存回调先持久化主题，再更新根状态，因此当前组合树立即重组并应用新主题。

### 设置界面

设置页在语言选择之前增加“主题”和“外观”两个只读下拉框，使用四套现有本地化资源。选择只更新表单草稿；用户点击现有“保存”后，主题、语言和 SSH 心跳设置一起提交。主题变化纳入 `hasChanges`，无变化时继续禁用保存按钮。

配色选项显示品牌/方案的稳定名称，不使用颜色含义不明确的自造译名。外观模式使用本地化的“跟随系统/浅色/深色”。

## Web 配色映射

Compose 语义角色从每套 Web 主题中映射：

- `background` ← `--goblin-surface-canvas`
- `surface` ← `--goblin-surface-raised`
- `surfaceVariant` ← `--goblin-surface-muted`
- `primary` ← `--goblin-action-primary`
- `onPrimary` ← `--goblin-action-primary-foreground`
- `onBackground` / `onSurface` ← `--goblin-text-primary`
- `onSurfaceVariant` ← `--goblin-text-secondary`
- `outline` ← `--goblin-border-strong`
- `error` ← `--goblin-action-danger`
- `onError` ← `--goblin-action-danger-foreground`

Compose 未直接表达的 Web 专属层级和 CSS 效果不新增 Android 私有机制。Material 组件只消费现有 `ColorScheme` 角色，保持实现简单。

## 错误与兼容性

- `SharedPreferences` 缺值或未知值静默回退到默认主题，不阻止应用启动。
- 不迁移现有终端偏好，也不覆盖当前终端会话的外观。
- 不增加依赖，不引入动态颜色，避免系统 Material You 覆盖选定预设。

## 测试

- 主题模型测试：稳定存储值、完整预设集合、未知值回退和明暗解析。
- 色板测试：12 套预设均提供浅色与深色方案，并校验来自 Web 的代表性色值。
- Store 测试：默认读取与往返持久化。
- 设置页契约测试：两个选择器、全部选项、本地化资源、保存回调参数与变更检测。
- 根主题契约测试：`MainActivity` 从 Store 恢复主题，保存后更新根 `HobgoblinTheme`。
- 全量 Android 单元测试与 debug 构建验证。

## 验收标准

1. Android 设置页可选择 3 种外观模式和 Web 的全部 12 套配色。
2. 点击保存后，所有 Android 原生页面立即使用所选主题。
3. 强制浅色/深色不受系统主题改变影响；跟随系统会响应系统明暗。
4. 杀死并重启应用后仍恢复选择。
5. 终端浅色/深色设置与现有色板行为不变。
6. 英文、简体中文、日文和韩文资源完整。
