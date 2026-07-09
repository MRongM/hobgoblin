# Terminal Font Independence And History List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make terminal font independent from the General font setting and simplify the History tab left pane to a plain commit list.

**Architecture:** Keep global font projection limited to app UI CSS variables. Let `TerminalSessionRegistry` retain its existing `DEFAULT_TERMINAL_FONT_FAMILY` default by removing the provider-level global font synchronization. Simplify `ProjectHistoryPanel` rendering only; keep history loading, selection, and detail data flow unchanged.

**Tech Stack:** React, TypeScript strip-only mode, Zustand, Vitest, jsdom, Bun.

---

## 文件结构

- Modify: `src/web/font-family.ts`
  - Responsibility: map `FontFamilyPref` to application UI font stacks only.
  - Remove the `terminal` field from `AppFontFamilyStack` and `APP_FONT_FAMILY_STACKS`.

- Modify: `src/web/font-family.test.ts`
  - Responsibility: contract tests for app UI font projection.
  - Add a guard that stack objects expose only `sans` and `mono`.

- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
  - Responsibility: connect runtime terminal settings to the terminal session registry.
  - Stop reading global `fontFamily` and stop calling `registry.setFontFamily()`.

- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
  - Responsibility: provider behavior tests with mocked `ManagedTerminalSession`.
  - Replace the old “configured font family reaches terminal” expectation with negative tests.

- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`
  - Responsibility: history tab left list and right detail UI.
  - Remove graph rendering from `HistoryList`; leave selection and detail behavior intact.

- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`
  - Responsibility: history panel behavior tests.
  - Add a plain-list DOM guard and a right-detail switching test.

项目 `AGENTS.md` 明确禁止在用户未主动要求时计划或执行 git 提交/分支操作。本计划不包含提交步骤；实现完成后如需提交，先向用户请求确认。

---

### Task 1: Font Family Stack Contract

**Files:**
- Modify: `src/web/font-family.test.ts`
- Modify: `src/web/font-family.ts`

- [ ] **Step 1: Write the failing font stack contract test**

Update `src/web/font-family.test.ts` so the first test no longer checks a terminal stack and add a field-shape assertion:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import {
  APP_FONT_FAMILY_STACKS,
  applyDocumentFontFamily,
  fontFamilyStackForPref,
} from '#/web/font-family.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-font-family')
  document.documentElement.style.removeProperty('--font-sans')
  document.documentElement.style.removeProperty('--font-mono')
})

describe('font family projection', () => {
  test('resolves fixed app UI font stacks for each preference', () => {
    expect(fontFamilyStackForPref('mono')).toBe(APP_FONT_FAMILY_STACKS.mono)
    expect(fontFamilyStackForPref('maple').mono).toContain('Maple Mono NF CN')
    expect(fontFamilyStackForPref('system').sans).toContain('-apple-system')
  })

  test('exposes only app UI font stack fields', () => {
    expect(Object.keys(APP_FONT_FAMILY_STACKS.mono).sort()).toEqual(['mono', 'sans'])
    expect(Object.keys(APP_FONT_FAMILY_STACKS.maple).sort()).toEqual(['mono', 'sans'])
    expect(Object.keys(APP_FONT_FAMILY_STACKS.system).sort()).toEqual(['mono', 'sans'])
  })

  test('applies data attribute and css variables to the document root', () => {
    applyDocumentFontFamily(document, 'system')

    expect(document.documentElement.getAttribute('data-font-family')).toBe('system')
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('-apple-system')
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toContain('ui-monospace')
  })
})
```

- [ ] **Step 2: Run the focused font test and verify it fails**

Run:

```bash
bun run test "src/web/font-family.test.ts"
```

Expected: FAIL because `APP_FONT_FAMILY_STACKS.*` still contains the `terminal` field.

- [ ] **Step 3: Remove terminal font stacks from the app font mapping**

Update `src/web/font-family.ts` to this shape:

```ts
import type { FontFamilyPref } from '#/shared/rpc.ts'

export interface AppFontFamilyStack {
  sans: string
  mono: string
}

const SYSTEM_MONO_STACK =
  "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
const SYSTEM_SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_SANS_STACK =
  "'Maple Mono NF CN', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_MONO_STACK = "'Maple Mono NF CN', ui-monospace, monospace"

export const APP_FONT_FAMILY_STACKS: Record<FontFamilyPref, AppFontFamilyStack> = {
  mono: {
    sans: SYSTEM_MONO_STACK,
    mono: SYSTEM_MONO_STACK,
  },
  maple: {
    sans: MAPLE_SANS_STACK,
    mono: MAPLE_MONO_STACK,
  },
  system: {
    sans: SYSTEM_SANS_STACK,
    mono: SYSTEM_MONO_STACK,
  },
}

export function fontFamilyStackForPref(fontFamily: FontFamilyPref): AppFontFamilyStack {
  return APP_FONT_FAMILY_STACKS[fontFamily]
}

export function applyDocumentFontFamily(document: Document, fontFamily: FontFamilyPref): void {
  const stack = fontFamilyStackForPref(fontFamily)
  const root = document.documentElement
  root.setAttribute('data-font-family', fontFamily)
  root.style.setProperty('--font-sans', stack.sans)
  root.style.setProperty('--font-mono', stack.mono)
}
```

- [ ] **Step 4: Run the focused font test and verify it passes**

Run:

```bash
bun run test "src/web/font-family.test.ts"
```

Expected: PASS.

---

### Task 2: Terminal Provider Font Independence

**Files:**
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`

- [ ] **Step 1: Write the failing terminal provider tests**

In `src/web/components/terminal/TerminalSessionProvider.test.tsx`, add this import near the existing imports:

```ts
import { DEFAULT_TERMINAL_FONT_FAMILY } from '#/web/components/terminal/terminal-geometry.ts'
```

Replace the existing test named `passes configured font family to managed sessions` with these two tests:

```ts
  test('uses the default terminal font family regardless of the global font preference', async () => {
    runtimeTerminalSettingsMock.fontFamily = 'maple'
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'terminal',
    })
    const { getContext, unmount } = await renderProvider()

    try {
      await act(async () => {
        await getContext().createTerminal({
          repoRoot: REPO_ID,
          branch: 'feature/worktree',
          worktreePath: WORKTREE_PATH,
        })
      })

      const session = mockSessions.find((item) => item.descriptor.terminalId === 'terminal-1')
      if (!session) throw new Error('missing terminal-1 mock session')
      expect(session.constructorFontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
      expect(session.constructorFontFamily).not.toContain('Maple Mono NF CN')
    } finally {
      await unmount()
    }
  })

  test('does not update managed terminal font family when the global font preference changes', async () => {
    const terminalWorktreeKey = worktreeTerminalKey(REPO_ID, WORKTREE_PATH)
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'terminal',
    })
    const { getContext, rerender, unmount } = await renderProviderWithProbe(terminalWorktreeKey)

    try {
      await act(async () => {
        await getContext().createTerminal({
          repoRoot: REPO_ID,
          branch: 'feature/worktree',
          worktreePath: WORKTREE_PATH,
        })
      })

      const session = mockSessions.find((item) => item.descriptor.terminalId === 'terminal-1')
      if (!session) throw new Error('missing terminal-1 mock session')
      session.setFontFamily.mockClear()

      runtimeTerminalSettingsMock.fontFamily = 'system'
      await rerender(REPO_ID)

      expect(session.setFontFamily).not.toHaveBeenCalled()
      expect(session.constructorFontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    } finally {
      await unmount()
    }
  })
```

- [ ] **Step 2: Run the focused provider test and verify it fails**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSessionProvider.test.tsx"
```

Expected: FAIL. The first new test should receive the Maple stack from current provider code, or the second new test should see `setFontFamily()` called after rerender.

- [ ] **Step 3: Remove global font synchronization from TerminalSessionProvider**

Update `src/web/components/terminal/TerminalSessionProvider.tsx`:

Remove this import:

```ts
import { fontFamilyStackForPref } from '#/web/font-family.ts'
```

Change the runtime settings destructuring from:

```ts
  const { terminalFontSize, terminalThemeSyncEnabled = true, fontFamily } = useRuntimeTerminalSettings()
  const terminalThemeMode = terminalThemeSyncEnabled ? 'theme' : 'classic'
  const terminalFontFamily = fontFamilyStackForPref(fontFamily).terminal
```

to:

```ts
  const { terminalFontSize, terminalThemeSyncEnabled = true } = useRuntimeTerminalSettings()
  const terminalThemeMode = terminalThemeSyncEnabled ? 'theme' : 'classic'
```

Remove the font family effect:

```ts
  // Font family settings
  useEffect(() => {
    registry.setFontFamily(terminalFontFamily)
  }, [registry, terminalFontFamily])
```

Keep the existing font size effect:

```ts
  // Font settings
  useEffect(() => {
    registry.setFontSize(terminalFontSize)
  }, [registry, terminalFontSize])
```

- [ ] **Step 4: Run the focused provider test and verify it passes**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSessionProvider.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Run a terminal font reference search**

Run:

```bash
rg -n "fontFamilyStackForPref\\(|terminalFontFamily" "src/web/components/terminal/TerminalSessionProvider.tsx"
rg -n "\\bterminal:" "src/web/font-family.ts"
```

Expected: no output from either command.

---

### Task 3: History Left Pane Plain Commit List

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`

- [ ] **Step 1: Write failing history panel tests**

Add these tests inside the existing `describe('ProjectHistoryPanel', () => { ... })` block in `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`:

```tsx
  test('renders history commits as a plain one-column list without graph content', async () => {
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    const firstCommitButton = container?.querySelector<HTMLButtonElement>('button[aria-label="abc123456789"]')
    expect(firstCommitButton).toBeTruthy()
    expect(firstCommitButton?.className).not.toContain('grid-cols-[64px_minmax(0,1fr)]')
    expect(firstCommitButton?.children).toHaveLength(1)
    expect(firstCommitButton?.textContent).toContain('feat: first')
    expect(firstCommitButton?.textContent).toContain('abc1234')
  })

  test('updates the right detail pane when a different history list item is selected', async () => {
    mocks.getRepositoryCommitDetail.mockImplementation(async (_repoId: string, hash: string) => {
      if (hash === 'def456789012') {
        return {
          hash: 'def456789012',
          shortHash: 'def4567',
          subject: 'fix: second',
          author: 'Bob',
          date: '2026-06-14T09:00:00+08:00',
          parents: [],
          files: [],
        }
      }
      return {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: first',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: ['def456'],
        files: [{ path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 }],
      }
    })

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="def456789012"]')?.click()
    })
    await act(async () => {})

    expect(mocks.getRepositoryCommitDetail).toHaveBeenCalledWith(REPO_ID, 'def456789012', expect.any(AbortSignal))
    expect(container?.textContent).toContain('def456789012')
    expect(container?.textContent).toContain('fix: second')
  })
```

- [ ] **Step 2: Run the focused history panel test and verify it fails**

Run:

```bash
bun run test "src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx"
```

Expected: FAIL because the first commit button still has the graph column child and grid column class.

- [ ] **Step 3: Simplify ProjectHistoryPanel imports**

In `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`, change the React import from:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
```

to:

```ts
import { useEffect, useRef, useState } from 'react'
```

Change the history graph import from:

```ts
import {
  buildHistoryGraphRows,
  commitFileStatusLabel,
  commitFileStatusTone,
  formatHistoryDate,
} from '#/web/components/repo-workspace/history-graph.ts'
```

to:

```ts
import {
  commitFileStatusLabel,
  commitFileStatusTone,
  formatHistoryDate,
} from '#/web/components/repo-workspace/history-graph.ts'
```

- [ ] **Step 4: Replace HistoryList row rendering with a plain commit list**

In `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`, replace the body of `HistoryList` from the `const rows = ...` line through the row map with this implementation:

```tsx
function HistoryList({
  commits,
  selectedHash,
  loading,
  error,
  hasMore,
  onSelect,
  onLoadMore,
}: {
  commits: CommitHistoryEntry[]
  selectedHash: string | null
  loading: boolean
  error: string | null
  hasMore: boolean
  onSelect: (hash: string) => void
  onLoadMore: () => void
}) {
  const t = useT()
  if (error && commits.length === 0) return <EmptyState title={t('history.load-error')} body={t(error)} />
  if (!loading && commits.length === 0)
    return <EmptyState title={t('history.empty-title')} body={t('history.empty-body')} />

  return (
    <div className="flex min-h-0 flex-col border-r border-separator/70">
      <ScrollPane>
        <ul className="py-1.5">
          {commits.map((commit) => (
            <li key={commit.hash}>
              <button
                type="button"
                aria-label={commit.hash}
                onClick={() => onSelect(commit.hash)}
                className={cn(
                  'block w-full px-2 py-1.5 text-left hover:bg-list-row-hover',
                  selectedHash === commit.hash && 'bg-list-row-selected text-list-row-selected-foreground',
                )}
              >
                <span className="block min-w-0">
                  <span className="block truncate text-sm">{commit.subject}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {commit.shortHash} · {commit.author} · {formatHistoryDate(commit.date)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollPane>
      <div className="flex min-h-9 items-center justify-end border-t border-separator/70 px-2">
        {error && <span className="mr-auto text-xs text-danger">{t(error)}</span>}
        <Button
          data-testid="history-load-more"
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading || !hasMore}
          onClick={onLoadMore}
        >
          {loading ? t('common.loading') : t('history.load-more')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Delete the unused HistoryGraphCell component**

Remove this function from `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`:

```tsx
function HistoryGraphCell({ lane, laneCount }: { lane: number; laneCount: number }) {
  const count = Math.max(1, laneCount)
  return (
    <span
      aria-hidden="true"
      className="grid h-9 items-center"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(10px, 1fr))` }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="relative flex h-full items-center justify-center">
          <span className="absolute inset-y-0 w-px bg-separator/80" />
          {index === lane && <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 6: Run the focused history panel test and verify it passes**

Run:

```bash
bun run test "src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx"
```

Expected: PASS.

- [ ] **Step 7: Run a graph rendering reference search**

Run:

```bash
rg -n "HistoryGraphCell|buildHistoryGraphRows\\(|grid-cols-\\[64px_minmax\\(0,1fr\\)\\]|bg-separator/80" "src/web/components/repo-workspace"
```

Expected: no hits in `ProjectHistoryPanel.tsx`. Hits in `history-graph.ts` or `history-graph.test.ts` for the model function are acceptable.

---

### Task 4: Final Verification

**Files:**
- Read: `docs/superpowers/specs/2026-07-03-terminal-font-history-list-design.md`
- Verify: all modified files from Tasks 1-3

- [ ] **Step 1: Run focused tests for changed behavior**

Run:

```bash
bun run test "src/web/font-family.test.ts" "src/web/components/terminal/TerminalSessionProvider.test.tsx" "src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx"
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff -- "src/web/font-family.ts" "src/web/font-family.test.ts" "src/web/components/terminal/TerminalSessionProvider.tsx" "src/web/components/terminal/TerminalSessionProvider.test.tsx" "src/web/components/repo-workspace/ProjectHistoryPanel.tsx" "src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx"
```

Expected:
- `font-family.ts` exposes only `sans` and `mono` stacks.
- `TerminalSessionProvider.tsx` does not import `fontFamilyStackForPref`, does not read `fontFamily`, and does not call `registry.setFontFamily()`.
- `ProjectHistoryPanel.tsx` does not render `HistoryGraphCell` or the `64px` graph column.
- Tests cover terminal font independence and right detail switching.

---

## 自审

- Spec coverage: terminal no longer follows General font; app UI font projection remains; terminal size/theme flows remain; History left pane becomes a plain commit list; right detail switching remains.
- Deferred-language scan: no deferred implementation language is used; each code-changing step includes concrete code.
- Type consistency: `AppFontFamilyStack` uses only `sans` and `mono`; provider no longer depends on a `terminal` stack; history list maps `CommitHistoryEntry[]` directly.
- Project instruction compatibility: no branch or commit commands are included because the user did not request implementation commits.
