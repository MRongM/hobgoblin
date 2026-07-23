# Directory tmux Restore Menu Copy Implementation Plan

> **For agentic workers:** Execute inline in the active isolated worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label the existing directory-scoped tmux recovery action explicitly in worktree, member-worktree, and branch-workspace item menus and context menus.

**Architecture:** Keep `open-tmux-sessions` as the single recovery path. Add one four-locale copy key and allow the two reusable menu projection components to accept a targeted label override, leaving terminal-topbar copy unchanged.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, react-i18next, Vitest 4, Bun 1.3.

## Global Constraints

- Do not add a second callback or transport action for tmux recovery.
- Do not change `terminal.new-with-tmux` outside directory item surfaces.
- Keep ordinary worktree, branch-workspace member, and branch-workspace root behavior aligned.
- Do not create Git commits.

---

### Task 1: Project the directory restore label through target menus

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.ts`
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Test: corresponding `*.test.tsx` files and `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- `projectWorktreeListItemActions(..., { tmuxTerminalLabel })` overrides only the projected `terminalTmux` label/title/ARIA label.
- `<WorkspaceItemContextMenu tmuxTerminalLabel={...}>` renders the provided localized label and otherwise keeps `terminal.new-with-tmux`.

- [x] **Step 1: Write failing menu projection and component tests**

Assert `terminal.restore-directory-tmux` on ordinary worktree, member-worktree, and branch-workspace root More/context menus while preserving the existing tmux callback.

- [x] **Step 2: Run focused tests and verify RED**

```bash
bun run test -- src/web/components/branch-list/worktree-list-item-actions.test.tsx src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

Expected: failures because the new label override and translation key are not implemented.

- [x] **Step 3: Add the four-locale key and minimal label overrides**

Keep all action callbacks, icons, busy/disabled state, and server interaction unchanged.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command plus `src/shared/i18n/dictionaries.test.ts`; expect all selected tests to pass.

- [x] **Step 5: Run project verification**

```bash
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all checks exit 0. If the known parallel 5-second timeout recurs, rerun the affected test file independently and report both results.
