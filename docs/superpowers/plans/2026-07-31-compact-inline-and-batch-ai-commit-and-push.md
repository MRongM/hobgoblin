# Compact Inline And Batch AI Commit And Push Plan

> 本计划由当前会话内联执行，不派发子代理，不创建分支，不执行 `git commit` 或 `git push`。

**目标：** 自动提交推送开关开启时隐藏手工编辑与底部按钮，并把相同交互扩展到分支工作区批量提交。

**架构：** 两个组件分别拥有局部开关和生成编排；单工作树继续复用 `onCommitAndPush`，批量流程由 `useBranchWorkspaceGitActions` 在提交全成功后重新规划并执行现有 batch push。服务端协议和 Git 写路径保持不变。

## Task 1：紧凑单工作树模式

- [x] 在 `BranchWriteDialogs.test.tsx` 先断言开启后 textarea、取消、提交和提交推送按钮消失，关闭后恢复。
- [x] `InlineCommitForm` 条件渲染编辑区和底部动作；开启时清除潜在替换确认。
- [x] 跑定向测试验证 RED -> GREEN。

## Task 2：批量自动交互

- [x] 在 `BranchWorkspaceGitActionDialog.test.tsx` 先断言开关顺序、紧凑呈现，以及全部生成成功后调用组合动作。
- [x] 先测试任一生成失败不会调用批量写入。
- [x] 批量生成函数返回本次成功消息集合；自动模式覆盖旧草稿，手工模式保持原语义。
- [x] 批量面板开启时隐藏 textarea、逐仓库 AI 按钮和底部按钮，保留成员摘要与错误。

## Task 3：批量提交后重新规划推送

- [x] 在 `useBranchWorkspaceGitActions.test.tsx` 先断言 `batch-commit execute -> push plan -> push execute` 顺序。
- [x] 先测试批量提交失败时不规划推送，以及推送计划失败/不可执行时停止。
- [x] 在 hook 内提取窄的 plan/execute helper，新增 `executeBatchCommitAndPush`，避免 UI 重复状态和令牌规则。
- [x] 从 `WorkspaceRepositoryRail` 注入组合动作，保持普通批量提交与独立批量推送不变。

## Task 4：文案与回归验证

- [x] 复用四语种 `action.commit-auto-commit-and-push`，仅在确有语义差异时新增文案。
- [x] 运行相关组件/hook/i18n 测试。
- [x] 运行 `bun run typecheck`、`bun run check:architecture`、`git diff --check` 和 `bun run test`。
- [x] 审阅最终 diff，确认没有新依赖、服务端协议、持久化字段、隐私数据或未授权 Git 写操作。

## 验证记录

- 定向回归：7 个文件、172 个测试通过。
- 类型检查：main、web、test 三套配置通过。
- 架构与 diff：`bun run check:architecture`、`git diff --check` 通过。
- 原始全量测试三次均完成到 380/381 或 379/381 文件；功能范围无失败。最后一次唯一失败为未改动的 Linux 归档测试耗时 5.27 秒，超过固定 5 秒阈值；该用例单独运行通过（4.18 秒）。受限 worker 运行另暴露未改动终端测试文件的既有顺序依赖，该用例单独运行通过。未通过放宽超时或修改无关测试来掩盖这些问题。
