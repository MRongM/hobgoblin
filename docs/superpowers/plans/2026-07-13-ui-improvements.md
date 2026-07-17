# UI 改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三个独立的 UI 改进：允许强制删除未合并分支（带二次确认）、统一终端按钮图标、统一最近操作图标与菜单一致。

**Architecture:** 前端优先，通过检测后端返回的 `error.branch-not-fully-merged` 错误信息触发未合并分支的二次确认对话框，然后使用 `force: true` 重新调用删除接口。图标改动仅涉及 lucide-react 导入替换与渲染表达式变更。

**Tech Stack:** React 19, TypeScript, Zustand, lucide-react, i18next, shadcn/ui (AlertDialog), Vitest

---

## 文件结构

**要修改的文件：**

1. `src/web/components/repo-workspace/ProjectLocalPanel.tsx`
   - 增加未合并分支二次确认逻辑
   - 新增 `handleForceDelete` 函数与 `unmergedDeleteTarget` 状态
   - 新增未合并确认对话框

2. `src/web/components/repo-workspace/RepoExplorerPane.tsx`
   - 终端按钮图标替换（统一使用 lucide `Terminal`）
   - 最近操作图标 `commit` 和 `createWorktree` 映射调整

3. `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
   - 新增三个国际化键：`local.branch-unmerged-confirm-title`、`local.branch-unmerged-confirm-body`、`local.branch-force-delete`

**不需要修改的文件：**
- 后端 `repo-backend.ts` 已经支持 `force: true` 跳过合并检查
- `deleteRepositoryBranch` 客户端 API 已经支持 `options.force` 参数

---

## Task 1: 图标一致性 - 更新 RECENT_ACTION_ICONS

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:4` (导入语句)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:236-240` (RECENT_ACTION_ICONS 常量)

- [ ] **Step 1: 调整 lucide-react 导入语句**

修改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 第 4 行导入语句，将 `FolderTree` 替换为 `FolderPlus`，将 `GitCommitHorizontal` 替换为 `SendHorizontal`：

```tsx
import { FolderPlus, FolderGit, FolderMinus, GitBranch, GitBranchPlus, SendHorizontal, GitCompareArrows, GitFork, GitMerge, History, RadioTower, Tag, ChevronDown, ArrowDown, ArrowUp, CloudDownload, Trash2, type LucideIcon } from 'lucide-react'
```

- [ ] **Step 2: 更新 RECENT_ACTION_ICONS 映射**

修改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 第 236-240 行的 `RECENT_ACTION_ICONS` 常量：

```tsx
const RECENT_ACTION_ICONS: Record<RepoEventAction['kind'], typeof GitBranch> = {
  checkout: GitBranch, pull: ArrowDown, push: ArrowUp, commit: SendHorizontal,
  merge: GitMerge, createWorktree: FolderPlus, createBranch: GitBranchPlus,
  trackRemoteBranch: CloudDownload, deleteBranch: Trash2, removeWorktree: FolderMinus,
}
```

- [ ] **Step 3: 运行类型检查**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 4: 运行相关测试**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane`
Expected: 所有已存在的测试通过（如果有），或无匹配测试

- [ ] **Step 5: 提交**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx
git commit -m "refactor(repo-explorer): align recent-action icons with menu icons"
```

---

## Task 2: 终端按钮统一图标

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:4` (再次调整导入)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:28` (移除 TerminalAppIcon 导入)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:194` (移除未使用的变量)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:215-231` (更新终端按钮渲染)

- [ ] **Step 1: 在 lucide-react 导入中添加 Terminal**

修改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 第 4 行导入语句，添加 `Terminal`：

```tsx
import { FolderPlus, FolderGit, FolderMinus, GitBranch, GitBranchPlus, SendHorizontal, GitCompareArrows, GitFork, GitMerge, History, RadioTower, Tag, Terminal, ChevronDown, ArrowDown, ArrowUp, CloudDownload, Trash2, type LucideIcon } from 'lucide-react'
```

- [ ] **Step 2: 从 ExternalAppIcon 导入中移除 TerminalAppIcon**

修改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 第 28 行的导入语句（只保留 `EditorAppIcon`）：

```tsx
import { EditorAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
```

- [ ] **Step 3: 移除未使用的 terminalIconPref 变量**

在 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 中找到 `BranchAreaQuickActionsInner` 函数内的这一行（第 194 行附近）：

```tsx
const terminalIconPref = repo.remote.target ? 'auto' : (resolvedTerminalApp ?? terminalApp)
```

删除这一行。同时检查 `useRuntimeExternalAppSettings` 的解构（第 186-187 行），如果 `terminalApp` 和 `resolvedTerminalApp` 除此之外无其他使用，也一并从解构中移除：

修改前：
```tsx
const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
  useRuntimeExternalAppSettings()
```

修改后（仅保留仍使用的字段）：
```tsx
const { terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
  useRuntimeExternalAppSettings()
```

- [ ] **Step 4: 更新终端按钮渲染**

修改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 中 `BranchAreaQuickActionsInner` 组件的终端按钮（约第 215-231 行）：

```tsx
{terminalItem && (
  <Tip label={terminalItem.title ?? terminalItem.label}>
    <span className="inline-flex">
      <AsyncButton
        data-testid="branch-area-terminal-btn"
        variant="ghost"
        size="icon-sm"
        loading={terminalItem.busy}
        disabled={terminalItem.disabled || !terminalAvailable}
        onClick={terminalItem.onSelect}
        aria-label={terminalItem.ariaLabel ?? terminalItem.label}
      >
        {() => <Terminal className="size-4" />}
      </AsyncButton>
    </span>
  </Tip>
)}
```

**注意：** `AsyncButton` 的 children 是一个函数返回 ReactNode，所以要保持 `{() => ...}` 结构，只是把内容从 `createElement(TerminalAppIcon, { pref: terminalIconPref })` 改为 `<Terminal className="size-4" />`。

- [ ] **Step 5: 检查 createElement 导入是否仍需要**

在文件顶部第 2 行查看：`import { useCallback, useEffect, useState, createElement } from 'react'`。

由于 EditorAppIcon 仍使用 `createElement`，此导入需保留。无需修改。

- [ ] **Step 6: 运行类型检查**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 7: 运行相关测试**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane`
Expected: 所有测试通过

- [ ] **Step 8: 提交**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx
git commit -m "refactor(repo-explorer): unify terminal button icon"
```

---

## Task 3: 添加未合并分支删除相关国际化文本

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: 在 en.ts 中添加三个新键**

打开 `src/shared/i18n/en.ts`，找到 `'local.branch-delete-success': 'Branch deleted.'` 这一行（约在其他 `local.branch-*` 键附近），在其后添加：

```typescript
  'local.branch-unmerged-confirm-title': 'Force delete unmerged branch {name}?',
  'local.branch-unmerged-confirm-body': 'This branch has commits that are not merged. Deleting it may cause work to be lost. Continue?',
  'local.branch-force-delete': 'Force delete',
```

- [ ] **Step 2: 在 zh.ts 中添加三个新键**

打开 `src/shared/i18n/zh.ts`，找到 `'local.branch-delete-success': '分支已删除。'` 这一行，在其后添加：

```typescript
  'local.branch-unmerged-confirm-title': '强制删除未合并分支 {name}？',
  'local.branch-unmerged-confirm-body': '该分支存在未合并的提交，删除后可能丢失工作内容。确定继续吗？',
  'local.branch-force-delete': '强制删除',
```

- [ ] **Step 3: 在 ja.ts 中添加三个新键**

打开 `src/shared/i18n/ja.ts`，找到对应的 `local.branch-delete-success` 键（如无对应，需先查看该文件寻找相似位置），在其后添加：

```typescript
  'local.branch-unmerged-confirm-title': '未マージのブランチ {name} を強制削除しますか?',
  'local.branch-unmerged-confirm-body': 'このブランチには未マージのコミットがあります。削除すると作業内容が失われる可能性があります。続行しますか?',
  'local.branch-force-delete': '強制削除',
```

- [ ] **Step 4: 在 ko.ts 中添加三个新键**

打开 `src/shared/i18n/ko.ts`，找到对应的 `local.branch-delete-success` 键，在其后添加：

```typescript
  'local.branch-unmerged-confirm-title': '병합되지 않은 브랜치 {name}을(를) 강제 삭제하시겠습니까?',
  'local.branch-unmerged-confirm-body': '이 브랜치에는 병합되지 않은 커밋이 있습니다. 삭제하면 작업이 손실될 수 있습니다. 계속하시겠습니까?',
  'local.branch-force-delete': '강제 삭제',
```

- [ ] **Step 5: 运行类型检查**

Run: `bun run typecheck`
Expected: 无类型错误。i18n 类型是通过 `en.ts` 的键名推导出来的，所以其他文件必须包含相同的键。

- [ ] **Step 6: 运行 i18n 相关测试**

Run: `bun run test src/shared/i18n`
Expected: 所有测试通过（`dictionaries.test.ts`、`snapshot.test.ts` 等应验证键完整性）

- [ ] **Step 7: 提交**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "i18n: add unmerged branch force-delete labels"
```

---

## Task 4: 实现未合并分支强制删除逻辑 - 编写测试

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.tsx` (稍后)
- Create/Modify: `src/web/components/repo-workspace/ProjectLocalPanel.test.tsx` (如果不存在则创建)

- [ ] **Step 1: 检查测试文件是否存在**

Run: `ls src/web/components/repo-workspace/ProjectLocalPanel.test.tsx 2>&1 || echo "not exists"`

如果不存在，需要在下一步创建。如果存在，需要打开查看现有测试结构，然后在其中添加新的测试用例。

- [ ] **Step 2: 编写测试 - 常规删除**

在 `src/web/components/repo-workspace/ProjectLocalPanel.test.tsx` 中添加以下测试用例（如果文件不存在需要创建完整的测试文件骨架，参考同目录下其他 `.test.tsx` 的写法，例如 `ProjectRemoteBranchesPanel.test.tsx`）：

需要覆盖的测试场景（用文字描述，具体实现依据现有测试模式）：

1. **场景 A：删除已合并的分支应显示常规确认对话框**
   - Mock `deleteRepositoryBranch` 返回 `{ ok: true }`
   - 触发删除按钮 → 断言常规确认对话框可见（`local.branch-confirm-title`）
   - 点击确认 → 断言 `deleteRepositoryBranch` 被调用时 `options` 为 `undefined` 或 `{ force: false }`

2. **场景 B：删除未合并的分支应显示强制确认对话框**
   - Mock `deleteRepositoryBranch` 首次调用返回 `{ ok: false, message: 'error.branch-not-fully-merged' }`
   - 触发删除 → 点击常规确认 → 断言强制确认对话框可见（`local.branch-unmerged-confirm-title`）
   - 点击强制删除 → 断言 `deleteRepositoryBranch` 被再次调用且 `options.force === true`

3. **场景 C：在强制确认对话框中取消**
   - Mock 后端返回未合并错误
   - 触发删除 → 点击常规确认 → 强制对话框出现 → 点击取消
   - 断言 `deleteRepositoryBranch` 只被调用了一次（force 模式没有触发）

参考已有测试文件的写法（例如 `ProjectRemoteBranchesPanel.test.tsx`）来正确构建 mock 和 store 状态。

- [ ] **Step 3: 运行测试确认失败**

Run: `bun run test src/web/components/repo-workspace/ProjectLocalPanel`
Expected: 新增测试用例应失败（因为未合并强制删除逻辑还未实现）

- [ ] **Step 4: 提交测试骨架**

```bash
git add src/web/components/repo-workspace/ProjectLocalPanel.test.tsx
git commit -m "test(local-panel): add failing tests for unmerged branch force delete"
```

---

## Task 5: 实现未合并分支强制删除逻辑 - 前端实现

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.tsx`

- [ ] **Step 1: 在 LocalBranchesPane 中新增状态**

在 `src/web/components/repo-workspace/ProjectLocalPanel.tsx` 中，找到 `LocalBranchesPane` 函数（约第 93 行）。在现有的 `useState` 声明附近添加新的状态：

修改前：
```tsx
function LocalBranchesPane({ repoId, query }: { repoId: string; query: string }) {
  const t = useT()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const [pushTarget, setPushTarget] = useState<string | null>(null)
```

修改后：
```tsx
function LocalBranchesPane({ repoId, query }: { repoId: string; query: string }) {
  const t = useT()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [unmergedDeleteTarget, setUnmergedDeleteTarget] = useState<string | null>(null)
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const [pushTarget, setPushTarget] = useState<string | null>(null)
```

- [ ] **Step 2: 修改 handleDelete 函数处理未合并情况**

找到 `handleDelete` 函数（约第 124-134 行），修改为：

```tsx
async function handleDelete() {
  if (!deleteTarget) return
  const target = deleteTarget
  const result = await deleteRepositoryBranch(repoId, target)
  if (!result.ok) {
    if (result.message === 'error.branch-not-fully-merged') {
      setDeleteTarget(null)
      setUnmergedDeleteTarget(target)
      return
    }
    toast.error(result.message)
    return
  }
  setDeleteTarget(null)
  toast.success(t('local.branch-delete-success'))
}
```

- [ ] **Step 3: 新增 handleForceDelete 函数**

在 `handleDelete` 函数之后添加：

```tsx
async function handleForceDelete() {
  if (!unmergedDeleteTarget) return
  const target = unmergedDeleteTarget
  const result = await deleteRepositoryBranch(repoId, target, { force: true })
  if (!result.ok) {
    toast.error(result.message)
    setUnmergedDeleteTarget(null)
    return
  }
  setUnmergedDeleteTarget(null)
  toast.success(t('local.branch-delete-success'))
}
```

- [ ] **Step 4: 在 return JSX 中添加未合并确认对话框**

找到 return JSX 中现有的两个 `ConfirmDialog`（约第 229-245 行）。在两个 dialog 之间或最后添加第三个 dialog：

```tsx
<ConfirmDialog
  open={unmergedDeleteTarget !== null}
  title={
    unmergedDeleteTarget
      ? t('local.branch-unmerged-confirm-title', { name: unmergedDeleteTarget })
      : t('local.branch-unmerged-confirm-title')
  }
  message={t('local.branch-unmerged-confirm-body')}
  confirmLabel={t('local.branch-force-delete')}
  destructive
  onCancel={() => setUnmergedDeleteTarget(null)}
  onConfirm={handleForceDelete}
/>
```

- [ ] **Step 5: 运行类型检查**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 6: 运行测试**

Run: `bun run test src/web/components/repo-workspace/ProjectLocalPanel`
Expected: 上一任务新增的三个测试用例全部通过

- [ ] **Step 7: 运行完整测试套件确保无回归**

Run: `bun run test`
Expected: 全部测试通过

- [ ] **Step 8: 提交**

```bash
git add src/web/components/repo-workspace/ProjectLocalPanel.tsx
git commit -m "feat(local-panel): allow force-delete of unmerged branches with confirmation"
```

---

## Task 6: 端到端验证

**Files:** 无需修改文件，仅验证

- [ ] **Step 1: 运行完整类型检查**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 2: 运行所有测试**

Run: `bun run test`
Expected: 所有测试通过，无失败

- [ ] **Step 3: 运行格式检查**

Run: `bun run format:check`
Expected: 所有文件符合 prettier 规范。如果有失败，运行 `bun run format` 并再次提交。

- [ ] **Step 4: 运行架构检查（如果项目有）**

Run: `bun run check:architecture`
Expected: 无架构违规

- [ ] **Step 5: 手动验证清单**

启动应用（`bun run dev`）并手动测试：

1. **分支删除**
   - [ ] 已合并分支删除 → 显示常规确认 → 删除成功
   - [ ] 未合并分支删除 → 常规确认 → 触发强制确认 → 强制删除成功
   - [ ] 未合并分支删除 → 常规确认 → 触发强制确认 → 取消 → 分支未删除
   - [ ] 当前分支不显示删除按钮
   - [ ] 有工作树的分支不显示删除按钮

2. **终端按钮**
   - [ ] 分支区顶部工具栏的终端按钮显示 `Terminal` 图标（`>_` 样式）
   - [ ] 悬浮显示 tooltip 文字（"Open terminal" / "打开终端" 等）
   - [ ] 点击可正常打开终端

3. **最近操作图标**
   - [ ] 执行 `commit` 操作后，最近操作区图标为 `SendHorizontal`（发送样式）
   - [ ] 执行 `createWorktree` 操作后，最近操作区图标为 `FolderPlus`（文件夹加号）
   - [ ] 与分支下拉菜单中对应操作的图标视觉一致

如所有项通过，本计划实施完毕。

---

## Self-Review 检查记录

**1. Spec coverage 检查：**
- ✅ 功能 1（未合并分支强制删除）→ Task 3 + Task 4 + Task 5
- ✅ 功能 2（终端按钮统一图标）→ Task 2
- ✅ 功能 3（最近操作图标一致）→ Task 1
- ✅ 国际化需求 → Task 3

**2. Placeholder 检查：** 无 TBD/TODO；所有代码片段完整。

**3. Type consistency 检查：**
- `deleteTarget` 与 `unmergedDeleteTarget` 类型统一为 `string | null`
- `handleDelete` 与 `handleForceDelete` 均为 `async () => Promise<void>`
- `RECENT_ACTION_ICONS` 保持 `Record<RepoEventAction['kind'], typeof GitBranch>` 类型不变

**4. 依赖假设检查：**
- `deleteRepositoryBranch(repoId, target, { force: true })` 是已存在 API（`src/web/repo-client.ts`）
- 后端 `validateBranchDeletionPolicy` 已经在 `force: true` 时跳过合并检查（`src/shared/repo-action-policy.ts:33-35`）
- `ConfirmDialog` 支持 `destructive` 属性（`src/web/components/ConfirmDialog.tsx`）
- 未合并错误信息为 `'error.branch-not-fully-merged'`（已确认在 4 个 i18n 文件中）
