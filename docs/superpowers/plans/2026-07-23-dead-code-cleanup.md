# Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove compiler-proven unused TypeScript code without changing Hobgoblin runtime behavior or deleting compatibility migrations.

**Architecture:** Treat the application entrypoints as the runtime reachability roots, then use TypeScript `noUnusedLocals` diagnostics as the deletion oracle for local symbols. Preserve HTML-loaded assets, framework/configuration dependencies, and legacy session fields that still participate in normalization.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Vitest 4, Bun 1.3.

## Global Constraints

- Execute inline in the current workspace; do not dispatch subagents.
- Do not delete files or uninstall packages without a separate final confirmation.
- Do not alter runtime behavior, persisted state shape, or migration compatibility.
- Preserve all pre-existing worktree changes.
- Do not create Git commits unless the user separately confirms the dangerous operation.
- Verify with `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Remove compiler-proven production dead code

**Files:**
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/settings/SettingsLayout.tsx`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: `src/web/components/ui/alert-dialog.tsx`
- Modify: `src/web/components/ui/dialog.tsx`
- Modify: `src/web/hooks/useBranchActions.tsx`
- Modify: `src/web/hooks/useMainWindowShellState.ts`
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/stores/repos/refresh.ts`
- Modify: `src/web/stores/repos/runtime.ts`
- Modify: `src/web/terminal.ts`
- Modify: `src/web/stores/i18n.ts`

**Interfaces:**
- Consumes: existing TypeScript compiler diagnostics with `--noUnusedLocals true`.
- Produces: the same runtime interfaces with unused implementation details removed; `TerminalSessionRegistry` drops its unused first constructor parameter.

- [x] **Step 1: Keep the compiler failure as the red check**

Run:

```bash
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --noUnusedLocals true --pretty false
```

Expected before cleanup: TS6133/TS6138/TS6192 diagnostics for the exact symbols listed by the audit.

- [x] **Step 2: Remove unused imports and locals**

Remove only the compiler-reported names: `ColorTheme`, `ComponentProps`, `ids`, `useMemo`, `Tag`, `cn`, `active`, `isMobileDevice`, `openRepositoryRemote`, `uiMode`, `ExecResult`, `RepoOperationReason`, and the unused type-only imports in `src/web/terminal.ts`.

- [x] **Step 3: Remove unused terminal implementation remnants**

Delete the unused `DEFAULT_PARKING_WIDTH` and `DEFAULT_PARKING_HEIGHT` constants; remove the unread `imageAddon` and `progressAddon` fields while retaining addon construction/loading and progress event subscription; remove the unused `TerminalTab` wrapper while retaining `TerminalTabChrome` and `SortableTerminalTab`.

- [x] **Step 4: Narrow the registry constructor**

Change:

```ts
constructor(
  private readonly getCurrentRepoId: () => string | null,
  private readonly onSelectedWorktreeChange: ...,
)
```

to:

```ts
constructor(
  private readonly onSelectedWorktreeChange: ...,
)
```

Remove the corresponding first argument in `TerminalSessionProvider.tsx` and `TerminalSessionRegistry.test.ts`.

- [x] **Step 5: Remove obsolete schemas and export**

Remove `StatusEntrySchema`, `WorktreeStatusSchema`, and `WorktreeStateSchema` from `persistence.ts`; remove the globally unreferenced `translate()` export from `src/web/stores/i18n.ts`. Keep `workspaceActiveRepoByRoot` because both server and renderer migration paths still consume it.

### Task 2: Remove compiler-proven test dead code

**Files:**
- Modify only test files reported by `tsc --noUnusedLocals`, including branch toolbar/dialog, workspace panels, terminal tests, hook tests, and repo-store tests.

**Interfaces:**
- Consumes: existing tests and their currently invoked helpers.
- Produces: behaviorally identical tests without unused imports, destructured values, locals, or never-called helper functions.

- [x] **Step 1: Remove unused test imports and destructured values**

Remove only TS6133/TS6196-reported imports and bindings such as `RendererBridge`, `vi`, `ReactNode`, `ReposStore`, `getProbe`, `getContext`, `toggle`, and `descriptor`.

- [x] **Step 2: Remove never-called test helpers**

Remove only compiler-reported helpers: `flushUntil`, `setTextareaValue`, `flushTerminalRenderSettle`, `makeDescriptor`, `renderItems`, `testBridge`, and `updateRepoForTest`.

### Task 3: Verify the cleanup and retained compatibility

**Files:**
- Verify: `src/web/index.html`
- Verify: `src/web/public/boot.js`
- Verify: `src/shared/rpc.ts`
- Verify: `src/server/modules/settings-source.ts`
- Verify: `src/web/restorable-workspace-state.ts`

**Interfaces:**
- Consumes: application entrypoints, HTML asset references, legacy session normalization.
- Produces: evidence that no source file or dependency requires destructive removal.

- [x] **Step 1: Run strict unused checks**

```bash
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.main.json --noUnusedLocals true --pretty false
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --noUnusedLocals true --pretty false
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json --noUnusedLocals true --pretty false
```

Expected: all three commands exit 0 with no diagnostics.

- [x] **Step 2: Run project verification**

```bash
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: typecheck and architecture checks pass; all tests pass; diff check emits no output.

Observed: typecheck, architecture, and diff checks passed. The final focused suite passed 441/441, and the final full suite passed 3237/3237. An earlier full-suite run had one `BranchList` interaction failure; three consecutive isolated reruns and the final full-suite rerun all passed, confirming suite-level timing interference rather than a cleanup regression.

- [x] **Step 3: Confirm retained non-dead candidates**

Verify `/boot.js` remains referenced by `src/web/index.html`, all declared packages have a source/config/CSS/type/test-runner purpose, and `workspaceActiveRepoByRoot` remains read by both migration paths. Do not request any destructive confirmation when no file or package deletion is justified.
