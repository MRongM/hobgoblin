# Branch Workspace Repository Dependency Source Fallback Design

## Goal

Keep branch-workspace repository dependencies useful when the selected base-branch worktree has no immediate untracked candidates. In that case, use the repository primary worktree as the fallback source, identify that source in the dialog, and allow the user to load candidates from another existing worktree outside the selected base branch.

## Domain language

- **Selected base branch** is the repository-specific branch used to create a missing branch-workspace member branch.
- **Repository dependency source** is the existing worktree whose immediate untracked entries populate the one-time repository dependency list.
- **Repository primary worktree** is Git's primary worktree for the repository. It is not synonymous with a branch named `main`.
- **Alternative dependency source** is another existing repository worktree whose branch differs from the selected base branch.

The branch-workspace target branch is not a dependency source during creation because its managed worktree has not yet been materialized.

## Source resolution

1. If the selected base branch has an existing worktree, read candidates from it first.
2. If that read succeeds with at least one candidate, keep it as the source and show the ordinary candidate list.
3. If the selected base-branch worktree has no candidates, read the repository primary worktree when it is a different path.
4. If the selected base branch has no worktree, read the repository primary worktree directly.
5. Identify primary-worktree use explicitly in the dialog, including the case where the selected base branch itself occupies the primary worktree.
6. When the base source is unavailable or empty, offer alternative existing worktrees. Exclude the selected base branch and deduplicate worktrees by path.
7. Loading an alternative source replaces the visible candidates and clears choices made against the previous source.
8. A read error is not an empty result and must not trigger fallback. The dialog keeps the existing blocking error behavior.

## UI

Repository dependency source state remains local to `BranchWorkspaceDialog`.

When fallback/source selection is active, the repository dependency area shows:

- a short source status such as `Using dependencies from the primary worktree` or `Using dependencies from feature/example`;
- an action-oriented source selector labelled `Use dependencies from another worktree`;
- options for the repository primary worktree when it differs from the selected base source, plus branch worktrees other than the selected base branch;
- the existing copy/symlink/skip candidate controls for the currently loaded source.

Raw branch names remain untranslated. UI copy uses sentence case and the project terms “branch workspace” / “子工作区”.

## Request and server validation

When at least one dependency is selected, the renderer includes the exact dependency source path in `worktreeBootstrap.sourceWorktreePath`.

The server plan builder must:

- accept only the repository primary worktree or a worktree currently attached to a snapshot branch;
- run candidate preflight against that exact source;
- reject stale selections that are absent from the authoritative candidate result;
- preserve the validated source path in the executable plan.

The renderer never becomes authoritative for source validity. No source preference is persisted, synchronized, or restored.

## Error and race handling

- Changing the base branch or dependency source aborts the previous request.
- Responses from aborted requests cannot replace current dialog state.
- Source changes reset all candidate choices for that repository.
- Primary fallback only follows a successful empty result; network, SSH, Git, and validation failures remain visible errors.
- If every eligible source is empty, the dialog reports that no selectable untracked entries exist and still permits a dependency-free plan.

## Testing

- Component tests cover automatic primary fallback, primary-source labelling, alternative option filtering, source changes, choice reset, and source-path submission.
- Server plan tests cover accepting a known alternative worktree source and rejecting an unknown source path.
- Existing local/SSH bootstrap candidate tests continue to cover candidate discovery and materialization.
- Full verification runs typecheck, architecture checks, and the complete Vitest suite.

## Non-goals

- No recursive search across all worktrees.
- No merging or unioning candidates from multiple sources.
- No persisted default dependency source.
- No automatic fallback after a source read error.
- No change to ordinary single-repository worktree creation in this iteration.
