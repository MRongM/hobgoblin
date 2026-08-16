# 设置中打开应用配置设计

**日期：** 2026-08-14  
**状态：** 已确认，正在实现

## 概述

在 `设置 > 常规` 中增加一个操作，使用用户已选择的外部编辑器打开 Hobgoblin 的整个应用数据目录。该目录是应用配置的单一入口，包含服务器设置、工作区配置和分支工作区配置等持久化文件。

## 目标

- 用户可从常规设置直接打开应用数据目录。
- 使用 `设置 > 应用` 已选择的编辑器，以及已有的自动检测逻辑。
- 服务端自行解析数据目录，Web 客户端不传入路径。
- 沿用现有编辑器不可用的错误结果，并在设置页显示可本地化的失败提示。
- 防止重复点击造成并发打开请求。

## 非目标

- 不创建新的设置页面或新的编辑器偏好。
- 不将应用配置目录路径暴露给 Web 客户端。
- 不打开单个配置文件，也不维护不完整的配置文件白名单。
- 不新增文件编辑、保存、同步或备份能力。

## 架构

新增一个聚焦的 server 模块 `settings-external-actions.ts`。它读取权威的 `editorApp` 偏好，使用 `serverDataDir()` 取得运行中的应用数据目录，再调用已有的 `openInPreferredEditor()`。

设置路由提供无请求体的 `POST /api/settings/open-app-config-editor`。Web 客户端只调用固定路由并返回 `ExecResult`。`GeneralSettings` 根据既有外部应用运行时状态决定按钮可用性，并通过 `useAsyncPending` 保证单飞；失败结果或请求异常显示 toast。

## UI

在“常规”设置列表中添加一行：

- 标题：打开应用配置。
- 说明：使用当前选择的编辑器打开包含应用设置和工作区配置的目录。
- 按钮：打开配置目录。
- 未检测到已选/自动选择的编辑器时禁用按钮。
- 请求进行中显示加载状态且禁用重复操作。

## 错误处理

- 无可用编辑器时 server 返回已有 `error.editor-not-installed`，按钮通常已在客户端禁用。
- 编辑器启动失败时，toast 显示本地化的“无法打开应用配置”标题及服务端错误描述。
- 网络或服务器异常同样显示该标题，不泄露应用数据目录路径。

## 测试与验证

- server action 测试：固定使用 `serverDataDir()` 和当前 `editorApp`，不接受客户端路径。
- settings route 测试：新路由委托该 action 并透传结果。
- settings client 测试：对固定 URL 发出无输入的 POST，并返回 `ExecResult`。
- General Settings UI 测试：渲染按钮、调用 client、单飞、不可用编辑器禁用、失败 toast。
- 全量验证：`bun run typecheck`、`bun run test`、`bun run check:architecture`。

## 工程原则

- **KISS：** 一个固定路由和一个专职 server action，不引入泛化的任意路径打开接口。
- **YAGNI：** 首版只打开整个数据目录，覆盖所有当前与后续配置文件。
- **DRY：** 复用编辑器解析、数据目录解析、按钮和异步状态 primitives。
- **SOLID：** 路由只做 HTTP 映射；server action 负责可信路径与偏好编排；Web 只负责交互反馈。
