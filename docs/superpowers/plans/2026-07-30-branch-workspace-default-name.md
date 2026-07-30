# Branch Workspace Default Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill a new branch workspace's common branch name with `feat/YYYYMMDD` based on the user's local date.

**Architecture:** Keep the proposal in `BranchWorkspaceDialog` component-local state. Add one feature-local pure formatter and invoke it from the existing open-reset effect only for create mode, leaving server contracts and existing-workspace modes unchanged.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest, jsdom, Bun.

## Global Constraints

- Use the renderer's local calendar date, not UTC.
- Generate exactly `feat/YYYYMMDD` with no suffix or collision counter.
- Keep the field editable and do not overwrite it during an open dialog's data refreshes.
- Preserve existing common branch names in extend, reduce, repair, and remove flows.
- Do not add dependencies, i18n copy, server state, persistence, or realtime behavior.
- Do not execute Git commits or branch operations.

---

### Task 1: Add the create-dialog default

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`

**Interfaces:**

- Consumes: Existing `BranchWorkspaceDialog` props and its open-reset effect.
- Produces: Private `defaultBranchWorkspaceName(now?: Date): string` behavior exposed through the create form's common branch input.

- [x] **Step 1: Write the failing component test**

Add a test that freezes local time and observes the public input behavior:

```tsx
test('prefills a dated feature branch name when creating a branch workspace', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 30, 12))

  renderDialog({})

  expect(document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.branch"]')?.value).toBe(
    'feat/20260730',
  )
})
```

Restore real timers in `afterEach` so later tests remain isolated:

```ts
vi.useRealTimers()
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: the new test fails because the current create-mode input value is empty rather than `feat/20260730`.

- [x] **Step 3: Implement the minimal create-mode default**

Add a private feature-local helper:

```ts
function defaultBranchWorkspaceName(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `feat/${year}${month}${day}`
}
```

Update the existing dialog-open reset without changing other modes:

```ts
setBranch(mode === 'create' ? defaultBranchWorkspaceName() : (initial.workspace?.branch ?? ''))
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```sh
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: every test in the focused suite passes.

- [x] **Step 5: Verify project-wide constraints**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit with status 0 and report no failures.
