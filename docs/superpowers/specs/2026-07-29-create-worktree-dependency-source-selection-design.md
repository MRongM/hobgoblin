# Create Worktree Dependency Source Selection Design

## Goal

Extend the single-repository “Create a new worktree” dialog with the same worktree-bootstrap source behavior used by branch-workspace repository dependencies: derive a branch-context source, fall back to the repository primary worktree when that source is empty or absent, identify the active source, and let the user load candidates from another eligible worktree.

## Domain language

This feature uses the existing `CONTEXT.md` terms **Worktree bootstrap**, **Worktree bootstrap source**, and **Worktree bootstrap candidate**. The repository primary worktree is Git's primary worktree and is not synonymous with a branch named `main`.

The **source context branch** is the local branch that initially guides source selection:

- `newBranch`: the selected base branch;
- `existingBranch`: the selected existing local branch;
- `trackRemoteBranch` and `detached`: the local branch context from which the dialog was opened, because a remote-tracking ref or detached ref does not identify an existing local worktree source.

No new domain term or architectural decision record is needed because the existing worktree-bootstrap source definition already covers single-repository worktree creation.

## Architecture

Keep asynchronous bootstrap loading in `CreateWorktreeDialogConnected`, next to the existing repository transport call. Keep `CreateWorktreeDialog` responsible for form state, source-context notification, candidate choices, and submission rendering.

Reuse `repositoryDependencySources` to derive the initial source, primary source, and branch alternatives from the renderer's runtime-coherent repository projection. Extract the existing source-status and action-select markup into a small presentational component so branch-workspace and single-repository dialogs use identical copy and interaction behavior.

No source preference is persisted or synchronized. The selected source exists only for the lifetime of the open dialog.

## Source resolution

1. Resolve the source context branch from the active create mode.
2. If that branch has a non-primary worktree, preflight it first.
3. If the read succeeds with candidates, keep that source.
4. If the read succeeds empty, preflight the repository primary worktree and identify it explicitly.
5. If the source context branch has no worktree, preflight the primary worktree directly.
6. A failed read is not an empty result and does not trigger fallback.
7. Alternative choices exclude the source context branch and duplicate worktree paths.
8. Selecting an alternative aborts the previous request, clears choices made against the previous candidates, and loads only the chosen source.
9. The primary source is represented by an omitted `sourceWorktreePath`; a branch source carries its exact worktree path.

## UI

Place a compact source-status panel immediately above the existing candidate list. It contains:

- `Using dependencies from the primary worktree` or `Using dependencies from {branch}`;
- an action selector labelled `Use dependencies from another worktree` when another eligible source exists;
- raw branch names and a localized primary-worktree option.

The panel reuses the existing muted border, typography, spacing, and native select treatment from `BranchWorkspaceDialog`. It adds no new palette, typography, animation, or layout system. This deliberate restraint keeps the dense Git form visually coherent and makes source provenance—not decoration—the distinguishing element.

## Data flow and race handling

`CreateWorktreeDialog` reports source-context branch changes to its connected wrapper. The wrapper derives eligible sources and performs the preflight with an `AbortController`. Changes to the mode context or explicit source abort the prior request; aborted or stale responses cannot replace the current state.

The ready bootstrap state contains the preflight, active source, and eligible source options. Submission copies the active branch source path into `CreateWorktreeRequest`; the connected wrapper creates the existing `WorktreeBootstrapDecision` from the selected candidates and that exact source. Candidate validation and materialization continue through the existing server path.

## Error handling

- Loading disables create, preserving the current behavior.
- Source read errors keep the existing non-blocking error message and do not fall back.
- Empty results show no candidate controls but still permit worktree creation.
- Source changes clear prior candidate choices before another selection can be submitted.
- Closing and reopening resets source and candidate state to the current branch context.

## Testing

- Presentational tests cover source labels, filtering the active source, and source selection callbacks.
- Dialog tests cover source-context changes by create mode, candidate reset on source changes, and exact source-path submission.
- Connected-hook tests cover initial branch reads, empty-to-primary fallback, excluding the source context branch, loading an alternative source, and forwarding the selected source path.
- Existing repository client, server candidate validation, local/SSH materialization, and branch-workspace tests remain green.
- Final verification runs focused Vitest tests, `bun run test`, `bun run typecheck`, `bun run check:architecture`, and `git diff --check`.

## Non-goals

- No union or merge of candidates from multiple sources.
- No recursive automatic search across every worktree.
- No persisted default source.
- No source inference from a remote-tracking or detached ref.
- No redesign of the create-worktree modes or worktree path controls.
- No change to server materialization semantics in this iteration.
