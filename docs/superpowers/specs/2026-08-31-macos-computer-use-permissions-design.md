# macOS Computer Use 权限快捷操作设计

## 目标

在 Hobgoblin 设置中提供 macOS Computer Use 所需权限的实时状态和快捷授权入口，让用户在应用更新导致授权失效后，可以快速定位并恢复“屏幕录制”和“辅助功能”权限。

## 范围

- 仅在 macOS Electron 桌面环境显示。
- 在“通用”设置页增加独立的“macOS 系统权限”分组。
- 分别展示“屏幕录制”和“辅助功能”的当前状态。
- 未授权时提供对应操作；返回 Hobgoblin 窗口后自动刷新状态。
- 明示部分授权变更可能需要重启 Hobgoblin 才能生效。

不包含：

- 麦克风、摄像头或音频权限。
- 修改、重置或直接写入 macOS TCC 数据库。
- 在 Hobgoblin 数据库、设置文件或服务端保存权限状态。
- 修改当前应用签名和发布流程。

## 方案比较

### 方案 A：原生状态检测与按权限授权（采用）

Electron 主进程读取 macOS 实时权限状态，渲染进程通过受信 IPC 获取快照并触发授权。首次请求屏幕录制时调用桌面捕获 API 触发系统提示；已经拒绝的权限打开对应的 macOS 隐私设置；辅助功能使用 Electron 的系统权限 API 请求。

优点：状态明确、入口精准、无持久化同步问题。缺点：需要扩展主进程、preload 和 renderer bridge。

### 方案 B：仅提供两个系统设置链接

不读取状态，只打开屏幕录制或辅助功能设置页。

优点：实现最少。缺点：无法判断更新后具体失效的权限，也不能在首次使用时触发标准授权请求。

### 方案 C：调用 `tccutil` 管理授权

不采用。`tccutil` 不能替用户授予权限，只能重置授权；会扩大破坏范围，也不符合“快速获取授权”的目标。

## 架构

### 共享协议

新增一个纯类型模块，定义权限种类、状态快照和操作结果。协议不包含 Electron 类型，供主进程、preload 和 Web renderer 共同使用。

### 主进程

新增单一职责的 macOS 权限模块：

- `getMacosComputerUsePermissions()`：读取屏幕录制与辅助功能状态。
- `requestMacosComputerUsePermission(kind)`：按当前状态触发系统授权或打开固定的系统设置页面。

Shell IPC 只接受受信 renderer，并校验权限种类。非 macOS 平台返回 `unsupported`，不会执行系统操作。

### 渲染桥接

preload 暴露两个低层方法：获取权限快照、请求单项权限。Web 侧通过 `app-shell-client` 封装可用性判断和 unsupported 回退。纯 Web 模式不会显示该设置分组。

### 设置界面

新增 `MacosComputerUsePermissionSettings` 组件，由 `SettingsSurface` 放入“通用”页。每一行包含：

- 权限名称及用途说明。
- 状态徽标。
- 未授权时的“授权”或“打开系统设置”按钮。

组件挂载时读取状态；窗口重新获得焦点时再次读取，覆盖用户从系统设置返回的流程。请求失败显示应用内错误提示，不伪造成功状态。

## 状态和错误处理

- 屏幕录制沿用 Electron 返回的 `not-determined`、`granted`、`denied`、`restricted`、`unknown`。
- 辅助功能 API 只能可靠区分已授权和未授权，因此映射为 `granted` 或 `denied`。
- 非 macOS 映射为 `unsupported`。
- 请求完成后立即重读；最终状态仍以操作系统查询结果为准。
- 系统设置修改可能需要重启应用，界面提供固定提示。

## 安全边界

- 不允许 renderer 传入任意 URL、命令或系统偏好面板标识。
- 主进程内部使用固定的屏幕录制和辅助功能设置地址。
- 所有 IPC 继续使用现有 `isTrustedIpcEvent` 校验。
- 不读取或修改 macOS TCC 数据库。

## 测试与验收

- 主进程单元测试覆盖状态映射、首次屏幕录制请求、拒绝后的系统设置跳转、辅助功能请求、非 macOS与非法 IPC 输入。
- preload 测试覆盖两个新增通道。
- Web client 测试覆盖 bridge 可用与不可用回退。
- 设置组件测试覆盖 macOS Electron 可见性、两项状态、按钮行为、返回窗口后的刷新，以及 Web/非 macOS隐藏。
- 四种语言字典包含新增文案并通过字典一致性测试。
- `bun run typecheck`、`bun run test`、`bun run check:architecture` 全部通过。

## 自审结果

- 无数据库或设置持久化变更。
- 未引入第三方依赖。
- 没有修改发布签名范围。
- 权限名、状态来源、失败行为和平台边界均已明确。
