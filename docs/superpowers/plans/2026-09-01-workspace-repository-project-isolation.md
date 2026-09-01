# Workspace Repository / Project Isolation Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and close the Windows parity work so repository synchronization preserves the existing workspace member and never imports it into the top-level Project list, matching the established macOS behavior.

**Architecture:** Keep Project membership represented exclusively by `ReposStore.order`, while workspace membership remains `WorkspaceProjectState.repositoryIds` plus `RepoState.workspaceRootId`. Capability reprobe must retain the repository's existing store key when Git reports an equivalent local path, and it must fail safely when Git reports a genuinely different root; neither branch may call an open/import flow or insert a Project.

**Tech Stack:** TypeScript strip-only mode, Zustand, Bun, Vitest, existing local-file path identity bridge.

**Spec:** `docs/superpowers/specs/2026-08-31-windows-local-file-path-bridge-design.md`

**Execution:** Run inline in this worktree. The implementation and focused regressions already exist in commit `3fae0d88`; this plan verifies their completeness against the user-confirmed macOS semantics and changes production code only if fresh evidence exposes a gap. Do not modify the independent `windows/` package, rewrite saved Project identifiers, remove existing user Projects, push, or merge.

---

## File Responsibility Map

- `src/web/stores/repos/lifecycle-write-paths.ts`: runtime repository lifecycle, workspace-member projection, capability reprobe, and the boundary that must not promote a member into Project order during synchronization.
- `src/web/stores/repos/refresh.ts`: explicit synchronization orchestration and propagation of a safe root-change failure.
- `src/web/stores/repos/lifecycle.test.ts`: platform-neutral macOS-style workspace discovery and explicit-open semantics.
- `src/web/stores/repos/refresh.test.ts`: Windows path-equivalence and genuine-root-change regression coverage.
- `src/shared/local-file-path-bridge.ts`: lexical local-path equivalence used to keep Windows spellings on one repository identity.
- `docs/superpowers/plans/2026-09-01-workspace-repository-project-isolation.md`: execution record for this focused parity verification.

### Task 1: Prove The Existing Product Boundary

**Files:**

- Verify: `src/web/stores/repos/lifecycle.test.ts`
- Verify: `src/web/stores/repos/refresh.test.ts`
- Verify: `src/shared/local-file-path-bridge.test.ts`

- [ ] **Step 1: Run the platform-neutral workspace lifecycle suite**

Run:

```bash
bun run test src/web/stores/repos/lifecycle.test.ts
```

Expected: exit code `0`; the suite proves that opening a workspace adds only the workspace root to `order`, projects immediate child repositories as workspace members, and promotes a member only after an explicit `ensureWorkspaceOpen(memberPath)` call.

- [ ] **Step 2: Run the synchronization regression suite**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts
```

Expected: exit code `0`; `manual sync keeps an equivalent Git-for-Windows root on the original workspace member` preserves `order: [workspaceRootId]`, while `manual sync rejects a genuinely different repository root without importing it` leaves the reported root absent.

- [ ] **Step 3: Run the path-identity matrix**

Run:

```bash
bun run test src/shared/local-file-path-bridge.test.ts
```

Expected: exit code `0`; Windows slash, separator, drive-case, and supported WSL projections compare consistently without weakening POSIX/macOS case-sensitive identity.

### Task 2: Grill The Synchronization Path Against Architecture Contracts

**Files:**

- Review: `CONTEXT.md`
- Review: `docs/layering.md`
- Review: `docs/state-sync.md`
- Review: `src/web/stores/repos/lifecycle-write-paths.ts`
- Review: `src/web/stores/repos/refresh.ts`

- [ ] **Step 1: Confirm the domain separation**

Check these fixed contracts:

```text
Project list membership = ReposStore.order
Workspace repository membership = WorkspaceProjectState.repositoryIds + RepoState.workspaceRootId
Synchronization = fetch + runtime projection refresh
Explicit Project import/open = ensureWorkspaceOpen
```

Expected: the contracts agree with `CONTEXT.md` definitions for Project, Repository, multi-repository workspace, and repository synchronization.

- [ ] **Step 2: Inspect synchronization for forbidden project side effects**

Run:

```bash
rg -n "reprobeWorkspaceCapability|repositoryIdAfterReprobe|ensureProjectInOrder|ensureWorkspaceOpen|recordRecentRepo|importWorkspace" src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/refresh.ts
```

Expected: `reprobeWorkspaceCapability` resolves back to the existing repository key and does not call `ensureWorkspaceOpen`, `recordRecentRepo`, `importWorkspace`, `ensureProjectInOrder`, or another Project-order insertion helper. Those open/import calls remain in explicit lifecycle paths only.

- [ ] **Step 3: Confirm state ownership and layering**

Run:

```bash
bun run check:architecture
```

Expected: exit code `0`; the pure comparison remains in `src/shared`, renderer projection updates remain in the repository write layer, and no forbidden Electron or cross-layer import is introduced.

### Task 3: Apply A TDD Fix Only If The Contract Is Broken

**Files:**

- Modify only on a reproduced failure: `src/web/stores/repos/refresh.test.ts`
- Modify only on a reproduced failure: `src/web/stores/repos/lifecycle-write-paths.ts`
- Modify only on a reproduced failure: `src/web/stores/repos/refresh.ts`

- [ ] **Step 1: Classify Task 1 and Task 2 evidence**

If every named regression passes and the synchronization path contains no forbidden side effect, make no production edit and continue to Task 4. Existing code already satisfies the approved design, and changing it would add risk without changing behavior.

If a named invariant fails, preserve the failing test output as the RED step. Tighten the failing test so it asserts all four required facts:

```ts
expect(state.order).toEqual([workspaceRootId])
expect(state.repos[reportedId]).toBeUndefined()
expect(state.repos[memberId]?.workspaceRootId).toBe(workspaceRootId)
expect(calls).toEqual({ fetch: [memberId], snapshot: [memberId], status: [memberId] })
```

- [ ] **Step 2: Make the minimal GREEN correction when RED exists**

Retain `memberId` as the canonical key after equivalent-path reprobe, return `error.repository-root-changed` before fetch for a different identity, and do not call any explicit open/import or Project-order helper. Do not normalize or migrate unrelated stored keys.

- [ ] **Step 3: Re-run the failing file**

Run the exact failing command from Task 1.

Expected: exit code `0` and no new warning or unhandled asynchronous work.

### Task 4: Run Repository Completion Gates

**Files:**

- Verify only; modify previously scoped source files only if a gate identifies a regression caused by this work.

- [ ] **Step 1: Run type checking**

Run:

```bash
bun run typecheck
```

Expected: exit code `0`.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: exit code `0`; report the fresh file/test counts. If the command fails, report the exact failing tests and distinguish pre-existing platform failures from regressions without claiming completion.

- [ ] **Step 3: Inspect scope and whitespace**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff -- src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/refresh.ts src/web/stores/repos/refresh.test.ts package.json bun.lock windows
```

Expected: no whitespace error, no dependency change, no edit under `windows/`, and no unexpected production change. The plan document may be the only new worktree file when all existing isolation regressions are already green.

- [ ] **Step 4: Leave external actions to final confirmation**

Report verification evidence and any remaining packaged-Windows smoke test. Do not push, merge, remove the worktree, or clean already-persisted duplicate Projects without explicit user direction.

## Execution Results

Executed inline on 2026-09-01.

- Focused lifecycle, synchronization, and local-path identity verification passed: 3 files and 76 tests.
- `bun run check:architecture` passed.
- `bun run typecheck` passed all three TypeScript projects after the competing full-suite process was stopped.
- The synchronization-path inspection found no call from capability reprobe to explicit Project open/import, recent-Project recording, or Project-order insertion.
- No production-code gap was reproduced, so Task 3 correctly made no production edit.
- A fresh standalone `bun run test` did not pass. It reported broad Windows/platform and timeout failures in unrelated suites, including file-tree, Git integration, terminal, Apple-terminal, SSH, and settings tests; Vitest also reported fork termination timeouts and then stopped producing output for more than one minute. The hung process was cancelled, so no aggregate pass/fail count is available and branch-level completion cannot be claimed.
- Final scope contains no production, dependency, lockfile, or independent `windows/` package change from this execution. This plan document is the only new worktree file.
