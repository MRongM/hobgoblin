# Branch Worktree Badge Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible neutral `工作树` badge from linked worktree branch rows while preserving worktree icons, directory text, dirty status, and terminal indicators.

**Architecture:** Keep the change inside the branch-row presentation boundary. `BranchSummaryInline` owns the visible badges, while `BranchRow` and `BranchList` keep interaction, selection, sorting, and detached worktree behavior unchanged.

**Tech Stack:** React, TypeScript in Node strip-only mode, Vitest with jsdom, Bun.

---

## Scope And File Structure

This plan implements the approved spec at `docs/superpowers/specs/2026-06-25-branch-worktree-badge-removal-design.md`.

Files:

- Modify: `src/web/components/branch-list/BranchRow.test.tsx:174-200`
  - Add a focused regression test proving clean linked worktree rows no longer render visible `工作树` badge text while still showing the worktree directory.
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx:45-137`
  - Remove the unused `isWorktree` local.
  - Remove only the clean-worktree fallback badge branch.
  - Keep dirty worktree badge, terminal badges, title text, icons, and directory line.

No implementation-stage commit steps are included because project instructions prohibit planning or executing git commits unless the user explicitly requests them.

### Task 1: Add Regression Test

**Files:**
- Modify: `src/web/components/branch-list/BranchRow.test.tsx:174-224`

- [ ] **Step 1: Insert the failing clean-worktree badge test**

Add this test immediately after the existing `shows the branch name first and the project directory name as secondary worktree text` test:

```tsx
  test('does not render the neutral worktree badge for clean linked worktree rows', () => {
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

    expect(document.body.querySelector('.text-sm.font-medium')?.textContent).toBe('feature/a')
    expect(document.body.querySelector('[aria-label="worktree-a"]')).not.toBeNull()
    expect(document.body.textContent).toContain('worktree-a')
    expect(document.body.textContent).not.toContain('工作树')
  })
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx
```

Expected result before implementation:

```text
FAIL src/web/components/branch-list/BranchRow.test.tsx
AssertionError mentioning: not to contain '工作树'
```

The existing clean worktree badge renders `branches.worktree`, and the mocked translation returns `工作树`, so this failure confirms the test observes the current behavior.

### Task 2: Remove The Neutral Worktree Badge

**Files:**
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx:45-137`

- [ ] **Step 1: Replace the worktree summary logic with the minimal implementation**

In `BranchSummaryInline`, remove the `isWorktree` local:

```tsx
  const isCurrent = branch.name === repo.data.currentBranch
  const hasWorktree = !!branch.worktree?.path
  const worktreeState = getBranchWorktreeState(repo, branch)
```

Then replace the visible worktree badge block with this dirty-only badge block:

```tsx
            {hasWorktree && worktreeDirty ? (
              <Badge variant="attention" className="gap-1">
                <FolderTree size={10} />
                {t('branches.dirty')}
              </Badge>
            ) : null}
```

The surrounding badge row should still keep default, gone, ahead, behind, and commit metadata rendering:

```tsx
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 overflow-hidden text-xs',
              selected ? 'text-selected-muted-foreground' : 'text-muted-foreground',
            )}
          >
            {branch.isDefault && (
              <Badge variant="outline" className="text-muted-foreground">
                {t('branches.default')}
              </Badge>
            )}
            {hasWorktree && worktreeDirty ? (
              <Badge variant="attention" className="gap-1">
                <FolderTree size={10} />
                {t('branches.dirty')}
              </Badge>
            ) : null}
            {branch.trackingGone && <Badge variant="attention">{t('branches.gone')}</Badge>}
            {branch.ahead > 0 && (
              <Delta
                direction="ahead"
                count={branch.ahead}
                label={t('branch-status.sync.ahead', { n: branch.ahead })}
              />
            )}
            {branch.behind > 0 && (
              <Delta
                direction="behind"
                count={branch.behind}
                label={t('branch-status.sync.behind', { n: branch.behind })}
              />
            )}
            {commitMeta && (
              <span
                className={cn(
                  'min-h-4 min-w-0 truncate whitespace-nowrap text-[11px] leading-4',
                  selected ? 'text-selected-muted-foreground/90' : 'text-muted-foreground/85',
                )}
                title={commitMeta}
              >
                {commitMeta}
              </span>
            )}
          </span>
```

Keep this title entry unchanged so hover and assistive context still identify clean worktree rows:

```tsx
    hasWorktree ? t(worktreeDirty ? 'branches.dirty' : 'branches.worktree') : null,
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx
```

Expected result after implementation:

```text
PASS src/web/components/branch-list/BranchRow.test.tsx
```

### Task 3: Verify Full Project

**Files:**
- Read-only verification across the repository.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result:

```text
Exit code 0
```

- [ ] **Step 2: Run the test suite**

Run:

```bash
bun run test
```

Expected result:

```text
Exit code 0
```

- [ ] **Step 3: Run the architecture guard**

Run:

```bash
bun run check:architecture
```

Expected result:

```text
Exit code 0
```

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff -- src/web/components/repo-workspace/BranchSummaryInline.tsx src/web/components/branch-list/BranchRow.test.tsx
```

Expected diff shape:

```text
src/web/components/branch-list/BranchRow.test.tsx
- adds one test for clean linked worktree rows without visible 工作树 badge text

src/web/components/repo-workspace/BranchSummaryInline.tsx
- removes the clean worktree Badge fallback
- removes the unused isWorktree local
- keeps dirty, default, gone, terminal, ahead, behind, and directory rendering
```

## Self-Review Notes

- Spec coverage: the plan removes only the neutral worktree badge, preserves the dirty badge, terminal indicators, icon, directory line, title text, and detached rows by leaving their code untouched.
- Completeness scan: all code changes and commands are explicit.
- Type consistency: the plan uses existing names from the codebase: `BranchSummaryInline`, `hasWorktree`, `worktreeDirty`, `Badge`, `FolderTree`, `BranchRow`, `createRepoBranch`, and `emptyRepo`.
