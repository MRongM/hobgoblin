# 子工作区批量错误隔离与 AI 托管实施计划

> 按用户授权在当前会话内联执行；每个任务保持测试先行，不执行 `git commit` 或 `git push`。

**目标：** 所有分支工作区批量 Git 动作隔离成员错误、完成后汇总，并把失败列表作为一个可审阅的 AI 终端 handoff。

**架构：** 服务端写路径拥有 best-effort 串行执行与权威结果；共享协议携带失败现场；Renderer 面板展示汇总，Workspace rail 复用根终端完成命令预填。全局校验和取消仍 fail-fast。

**技术栈：** TypeScript、React、Vitest、现有 repository backend、内部终端 command bridge。

---

## 任务 1：定义聚合结果的协议与服务端测试

**文件：**

- 修改：`src/shared/branch-workspace-git-actions.ts`
- 修改：`src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- 修改：`src/server/modules/branch-workspace-git-action-write-paths.ts`

1. 在成员失败结果中增加可选 `worktreePath`，供错误现场与 AI handoff 使用。
2. 先把批量提交测试改为：首成员失败后仍执行后续成员；一次结果可包含多个失败；重试只重新执行失败成员。
3. 为 pull 与 push 各增加失败隔离测试，断言清单顺序、最终成员 phase 和重试调用序列。
4. 运行目标测试，确认旧的 first-failure 实现出现 RED。
5. 引入一次执行局部的失败映射与统一结果投影；成功成员仍写入 `completed`，循环结尾统一返回成功或成员失败汇总。
6. 对取消在每次成员调用后再次检查，确保取消不进入下一成员；全局 `failureResult` 保持阻断语义。
7. 运行服务端目标测试确认 GREEN。

## 任务 2：覆盖合入、合出与临时工作树清理

**文件：**

- 修改：`src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- 修改：`src/server/modules/branch-workspace-git-action-write-paths.ts`

1. 先更新合入冲突测试：记录冲突现场后继续合并下一仓库；增加两个成员分别失败的聚合断言。
2. 增加合入 pull/merge/push 失败后继续的代表性测试，并保留既有步骤恢复断言。
3. 增加合出准备失败后继续、临时工作树 Git 失败清理后继续、清理失败后继续的测试。
4. 运行目标测试确认 RED。
5. 把合入各步骤的直接 `return` 改为记录失败并进入下一成员；只在该成员完整成功后清理进度并加入完成集。
6. 让合出失败清理 helper 返回成员失败记录；先结算临时工作树，再记录原步骤或 cleanup 失败，并按取消信号决定停止或继续。
7. 运行服务端测试与合并进度投影测试确认 GREEN。

## 任务 3：生成结构化批量错误 AI 命令

**文件：**

- 修改：`src/web/ai-terminal-handoff.test.ts`
- 修改：`src/web/ai-terminal-handoff.ts`

1. 先增加命令构建测试，覆盖多个仓库、动作类型、步骤、诊断、普通工作树和保留冲突路径。
2. 断言 Codex/Claude 前缀正确、提示为单行 shell 参数、末尾无回车，并包含禁止危险 Git 后续动作的约束。
3. 运行测试确认 RED。
4. 增加窄类型 `BranchWorkspaceBatchErrorAiFailure` 与 `buildBranchWorkspaceBatchErrorAiCommand`；使用 `JSON.stringify` 复用现有安全参数编码。
5. 运行命令构建测试确认 GREEN。

## 任务 4：在所有批量面板中展示错误汇总与 AI 托管

**文件：**

- 修改：`src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- 修改：`src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- 修改：`src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- 修改：`src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

1. 先增加组件测试：批量提交、pull/push 与两个合并方向的失败都展示一个汇总；列表按计划顺序显示全部失败及步骤诊断。
2. 更新原冲突 handoff 测试，断言 callback 接收动作类型和全部失败，不再只接收首个冲突。
3. 增加 rail 测试，断言根终端命令包含多个错误且仍只预填、不自动执行。
4. 运行目标测试确认 RED。
5. 用一个 `BranchWorkspaceBatchErrorAiActions` 局部组件统一筛选结果、展示汇总、组合 callback 输入，并复用现有提供方按钮。
6. 将 panel callback 改为通用 `onBatchErrorAiHandoff`；rail 使用新 command builder，继续复用 branch-workspace root terminal base。
7. 成功 handoff 关闭面板；预填失败保留面板和错误反馈。
8. 运行目标测试确认 GREEN。

## 任务 5：多语言、术语与回归验证

**文件：**

- 修改：`src/shared/i18n/en.ts`
- 修改：`src/shared/i18n/zh.ts`
- 修改：`src/shared/i18n/ja.ts`
- 修改：`src/shared/i18n/ko.ts`
- 修改：`CONTEXT.md`
- 修改：`docs/superpowers/specs/2026-07-31-branch-workspace-batch-error-ai-handoff-design.md`

1. 增加“部分成员失败”“错误汇总”和 AI 托管说明文案，保持四种字典键集合一致。
2. 运行 i18n 字典测试、服务端写路径测试、handoff/面板/rail 目标测试。
3. 运行 `bun run typecheck`。
4. 运行 `bun run check:architecture`。
5. 运行 `bun run test`；如遇与改动无关的已知定时测试抖动，隔离复跑并如实记录两组证据。
6. 复核 `git diff --check` 和工作树，只报告本次范围，不提交、不推送。
