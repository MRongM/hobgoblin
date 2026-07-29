# Worktree Bootstrap Source Worktree Design

> **Partially superseded (2026-07-29):** Source-worktree selection and manual dependency candidates remain current, but all `goblin.toml` configuration behavior described below has been removed. This document is retained as implementation history.

## Goal

Resolve repository worktree-bootstrap dependencies from the worktree that the user selected as the source context, rather than always reading the repository locator's primary worktree. This applies equally to one-time untracked candidates and repository-owned `goblin.toml` configuration.

## Scope

In scope:

- Treat every existing, safe, immediate-child file or directory that Git does not track as a manual dependency candidate, whether ignored or ordinarily untracked.
- Read `goblin.toml`, expand configured dependency paths, and materialize sources from the same selected source worktree.
- Preserve the selected source from preview through the corresponding create execution only.
- Support local and SSH repositories with matching behavior.
- Preserve existing trust-by-repository-and-config-hash semantics.
- Treat branch-workspace dependency materialization as best-effort creation work, not durable workspace intent.

Out of scope:

- A new source-worktree picker.
- Recursive manual candidate selection below repository-root direct children.
- Treating Git-tracked entries as manual dependency candidates.
- Synchronizing materialized dependencies after successful creation.
- Persisting dependency decisions, dependency progress, or dependency failures in branch-workspace manifests.
- Inspecting, replacing, or rematerializing repository dependencies during branch-workspace repair.
- Changing configured `copy`, `symlink`, `hardlink`, `exclude`, or `setup` semantics.

## Source Selection

The canonical source is called the **worktree bootstrap source**.

- Ordinary worktree creation uses the worktree attached to the branch context that opened the create dialog.
- Branch-workspace creation uses the existing worktree attached to the selected base branch for that repository.
- If the selected branch has no existing worktree, the repository locator's primary worktree remains the fallback so branch creation remains available.
- The source stays fixed for the lifetime of the preview and resulting decision. Changing the selected base branch reloads dependency preflight from the newly resolved source.

The renderer may derive the source for responsive preview, but branch-workspace planning re-derives it from the server snapshot. Client input therefore cannot make a branch workspace read an arbitrary host path.

## Shared Contract

Non-skip `WorktreeBootstrapDecision` variants gain an optional `sourceWorktreePath`:

```ts
type WorktreeBootstrapDecision =
  | { kind: 'skip' }
  | {
      kind: 'run'
      configHash: string
      configTrusted: boolean
      sourceWorktreePath?: string
    }
  | {
      kind: 'materialize'
      selections: WorktreeBootstrapSelection[]
      candidateScope?: WorktreeBootstrapCandidateScope
      sourceWorktreePath?: string
    }
```

The field is optional for ordinary create-call compatibility. New renderer and branch-workspace create plans include it whenever the selected branch has an existing worktree. Execution falls back to the repository root only for a missing field.

The preflight HTTP/client boundary gains an optional `sourceWorktreePath`. It is validated as a worktree path before any read. The existing preview endpoint already supports an explicit worktree path and remains unchanged.

## Candidate Resolution

Manual dependency preflight uses `all-untracked`:

1. Resolve the selected source to its Git worktree root.
2. Read Git tracked paths and exclude every direct-child root that contains tracked content.
3. Enumerate existing direct children from the filesystem.
4. Exclude `.git`, tracked roots, unsafe names, symlinks, sockets, and other unsupported entry types.
5. Return stable directory-first ordering.

Validation repeats preflight immediately before Git worktree creation. A selected path that has become tracked is stale; a selected path that disappeared remains valid so execution can report it under `skippedMissing`.

## Configured Resolution

If `goblin.toml` exists in the worktree bootstrap source, it takes precedence over manual candidates. Preview hashes that exact file. Execution reads the same source path, rejects a changed hash, expands configured paths there, and materializes only paths that still exist. Missing configured paths remain non-fatal and are reported using existing summary behavior.

The config trust key remains repository id plus content hash. The source path is not a new trust dimension because execution is still hash-bound and repository-scoped.

## Branch-Workspace Lifecycle

Planning resolves the source from the selected base branch and embeds it into the transient server-produced create decision:

- Manual selections are normalized to `candidateScope: 'all-untracked'` plus the resolved source.
- Configured decisions store the resolved source with the config hash.
- The branch-workspace manifest does not persist that decision, bootstrap progress, or bootstrap failures.
- Repair plans recreate missing worktrees with `kind: 'skip'` and never inspect or execute repository dependencies.
- Legacy persisted bootstrap fields are accepted while reading old manifests and discarded from the normalized domain state.

If a user changes a base branch before previewing the plan, the renderer aborts the previous dependency read, clears choices from the old source, and reloads the new source.

## Dependency Failure Semantics

Repository dependency setup is best-effort for branch-workspace creation. When Git creates the member worktree but dependency setup fails, the member is structurally complete, creation continues with the remaining members, and the successful execution result contains a repository-scoped warning for the renderer. The warning is shown to the user but is not persisted.

Failures before Git creates the member worktree remain ordinary operation failures and retain the existing branch-workspace retry behavior. A retry may execute dependencies for a member whose worktree is being created for the first time, but it never retries dependencies for a worktree that already exists.

## Error Handling and Safety

- Reject malformed or overlong source paths at route/service boundaries.
- For branch workspaces, accept only a source worktree observed in that repository snapshot; otherwise use the primary fallback.
- Keep config hash checks during initial creation unchanged.
- Do not follow manual-candidate symlinks.
- Keep local and SSH source selection lexical; do not resolve a source outside the selected repository.
- Cancellation aborts source discovery, validation, initial materialization, and setup through the existing signal paths.

## Testing

Focused tests cover:

- Shared decision normalization preserving a valid source path and rejecting malformed values.
- Local and remote preflight reading untracked candidates and `goblin.toml` from an explicit linked worktree.
- Local and remote create execution using the decision source rather than the primary repository root.
- Ordinary create-dialog preflight and decision forwarding from the opening branch worktree.
- Branch-workspace base-branch changes reloading preflight, all-untracked selection requests, and server re-derivation.
- Branch-workspace manifests omitting dependency intent and progress.
- Dependency failures after Git creation producing non-persisted warnings while creation continues.
- Repair plans skipping dependency inspection and execution, including for legacy manifests.

Full verification uses `bun run typecheck`, `bun run test`, and `bun run check:architecture`.
