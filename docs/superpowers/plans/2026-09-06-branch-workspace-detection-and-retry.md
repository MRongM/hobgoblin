# Branch Workspace Detection and Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect manually created `hob-`, `hobgoblin-`, and `goblin-` branch-workspace folders from real Git worktrees while treating Hob registries as optional metadata, and retry transient branch-workspace CRUD operations up to three attempts.

**Architecture:** Add a server-side discovery source that scans only direct prefix directories and probes their direct children as Git worktrees. The branch-workspace read model merges discovered manifests with persisted manifests by normalized path; persisted metadata still supplies stable ids/order and recovery state, but configuration membership no longer gates discovery. Add one small retry helper at the materialization/write boundary with a fixed three-attempt limit and abort-aware delay.

**Tech Stack:** TypeScript strip-only runtime, Bun, Vitest, local and SSH repository backends, existing branch-workspace read/write layers.

## Global Constraints

- Keep `src/main/**` independent from `src/web/**` and `src/server/**`.
- Do not change the persisted registry schema or add database fields.
- Keep the `hob-`, `hobgoblin-`, and `goblin-` prefix rule; ordinary directories remain excluded from automatic detection.
- Preserve safety checks for root containment, symlinks, primary worktrees, and locked worktrees.
- Pin no new dependencies.
- Run `bun run typecheck`, `bun run check:architecture`, targeted Vitest, and `bun run test` before reporting completion.

---

### Task 1: Add prefix-directory branch-workspace discovery

**Files:**
- Create: `src/server/modules/branch-workspace-discovery-source.ts`
- Test: `src/server/modules/branch-workspace-discovery-source.test.ts`

**Interfaces:**
- Consumes: `workspaceRootId`, `workspaceRepositoryPath`, `getRepositoryWorktrees`, `inspectBranchWorkspacePath`, and `isBranchWorkspaceDirectoryName`.
- Produces: `discoverBranchWorkspaceDirectories(rootId, signal?, dependencies?)` returning `{ directoryName, path, branch, members }[]`, where each member contains `repositoryName`, `worktreePath`, and `branch`.

- [x] Write and verify discovery tests for manual, legacy-prefix, local, and remote worktrees.
- [x] Implement local and remote-safe direct-child enumeration using existing path/materialization APIs; retain only exact registered worktree paths and derive a stable repository identity without writing a registry.
- [x] Run the targeted discovery test file.

### Task 2: Merge discovery into the branch-workspace read model

**Files:**
- Modify: `src/server/modules/branch-workspace-read.ts`
- Test: `src/server/modules/branch-workspace-read.test.ts`

**Interfaces:**
- Consumes: `discoverBranchWorkspaceDirectories` from Task 1.
- Produces: Existing `BranchWorkspaceReadResult`, with discovered folders represented as ordinary `BranchWorkspaceSnapshot` items.

- [x] Add and verify read/catalog tests for an unconfigured discovered folder and stored metadata merging.
- [x] Inject discovery into a catalog read layer, synthesize runtime manifests, merge by normalized path, and preserve stored identity/operation metadata.
- [x] Remove configuration membership as a readiness gate while retaining physical resource and safety checks.
- [x] Run the focused read and catalog suites.

### Task 3: Add bounded retry for branch-workspace CRUD operations

**Files:**
- Create: `src/server/modules/branch-workspace-retry.ts`
- Modify: `src/server/modules/branch-workspace-materialization-source.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.ts`
- Test: `src/server/modules/branch-workspace-retry.test.ts`
- Test: `src/server/modules/branch-workspace-materialization-source.test.ts`

**Interfaces:**
- Produces: `withBranchWorkspaceRetry<T>(operation, options?)`, with `maxAttempts` fixed to 3 by default and abort-aware retry delays.

- [x] Add and verify helper tests for capped retries, result retries, aborts, and deterministic safety errors.
- [x] Implement the helper with a short bounded backoff and transient-error classification.
- [x] Wrap materialization, Git worktree/branch mutations, and manifest persistence calls at existing call sites.
- [x] Run the retry, materialization, and write-path suites.

### Task 4: Full verification and documentation alignment

**Files:**
- Modify: `docs/superpowers/plans/2026-09-06-branch-workspace-detection-and-retry.md`

- [x] Review the implementation against every requirement in this plan and remove stale wording.
- [x] Run `bun run typecheck`.
- [x] Run `bun run check:architecture`.
- [x] Run `bun run test` (one pre-existing Windows shell override test remains failing).
- [x] Inspect `git diff --check`, `git diff --stat`, and `git status --short`; preserve unrelated pre-existing changes and do not commit.
