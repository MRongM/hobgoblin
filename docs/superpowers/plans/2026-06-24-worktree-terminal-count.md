# Worktree Terminal Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact count badge for the number of open terminal sessions on each worktree row in the branch list.

**Architecture:** Keep the change inside the existing branch summary boundary. `BranchSummaryInline` will derive the worktree terminal key from `repo.id` and `branch.worktree.path`, read the count through the existing terminal store hook, and render a compact badge only when the count is greater than zero. Existing bell markers, worktree paths, and metadata stay in place.

**Tech Stack:** TypeScript, React, Zustand, Vitest, existing terminal session read context.

---

### Task 1: Render the worktree terminal count badge

**Files:**
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx`
- Test: `src/web/components/branch-list/BranchRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test to `src/web/components/branch-list/BranchRow.test.tsx` that renders a branch with a worktree path and a terminal read context whose `worktreeSnapshot(...).count` is `2`. Assert that the branch row shows a compact count badge for `2` alongside the existing worktree row content.

```ts
test('shows a terminal count badge for worktrees with open sessions', () => {
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
    {
      bellWorktreeKeys: [],
      countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 2]]),
    },
  )

  expect(document.body.textContent).toContain('2')
})
```

Update the local `render` helper in the same test file so it accepts a snapshot fixture object:

```ts
function render(
  element: React.ReactNode,
  fixture: {
    bellWorktreeKeys?: string[]
    countsByWorktreeKey?: Map<string, number>
  } = {},
) {
  const readContext = terminalReadContextWithState(
    new Set(fixture.bellWorktreeKeys ?? []),
    fixture.countsByWorktreeKey ?? new Map(),
  )
  act(() => {
    root!.render(<TerminalSessionReadContext.Provider value={readContext}>{element}</TerminalSessionReadContext.Provider>)
  })
}
```

Replace the current `terminalReadContextWithBellKeys` helper with a stateful fixture helper:

```ts
function terminalReadContextWithState(
  bellKeys: ReadonlySet<string>,
  countsByWorktreeKey: ReadonlyMap<string, number>,
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const hasBell = bellKeys.has(worktreeTerminalKey)
      const count = countsByWorktreeKey.get(worktreeTerminalKey) ?? 0
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions: hasBell
          ? [
              {
                key: `${worktreeTerminalKey}\0terminal-1`,
                worktreeTerminalKey,
                terminalId: 'terminal-1',
                index: 1,
                title: 'terminal',
                phase: 'open',
                selected: true,
                hasBell: true,
              },
            ]
          : [],
        count,
      }
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}
```

Keep the helper local to the test file; do not change production code yet.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx
```

Expected: the new badge assertion fails because `BranchSummaryInline` does not yet render a count badge.

- [ ] **Step 3: Implement the badge in the component**

Update `src/web/components/repo-workspace/BranchSummaryInline.tsx` to:

1. Import `useWorktreeTerminalCount` from `#/web/components/terminal/terminal-session-store.ts`.
2. Compute the worktree terminal key only when `branch.worktree?.path` exists.
3. Read the count with `useWorktreeTerminalCount(worktreeTerminalKey)`.
4. Render a compact numeric badge next to the branch name only when `count > 0`.
5. Keep the existing unread bell marker and the rest of the row layout unchanged.

Use the existing `Badge` component. Keep the badge compact so it does not steal space from the branch name or worktree path line.

```ts
const terminalCount = useWorktreeTerminalCount(terminalWorktreeKey)

{terminalCount > 0 && (
  <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[10px] font-medium tabular-nums">
    {terminalCount}
  </Badge>
)}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx
```

Expected: the new badge assertion passes, and the existing worktree row assertions still pass.

- [ ] **Step 5: Commit**

If you are working in a code-editing session, stage only the component and test changes for this task and commit them with a focused message.

### Task 2: Add regression coverage for zero-count and bell coexistence

**Files:**
- Modify: `src/web/components/branch-list/BranchRow.test.tsx`
- Modify: `src/web/components/BranchList.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/web/components/branch-list/BranchRow.test.tsx`, add a test that renders a worktree branch with `count: 0` and asserts no terminal count badge is shown.

In `src/web/components/branch-list/BranchRow.test.tsx`, add a second test that renders a worktree branch with both `count: 1` and the existing bell key present, then asserts both the count badge and the unread bell marker appear together.

In `src/web/components/BranchList.test.tsx`, extend the worktree row rendering case to verify the branch list still renders the worktree path and does not regress on compact layout when a count badge is present.

```ts
test('does not show a terminal count badge when a worktree has no open sessions', () => {
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
    {
      bellWorktreeKeys: [],
      countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 0]]),
    },
  )

  expect(document.body.querySelector('[aria-label="terminal-count"]')).toBeNull()
})
```

- [ ] **Step 2: Run the focused test files and confirm the new regressions are covered**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx src/web/components/BranchList.test.tsx
```

Expected: the new tests pass and the existing worktree layout assertions remain green.

- [ ] **Step 3: Tighten the count badge implementation if needed**

If the badge layout or label collides with the bell marker or worktree path in the updated tests, adjust only `BranchSummaryInline.tsx`. Do not move the count into another component.

- [ ] **Step 4: Commit**

Stage the updated tests and any follow-up component adjustment, then commit with a focused message.

### Task 3: Verify the change end to end

**Files:**
- None expected beyond the files from Tasks 1 and 2

- [ ] **Step 1: Run the full targeted test set**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx src/web/components/BranchList.test.tsx
```

Expected: all branch row and branch list tests pass with the new count badge behavior.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: no new type errors from the badge rendering or terminal hook usage.

- [ ] **Step 3: Review the result**

Confirm the final state matches the spec:

1. Worktree rows show a compact terminal count badge only when open sessions exist.
2. The unread bell marker still appears independently.
3. Branch names, worktree paths, and existing metadata remain unchanged.
