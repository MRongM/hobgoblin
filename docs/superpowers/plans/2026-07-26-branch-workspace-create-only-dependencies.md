# Branch Workspace Create-Only Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository dependencies best-effort, create-only work so branch-workspace failure recovery and repair never persist, inspect, replace, or rerun dependencies.

**Architecture:** Keep `WorktreeBootstrapDecision` on transient repository create plans, but remove it and its progress from durable branch-workspace members. Convert the specific post-Git bootstrap failure (`repoChanged: true`) into a successful branch-workspace execution warning, continue orchestration, and render those warnings through the existing toast surface. Structural creation failures and structural repair retain their current behavior.

**Tech Stack:** TypeScript in Node.js strip-only mode, React, Hono, Git/SSH backends, Vitest, Testing Library, Sonner.

## Global Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not add package dependencies.
- Manually selected dependencies still resolve from the selected source worktree during initial creation.
- A dependency failure is non-fatal only when Git already created the target worktree and the backend returns `repoChanged: true`.
- Do not persist dependency decisions, progress, failures, or warnings.
- Repair must use `worktreeBootstrap: { kind: 'skip' }` for missing worktrees and must not preflight existing dependency targets.
- Accept legacy persisted dependency fields but discard them during normalization.
- Do not create a Git branch, commit, push, merge, or remove this worktree.

---

### Task 1: Remove durable dependency recovery state

**Files:**
- Modify: `src/shared/branch-workspaces.ts`
- Modify: `src/server/modules/branch-workspace-source.ts`
- Modify: `src/server/modules/branch-workspace-source.test.ts`
- Modify: `src/server/modules/branch-workspace-read.ts`
- Modify: `src/server/modules/branch-workspace-read.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.test.ts`

**Interfaces:**
- Produces a `BranchWorkspaceRepositoryMember` containing only structural member state.
- Legacy JSON may contain `worktreeBootstrap`, `bootstrapProgress`, and `bootstrapLastError`; normalization ignores those extra keys.

- [x] Add failing source/read/git-plan tests proving legacy dependency recovery fields are discarded, do not create readiness issues, and do not block Git actions.
- [x] Run the focused tests and verify failures mention retained bootstrap fields/issues or the Git-action readiness gate.
- [x] Remove `BranchWorkspaceBootstrapProgress`, repository bootstrap member fields, bootstrap issue kinds, and the Git-action bootstrap gate.
- [x] Stop parsing and cloning persisted bootstrap state while leaving extra legacy JSON keys tolerated.
- [x] Remove bootstrap-progress projection from branch-workspace reads.
- [x] Re-run the focused tests and expect PASS.

### Task 2: Make repair strictly structural

**Files:**
- Modify: `src/server/modules/branch-workspace-plan.ts`
- Modify: `src/server/modules/branch-workspace-plan.test.ts`
- Modify: `src/shared/branch-workspaces.ts`

**Interfaces:**
- `planRepairRepository(...)` returns either a satisfied structural member or a `create-worktree` plan with `worktreeBootstrap: { kind: 'skip' }`.
- Repair no longer produces `bootstrap-worktree`, `replace-repository-dependency`, `bootstrapReplacements`, or `replace-repository-dependencies` approval.

- [x] Replace recovery-oriented planner tests with failing tests proving an existing legacy-failed worktree is structurally satisfied without dependency preflight and a missing worktree is recreated with `kind: 'skip'`.
- [x] Run `bun run test src/server/modules/branch-workspace-plan.test.ts`; expect the current planner to call dependency preflight or carry bootstrap intent.
- [x] Remove dependency preview/target-preflight dependencies and simplify repair planning to structural worktree checks only.
- [x] Stop storing transient create decisions in the planned manifest while retaining them on `BranchWorkspaceRepositoryPlan` for initial execution.
- [x] Remove repair-only dependency approvals, replacement steps, action variants, and reduce readiness checks.
- [x] Re-run the focused planner tests and expect PASS.

### Task 3: Continue creation with transient dependency warnings

**Files:**
- Modify: `src/shared/branch-workspaces.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.test.ts`

**Interfaces:**
- Produces `BranchWorkspaceExecutionWarning = { kind: 'repository-dependency-failed'; repositoryName: string; message: string }`.
- Successful `BranchWorkspaceExecuteResult` gains optional `warnings: BranchWorkspaceExecutionWarning[]`.

- [x] Add a failing executor test where one create call returns `{ ok: false, repoChanged: true }`; assert execution continues, returns `ok: true` with one warning, and persists only `progress: 'complete'`.
- [x] Add a failing control test where `repoChanged` is absent; assert the operation still fails structurally.
- [x] Run `bun run test src/server/modules/branch-workspace-write-paths.test.ts`; verify the best-effort case fails under current recovery persistence.
- [x] Collect warnings during execution, treat only post-Git dependency failures as completed members, and continue orchestration.
- [x] Remove bootstrap-only execution and bootstrap-progress persistence helpers.
- [x] Return warnings on successful create and extend results without writing them to the manifest.
- [x] Re-run the focused executor tests and expect PASS.

### Task 4: Surface warnings and update contracts

**Files:**
- Modify: `src/web/hooks/useBranchWorkspaceActions.ts`
- Modify: `src/web/hooks/useBranchWorkspaceActions.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-07-25-worktree-bootstrap-source-worktree-design.md`

**Interfaces:**
- `useBranchWorkspaceActions.confirm()` shows one warning toast summarizing repository-scoped transient dependency failures.

- [x] Add a failing hook test for a successful execution result containing warnings; assert a warning toast contains the repository and failure message.
- [x] Add localized warning title text and dictionary parity assertions.
- [x] Implement warning toast presentation without changing success cache/invalidation behavior.
- [x] Remove recovery/replacement wording from the glossary and design contract.
- [x] Run the hook and dictionary tests; expect PASS.

### Task 5: Verify the complete change

**Files:**
- Review every file changed by Tasks 1–4 and the earlier source-worktree implementation.

- [x] Run all focused branch-workspace source, read, plan, executor, Git-action, hook, route, client, and backend tests; expect PASS.
- [x] Run `bun run typecheck`; expect exit 0.
- [x] Run `bun run test`; expect exit 0.
- [x] Run `bun run check:architecture`; expect exit 0.
- [x] Run `git diff --check` and inspect `git status --short` plus `git diff --stat`; expect no whitespace errors and only task-scoped changes.
