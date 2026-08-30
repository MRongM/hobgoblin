# Force Complete Remote Alignment Design

**Date:** 2026-08-30

## Goal

Make **Fully align with remote** a consistently forceful destructive action for ordinary worktrees, branch-workspace member worktrees, and complete branch workspaces.

After one destructive confirmation, the action must discard staged, unstaged, and untracked changes, remove local-only commits, and make every eligible worktree match its configured upstream while preserving ignored files.

## Current Behavior

- Ordinary worktrees fetch the configured upstream remote, reset directly to the fetched remote commit, and remove non-ignored untracked content.
- Branch-workspace member worktrees reuse the ordinary worktree action and execution path.
- The ordinary/member path no longer rejects last-second local commits or worktree changes after confirmation.
- The branch-workspace batch path still rebuilds the reviewed plan and compares fingerprints containing HEAD, status entries, and the complete worktree content state before execution.
- Consequently, a batch confirmation can be rejected as `repository-changed` when local state changes between preview and execution, even though the confirmed action explicitly promises to discard that state.

## Confirmed Scope

- Support ordinary worktrees, branch-workspace member worktrees, and complete branch workspaces.
- Keep exactly one destructive confirmation after the user selects the action.
- Do not add another confirmation or approval during execution.
- Do not block execution because a worktree is dirty, has staged changes, contains untracked files, or has commits ahead of upstream.
- Preserve ignored files.
- Continue to require a configured, parseable, non-gone upstream. The application must not guess a remote or branch for a destructive reset.
- Preserve the current batch progress, cancellation, failure-isolation, retry, and invalidation model.

## Considered Approaches

### 1. Alignment-specific stable-target validation (selected)

Keep the branch-workspace plan and confirmation, but validate only the stable destructive target for unfinished alignment members: repository identity, target branch, exact worktree path, and configured upstream readiness. Treat HEAD, ahead count, status, and worktree content as informational impact data rather than execution guards.

This preserves protection against acting on a different repository target while making the action forceful toward the local state it promises to discard.

### 2. Remove all batch validation for remote alignment

Execute the retained plan immediately after token validation without rebuilding current member facts.

This is smaller, but it can retain stale membership or target information and weakens protection against operating on the wrong worktree. Rejected.

### 3. Orchestrate separate discard, local-commit reset, and pull steps

First reset tracked changes to the current HEAD, clean untracked content, then reset local-only commits, and finally pull.

This introduces redundant destructive steps and more partial-failure states. A fetch followed by `reset --hard <fetched-remote-oid>` already discards tracked changes and local-only commits in one operation; `clean -fd` then removes non-ignored untracked content. Rejected.

## Selected Design

### Ordinary and member worktrees

Retain the existing shared flow:

1. Read the exact checked-out branch, worktree path, and configured upstream for the preview.
2. Show one destructive confirmation with the observed ahead count and change count.
3. On confirmation, fetch only the configured upstream remote.
4. Resolve the fetched remote-tracking branch to its exact commit OID.
5. Run `git reset --hard <remote-oid>` in the exact worktree.
6. Run `git clean -fd` in the same worktree.

The preview's ahead and change counts describe impact only. Local state created after the preview is intentionally discarded by the confirmed operation.

### Complete branch workspaces

Retain the existing batch plan and confirmation UI. Change only alignment-plan validation:

- Rebuild current member facts before execution through the existing server-owned plan layer.
- Require every unfinished reviewed member to still resolve to the same repository, target branch, exact worktree path, and valid upstream target.
- Ignore differences in target HEAD, ahead count, status entries, index hash, and worktree tree for `batch-align-remote` validation.
- Keep fingerprint equality validation unchanged for commit, discard, merge, pull, push, and upstream-changing actions.
- Execute each member through `alignRepositoryWorktreeToRemote`, preserving existing sequential progress, cancellation boundaries, per-member failure reporting, retry rules, and consolidated invalidation.

### Confirmation model

Selecting **Fully align with remote** opens one destructive confirmation surface. Confirming starts the operation directly. No dirty-worktree warning, ahead-commit warning, changed-repository warning, or additional prompt may interrupt execution solely because discardable local state exists or changed.

### Failure handling

- A missing, malformed, or gone upstream remains unavailable because there is no safe remote target to infer.
- A fetch failure occurs before destructive Git mutation for that member.
- If reset succeeds but untracked cleanup fails, report the existing partial-change error and require a fresh review before retry.
- In a complete branch workspace, one member failure does not roll back or prevent later eligible members under the existing failure-isolation model.
- Cancellation may stop before the next member, but reset and clean remain one non-interruptible mutation unit once a member starts.

## Architecture Boundaries

- Plan and execution policy remain in `src/server/modules/branch-workspace-git-action-*.ts`.
- Git process execution remains in `src/system/git/` and `src/system/ssh/`.
- Routes stay thin and transport-only.
- Renderer confirmation and progress remain local projections of server-owned operation state.
- No new persistence, realtime transport, package dependency, re-export shim, or Electron import is introduced.

## Testing

Automated coverage will prove:

- alignment-plan validation accepts changed HEAD, status, and worktree content after confirmation;
- alignment-plan validation still rejects a changed repository, branch, worktree path, or upstream target;
- batch execution invokes every unfinished member even when its discardable local-state fingerprint changed;
- ordinary worktrees retain one confirmation and submit the force-alignment action;
- branch-workspace member worktrees retain the same ordinary action projection;
- local and SSH alignment still reset to the fetched commit and remove non-ignored untracked content;
- ignored files remain untouched because cleanup uses `git clean -fd`, not `-fdx`;
- targeted tests, the full test suite, typecheck, and architecture guard are run.

## Out of Scope

- Guessing or creating an upstream.
- Deleting ignored files.
- Rewriting remote history or force-pushing.
- Changing batch concurrency, progress presentation, or retry UX.
- Adding a second execution confirmation.
- Refactoring unrelated Git actions or repairing unrelated platform-specific test fixtures.

## Success Criteria

- One confirmation authorizes discarding the reviewed worktree's current and last-second local state.
- Ordinary worktrees and branch-workspace member worktrees reach the exact fetched upstream commit with no staged, unstaged, or non-ignored untracked content remaining.
- Complete branch workspaces perform the same force alignment for every eligible member without rejecting changed discardable local state.
- Stable target changes still fail closed instead of resetting an unreviewed repository target.
- Existing ignored-file, cancellation, failure-isolation, invalidation, and architecture guarantees remain intact.
