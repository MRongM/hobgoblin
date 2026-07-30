# Branch Workspace Merge-Conflict AI Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在子工作区批量合入/合出留下可处理的合并冲突时，把上下文化的 Codex 或 Claude 命令填入子工作区根目录终端。

**Architecture:** 服务端在失败成员结果中显式返回保留的冲突工作树，Renderer 不推断临时路径生命周期。终端层抽取接受完整 `TerminalSessionBase` 的通用填入核心，普通工作树与子工作区分别提供目标适配；两类界面共享提供商探测和按钮状态组件。

**Tech Stack:** TypeScript 6（Node.js strip-only）、React 19、Vitest、现有 server-backed terminal command bridge。

**Status:** 已按计划实施并验证（2026-07-30）。

## Global Constraints

- 不新增依赖；如意外需要依赖，先停止实施并在最终结果中说明。
- 不使用 enum、runtime namespace、parameter property 或 TypeScript import alias。
- 使用 repo alias 和显式 `.ts` / `.tsx` 后缀。
- 只在 `reason === 'merge-conflict'` 且服务端返回保留现场时展示接管。
- 接管进入子工作区根目录 Native 内部终端，不进入成员终端。
- 命令只填入输入框，不发送回车，不自动暂存、提交或继续合并。
- 临时工作树冲突完成既有清理，不暴露已清理路径。
- 保持中英日韩现有 `action.merge-conflict-ai-*` 文案，不增加重复翻译键。
- 本计划由当前会话 inline 执行；不启用子代理，不执行 `git commit`。

## File Structure

- `src/shared/git-types.ts`：通用 `GitConflictWorktree` 值类型。
- `src/shared/repository-branch-merge.ts`：保留仓库级导出名并复用通用类型。
- `src/shared/branch-workspace-git-actions.ts`：失败成员可选保留现场协议。
- `src/server/modules/branch-workspace-git-action-write-paths.ts`：决定现场是否保留并构造权威结果。
- `src/server/modules/branch-workspace-git-action-write-paths.test.ts`：合入、现有目标合出、临时目标合出的现场测试。
- `src/web/ai-terminal-handoff.ts`：完整终端目标填入核心与两类冲突命令构造。
- `src/web/ai-terminal-handoff.test.ts`：根终端身份、复用/创建、命令编码测试。
- `src/web/hooks/useMergeConflictAiActions.ts`：仅拥有提供商探测、pending 和错误状态。
- `src/web/hooks/useMergeConflictAiActions.test.tsx`：通用提供商回调测试。
- `src/web/components/MergeConflictAiActions.tsx`：普通工作树和子工作区共享的 AI 操作块。
- `src/web/components/branch-list/BranchWriteDialogs.tsx`：普通工作树适配到共享操作块。
- `src/web/components/branch-list/BranchWriteDialogs.test.tsx`：确保普通工作树行为不回退。
- `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`：从失败成员渲染共享操作块。
- `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`：展示门槛、成功/失败行为测试。
- `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`：激活根上下文并提供根终端目标。
- `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`：根上下文、目标身份和命令传递集成测试。
- `CONTEXT.md` 与设计文档：领域术语和最终实施状态。

---

### Task 1: 让服务端结果只暴露保留的冲突现场

**Files:**

- Modify: `src/shared/git-types.ts`
- Modify: `src/shared/repository-branch-merge.ts`
- Modify: `src/shared/branch-workspace-git-actions.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`
- Test: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`

**Interfaces:**

- Produces: `GitConflictWorktree { branch: string; path: string }`
- Produces: `BranchWorkspaceGitActionMemberResult.conflictWorktree?: GitConflictWorktree`
- Preserves: `RepositoryBranchMergeOutConflictWorktree` as a public type alias.

- [x] **Step 1: 写入失败测试**

扩展现有三个批量合并测试，使断言分别要求：

```ts
// batch merge-in retained member worktree
{
  repositoryName: 'api',
  phase: 'failed',
  step: 'merge',
  reason: 'merge-conflict',
  conflictWorktree: {
    branch: 'feature/a',
    path: '/workspace/goblin-feature-a/api',
  },
}

// batch merge-out retained destination worktree
{
  repositoryName: 'api',
  phase: 'failed',
  step: 'merge',
  reason: 'merge-conflict',
  conflictWorktree: { branch: 'main', path: '/workspace/api' },
}

// batch merge-out temporary destination
expect(failedMember.conflictWorktree).toBeUndefined()
```

- [x] **Step 2: 运行测试并确认 RED**

Run:

```text
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts
```

Expected: FAIL，因为当前失败成员没有 `conflictWorktree`。

- [x] **Step 3: 增加共享类型**

在 `src/shared/git-types.ts` 增加：

```ts
export interface GitConflictWorktree {
  branch: string
  path: string
}
```

在仓库级协议中保留兼容名：

```ts
import type { ExecResult, GitConflictWorktree } from '#/shared/git-types.ts'

export type RepositoryBranchMergeOutConflictWorktree = GitConflictWorktree
```

在子工作区成员结果中增加：

```ts
conflictWorktree?: GitConflictWorktree
```

- [x] **Step 4: 在写路径绑定保留现场**

让 `actionFailure()` 接受可选 `GitConflictWorktree`，并只附加到失败成员。批量合入的 merge 失败使用：

```ts
const conflictWorktree =
  merged.reason === 'merge-conflict' ? { branch: member.targetBranch, path: member.targetWorktreePath } : undefined
```

`batchMergeFailureAfterCleanup()` 接收本次实际 `destinationWorktreePath`；只在以下条件全部满足时构造现场：

```ts
step === 'merge' && result.reason === 'merge-conflict' && !member.destination.requiresTemporaryWorktree
```

构造值：

```ts
{
  branch: member.destination.branch,
  path: destinationWorktreePath,
}
```

清理失败继续覆盖原 merge 失败，不附加冲突现场。

- [x] **Step 5: 运行服务端测试并确认 GREEN**

Run:

```text
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts
```

Expected: PASS。

---

### Task 2: 抽取目录级终端填入核心并构造子工作区命令

**Files:**

- Modify: `src/web/ai-terminal-handoff.ts`
- Test: `src/web/ai-terminal-handoff.test.ts`

**Interfaces:**

- Produces: `prefillAiTerminalTargetCommand(input: AiTerminalTargetHandoffInput): Promise<boolean>`
- Produces: `buildMergeConflictAiCommand(provider): string`
- Produces: `buildBranchWorkspaceMergeConflictAiCommand(provider, repositoryName, conflictWorktree): string`
- Preserves: `prefillAiTerminalCommand(input): Promise<boolean>`.

- [x] **Step 1: 写入通用目标与命令失败测试**

新增完整子工作区目标测试：

```ts
await prefillAiTerminalTargetCommand({
  terminalBase: {
    repoRoot: '/workspace',
    branch: 'feature/a',
    worktreePath: '/workspace/goblin-feature-a',
    targetKind: 'branch-workspace',
    branchWorkspaceId: 'ws-1',
  },
  activate: mocks.activate,
  command: 'codex exec "prompt"',
})

expect(mocks.activate).toHaveBeenCalledOnce()
expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
  repoRoot: '/workspace',
  branch: 'feature/a',
  worktreePath: '/workspace/goblin-feature-a',
  targetKind: 'branch-workspace',
  branchWorkspaceId: 'ws-1',
})
```

新增命令测试，要求包含失败仓库与路径、无真实换行，并通过 JSON 编码保护引号：

```ts
const command = buildBranchWorkspaceMergeConflictAiCommand('codex', 'api', {
  branch: 'main',
  path: '/workspace/api "quoted"',
})
expect(command).toContain('api')
expect(command).toContain('/workspace/api \\"quoted\\"')
expect(command).not.toMatch(/[\r\n]/)
```

- [x] **Step 2: 运行测试并确认 RED**

Run:

```text
bun run test src/web/ai-terminal-handoff.test.ts
```

Expected: FAIL，因为新导出尚不存在。

- [x] **Step 3: 实现通用填入核心**

定义：

```ts
export interface AiTerminalTargetHandoffInput {
  terminalBase: TerminalSessionBase
  command: string
  activate: () => void
}
```

`prefillAiTerminalTargetCommand()` 保持现有顺序：桥不可用直接失败；调用 `activate()`；以 `worktreeTerminalKey(repoRoot, worktreePath)` 读取快照；复用已选 `open` 或第一个 `open`；否则 `createTerminal(terminalBase)`；等待输入；`writeInput(key, command)`。

让旧 `prefillAiTerminalCommand()` 仅构造普通工作树 `terminalBase` 与导航回调后委托新核心。

- [x] **Step 4: 实现两个冲突命令构造器**

普通工作树提示词保持原文。子工作区提示词明确：当前目录是 branch workspace root、失败仓库名、精确冲突路径、最小修改与禁止 Git 收尾命令。两个构造器最终都委托：

```ts
buildAiHandoffCommand(provider, prompt)
```

- [x] **Step 5: 运行终端接管测试并确认 GREEN**

Run:

```text
bun run test src/web/ai-terminal-handoff.test.ts
```

Expected: PASS，且原普通工作树场景继续通过。

---

### Task 3: 共享 AI 操作块并保持普通工作树行为

**Files:**

- Create: `src/web/components/MergeConflictAiActions.tsx`
- Modify: `src/web/hooks/useMergeConflictAiActions.ts`
- Modify: `src/web/hooks/useMergeConflictAiActions.test.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

**Interfaces:**

- Produces: `useMergeConflictAiActions({ onHandoff })`
- Produces: `MergeConflictAiActions({ onHandoff, onHandoffComplete })`
- Consumes: Task 2 的普通工作树命令和 `prefillAiTerminalCommand()`。

- [x] **Step 1: 把 hook 测试改为通用回调契约并确认 RED**

Harness 使用：

```ts
useMergeConflictAiActions({ onHandoff: mocks.onHandoff })
```

测试 Codex / Claude 可用性、pending 锁定、`onHandoff(provider)` 参数、返回 false 时的本地错误，以及异常错误。当前 hook 仍要求 repo 导航字段，因此应失败。

- [x] **Step 2: 实现通用提供商 hook**

保留现有 provider query、AbortController、pending 与翻译行为；将具体终端调用替换为：

```ts
const ok = await input.onHandoff(provider)
```

hook 不再知道 repo、branch、worktree 或导航。

- [x] **Step 3: 创建共享操作块**

组件 props：

```ts
interface MergeConflictAiActionsProps {
  onHandoff: (provider: CommitMessageProvider) => Promise<boolean>
  onHandoffComplete: () => void
}
```

组件复用现有 `data-slot="merge-conflict-ai-actions"`、标题、两个按钮、pending 图标和错误区域；`action.onSelect()` 返回 true 时调用 `onHandoffComplete()`。

- [x] **Step 4: 让普通工作树成为目标适配器**

`BranchWriteDialogs.tsx` 中的小包装组件读取既有 navigation 与 `setDetailCollapsed`，为每个 provider 调用：

```ts
prefillAiTerminalCommand({
  repoId,
  branch,
  worktreePath,
  navigation,
  setDetailCollapsed,
  command: buildMergeConflictAiCommand(provider),
})
```

删除原文件内重复的按钮块实现。

- [x] **Step 5: 运行共享 hook 与普通工作树组件测试**

Run:

```text
bun run test src/web/hooks/useMergeConflictAiActions.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: PASS，包括“成功关闭、失败保留、只填入不执行”的现有断言。

---

### Task 4: 在批量合入/合出弹窗展示可接管现场

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`

**Interfaces:**

- Produces: `BranchWorkspaceMergeConflictAiHandoffInput`
- Adds prop: `onMergeConflictAiHandoff(input): Promise<boolean>`
- Consumes: Task 1 的失败成员现场与 Task 3 的共享操作块。

- [x] **Step 1: 写入 Renderer 失败测试**

构造批量合入与合出结果：

```ts
const retainedConflict = {
  repositoryName: 'api',
  phase: 'failed' as const,
  step: 'merge' as const,
  reason: 'merge-conflict' as const,
  message: 'conflict',
  conflictWorktree: { branch: 'feature/a', path: '/workspace/goblin-feature-a/api' },
}
```

验证：

- `data-slot="merge-conflict-ai-actions"` 出现；
- 点击 Codex 调用 `{ provider: 'codex', repositoryName: 'api', conflictWorktree }`；
- 回调 true 时 `onOpenChange(false)`；
- 回调 false 时弹窗保留并显示 `action.merge-conflict-ai-prefill-failed`；
- 普通失败、只有 `reason` 无 `conflictWorktree`、非 merge step 均不出现操作块。

- [x] **Step 2: 运行组件测试并确认 RED**

Run:

```text
bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```

Expected: FAIL，因为 panel 尚无接管 prop 和操作块。

- [x] **Step 3: 实现失败成员投影与共享操作块**

导出 Renderer 回调输入：

```ts
export interface BranchWorkspaceMergeConflictAiHandoffInput {
  provider: CommitMessageProvider
  repositoryName: string
  conflictWorktree: GitConflictWorktree
}
```

用一个小组件从 `result.members` 查找满足以下条件的第一个成员：

```ts
member.phase === 'failed' &&
  member.step === 'merge' &&
  member.reason === 'merge-conflict' &&
  member.conflictWorktree !== undefined
```

在合入与合出弹窗的 `DialogError` 后、`DialogFooter` 前复用该组件。

- [x] **Step 4: 运行组件测试并确认 GREEN**

Run:

```text
bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```

Expected: PASS。

---

### Task 5: 把接管接到子工作区根目录终端

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**

- Consumes: Task 2 的 `prefillAiTerminalTargetCommand()` 与 `buildBranchWorkspaceMergeConflictAiCommand()`。
- Consumes: `branchWorkspaceFolderContext()` 和 `branchWorkspaceTerminalBase()`。
- Supplies: Task 4 的 `onMergeConflictAiHandoff`。

- [x] **Step 1: 写入 Rail 集成失败测试**

扩展被 mock 的 `BranchWorkspaceGitActionPanel` props，捕获 `onMergeConflictAiHandoff`。触发后验证：

```ts
expect(useReposStore.getState().workspaceActiveContextByRoot[ROOT]).toEqual({
  kind: 'branch-workspace',
  branchWorkspaceId: 'branch-1',
})
expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
  repoRoot: ROOT,
  branch: 'feature/auth',
  worktreePath: '/workspace/goblin-feature-auth',
  targetKind: 'branch-workspace',
  branchWorkspaceId: 'branch-1',
})
expect(mocks.bridge.writeInput.mock.calls[0]![1]).toContain('/workspace/goblin-feature-auth/api')
```

另加已有根终端为 `open` 时复用、不会创建新终端的断言。

- [x] **Step 2: 运行 Rail 测试并确认 RED**

Run:

```text
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: FAIL，因为 callback 尚未传入。

- [x] **Step 3: 实现根终端适配**

在 `gitActionTarget` 有效时构造 callback：

```ts
const context = branchWorkspaceFolderContext(workspaceRootId, gitActionTarget)
return await prefillAiTerminalTargetCommand({
  terminalBase: branchWorkspaceTerminalBase(context),
  activate: () => {
    activateBranchWorkspace(workspaceRootId, gitActionTarget.id)
    onOpenDetailArea?.()
  },
  command: buildBranchWorkspaceMergeConflictAiCommand(input.provider, input.repositoryName, input.conflictWorktree),
})
```

把 callback 传给 `BranchWorkspaceGitActionPanel`。普通 desktop、compact root、overview 切换均依赖现有 `activateBranchWorkspace()`，不新增导航状态。

- [x] **Step 4: 运行 Rail 与终端测试并确认 GREEN**

Run:

```text
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/ai-terminal-handoff.test.ts
```

Expected: PASS。

---

### Task 6: 文档同步与完整验证

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-07-30-branch-workspace-merge-conflict-ai-handoff-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-branch-workspace-merge-conflict-ai-handoff.md`

**Interfaces:**

- Documents: `Branch workspace merge-conflict AI handoff`。

- [x] **Step 1: 同步实施状态**

确认 `CONTEXT.md` 的定义保持纯领域语言；将设计文档状态改为“已实施并验证”，补充实际验证结果；勾选计划中已完成步骤。

- [x] **Step 2: 运行定向测试集合**

Run:

```text
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts src/web/ai-terminal-handoff.test.ts src/web/hooks/useMergeConflictAiActions.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS。

- [x] **Step 3: 运行类型与架构检查**

Run:

```text
bun run typecheck
bun run check:architecture
```

Expected: PASS。

- [x] **Step 4: 运行全量测试**

Run:

```text
bun run test
```

Expected: PASS。

- [x] **Step 5: 检查补丁质量**

Run:

```text
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；状态仅包含本功能文档、源码与测试，不包含构建产物。

## Plan Self-Review

- Spec coverage：服务端权威现场、临时清理、根终端身份、提供商共享、成功/失败交互与全量验证均有对应任务。
- Placeholder scan：计划没有 TBD、模糊错误处理或“参照其他任务”步骤。
- Type consistency：`GitConflictWorktree`、`BranchWorkspaceMergeConflictAiHandoffInput`、`prefillAiTerminalTargetCommand()` 和共享组件 props 在生产者与消费者之间名称一致。
- Scope：单一纵向功能切片，不包含自动冲突解决、终端持久化或批量流水线重构。

## Execution Result

- 定向回归：6 个测试文件、143 个测试通过。
- 全量回归：380 个测试文件、3587 个测试通过。
- 类型检查：main、web、test 三套工程通过。
- 架构、变更文件格式和补丁空白检查通过。
- 未新增依赖，未创建 Git 提交。
