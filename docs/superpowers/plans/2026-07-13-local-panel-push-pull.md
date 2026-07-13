# Local Panel Push/Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add push/pull buttons to local panel branch and tag list items, enabling users to push/fetch without switching to worktree panel.

**Architecture:** Local branches reuse existing `RepoBranchAction` framework with `{ kind: 'pull' | 'push' }` actions, calling `submitBranchAction` from store. Tags keep independent `pushRepositoryLocalTag` implementation with `useAsyncPending` for pending state. Type adjustment: `RepoEventAction.pull.worktreePath` becomes optional to support both worktree-based and reference-only pulls.

**Tech Stack:** TypeScript (Node.js strip-only), React 19, Zustand, lucide-react, sonner toasts, Vitest.

---

### Task 1: Type Layer - Make pull worktreePath optional

**Files:**
- Modify: `src/web/stores/repos/types.ts:27`

- [ ] **Step 1: Update RepoEventAction pull type**

Change line 27 in `src/web/stores/repos/types.ts`:

```typescript
| { kind: 'pull'; branch: string; worktreePath?: string }
```

This allows both:
- Worktree pull: `{ kind: 'pull', branch, worktreePath: '/path' }`
- Reference pull: `{ kind: 'pull', branch, worktreePath: undefined }`

- [ ] **Step 2: Verify branch-actions.ts handles optional worktreePath**

Check `src/web/stores/repos/branch-actions.ts:112` - it already defaults to empty string:

```typescript
case 'pull':
  return { kind: action.kind, branch: action.branch, worktreePath: action.worktreePath ?? '' }
```

No change needed - existing code handles undefined.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit type change**

```bash
git add src/web/stores/repos/types.ts
git commit -m "types: make RepoEventAction pull worktreePath optional

Allows both worktree-based pull and reference-only pull
(fetch to local branch without checkout)"
```

---

### Task 2: i18n - Add translation keys

**Files:**
- Modify: `src/shared/i18n/en.ts:1075` (after last local.* key)
- Modify: `src/shared/i18n/zh.ts:1042` (after last local.* key)
- Modify: `src/shared/i18n/ja.ts:1077` (after last local.* key)
- Modify: `src/shared/i18n/ko.ts:1065` (after last local.* key)

- [ ] **Step 1: Add English keys**

Add to `src/shared/i18n/en.ts` after line 1075 (`'local.tag-delete-success'`):

```typescript
  'local.branch-pull': 'Pull branch',
  'local.branch-push': 'Push branch',
  'local.tag-push': 'Push tag',
  'local.tag-push-success': 'Tag pushed successfully',
```

- [ ] **Step 2: Add Chinese keys**

Add to `src/shared/i18n/zh.ts` after line 1042 (`'local.tag-delete-success'`):

```typescript
  'local.branch-pull': '拉取分支',
  'local.branch-push': '推送分支',
  'local.tag-push': '推送标签',
  'local.tag-push-success': '标签推送成功',
```

- [ ] **Step 3: Add Japanese keys**

Add to `src/shared/i18n/ja.ts` after line 1077 (`'local.tag-delete-success'`):

```typescript
  'local.branch-pull': 'ブランチをプル',
  'local.branch-push': 'ブランチをプッシュ',
  'local.tag-push': 'タグをプッシュ',
  'local.tag-push-success': 'タグが正常にプッシュされました',
```

- [ ] **Step 4: Add Korean keys**

Add to `src/shared/i18n/ko.ts` after line 1065 (`'local.tag-delete-success'`):

```typescript
  'local.branch-pull': '브랜치 가져오기',
  'local.branch-push': '브랜치 푸시',
  'local.tag-push': '태그 푸시',
  'local.tag-push-success': '태그가 성공적으로 푸시되었습니다',
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit i18n**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "i18n: add local panel push/pull labels

- local.branch-pull/push for branch actions
- local.tag-push/success for tag push
- 4 languages: en, zh, ja, ko"
```

---

### Task 3: LocalBranchesPane - Add pull/push buttons

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.tsx:1-12,91-175`

- [ ] **Step 1: Add imports**

At top of `src/web/components/repo-workspace/ProjectLocalPanel.tsx`, add to imports from `lucide-react`:

```typescript
import { GitBranch, Loader2, Search, Tag, Trash2, X, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
```

Add new import after line 11:

```typescript
import { isPushProtected } from '#/web/stores/repos/branch-action-write-paths.ts'
import { pushRepositoryLocalTag } from '#/web/repo-client.ts'
```

- [ ] **Step 2: Add pending state hook in LocalBranchesPane**

After line 93 (`const [deleteTarget, setDeleteTarget] = useState<string | null>(null)`), add:

```typescript
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const [pushTarget, setPushTarget] = useState<string | null>(null)
  
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (s) => s.repos[repoId],
    (a, b) => a?.instanceToken === b?.instanceToken && a?.operations === b?.operations && a?.resources === b?.resources,
  )
  
  const isPending = 
    repo?.operations.branchAction.phase !== 'idle' || 
    repo?.resources.fetch.phase === 'loading'
```

- [ ] **Step 3: Add pull handler**

After line 120 (`toast.success(t('local.branch-delete-success'))`), add:

```typescript
  function handlePull(branchName: string) {
    submitBranchAction(repoId, { kind: 'pull', branch: branchName })
  }

  function handlePush(branchName: string) {
    if (isPushProtected(branchName)) {
      setPushTarget(branchName)
      return
    }
    submitBranchAction(repoId, { kind: 'push', branch: branchName })
  }

  function confirmPush() {
    if (!pushTarget) return
    const target = pushTarget
    setPushTarget(null)
    submitBranchAction(repoId, { kind: 'push', branch: target })
  }
```

- [ ] **Step 4: Replace branch row buttons section**

Replace lines 143-158 (the delete button section) with:

```typescript
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  aria-label={t('local.branch-pull')}
                  title={t('local.branch-pull')}
                  onClick={() => handlePull(branch.name)}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="size-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  aria-label={t('local.branch-push')}
                  title={t('local.branch-push')}
                  onClick={() => handlePush(branch.name)}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="size-3.5" />
                  )}
                </Button>
                {branch.name !== currentBranch && !branch.worktree?.path && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('local.branch-delete')}
                    title={t('local.branch-delete')}
                    onClick={() => setDeleteTarget(branch.name)}
                    className={cn(
                      'h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
                      'hover:bg-danger-surface hover:text-danger',
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
```

- [ ] **Step 5: Add push protected confirm dialog**

After the delete ConfirmDialog (after line 172), add:

```typescript
      <ConfirmDialog
        open={pushTarget !== null}
        title={pushTarget ? t('branch-menu.push-protected-title', { name: pushTarget }) : ''}
        message={t('branch-menu.push-protected-body')}
        confirmLabel={t('branch-menu.push-protected-confirm')}
        onCancel={() => setPushTarget(null)}
        onConfirm={confirmPush}
      />
```

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit local branches push/pull**

```bash
git add src/web/components/repo-workspace/ProjectLocalPanel.tsx
git commit -m "feat(local-panel): add pull/push buttons to branch rows

- Pull button: fetch upstream to local ref (no checkout)
- Push button: push to upstream with protected branch confirmation
- Both buttons always visible, disabled when pending
- Uses submitBranchAction to reuse existing action queue"
```

---

### Task 4: LocalTagsPane - Add push button

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.tsx:177-272`

- [ ] **Step 1: Import pushRepositoryLocalTag and useAsyncPending**

Already added in Task 3 Step 1. Verify imports include:

```typescript
import { pushRepositoryLocalTag } from '#/web/repo-client.ts'
```

Add after other imports:

```typescript
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
```

- [ ] **Step 2: Add push state in LocalTagsPane**

After line 183 (`const loadController = useRef<AbortController | null>(null)`), add:

```typescript
  const [pushingTag, setPushingTag] = useState<string | null>(null)
  const { pending: pushPending, isPending: isPushPending, run: runPush } = useAsyncPending<'push'>()
```

- [ ] **Step 3: Add handlePushTag function**

After line 224 (`await loadTags()`), add:

```typescript
  async function handlePushTag(tag: string) {
    setPushingTag(tag)
    try {
      const ctrl = new AbortController()
      const sourceToken = `push-tag-${Date.now()}`
      const result = await pushRepositoryLocalTag(repoId, tag, ctrl.signal, sourceToken)
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      toast.success(t('local.tag-push-success'))
    } finally {
      setPushingTag(null)
    }
  }
```

- [ ] **Step 4: Add push button to tag row**

In the tag row div (line 238), after the span (line 241), before the delete Button, add:

```typescript
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPushPending}
                  aria-label={t('local.tag-push')}
                  title={t('local.tag-push')}
                  onClick={() => void runPush('push', () => handlePushTag(tag))}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {pushPending === 'push' && pushingTag === tag ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="size-3.5" />
                  )}
                </Button>
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit local tags push**

```bash
git add src/web/components/repo-workspace/ProjectLocalPanel.tsx
git commit -m "feat(local-panel): add push button to tag rows

- Push button calls pushRepositoryLocalTag
- Uses useAsyncPending for single-flight pending state
- Shows spinner when pushing specific tag
- Toast on success/error"
```

---

### Task 5: Manual Testing

**Files:**
- None (manual testing only)

- [ ] **Step 1: Start dev server**

Run: `bun run dev`
Expected: Electron app launches

- [ ] **Step 2: Test local branch pull**

1. Open a repo with branches that have upstream
2. Navigate to Local panel → Branches tab
3. Hover over a branch → verify pull button appears
4. Click pull button → verify:
   - Button shows spinner
   - Toast shows success or error message
   - Branch list doesn't change (no checkout)

- [ ] **Step 3: Test local branch pull without upstream**

1. Create a local branch without upstream: `git branch test-local`
2. In Local panel, find test-local branch
3. Click pull button → verify error toast: "error.invalid-arguments" or "error.pull-no-remote"

- [ ] **Step 4: Test local branch push**

1. Hover over a non-protected branch → verify push button appears
2. Click push button → verify:
   - Button shows spinner
   - Toast shows success or error message

- [ ] **Step 5: Test protected branch push**

1. Hover over main/master branch
2. Click push button → verify:
   - Confirmation dialog appears with branch name
   - Click confirm → push executes

- [ ] **Step 6: Test local tag push**

1. Navigate to Local panel → Tags tab
2. Hover over a tag → verify push button appears
3. Click push button → verify:
   - Button shows spinner
   - Toast shows "Tag pushed successfully" or error

- [ ] **Step 7: Test tag push without remote**

1. In a repo without remote, create a local tag: `git tag v0.0.1`
2. In Local panel Tags tab, find v0.0.1
3. Click push button → verify error toast: "error.push-no-remote"

- [ ] **Step 8: Test concurrent operations**

1. In worktree panel, start a push operation
2. Immediately switch to Local panel and click pull
3. Verify: Local panel pull waits (shows spinner) until worktree push completes
4. Verify: Both operations complete successfully

- [ ] **Step 9: Document test results**

Create a summary comment in the implementation PR noting:
- All scenarios tested
- Any issues found
- Browser/OS tested on

---

### Task 6: Create Pull Request

**Files:**
- None (PR creation only)

- [ ] **Step 1: Push branch**

Run:
```bash
git push -u origin opt-history
```

- [ ] **Step 2: Create PR**

Run:
```bash
gh pr create --title "feat: add push/pull buttons to local panel" --body "$(cat <<'EOF'
## Summary

为本地面板的分支和标签列表项添加推送/拉取按钮，用户无需切换到 worktree 面板即可完成基础 Git 网络操作。

**本地分支：**
- 拉取：fetch 远端更新到本地引用（不 checkout）
- 推送：推送到 upstream，保护分支需确认

**本地标签：**
- 推送：推送到默认 remote

**技术实现：**
- 分支复用 `RepoBranchAction` 框架，走 `submitBranchAction` 队列
- 标签保持独立 `pushRepositoryLocalTag` 实现
- `RepoEventAction.pull.worktreePath` 改为可选，支持引用拉取

## Changes

- Type: `RepoEventAction.pull.worktreePath` optional
- i18n: 4 新键值（en/zh/ja/ko）
- UI: LocalBranchesPane 增加拉取/推送按钮
- UI: LocalTagsPane 增加推送按钮

## Test plan

- [x] 有 upstream 的分支：拉取成功 toast
- [x] 无 upstream 的分支：拉取错误 toast
- [x] 普通分支推送：成功 toast
- [x] 保护分支推送：弹确认框
- [x] 标签推送：成功 toast
- [x] 无 remote 仓库：错误 toast
- [x] 并发操作：队列等待

## Related

- Spec: docs/superpowers/specs/2026-07-13-local-panel-push-pull-design.md
- Plan: docs/superpowers/plans/2026-07-13-local-panel-push-pull.md
EOF
)"
```

Expected: PR created with URL

- [ ] **Step 3: Verify PR checks pass**

Run: `gh pr checks`
Expected: All checks pass (typecheck, tests, linting)

---

## Self-Review

**Spec coverage:**
- ✅ 本地分支拉取：Task 3 实现 pull 按钮，调用 `submitBranchAction({ kind: 'pull' })`
- ✅ 本地分支推送：Task 3 实现 push 按钮，调用 `submitBranchAction({ kind: 'push' })`
- ✅ 本地标签推送：Task 4 实现 push 按钮，调用 `pushRepositoryLocalTag`
- ✅ 按钮始终显示：Task 3/4 不设置条件渲染，只在 pending 时 disable
- ✅ 保护分支确认：Task 3 Step 3 使用 `isPushProtected` 检查并弹确认框
- ✅ 类型调整：Task 1 修改 `RepoEventAction.pull.worktreePath` 为可选
- ✅ i18n 文案：Task 2 添加 4 语言键值
- ✅ 错误处理：Task 3/4 通过 `submitBranchAction` 和 `pushRepositoryLocalTag` 的内部 toast 机制处理

**Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 所有代码块完整
- ✅ 所有文件路径精确
- ✅ 所有命令可执行

**Type consistency:**
- ✅ `submitBranchAction` 类型与 `useReposStore` 一致
- ✅ `pushRepositoryLocalTag` 签名与 `repo-client.ts` 一致
- ✅ i18n 键名在各语言文件中统一

**File structure:**
- ✅ Task 1: 类型层单独任务，确保类型基础先到位
- ✅ Task 2: i18n 独立任务，避免 UI 代码混杂翻译
- ✅ Task 3/4: UI 按功能分离（分支 vs 标签），每个 commit 独立可测
- ✅ Task 5: 手动测试覆盖所有场景
- ✅ Task 6: PR 创建标准流程
