# Delete subworkspace folder implementation plan

**Goal:** 自动按类型删除整个子工作区，只确认一次、无勾选。

**Architecture:** 列表只呈现删除与注销两个明确动作；独立确认组件协调已有 plan/execute/abort；服务端恢复 remove 计划和执行，沿用现有范围校验、取消和进度机制。

在当前 worktree 内执行，保留之前的刷新改动，不提交或推送。

- [x] 新增真实临时文件与 Git 测试，先观察“只注销不删除”的失败。
- [x] 启用 `buildRemovePlan` 与 remove 执行，校验删除范围，适配根 worktree 和链接外部目标。
- [x] 新增单确认无勾选的删除对话框测试与实现，自动提交计划批准，同一路径计划过期自动重试一次。
- [x] 根菜单替换批量移除入口，保留成员级工作树移除和独立注销，四语言文案同步。
- [x] 验证菜单到对话框连接、真实删除顺序、取消与重试、旧选择退出。
- [x] 更新架构/交互文档并进行只读审查。
- [x] 运行定向测试、类型、架构、Web 构建和完整测试，比较现有失败集合。

## 验证结果

- 本次新增 18 项测试全部通过：9 项真实文件/Git 删除测试、7 项单确认对话框测试，以及菜单与 Rail 的 2 项连接测试。
- 目录链接不越界、相同 worktree 路径去重、同文件夹内先移除 worktree 再删除 primary repository、取消/失败重试和取消请求结算均有回归覆盖。
- `bun run typecheck`、`bun run check:architecture`、`bun run build:web`、格式检查和 `git diff --check` 通过。
- 完整 `bun run test`：4792 项通过、306 项失败、17 项跳过。失败集合是改动前 311 项失败的子集，无新增失败，修复了 5 项已有删除行为测试。
- 独立只读审查复核通过。未提交或推送。
