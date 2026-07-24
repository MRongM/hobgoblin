# Detached Directory tmux Restore Implementation Plan

> **For agentic workers:** Execute inline in the active isolated worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve tmux terminal creation and add a separate directory action that batch-opens only existing detached associated Hobgoblin tmux sessions.

**Architecture:** Extend strict tmux discovery with `session_attached`, then let the server-owned `open-tmux-sessions` operation filter detached exact-directory matches and return an explicit restored count without creating sessions. Expose separate renderer commands for creating one tmux terminal and restoring detached sessions, and project both commands into worktree, member-worktree, and branch-workspace root menus.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, react-i18next, Vitest 4, Bun 1.3.

## Global Constraints

- Keep `terminal.new-with-tmux` and its ordinary `create` request unchanged.
- Restore only v1 sessions whose exact directory metadata and name hash validate and whose `session_attached` count is zero.
- Treat an empty restore scan as success with count zero; never create a session from restore.
- Keep ordinary worktree, branch-workspace member, and branch-workspace root behavior aligned.
- Keep discovery and filtering server-owned for local and SSH targets.
- Do not create Git commits.

---

### Task 1: Discover detached associated tmux sessions

**Files:**

- Modify: `src/shared/tmux-cleanup.ts`
- Modify: `src/system/tmux-cleanup.ts`
- Modify: `src/system/tmux-cleanup.test.ts`
- Modify: `src/server/modules/tmux-cleanup.test.ts`

**Interfaces:**

- `TmuxSessionRecord.attachedClients: number` records the non-negative tmux `session_attached` count from the same strict list row as identity metadata.
- `TMUX_SESSION_LIST_FORMAT` emits initial path, terminal number, attached count, and session name.

- [ ] **Step 1: Write failing four-field parser tests**

Assert canonical attached counts are parsed, malformed counts are skipped, and malformed field boundaries fail closed.

- [ ] **Step 2: Run parser tests and verify RED**

```bash
bun run test -- src/system/tmux-cleanup.test.ts src/server/modules/tmux-cleanup.test.ts
```

Expected: failures because the list format and parser do not carry attached-client state.

- [ ] **Step 3: Implement attached-client parsing**

Add the fourth strict field without changing association or cleanup eligibility.

- [ ] **Step 4: Run Task 1 tests and verify GREEN**

Run the Step 2 command; expect all selected tests to pass.

### Task 2: Split creation from detached-only batch restore

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/shared/terminal.test.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/renderer-terminal-bridge.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`

**Interfaces:**

- `TerminalOpenTmuxSessionsResult` reports `restored` and the full terminal catalog; a zero result has no first frame.
- `createTerminal(base, 'tmux-if-available')` uses the ordinary `create` request.
- `restoreTmuxSessions(base): Promise<number>` uses `open-tmux-sessions`, reconciles returned sessions, and returns the restored count.

- [ ] **Step 1: Write failing server and registry tests**

Cover detached-only filtering, attached-session exclusion, empty no-op, ordinary tmux creation, non-empty restore reconciliation, and zero restore reconciliation.

- [ ] **Step 2: Run Task 2 tests and verify RED**

```bash
bun run test -- src/shared/terminal.test.ts src/server/terminal/terminal.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts
```

- [ ] **Step 3: Implement the split commands and result shape**

Keep authorization, collision-safe slot assignment, exact-name attachment, and close-safety checks unchanged.

- [ ] **Step 4: Run Task 2 tests and verify GREEN**

Run the Step 2 command; expect all selected tests to pass.

### Task 3: Add both menu actions to directory items

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/web/hooks/branch-action-state.ts`
- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.ts`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: member and ordinary worktree component tests as required.

**Interfaces:**

- `restoreTmuxTerminals` is a menu-only branch action next to `terminalTmux`.
- `WorkspaceItemContextMenu` receives and renders separate tmux-create and tmux-restore actions.

- [ ] **Step 1: Write failing menu and callback tests**

Assert both labels appear in More and context menus and invoke distinct registry commands for all requested directory item types.

- [ ] **Step 2: Run Task 3 tests and verify RED**

```bash
bun run test -- src/web/hooks/useBranchActionItems.test.tsx src/web/components/branch-list/worktree-list-item-actions.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

- [ ] **Step 3: Implement both menu projections and four-locale copy**

Remove the prior label-override approach; keep `terminal.new-with-tmux` unchanged and add `terminal.restore-directory-tmux` as a separate action.

- [ ] **Step 4: Run Task 3 tests and verify GREEN**

Run the Step 2 command plus `src/shared/i18n/dictionaries.test.ts`; expect all selected tests to pass.

### Task 4: Persist recoverable tmux identity metadata

**Files:**

- Modify: `src/system/tmux-session.ts`
- Modify: `src/system/tmux-session.test.ts`
- Modify: `src/system/local-terminal.test.ts`
- Modify: `src/system/remote-terminal.test.ts`

- [ ] **Step 1: Write failing exact-command and real-server tests**

Require all identity `set-option` commands to target `=<session>:`. Start an isolated detached tmux server through a short `TMUX_TMPDIR`, then assert the initial path, terminal number, and detached count are persisted and discoverable.

- [ ] **Step 2: Verify RED on tmux 3.6a**

Expected: the real invocation fails with `no such session: =<session>` while the two metadata commands omit the target-pane colon.

- [ ] **Step 3: Use one exact pane target for all session options**

Keep attach-or-create behavior unchanged; only correct the `set-option -t` target syntax.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```bash
bun run test -- src/system/tmux-session.test.ts src/system/local-terminal.test.ts src/system/remote-terminal.test.ts
```

### Task 5: Complete documentation and verification

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/terminal-tmux-protocol.md`
- Verify: every file changed in Tasks 1–4.

- [ ] **Step 1: Document detached directory recovery**

Record detached eligibility, exact-path association, attached-session exclusion, and empty-scan behavior.

- [ ] **Step 2: Run project verification**

```bash
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all checks exit 0. If the known parallel 5-second timeout recurs, rerun the affected test file independently and report both results.
