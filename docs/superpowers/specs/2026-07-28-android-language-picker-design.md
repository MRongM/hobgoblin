# Android 应用语言选择设计

**日期**：2026-07-28  
**状态**：已确认，自主 inline 实施

## 目标

在 Android 设置内直接选择 Hobgoblin 的应用语言，并覆盖当前支持的全部 Android 版本。可选项为“跟随系统”、English、中文、日本語和 한국어。

本设计扩展 `2026-07-26-android-i18n-design.md`：保留 Android 原生资源体系、四种资源目录和平台每应用语言能力，但不再保留“无应用内语言选择器”的原范围限制。

## 范围

- 在 Android 设置表单中增加语言下拉选择。
- Android 8（API 26）及以上均可选择应用语言。
- 语言选择与现有心跳设置一同在点击“保存”后生效。
- “跟随系统”清除应用 locale 覆盖，由设备 locale 决定界面语言。
- 语言变化后允许 Activity 按平台默认行为重建，Compose 重新解析 `stringResource`。
- 继续支持 Android 系统的每应用语言设置；应用内和系统入口读取、写入同一平台状态。
- 保持桌面/Web 语言设置不变，不与 Android 同步。

## 非目标

- 不新增 Kotlin 字典、服务器语言 API 或 Android 自有 `SharedPreferences` 语言字段。
- 不翻译终端输出、命令、路径、仓库名、Host 名称或原始 Git/SSH/Termux 诊断。
- 不增加新的语言或地区变体。
- 不在选择下拉项时立即切换；切换发生在用户保存设置时。

## 方案选择

### 采用：AndroidX AppCompat 应用语言 API

使用 `AppCompatDelegate.getApplicationLocales()` 和 `setApplicationLocales()`，并让 `MainActivity` 继承 `AppCompatActivity`。Android 12 及以下通过 `AppLocalesMetadataHolderService` 的 `autoStoreLocales` 持久化；Android 13 及以上由平台自动持久化并与系统每应用语言设置保持一致。

该方案覆盖项目的完整 `minSdk 26` 范围，复用 Android locale 配置、资源回退和 Activity 重建机制，且不产生第二份语言真相。

### 未采用：跳转 Android 系统语言设置

改动较小，但 Android 12 及以下没有对应系统页面，也不满足“设置内选择”。

### 未采用：仅使用 Android 13 `LocaleManager`

无需 AppCompat，但 API 26–32 只能继续跟随系统，功能在受支持设备间不一致。

### 未采用：自行持久化并包装 `Context`

会重复实现 locale 存储、配置更新、升级迁移和系统设置同步，增加状态分叉风险。

## 组件与职责

- `AndroidApplicationLanguage`：纯 Kotlin 语言偏好模型，拥有稳定语言标签；空标签代表跟随系统。
- `AndroidApplicationLanguageSetting`：同时保留设置页展示偏好和平台返回的原始 locale tags，避免未知或非规范覆盖无法被清除。
- Android locale 适配函数：在语言设置与 AppCompat locale 列表之间转换，仅负责平台边界。
- `SettingsScreen`：维护表单内暂存的语言选择，显示下拉选项，并把语言随其他字段提交。
- `HobgoblinAndroidApp`：读取当前应用语言，并在保存回调中先持久化现有终端参数、再提交应用 locale。
- `MainActivity` 与 manifest：提供 AppCompat Activity 宿主和 API 26–32 自动 locale 存储。
- 前台终端通知边界：通过 AndroidX 的 locale-aware Context 解析资源，确保 API 26–32 的 Service 文本也服从应用语言。

不引入语言 Store、Controller 接口或服务端层；当前只有一个 Activity 和一个调用点，额外抽象不符合 YAGNI。

## 数据流

1. 用户进入设置时，从 `AppCompatDelegate.getApplicationLocales()` 读取应用 locale；空列表映射为“跟随系统”，同时保留原始 tags 用于精确变更判断。
2. 设置表单暂存用户选择，不立即改变 Activity 配置。
3. 用户点击“保存”；现有心跳值写入 `TerminalSettingsStore`，语言偏好转换为 `LocaleListCompat` 并提交。
4. locale 变化触发 Activity 重建；Compose 和 Android 资源系统以新 locale 重新解析界面文本。
5. Android 12 及以下由 AppCompat 自动存储；Android 13 及以上由框架存储并同步系统每应用语言设置。

## 错误与边界处理

- 空 locale 列表始终表示“跟随系统”。
- 只接受应用自身定义的 `en`、`zh-Hans`、`ja`、`ko`；`zh-Hant` 和 `zh-TW/HK/MO` 不得误映射为简体中文。未知或异常标签在设置展示中归一为“跟随系统”，但保留原始 tags，使保存操作能够清除该覆盖。
- 中文使用 `zh-Hans` 与现有 `values-b+zh+Hans` 资源目录一致。
- 只有 locale 实际变化时才调用设置 API，避免无意义 Activity 重建。
- 语言切换不触碰终端会话、远端连接或服务器设置；Activity 重建后的现有 Android runtime 生命周期保持当前行为。
- 非 Activity 的前台 Service 使用 locale-aware Context 解析通知标题、正文和通知渠道名称，避免 API 26–32 回退到设备语言。

## 界面

语言选择放在设置页首部，位于 SSH 终端保活配置之前。字段标签和“跟随系统”使用当前 locale 的资源；各语言名称使用自称形式（English、中文、日本語、한국어），让用户即使误切语言也能识别恢复入口。

下拉框沿用 Material 3 控件和现有页面间距；内容列可垂直滚动，保证小屏、横屏和放大字体下仍能访问保存按钮。保存按钮的启用条件扩展为：任一数值设置、原始 locale tags 或语言偏好发生变化，且数值字段均有效。

## 测试

- 纯单元测试覆盖空标签、四种显式语言、繁体中文、未知/多 locale 标签的归一化和清除决策。
- localization contract test 覆盖 AppCompat 精确版本、manifest 自动存储声明、AppCompat Activity 宿主和设置页接线。
- 通知 contract 覆盖非 Activity 上下文通过 locale-aware Context 解析资源。
- 四个资源目录保持键集合完全一致。
- 运行 Android JVM 测试、lint、debug assemble，以及根级 typecheck、test 和 architecture 检查。

## 架构质询结论

- 状态归属：Android application language 是设备本地平台偏好，不是服务器拥有的 runtime-coherent 设置。
- 持久化：AppCompat/Android 是唯一事实来源；不复制到 `TerminalSettingsStore`。
- 生命周期：保存后 Activity 重建是预期配置变化，不自行拦截。
- 通知：继续使用 Android 资源；本功能不持久化已解析字符串。
- 可逆性：若未来最低版本提升到 API 33，可移除 AppCompat 兼容层并保留相同领域模型与设置 UI。
