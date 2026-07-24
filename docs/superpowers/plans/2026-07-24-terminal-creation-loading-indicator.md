# Terminal Creation Loading Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the terminal-area loading status throughout a pending new-terminal request and remove it after settlement.

**Architecture:** `TerminalSessionRegistry` owns a per-worktree pending creation count as renderer-local interaction state and projects it as `WorktreeTerminalSnapshot.creating`. `TerminalSlot` reuses the existing accessible status overlay, while first-terminal panel composition keeps the slot mounted before a selected descriptor exists.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest, Bun.

## Global Constraints

- Preserve the existing localized `terminal.opening` copy and bottom-right overlay styling.
- Keep pending creation state renderer-local, ephemeral, and absent from persistence and server contracts.
- Preserve existing registered-session `phase === 'opening'` behavior.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not execute `git commit`; the project requires explicit user authorization.

---

### Task 1: Publish terminal creation pending state

**Files:**
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/types.ts`

**Interfaces:**
- Consumes: `TerminalSessionRegistry.createTerminal(base, launchMode)` and `worktreeTerminalKey(repoRoot, worktreePath)`.
- Produces: optional-compatible `WorktreeTerminalSnapshot.creating?: boolean`, with production snapshots always supplying a boolean.

- [x] **Step 1: Add failing registry tests**

Add tests that hold `terminalBridge.create` unresolved, assert
`registry.worktreeSnapshot(WORKTREE_KEY).creating === true`, then resolve or
reject the request and assert the flag returns to `false`. The failure test
must catch the rejection before checking cleanup.

- [x] **Step 2: Run the registry tests and verify RED**

Run:

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: FAIL because `WorktreeTerminalSnapshot` has no creation state and
`createTerminal` does not notify before awaiting the bridge.

- [x] **Step 3: Add the minimal registry implementation**

Add a private pending-count map and begin/end helpers. Clear the map from
`destroy()`, derive `creating` in `worktreeSnapshot()`, and wrap only the bridge
creation/reconciliation path:

```ts
this.beginTerminalCreation(terminalWorktreeKey)
try {
  // existing terminalBridge.create and reconciliation
} finally {
  this.endTerminalCreation(terminalWorktreeKey)
}
```

Both helpers invalidate and notify the worktree snapshot. `end` deletes the
entry at one and decrements it above one.

- [x] **Step 4: Run the registry tests and verify GREEN**

Run the same focused command and expect all registry tests to pass.

### Task 2: Render the existing status for pending creation

**Files:**
- Modify: `src/web/components/terminal/terminal-session-store.ts`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

**Interfaces:**
- Consumes: `WorktreeTerminalSnapshot.creating` and existing worktree subscriptions.
- Produces: `useWorktreeTerminalCreationPending(key): boolean` and a status overlay visible for creation pending or registered-session opening.

- [x] **Step 1: Add a failing slot test**

Render `TerminalSlot` with a worktree snapshot containing no sessions and
`creating: true`. Assert the status role, `terminal.opening` copy, and spinner
exist; rerender with `creating: false` and assert the overlay is absent.

- [x] **Step 2: Run the slot test and verify RED**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: FAIL because the current condition requires `hasSessions` and a
selected snapshot in `opening` phase.

- [x] **Step 3: Implement the creation-pending selector and condition**

Add a primitive `useSyncExternalStore` selector returning
`worktreeSnapshot(key).creating === true`. In `TerminalSlot`, render the
existing overlay when:

```ts
creationPending || (hasSessions && snapshot.phase === 'opening')
```

Do not change CSS, copy, roles, or spinner markup.

- [x] **Step 4: Run the slot test and verify GREEN**

Run the same focused command and expect all slot tests to pass.

### Task 3: Keep first-terminal surfaces mounted while creating

**Files:**
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`

**Interfaces:**
- Consumes: `WorktreeTerminalSnapshot.creating`.
- Produces: a mounted `TerminalSlot` during first-terminal creation in both panel variants.

- [x] **Step 1: Add failing panel tests**

For each panel, supply `sessions: []`, `selectedDescriptor: null`, `count: 0`,
and `creating: true`. Assert the mocked `TerminalSlot` renders with the known
panel branch/worktree identity.

- [x] **Step 2: Run both panel tests and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

Expected: FAIL because both panels currently require a selected descriptor.

- [x] **Step 3: Mount the slot when selected or creating**

Change each composition guard to accept `snapshot.creating === true`. Use the
known plain-workspace branch constant or branch-workspace context as the branch
fallback; do not create a descriptor or session.

- [x] **Step 4: Run both panel tests and verify GREEN**

Run the same focused command and expect both test files to pass.

### Task 4: Full verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh evidence that types, behavior, and architecture remain valid.

- [x] **Step 1: Run focused tests**

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

- [x] **Step 2: Run project verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: every command exits zero with no new warnings or failures.
