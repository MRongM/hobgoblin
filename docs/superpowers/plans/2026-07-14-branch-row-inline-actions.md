# 分支区 item 与 toolbar 简化 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简化分支 item 展示（移除 worktree 路径行、hash tag 去 badge 化），并把编辑/终端/最近操作 icon 从 BranchArea 顶部 toolbar 迁移到每个 branch row 内部。

**Architecture:** 三个文件的定向修改。`BranchSummaryInline` 只改渲染输出；`BranchRow` 内新增编辑/终端两个 AsyncButton（复用 `useBranchActionItems.externalItems`）并将最近操作数从 3 减为 1；`RepoExplorerPane` 中的 `BranchArea` 移除整个 toolbar 及其支持函数。同步修改覆盖三个组件的测试。

**Tech Stack:** TypeScript 6, React 19, Tailwind CSS 4, Vitest, Testing Library, lucide-react。

**Spec:** `docs/superpowers/specs/2026-07-14-branch-row-inline-actions-design.md`

---

## 文件结构

| 文件 | 变更 |
|---|---|
| `src/web/components/repo-workspace/BranchSummaryInline.tsx` | 修改 — hash tag 从 Badge 改为 span；移除 worktree 路径行 |
| `src/web/components/branch-list/BranchRow.tsx` | 修改 — `BranchRowRecentActions` 减为 1；行内加编辑/终端按钮 |
| `src/web/components/repo-workspace/RepoExplorerPane.tsx` | 修改 — 删除 `BranchArea` 中的 `<Toolbar>` 及其支持代码 |
| `src/web/components/branch-list/BranchRow.test.tsx` | 修改 — 更新 hash tag / worktree path 相关测试 |
| `src/web/components/repo-workspace/RepoExplorerPane.test.tsx` | 修改 — 删除 toolbar 相关测试，迁移编辑/终端按钮断言到 row 内部 |

---

## Task 1: BranchSummaryInline — hash tag 从 Badge 改为 span

**Files:**
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx:116-130` (hash tag JSX)

- [ ] **Step 1: 修改 BranchRow 测试以验证新样式（先写失败测试）**

编辑 `src/web/components/branch-list/BranchRow.test.tsx:271-294`，用以下内容替换：

```tsx
  test('shows the abbreviated commit hash tag after the branch name', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { lastCommitHash: 'abc123456789' })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    const branchName = document.body.querySelector('.text-sm.font-medium')
    const hashTag = document.body.querySelector<HTMLElement>('[data-testid="branch-hash-tag"]')

    expect(branchName?.textContent).toBe('feature/a')
    expect(hashTag?.tagName).toBe('SPAN')
    expect(hashTag?.textContent).toBe('#abc1234')
    // hash tag 不再有独立的 title 悬停
    expect(hashTag?.hasAttribute('title')).toBe(false)
    // muted 文本样式（非 badge 边框）
    expect(hashTag?.className).toContain('font-mono')
    expect(hashTag?.className).toContain('text-muted-foreground')
    expect(hashTag?.className).not.toMatch(/border-/)
  })
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "shows the abbreviated commit hash tag"
```

Expected: FAIL — 现在的实现仍是 `<Badge>` 且有 `title`。

- [ ] **Step 3: 修改 BranchSummaryInline hash tag 渲染**

打开 `src/web/components/repo-workspace/BranchSummaryInline.tsx`，找到第 116-130 行的 hash tag block，替换为：

```tsx
          {commitHashTag && (
            <span
              data-testid="branch-hash-tag"
              className={cn(
                'font-mono text-[10px] font-medium tabular-nums',
                selected ? 'text-selected-muted-foreground' : 'text-muted-foreground',
              )}
            >
              {commitHashTag}
            </span>
          )}
```

注意：
- `<Badge>` → `<span>`
- 移除 `title={commitHashTag}` 和 `variant="outline"`
- 移除 `border-border/60 px-1` 边框和内边距（不再是 badge 视觉）
- 移除 `h-4` 固定高度（普通 inline 文本自然对齐）
- 保留 `data-testid="branch-hash-tag"`、`font-mono`、`text-[10px]`、`tabular-nums`
- 简化颜色 class：`selected` 时用 `text-selected-muted-foreground`，否则 `text-muted-foreground`（去掉 `/40`、`border-` 变体）

- [ ] **Step 4: 运行测试确认通过**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "shows the abbreviated commit hash tag"
```

Expected: PASS。

- [ ] **Step 5: 确认 Badge 是否还在文件中使用**

```bash
grep -n "Badge" src/web/components/repo-workspace/BranchSummaryInline.tsx
```

Expected: 输出中仍有 `Badge` 的其它使用（`terminal-count-badge`、`dirty-worktree-badge`、`branches.gone`）。保留 `import { Badge } from '#/web/components/ui/badge.tsx'`。

---

## Task 2: BranchSummaryInline — 移除 worktree 路径行

**Files:**
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx:187-198` (第二行 worktreePath 显示)

- [ ] **Step 1: 修改 BranchRow 测试以验证 worktree 路径不再作为独立文本显示**

编辑 `src/web/components/branch-list/BranchRow.test.tsx`，将第 243-269 行的测试整体替换为：

```tsx
  test('shows the branch name only; worktree path lives in the row title', () => {
    const repo = emptyRepo('/Users/test/Desktop/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-optimize', 'repo')
    const branch = createRepoBranch('feature/a', {
      worktree: { path: '/Users/test/Desktop/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-optimize' },
    })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.querySelector('.text-sm.font-medium')?.textContent).toBe('feature/a')
    // worktree 路径不再作为独立 aria-label 元素显示
    expect(document.body.querySelector('[aria-label="hobgoblin-feat-optimize"]')).toBeNull()
    // 但仍出现在整行的 title 悬停中
    const rowSummary = document.body.querySelector<HTMLElement>('[title*="hobgoblin-feat-optimize"]')
    expect(rowSummary).not.toBeNull()
  })
```

- [ ] **Step 2: 修改另一个引用 worktreePath 的测试**

编辑 `src/web/components/branch-list/BranchRow.test.tsx:296-322` 那个 `centers the worktree icon beside the full two-line worktree summary` 测试，替换为：

```tsx
  test('centers the worktree icon beside the single-line worktree summary', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    const summary = document.querySelector<HTMLElement>('li > .pointer-events-none > [title*="feature/a"]')
    const [iconColumn, textColumn] = Array.from(summary?.children ?? []) as HTMLElement[]

    expect(summary?.className).toContain('grid-cols-[1rem_minmax(0,1fr)]')
    expect(summary?.className).toContain('items-center')
    expect(iconColumn?.querySelector('svg')?.classList.contains('lucide-folder-tree')).toBe(true)
    expect(textColumn?.textContent).toContain('feature/a')
    // 路径不再显示在文本内容里（只在 title 悬停中）
    expect(textColumn?.textContent).not.toContain('worktree-a')
  })
```

- [ ] **Step 3: 修改第三个引用 worktreePath 的测试**

编辑 `src/web/components/branch-list/BranchRow.test.tsx:324-346` 那个 `does not render the neutral worktree badge for clean linked worktree rows` 测试。将 `expect(document.body.querySelector('[aria-label="worktree-a"]')).not.toBeNull()` 和 `expect(document.body.textContent).toContain('worktree-a')` 替换为：

```tsx
    // worktree 路径不再作为独立可见文本；只在整行 title 悬停中
    expect(document.body.querySelector('[aria-label="worktree-a"]')).toBeNull()
    const rowSummary = document.body.querySelector<HTMLElement>('[title*="worktree-a"]')
    expect(rowSummary).not.toBeNull()
```

- [ ] **Step 4: 运行以上三个测试确认失败**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "shows the branch name only; worktree path lives"
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "centers the worktree icon beside the single-line worktree summary"
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "does not render the neutral worktree badge"
```

Expected: FAIL for first two（worktreePath 仍作为独立元素渲染）；第三个可能因 aria-label 检查而失败。

- [ ] **Step 5: 修改 BranchSummaryInline 删除 worktreePath 行**

打开 `src/web/components/repo-workspace/BranchSummaryInline.tsx`，删除第 187-198 行整个 block：

```tsx
        {worktreePath && (
          <span
            title={worktreePath}
            aria-label={worktreePath}
            className={cn(
              'block min-w-0 truncate font-mono text-[11px] leading-3',
              selected ? 'text-selected-muted-foreground/90' : 'text-muted-foreground/85',
            )}
          >
            {worktreePath}
          </span>
        )}
```

**注意：`title` 数组（第 80-95 行）里的 `worktreePath` 变量保留 —— 整行 title 悬停仍需显示 worktree 路径。**

- [ ] **Step 6: 确认 worktreePath 变量是否可删除**

删除该 block 后，`worktreePath` 变量仅在第 89 行 title 数组里用到。保留其定义（第 69-71 行）不变。

- [ ] **Step 7: 运行相关测试确认通过**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx
```

Expected: 全部通过。

- [ ] **Step 8: 提交 BranchSummaryInline 变更**

```bash
# 提交需用户同意 —— 见"提交策略"章节
```

---

## Task 3: BranchRow — 减少最近操作数为 1

**Files:**
- Modify: `src/web/components/branch-list/BranchRow.tsx:135-201` (`BranchRowRecentActions` 相关)

- [ ] **Step 1: 修改 BranchRow.tsx 中最近操作数**

打开 `src/web/components/branch-list/BranchRow.tsx`，找到第 138-164 行 `BranchRowRecentActions`：

```tsx
function BranchRowRecentActions({ repo, branch }: { repo: BranchActionRepo; branch: RepoBranchState }) {
  const ids = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const r = s.repos[repo.id]
      if (!r) return [] as RepeatableActionId[]
      const found: RepeatableActionId[] = []
      for (let i = r.events.length - 1; i >= 0 && found.length < 3; i--) {
```

将 `found.length < 3` 改为 `found.length < 1`：

```tsx
      for (let i = r.events.length - 1; i >= 0 && found.length < 1; i--) {
```

- [ ] **Step 2: 验证类型和现有测试仍通过**

```bash
bun run typecheck
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx
```

Expected: PASS（此变更本身不破坏现有断言，因为原来测试就是"最多 3 个"的场景无严格上限断言）。

---

## Task 4: BranchRow — 行内加编辑/终端按钮

**Files:**
- Modify: `src/web/components/branch-list/BranchRow.tsx:88-133` (`BranchRowActions`)

- [ ] **Step 1: 写测试：验证 row 内有编辑/终端按钮（当分支有 worktree 时）**

在 `src/web/components/branch-list/BranchRow.test.tsx` 末尾（在最后一个 `test(...)` 之后但仍在 `describe` 块内）追加：

```tsx
  test('renders editor and terminal buttons inline before the actions dropdown when worktree exists', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    const editorBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="branch-row-editor-btn"]')
    const terminalBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="branch-row-terminal-btn"]')

    expect(editorBtn).not.toBeNull()
    expect(terminalBtn).not.toBeNull()
  })

  test('does not render editor/terminal inline buttons when branch has no worktree', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a') // no worktree

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    expect(document.body.querySelector('[data-testid="branch-row-editor-btn"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="branch-row-terminal-btn"]')).toBeNull()
  })
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx -t "renders editor and terminal buttons inline"
```

Expected: FAIL — 目前 row 内不存在这些按钮。

- [ ] **Step 3: 修改 BranchRow.tsx —— 引入新按钮**

打开 `src/web/components/branch-list/BranchRow.tsx`。

首先在 import 部分添加：

```tsx
import { createElement } from 'react'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
```

注意 `createElement` 已经通过 `import { ... } from 'react'` 引入过，你可能只需要加到那一行的 named import 里。检查文件顶部的 react import 并调整。

- [ ] **Step 4: 修改 BranchRowActions —— 用 hook 获取 external items 并渲染编辑/终端**

编辑第 88-133 行的 `BranchRowActions`，将其内部改为：

```tsx
function BranchRowActions({
  repo,
  branch,
  actionMenuOpen,
  onActionMenuOpenChange,
}: {
  repo: BranchActionRepo
  branch: RepoBranchState
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
}) {
  const actions = useBranchActionItems(repo, branch)
  return (
    <>
      <div className="pointer-events-none relative z-20 flex shrink-0 items-center py-1 pr-4">
        <div className="pointer-events-auto flex items-center gap-0.5">
          {branch.worktree?.path && (
            <div className="hidden md:flex items-center gap-0.5">
              <BranchRowExternalActions actions={actions} />
              <BranchRowRecentActions repo={repo} branch={branch} />
            </div>
          )}
          <BranchActionsDropdown
            repoId={repo.id}
            branchName={branch.name}
            patchItems={actions.patchItems}
            mainItems={actions.mainItems}
            externalItems={actions.externalItems}
            destructiveItems={actions.destructiveItems}
            open={actionMenuOpen}
            onOpenChange={onActionMenuOpenChange}
          />
        </div>
      </div>
      {actions.inlinePanel ? (
        <div
          className="col-span-full"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {actions.inlinePanel}
        </div>
      ) : null}
      {actions.dialogs}
    </>
  )
}
```

- [ ] **Step 5: 在 BranchRow.tsx 增加 `BranchRowExternalActions` 组件**

在 `BranchRowActions` 之后、`REPEATABLE_ACTION_IDS` 常量之前新增：

```tsx
function BranchRowExternalActions({ actions }: { actions: ReturnType<typeof useBranchActionItems> }) {
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()

  const editorItem = actions.externalItems.find((item) => item.id === 'editor')
  const terminalItem = actions.externalItems.find((item) => item.id === 'terminal')

  const editorIconPref = resolvedEditorApp ?? editorApp
  const terminalIconPref = resolvedTerminalApp ?? terminalApp

  return (
    <>
      {editorItem && (
        <Tip label={editorItem.title ?? editorItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-row-editor-btn"
              variant="ghost"
              size="icon-sm"
              loading={editorItem.busy}
              disabled={editorItem.disabled || !editorAvailable}
              onClick={(e) => {
                e.stopPropagation()
                return editorItem.onSelect()
              }}
              aria-label={editorItem.ariaLabel ?? editorItem.label}
            >
              {() => createElement(EditorAppIcon, { pref: editorIconPref })}
            </AsyncButton>
          </span>
        </Tip>
      )}
      {terminalItem && (
        <Tip label={terminalItem.title ?? terminalItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-row-terminal-btn"
              variant="ghost"
              size="icon-sm"
              loading={terminalItem.busy}
              disabled={terminalItem.disabled || !terminalAvailable}
              onClick={(e) => {
                e.stopPropagation()
                return terminalItem.onSelect()
              }}
              aria-label={terminalItem.ariaLabel ?? terminalItem.label}
            >
              {() => createElement(TerminalAppIcon, { pref: terminalIconPref })}
            </AsyncButton>
          </span>
        </Tip>
      )}
    </>
  )
}
```

**注意：`e.stopPropagation()` 是必需的 —— row 有 `onClick` 会切换选中分支，若不 stop 会导致点击按钮时也切换选中。这与现有 `BranchRowRecentActionsInner` 的模式一致。**

- [ ] **Step 6: 运行测试确认新按钮渲染成功**

```bash
bun run test -- --run src/web/components/branch-list/BranchRow.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 7: 运行 typecheck 和架构检查**

```bash
bun run typecheck
bun run check:architecture
```

Expected: 无错误。

---

## Task 5: RepoExplorerPane — 删除 BranchArea toolbar

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:150-358` (BranchArea 及其支持组件)

- [ ] **Step 1: 修改现有测试断言 —— 断言 toolbar 已被删除**

打开 `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`。

**A) 第 340-395 行附近的 `branch area toolbar shows...` 那个测试** —— 将里面对 `[data-testid="branch-area-toolbar"]` 的所有 `toBeTruthy()` 断言改为 `toBeNull()`，并删除所有需要 toolbar 存在才有意义的子断言。用以下更简单的替代内容替换整个测试体：

```tsx
  test('does not render a branch-area toolbar (removed after inline action migration)', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const branchToolbar = container.querySelector<HTMLElement>('[data-testid="branch-area-toolbar"]')
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchToolbar).toBeNull()
    expect(branchList).toBeTruthy()
    await act(async () => root.unmount())
  })
```

**B) 修改测试 `matches file and branch toolbar height`（约第 396+ 行）**

找到并删除 `const branchToolbar = ... branch-area-toolbar` 及其断言 `expect(branchToolbar?.style.height).toBe('41px')`。保留其他 `explorerToolbar`、`fileTree`、`firstTab` 等断言。

**C) 修改 780-820 行两个测试 `branch area toolbar shows disabled/enabled editor and terminal buttons`**

用以下两个测试替换它们（把断言从 toolbar 内部改到分支 row 内部）：

```tsx
  test('branch row shows disabled editor and terminal inline buttons when selected branch has no worktree', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    // 无 worktree 时 —— 行内 editor/terminal 按钮不渲染
    const editorBtn = container.querySelector('[data-testid="branch-row-editor-btn"]') as HTMLButtonElement | null
    const terminalBtn = container.querySelector('[data-testid="branch-row-terminal-btn"]') as HTMLButtonElement | null
    expect(editorBtn).toBeNull()
    expect(terminalBtn).toBeNull()

    await act(async () => root.unmount())
  })

  test('branch row shows enabled editor and terminal inline buttons when branch has a worktree', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: '/repos/main' } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const editorBtn = container.querySelector('[data-testid="branch-row-editor-btn"]') as HTMLButtonElement | null
    const terminalBtn = container.querySelector('[data-testid="branch-row-terminal-btn"]') as HTMLButtonElement | null
    expect(editorBtn).toBeTruthy()
    expect(terminalBtn).toBeTruthy()
    expect(editorBtn?.disabled).toBe(false)
    expect(terminalBtn?.disabled).toBe(false)

    await act(async () => root.unmount())
  })
```

**D) 关于 `branch-area-toolbar` 的第 190 行左右一处 `.toBeNull()` 断言** —— 这个断言（在 "plain workspace" 场景下）本来就是 `.toBeNull()`，保留不变。

- [ ] **Step 2: 运行测试确认失败**

```bash
bun run test -- --run src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: 多个测试失败 — 目前 toolbar 仍在，需要修改源码。

- [ ] **Step 3: 修改 RepoExplorerPane.tsx —— 简化 BranchArea**

打开 `src/web/components/repo-workspace/RepoExplorerPane.tsx`。

**A) 替换 `BranchArea` 函数（第 150-164 行）为：**

```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

**B) 删除以下不再使用的组件与常量：**

- `BranchAreaQuickActions`（第 166-204 行）
- `BranchAreaQuickActionsInner`（第 206-255 行）
- `RECENT_ACTION_ICONS` 常量（第 257-268 行）
- `recentActionTooltip` 函数（第 270-293 行）
- `BranchAreaRecentActions`（第 295-328 行）
- `BranchAreaRecentActionButton`（第 330-358 行）

- [ ] **Step 4: 清理未使用的 imports**

删除以下 import（如果未在文件其它地方使用）。用 grep 检查每一个：

```bash
grep -c "ArrowDown\|ArrowUp\|CloudDownload\|FolderMinus\|FolderPlus\|GitBranchPlus\|GitCommitHorizontal\|GitMerge\|SendHorizontal\|Trash2\|EditorAppIcon\|TerminalAppIcon\|useRuntimeExternalAppSettings\|useBranchActionItems\|BranchActionRepo\|createElement\|Toolbar\b" src/web/components/repo-workspace/RepoExplorerPane.tsx
```

对于计数减少后仍 > 0 的保留；等于 1（就是 import 语句自己）的删除。**具体每一项要看 grep 结果决定**。

预计需要删除或缩减：
- `import { Toolbar } from '#/web/components/Layout.tsx'` — 如 `Toolbar` 仅在 `ExplorerTabs` 里也用则保留；确认。
- `import { AsyncButton } from '#/web/components/AsyncButton.tsx'`
- `import { Tip } from '#/web/components/Tip.tsx'`
- `import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'`
- `import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'`
- `import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'`
- `import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'`
- 从 `import { createElement, ... } from 'react'` 中移除 `createElement`（如未在别处使用）
- 从 lucide-react import 中移除仅用于 `RECENT_ACTION_ICONS` 的图标：`ArrowDown`、`ArrowUp`、`CloudDownload`、`FolderMinus`、`FolderPlus`、`GitBranchPlus`、`GitCommitHorizontal`、`GitMerge`、`SendHorizontal`、`Trash2`
- `RepoEventAction` 类型导入是否还需要（仅 `RECENT_ACTION_ICONS` 用过） — 若无别处用途则从 type import 里删除

- [ ] **Step 5: 运行 typecheck 确认无未使用变量报错**

```bash
bun run typecheck
```

Expected: 无错误（TypeScript 会报 unused import 提示，一并清理）。

- [ ] **Step 6: 运行 RepoExplorerPane 测试确认通过**

```bash
bun run test -- --run src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 7: 运行全量测试与架构检查**

```bash
bun run test
bun run check:architecture
```

Expected: 全部通过。

---

## Task 6: 视觉回归检查

**Files:**
- 无源码修改；启动 dev 服务器人工核对。

- [ ] **Step 1: 启动开发环境**

```bash
bun run dev
```

- [ ] **Step 2: 目视核对分支 row**

打开一个已初始化的 repo，检查分支列表：

- [ ] 分支 item 只有一行（无第二行 worktree 路径）
- [ ] Hash tag 显示为普通 muted monospace 文本（无 badge 边框、无 padding）
- [ ] 悬停 hash tag 无独立 tooltip
- [ ] 悬停整个 row 显示的 title 中包含 worktree 路径和 hash 信息
- [ ] 有 worktree 的分支 row 右侧显示：`[编辑][终端][最近1操作][编辑▼]` 四个按钮/组
- [ ] 无 worktree 的分支 row 右侧只显示 `[编辑▼]` dropdown
- [ ] 分支区顶部无 toolbar（BranchList 直接紧贴顶部）

- [ ] **Step 3: 核对 focus mode（可选）**

将 workspace layout 切换到 focus 模式，检查 `RepoToolbar` 里的 `BranchSummaryInline` 也遵循新样式（无 worktree 路径行、hash 为普通文本）。

- [ ] **Step 4: 检查小屏行为**

将窗口缩小到 md 断点以下，确认：
- 行内 `[编辑][终端][最近1]` 组隐藏
- 只保留 `[编辑▼]` dropdown

---

## 提交策略

按你的项目规则，用户 CLAUDE.md 明确 "如果用户没有主动要求，绝对不要计划和执行 git 提交和分支等操作"。

因此，**每个 Task 完成后不自动 commit**。执行者应：
- 每 Task 完成、验证通过后，向用户确认 "Task N 已完成，是否 commit？"
- 收到明确同意后再执行 git 命令
- 建议按 Task 粒度分别 commit（feat/refactor 分类），也可整体一次性 commit —— 由用户决定

推荐的提交消息（供用户参考）：

```
Task 1-2: refactor(branch-summary): drop worktree path row and badge styling from hash tag
Task 3-4: feat(branch-row): move editor/terminal icons inline before actions dropdown
Task 5:   refactor(explorer): remove branch-area toolbar in favor of inline row actions
```

---

## 自查（Self-Review）已完成

- **Spec 覆盖**：spec 中 3 条变更（BranchSummaryInline / BranchRow / RepoExplorerPane）分别对应 Task 1-2 / Task 3-4 / Task 5，测试更新贯穿其中。视觉验证由 Task 6 兜底。
- **占位符**：所有代码块均给出完整 JSX / imports；无 TBD、"add appropriate handling" 之类。
- **类型一致**：`BranchRowExternalActions` props 类型使用 `ReturnType<typeof useBranchActionItems>`；`data-testid` 命名统一为 `branch-row-editor-btn` / `branch-row-terminal-btn`（旧 `branch-area-*` 已废弃）。
- **变量一致**：`REPEATABLE_ACTION_IDS`、`RepeatableActionId`、`BranchRowRecentActionsInner` 等原有符号保留不变（Task 3 只修改数字上限）。
