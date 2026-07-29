# Android tmux 详情内主机切换设计

**日期**：2026-07-29  
**状态**：已确认，inline 实施

## 目标

保留 Android tmux Tab 首次进入时的主机选择页；进入某台主机的扫描详情后，将顶部“更换主机”改为详情内下拉菜单。用户选择另一台主机后停留在详情态，立即扫描新主机，不再回到主机选择页。

## 方案

`TmuxScreen` 继续接收完整 Host 列表和单一 `onSelectHost(hostId)` 回调。列表先经过现有 `ManualItemOrderPolicy` 排序，并同时用于首次选择页与详情下拉，避免产生两套排序规则。

详情顶部的当前主机卡片保留标题、SSH authority 和刷新动作。“更换主机”按钮锚定一个 `DropdownMenu`：

- 菜单展示全部已保存 Host；
- 当前 Host 可见但禁用；
- 只有一个 Host 时禁用“更换主机”；
- 选择其他 Host 时先关闭菜单，再调用 `onSelectHost(host.id)`。

应用层复用现有选主机写路径：清除旧 tmux 快照和对应 Host ID，然后写入 `AppRoute.Tmux(selectedHostId)`。现有 `LaunchedEffect(route, hostTmuxRefreshNonce)` 观察到 Host ID 变化后自动扫描；按 Host ID 的结果投影和刷新指示器所有权继续防止旧扫描污染新详情。

## 状态与异常

- 首次进入 tmux Tab：仍显示整页主机选择。
- 详情内 A→B：立即显示 B 的扫描状态；A 的旧结果不可投影到 B。
- loading、empty、error、stale：顶部主机卡片和下拉始终存在。
- empty/error 内容区不再提供重复的“更换主机”回退动作。
- 当前 Host 被外部删除：保留现有失效恢复，回到首次主机选择页。
- 从 tmux 会话打开 terminal 后返回：仍返回原 Host 的 tmux 访问上下文。

## 非目标

- 不取消首次主机选择页。
- 不记忆最近 Host，不自动选择唯一 Host。
- 不改变 tmux 扫描协议、远端命令、会话身份或删除安全语义。
- 不引入新的持久化状态、依赖或字符串资源。

## 测试

- UI 合同验证详情使用 `DropdownMenu` / `DropdownMenuItem`，当前项禁用，选择项走 `onSelectHost`。
- UI 合同验证 `onChangeHost` 及 empty/error 中的重复回退入口被移除。
- 现有状态测试继续验证选择 Host 会启用扫描、Host 快照隔离以及并发扫描指示器所有权。
- 运行 Android 定向单测、Android 全量单测、`assembleDebug`、根级 typecheck/test/architecture 检查。

## 原则检查

- **KISS / YAGNI**：复用现有路由驱动扫描，只替换详情内切换交互。
- **DRY**：首次选择页和详情下拉共享 Host 排序与 `onSelectHost`。
- **SOLID**：Compose 只管理下拉展开状态；扫描编排、远端协议和终端返回继续由原边界负责。
