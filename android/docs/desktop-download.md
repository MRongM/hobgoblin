# Android 桌面版下载入口

## 目标

在 Android 客户端提供桌面版下载入口，帮助用户安装 Hobgoblin Desktop 并与 Android 客户端联动。

## 方案选择

采用设置页入口：在现有隐私政策入口上方添加桌面版说明和下载按钮，复用原生 Compose 控件及系统浏览器打开方式。相比首页常驻引导，设置页不会占用日常终端操作空间；相比首次启动弹窗，它始终可再次访问且不需要保存展示状态。

## 行为和边界

- 按钮中文文案为“下载桌面版”；说明为“在电脑上安装 Hobgoblin Desktop，与安卓客户端联动使用。点击前往 GitHub 下载最新桌面版。”
- 目标地址固定为 `https://github.com/MRongM/hobgoblin/releases/latest`，由 GitHub 决定最新 Release，不绑定版本号或安装包平台。
- 使用设置页现有的 `LocalUriHandler` 打开外部浏览器，遵循现有链接行为。
- URL 集中定义为设置功能内的常量，文案使用 Android 字符串资源，覆盖英语、简体中文、日语和韩语。
- 此操作只打开公开下载页面，不涉及 SSH、终端状态、设置持久化或联动协议变更。
- 不引入新依赖，不新增导航页面或版本查询 API。

## 验证

- 执行 Android 单元测试和 debug 构建，验证资源完整性与 Kotlin 编译。
- 按仓库要求执行 `bun run typecheck`、`bun run test` 和 `bun run check:architecture`。
- 可运行设备上人工检查设置页文案、点击跳转以及返回客户端后的页面行为；无设备时明确记录未验证项。
