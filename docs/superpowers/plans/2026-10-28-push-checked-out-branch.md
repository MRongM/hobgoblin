# 推送到已检出分支 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 内联执行；最后使用 superpowers:requesting-code-review 审查工作结果。

**Goal:** 发送端有未提交改动时仍可推送已有提交，并自动安全处理接收端已检出的目标分支。

**Architecture:** 在系统层共享受限的一次重试策略，本地 Git 与 SSH/WSL 分支推送复用；接收端检查由 Git 的 updateInstead 执行，不新增 UI 门禁或永久配置。

**Tech Stack:** TypeScript strip-only、Git、Vitest。

## Global Constraints

- 不增加依赖；使用带扩展名的 canonical repo-alias imports。
- 不强推、不清理、不暂存、不自动提交、不切换接收端分支、不永久修改配置。
- 保持目标远端、分支、上游创建、网络选项、互斥及取消。
- 真实仓库和文档仅使用通用占位身份。
- 在现有隔离工作树中执行；本任务不提交或推送开发分支。

## Task 1：真实仓库验收

- [x] 新增 `src/system/git/push.integration.test.ts`，对本地函数及实际生成的 SSH shell 命令执行相同验收：接收端干净、linked worktree、暂存修改、未暂存修改、未跟踪文件覆盖冲突、非快进。
- [x] `bun run test src/system/git/push.integration.test.ts`，确认干净接收端与 linked worktree 因当前缺少自动恢复而失败。

## Task 2：实现一次安全恢复

- [x] 在 `src/system/git/remote.test.ts` 覆盖成功/其他失败不重试、已检出分支重试一次、取消及重试失败返回。
- [x] 新增 `src/system/git/push-with-worktree-update.ts`，提供 `pushWithWorktreeUpdate(runPush: (updateWorktree: boolean) => Promise<ExecResult>, signal?: AbortSignal): Promise<ExecResult>` 与固定 `WORKTREE_UPDATE_RECEIVE_PACK` 参数。
- [x] 修改 `src/system/git/remote.ts` 的 `pushBranch`，在共享回调中为重试增加固定 receive-pack 参数。
- [x] 修改 `src/system/ssh/git.ts` 的 `pushRemoteBranch` 和 `src/system/ssh/commands.ts` 的 `gitPush` 布尔字段及命令构造，复用同一策略与固定参数。
- [x] 执行真实仓库和上述现有系统层测试，验证取消与网络选项沿用。
- [x] 增加真实 hooks 拒绝与彩色输出回归测试，分别观察错误重试和漏掉恢复的失败后修复；补充 WSL 代理、超时、取消信号重试覆盖。

## Task 3：验证与审查

- [x] 运行 `bun run typecheck`、`bun run check:architecture`、`bun run test`，对比完整测试基线，修复新增问题。
- [x] 独立只读审查实现与测试；处理重要问题。
- [x] 检查格式和 `git diff --check`；记录验证结果。

## 验证结果

- 4 个相关测试文件共 197 项通过；其中 20 项真实临时仓库测试覆盖本地 Git 与 SSH 命令执行路径，另有 WSL 网络选项重试覆盖。
- `bun run typecheck`、`bun run check:architecture`、修改文件的 Prettier 检查与 `git diff --check` 通过。
- 完整测试：4821 项通过、306 项失败、17 项跳过；相较改动前的 4792 项通过、306 项失败、17 项跳过，新增 29 项全部通过。失败用例和失败文件集合与基线完全一致，没有新增失败。
- 独立只读审查发现并复核了彩色 Git 错误输出的兼容修复；hook 日志误判也有先失败后通过的回归验证。
- SSH 路径测试实际执行生成的 shell 命令，未连接外部 SSH 主机；没有修改实际接收端配置，也未提交或推送开发分支。
