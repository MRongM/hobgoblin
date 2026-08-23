# Branch Workspace Sync Select-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users batch-toggle “Sync before creation” while creating or extending a branch workspace.

**Architecture:** Keep the behavior entirely inside `BranchWorkspaceDialog` as interaction-local React state. Derive the mutable synchronization scope from repositories that are visible, selected, available, not fixed, and eligible for synchronization under their effective creation base; the existing preview request remains the only boundary payload.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest/jsdom, Tailwind CSS 4.

**Spec:** `docs/ui-conventions.md`, plus the user-approved inline design from 2026-08-23.

## Global Constraints

- Use Chinese “子工作区” and “成员工作树”; do not introduce “子仓库”.
- Keep dialog selection state local; do not add persistence, Zustand state, server APIs, polling, or realtime events.
- Batch synchronization affects only currently selected, synchronization-eligible, non-fixed repositories.
- Preserve fixed members and ignore unavailable, unselected, or synchronization-ineligible repositories.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and Node.js strip-only TypeScript syntax.
- Do not commit without an explicit user request.

---

### Task 1: Add a tri-state batch synchronization control

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: existing `selectedRepositories`, `syncBeforeCreate`, `effectiveCreationBase(...)`, and `syncEligible(...)` dialog state/policy.
- Produces: a header checkbox localized as `workspace.branch-workspace.sync-before-create-select-all`; checked means every mutable eligible selected repository is enabled, indeterminate means only some are enabled, and disabled means the mutable scope is empty.
- Preserves: `BranchWorkspacePlanRequest` and the existing per-repository `syncBeforeCreate: boolean` payload.

- [x] **Step 1: Write the failing behavior and localization tests**

  Add a `BranchWorkspaceDialog` test with two selected repositories whose local bases track remote refs and one selected repository without a usable upstream. Assert the batch checkbox starts checked, becomes indeterminate after disabling one eligible row, enables all eligible rows on the next click, disables all eligible rows on the following click, ignores the ineligible row, and does not change an eligible row after that repository is unselected. Add `workspace.branch-workspace.sync-before-create-select-all` to the synchronization dictionary contract.

- [x] **Step 2: Run RED**

  Run:

  ```bash
  bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
  ```

  Expected: FAIL because the batch synchronization checkbox and its localized key do not exist.

- [x] **Step 3: Implement the minimal component and copy changes**

  Derive `syncSelectableRepositories` from the current effective bases and selection state, then derive its selected count and all/some flags. Replace the repository header’s single flex row with the existing four-column responsive grid, keep repository select-all in column one, and put a native tri-state batch synchronization checkbox in column four. Its change handler writes only the derived mutable repository names into `syncBeforeCreate`. Add concise English, Simplified Chinese, Japanese, and Korean accessible copy for selecting synchronization across eligible repositories.

- [x] **Step 4: Run GREEN and format the touched files**

  Run:

  ```bash
  bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
  bunx prettier --write src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts docs/superpowers/plans/2026-08-23-branch-workspace-sync-select-all.md
  bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
  ```

  Expected: both target suites PASS before and after formatting.

- [ ] **Step 5: Run repository verification**

  Run:

  ```bash
  bun run typecheck
  bun run check:architecture
  bun run test
  ```

  Expected: all commands exit successfully with no new warnings or failures.

  Verification note (2026-08-23): `bun.exe run typecheck` and `bun.exe run check:architecture` passed. The two target suites passed with 101 tests. The full suite completed with 4,147 passed, 134 failed, and 22 skipped tests across 413 files; observed failures are outside this feature's touched tests and include CRLF-sensitive assertions, a missing Electron binary, and a Windows-only timeout. Step 5 remains open because the repository-wide suite is not green in this environment.
