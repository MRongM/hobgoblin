# Branch Workspace Dependency Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, loosely coupled Add dependencies and Remove dependencies actions to ready branch-workspace item menus.

**Architecture:** A dedicated shared contract, server planner/write service, renderer hook, and focused dialog compare live workspace-root candidates with same-named branch-workspace children. Existing materialization IO is reused; successful dependencies remain ordinary, unregistered content.

**Tech Stack:** TypeScript in Node strip-only mode, Hono, React, TanStack Query, Zustand projection, Vitest, Testing Library, shadcn/ui.

## Global Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not add package dependencies.
- Preserve the user's uncommitted `MaterializationCandidateList.tsx` styling change.
- Use sentence case for buttons and the existing item-menu copy style.
- Support local and SSH workspaces through existing source-layer functions.
- Do not create a Git branch, commit, or push.

---

### Task 1: Define and validate dependency-maintenance contracts

**Files:**
- Create: `src/shared/branch-workspace-dependencies.ts`
- Create: `src/shared/branch-workspace-dependencies.test.ts`

**Interfaces:**
- Produces `BranchWorkspaceDependencyOperation`, candidate/read types, add/remove requests, plans, approvals, execute inputs/results, `normalizeBranchWorkspaceDependencyPlanRequest()`, and `normalizeBranchWorkspaceDependencyExecuteInput()`.

- [ ] Write failing tests for valid add/remove inputs, trimmed non-empty names, duplicate rejection, unsafe separators/NUL rejection, allowed modes, approvals, and source tokens.
- [ ] Run `bun run test src/shared/branch-workspace-dependencies.test.ts`; expect failures because the module does not exist.
- [ ] Implement the smallest discriminated unions and normalizers that satisfy the tests.
- [ ] Re-run the focused test; expect PASS.

### Task 2: Build live add/remove comparison plans

**Files:**
- Create: `src/server/modules/branch-workspace-dependency-plan.ts`
- Create: `src/server/modules/branch-workspace-dependency-plan.test.ts`

**Interfaces:**
- Consumes `readBranchWorkspaceSnapshot()`, `inspectBranchWorkspacePath()`, and `fingerprintBranchWorkspaceEntry()`.
- Produces `readBranchWorkspaceDependencyCandidates(rootId, branchWorkspaceId, signal?, dependencies?)` and `buildBranchWorkspaceDependencyPlan(rootId, request, dependencies?, signal?)`.

- [ ] Write failing tests proving only ready workspaces are accepted and candidates are classified by same-named target presence.
- [ ] Add failing tests proving add plans include selected modes, outside-root approval, and server-derived direct-child paths.
- [ ] Add failing tests proving remove plans include target fingerprints and reject missing/unselected targets.
- [ ] Run the focused planner test; expect missing exports.
- [ ] Implement comparison and deterministic SHA-256 plan tokens without persisting dependency state.
- [ ] Re-run the focused planner test; expect PASS.

### Task 3: Execute plans through a focused write path

**Files:**
- Create: `src/server/modules/branch-workspace-dependency-write-paths.ts`
- Create: `src/server/modules/branch-workspace-dependency-write-paths.test.ts`

**Interfaces:**
- Consumes the Task 2 planner plus existing copy, symlink, remove, and invalidation functions.
- Produces `createBranchWorkspaceDependencyWriteService()` with `read`, `plan`, `execute`, `abort`, and `isActive` methods.

- [ ] Write failing tests for read/plan delegation, stale tokens, required approval, and cancellation.
- [ ] Add failing add tests proving sequential copy/symlink execution and stop-on-first-error partial results.
- [ ] Add failing remove tests proving exact target delegation, stale fingerprint rejection through replan, and no rollback.
- [ ] Add failing invalidation tests for full and partial completion.
- [ ] Run the focused write-path test; expect missing implementation.
- [ ] Implement the service with per-root pending plans and abort controllers.
- [ ] Re-run the focused write-path test; expect PASS.

### Task 4: Expose thin server and web boundaries

**Files:**
- Modify: `src/server/routes/workspace.ts`
- Modify: `src/server/routes/workspace.test.ts`
- Modify: `src/web/workspace-client.ts`
- Modify: `src/web/workspace-client.test.ts`

**Interfaces:**
- Produces POST endpoints `/api/workspace/branch-workspaces/dependencies/read`, `/plan`, `/execute`, and `/abort`.
- Produces matching `readBranchWorkspaceDependencies`, `planBranchWorkspaceDependencies`, `executeBranchWorkspaceDependencies`, and `abortBranchWorkspaceDependencies` clients.

- [ ] Write failing route tests for normalizer enforcement and service responses.
- [ ] Write failing client tests for exact payloads and abort signals.
- [ ] Run both focused files; expect failures for missing routes/functions.
- [ ] Add thin route handlers and client wrappers only.
- [ ] Re-run both focused files; expect PASS.

### Task 5: Add renderer action orchestration

**Files:**
- Create: `src/web/hooks/useBranchWorkspaceDependencyActions.ts`
- Create: `src/web/hooks/useBranchWorkspaceDependencyActions.test.tsx`

**Interfaces:**
- Produces candidate/plan/result/pending/error state plus `read`, `requestPlan`, `confirm`, `cancel`, and `reset` actions.

- [ ] Write failing hook tests for read, preview, execute, stale/error projection, partial-result invalidation, and reset.
- [ ] Run the focused hook test; expect missing hook.
- [ ] Implement transport orchestration and branch-workspace query invalidation using `runWithRepoInvalidationSource`.
- [ ] Re-run the focused hook test; expect PASS.

### Task 6: Build the dependency dialog

**Files:**
- Create: `src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.test.tsx`

**Interfaces:**
- Consumes Task 5 state/actions and reuses `MaterializationCandidateList` for add mode.
- Produces a two-stage add/remove dialog with exact-plan preview and destructive remove confirmation.

- [ ] Write failing component tests for add choices, remove checkboxes, empty states, preview payloads, approvals, destructive variant, success close, and error retention.
- [ ] Run the focused component test; expect missing component.
- [ ] Implement the focused dialog without modifying `MaterializationCandidateList.tsx`.
- [ ] Re-run the focused component test; expect PASS.

### Task 7: Wire menu intents and workspace composition

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**
- Adds `onAddDependencies(item)` and `onRemoveDependencies(item)` presentation callbacks.
- Opens Task 6 dialog from the workspace rail and disables competing lifecycle actions while pending.

- [ ] Add failing list tests for menu order, grouping, icons/intents, destructive removal, ready-only visibility, and disabled behavior.
- [ ] Add failing rail tests for add/remove dialog opening and action-hook wiring.
- [ ] Run both focused files; expect failures for absent actions.
- [ ] Add the menu entries and rail composition with no business logic in `BranchWorkspaceList`.
- [ ] Re-run both focused files; expect PASS.

### Task 8: Add localized copy and verify the feature

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Produces all dependency action, dialog, state, approval, stale-plan, and result keys in four dictionaries.

- [ ] Add failing dictionary expectations for every new key.
- [ ] Run `bun run test src/shared/i18n/dictionaries.test.ts`; expect missing-key failures.
- [ ] Add concise localized strings, with Chinese “添加依赖项” and “移除依赖项”.
- [ ] Run all focused tests added or changed by Tasks 1–8; expect PASS.
- [ ] Run `bun run typecheck`; expect exit 0.
- [ ] Run `bun run test`; expect exit 0.
- [ ] Run `bun run check:architecture`; expect exit 0.
- [ ] Review `git diff --check` and `git diff --stat`; preserve unrelated user changes and do not commit.
