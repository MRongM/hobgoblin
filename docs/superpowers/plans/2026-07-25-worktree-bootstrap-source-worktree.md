# Worktree Bootstrap Source Worktree Implementation Plan

> **Amendment (2026-07-26):** Branch-workspace dependency persistence and repair steps in this original plan are superseded by `2026-07-26-branch-workspace-create-only-dependencies.md`. Source selection remains part of transient preflight and create execution only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve manual and `goblin.toml` worktree-bootstrap dependencies from the selected source worktree, including ignored and ordinary untracked files.

**Architecture:** Add an optional, backward-compatible source path to non-skip bootstrap decisions and the preflight boundary. Renderer previews use the selected branch worktree, while branch-workspace planning re-derives and persists the authoritative source from repository snapshots; local and SSH backends use that same persisted source during create and repair.

**Tech Stack:** TypeScript in Node.js strip-only mode, React, Hono, Git CLI, SSH command layer, Vitest, Testing Library.

## Global Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not add package dependencies.
- Manual candidates are existing safe direct children that Git does not track; `.git` and unsupported filesystem types remain excluded.
- `goblin.toml` takes precedence over manual selection and is read from the same source worktree.
- Preserve legacy decisions without `sourceWorktreePath` through primary-root fallback.
- Support local and SSH repositories symmetrically.
- Do not create a Git branch, commit, or push.

---

### Task 1: Extend and normalize the bootstrap source contract

**Files:**
- Modify: `src/shared/worktree-bootstrap-summary.ts`
- Modify: `src/shared/worktree-bootstrap-summary.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

**Interfaces:**
- Produces optional `sourceWorktreePath` on non-skip `WorktreeBootstrapDecision` variants.
- Produces `getRepositoryWorktreeBootstrapPreflight(cwd, signal?, candidateScope?, sourceWorktreePath?)`.

- [x] Add failing shared and route tests proving a safe source path survives normalization, malformed values are rejected, and `skip` carries no source.
- [x] Add failing client tests expecting `{ cwd, candidateScope, sourceWorktreePath }` on the preflight request.
- [x] Run `bun run test src/shared/worktree-bootstrap-summary.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts`; expect focused assertion failures.
- [x] Add the optional source field, route normalization, and client payload with no new abstraction beyond a small shared path guard if required by both normalizers.
- [x] Re-run the focused tests; expect PASS.

### Task 2: Read and execute bootstrap from one explicit source

**Files:**
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/modules/repo-read-paths.test.ts`
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/system/git/worktree-bootstrap-candidates.test.ts`
- Modify: `src/system/git/worktree-bootstrap.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

**Interfaces:**
- Consumes `decision.sourceWorktreePath` and falls back to the backend repository root only when absent.
- Explicit preflight validates the path, creates a source-specific local cwd or remote target, and delegates to existing candidate/config readers.

- [x] Add failing server tests where the repository root and linked source worktree contain different candidates and different `goblin.toml` content.
- [x] Add failing local and SSH execution tests proving materialization reads the selected source and config hash checks bind to that source.
- [x] Run `bun run test src/server/modules/repo-read-paths.test.ts src/server/modules/repo.test.ts src/system/git/worktree-bootstrap-candidates.test.ts src/system/git/worktree-bootstrap.test.ts src/system/ssh/git.test.ts`; expect source-selection failures.
- [x] Implement source-specific local and remote delegation for preflight, selection validation, target preflight, creation bootstrap, and repair bootstrap.
- [x] Keep legacy no-source decisions on the existing repository-root path.
- [x] Re-run the focused tests; expect PASS.

### Task 3: Bind ordinary worktree creation to its opening worktree

**Files:**
- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

**Interfaces:**
- Consumes the branch context passed through `createWorktreeDialog.payload` and `repo.data.branches[*].worktree.path`.
- Produces preflight calls and non-skip decisions containing the resolved opening worktree path.

- [x] Add failing hook tests with different primary and selected linked-worktree paths; assert preflight receives the selected path.
- [x] Add failing tests proving configured and manual decisions both forward that path, while a branch without a worktree uses the legacy root fallback.
- [x] Run `bun run test src/web/hooks/useBranchActionItems.test.tsx`; expect argument and payload failures.
- [x] Resolve the opening source once per dialog open, pass it to preflight, and attach it to non-skip decisions.
- [x] Re-run the focused hook test; expect PASS.

### Task 4: Bind branch-workspace dependencies to the selected base worktree

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/shared/branch-workspaces.ts`
- Modify: `src/shared/branch-workspaces.test.ts`
- Modify: `src/server/modules/branch-workspace-plan.ts`
- Modify: `src/server/modules/branch-workspace-plan.test.ts`

**Interfaces:**
- `BranchWorkspaceRepositoryOption.sourceWorktreeByBranch` maps branch names to existing worktree paths.
- Planning derives `sourceWorktreePath` from the selected base branch's snapshot worktree and emits `candidateScope: 'all-untracked'`.
- Server-produced decisions persist the source for repair; client-provided source fields are not trusted by branch-workspace planning.

- [x] Add failing renderer tests proving initial selection uses the default branch worktree and a base change aborts/reloads preflight from the new source while clearing old choices.
- [x] Add failing shared tests proving create-request normalization strips client source authority and normalizes materialization selections to all-untracked semantics.
- [x] Add failing planner tests proving manual and configured decisions use the selected base branch worktree, ordinary untracked files are accepted, and a base without a worktree falls back to the repository root.
- [x] Run `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/branch-workspaces.test.ts src/server/modules/branch-workspace-plan.test.ts`; expect source and scope failures.
- [x] Carry branch worktree paths into dialog options, reload source-sensitive preflight, and re-derive the authoritative source in `planRepository()`.
- [x] Persist that source through existing decision cloning and manifest serialization.
- [x] Re-run the focused tests; expect PASS.

### Task 5: Update the domain contract and verify the repository

**Files:**
- Modify: `CONTEXT.md`
- Modify: any focused snapshots or localized descriptions whose assertions still state ignored-only behavior.

**Interfaces:**
- Updates **Worktree bootstrap candidate** and **Repository dependency candidate** to identify the worktree bootstrap source and all-untracked rule.

- [x] Update glossary definitions without implementation details and replace ignored-only user copy with untracked-source wording where surfaced.
- [x] Run every focused test changed in Tasks 1–4; expect PASS.
- [x] Run `bun run typecheck`; expect exit 0.
- [x] Run `bun run test`; expect exit 0.
- [x] Run `bun run check:architecture`; expect exit 0.
- [x] Run `git diff --check` and inspect `git diff --stat`; expect no whitespace errors and only task-scoped changes.
