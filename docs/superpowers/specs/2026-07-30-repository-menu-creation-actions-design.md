# Repository Menu Creation Actions Design

## Goal

Expose the existing repository creation flows from the row menus for:

- A standalone Git repository project in the project list.
- A Git repository member in a multi-repository workspace.

Each eligible row gains two independent actions:

- `从远程新建分支` / the existing `action.pull-remote-branch` copy, which creates a local tracking branch from a selected remote-tracking ref.
- `新工作树` / the existing `action.create-worktree` copy, which opens the current worktree dialog without restricting its mode.

## Scope

In scope:

- Add both actions to the row-end `…` menu for standalone Git repository projects.
- Add both actions to the row-end `…` menu for workspace repository members.
- Reuse the existing tracking-branch dialog, worktree dialog, bootstrap preflight, branch-action scheduler, repository refresh, and result reporting.
- Keep the worktree dialog's existing `newBranch`, `existingBranch`, `trackRemoteBranch`, and `detached` modes.
- Keep menu actions visible but disabled when their existing repository capability or operation state makes them unavailable.
- Keep both actions hidden for plain workspace projects.

Out of scope:

- Adding the actions to right-click context menus.
- Adding a remote-only worktree shortcut or changing the worktree dialog's initial mode.
- Adding a local-only branch creation shortcut to these repository-row menus.
- Changing Git commands, server routes, renderer store actions, or repository refresh semantics.
- Automatically activating a project or workspace repository when a menu action is selected.

## Interaction Design

The two creation actions form the first group in each eligible `…` menu. Existing terminal, close-project, and tmux cleanup groups retain their current order after that group.

Selecting `从远程新建分支` opens the existing tracking-branch dialog. It lists known remote-tracking refs, derives an editable local branch name, filters collisions using the existing branch creation model, and submits `trackRemoteBranch` through the existing branch-action write lane.

Selecting `新工作树` opens the existing worktree dialog. At repository-row scope, the dialog uses the repository's current branch as its default base, falling back to the first local branch exactly as the current dialog already does. The user can still change creation mode, branch/ref, target path, and one-time bootstrap selections.

Opening either action must not activate, close, or reorder the row. A plain workspace project does not render either action. When repository data is missing or unavailable, the actions remain disabled rather than attempting a mutation.

## Architecture

Extract the two existing repository-scoped creation flows into one focused renderer hook module. The module exposes:

- A tracking-branch action and its retained dialog.
- A worktree action and its retained connected dialog, including bootstrap-source preflight.
- A small composition hook for repository-row consumers that need both actions.

The existing branch action surfaces consume the same focused hooks, preserving their labels, ordering, selected-branch default for worktree creation, busy state, and mutation payloads. This avoids mounting the complete branch action stack for every project or workspace repository row and avoids duplicating mutation orchestration.

The standalone project row and workspace repository row read their already-open repository projection from `useReposStore`, project the two returned actions into the existing `WorkspaceListItemMenu`, and render the returned retained dialogs beside the row.

No server, shared domain, system Git, SSH, or realtime changes are required. Both mutations already invalidate and refresh runtime-coherent repository state through `runBranchAction` / `submitBranchAction`.

## State and Data Flow

All new state is short-lived dialog state and remains renderer-local.

Tracking branch flow:

1. User opens an eligible repository row's `…` menu.
2. User selects `从远程新建分支`.
3. The retained tracking dialog loads remote refs through `getRepositoryRemoteBranches`.
4. The user selects a ref and confirms the derived or edited local name.
5. The shared hook submits `{ kind: 'trackRemoteBranch', localBranch, remoteRef }` through `runBranchAction`.
6. Existing result reporting and repository refresh update every renderer projection.

Worktree flow:

1. User selects `新工作树`.
2. The retained connected worktree dialog reads the target repository projection and loads bootstrap candidates from the existing preflight endpoint.
3. The user selects one of the existing four modes and confirms.
4. The shared hook submits `{ kind: 'createWorktree', input, worktreeBootstrap }` through `submitBranchAction`.
5. Existing result reporting and repository refresh expose the new branch/worktree.

## Error and Busy Behavior

- `从远程新建分支` is disabled when the repository has no configured remotes or another branch action is active.
- `新工作树` is disabled while another branch action is active.
- Both actions are disabled for unavailable or missing repository projections.
- Dialog validation, empty remote lists, remote-list load failures, Git/SSH failures, stale repository tokens, and worktree bootstrap failures keep their existing handling.
- No error path activates the target project or workspace repository.

## Testing

Use TDD at the renderer boundary:

- Project-list tests first assert that Git project menus expose both actions, plain workspace menus do not, and selecting the actions does not activate or close the project.
- Workspace-repository-list tests first assert that each menu exposes both actions and selecting them does not activate the repository row.
- Focused creation-hook tests cover dialog opening, existing action payloads, disabled states, and the current-branch default for repository-scoped worktree creation.
- Existing `useBranchActionItems` tests remain green to prove selected-branch worktree defaults, bootstrap decisions, action ordering, and remote tracking behavior did not regress during extraction.

Verification commands:

```text
bun run typecheck
bun run test
bun run check:architecture
```

## Domain Model and Decisions

This change uses existing domain terms without adding a new concept:

- A `Project` may be a Git repository or a plain workspace.
- A `Repository` remains the single Git operation boundary.
- A `Workspace repository` remains a repository member of a multi-repository workspace.
- Branch and worktree creation remain repository-scoped writes.

No `CONTEXT.md` glossary update is needed. No ADR is justified because this is a reversible UI entry-point and renderer refactor that does not introduce a hard-to-reverse architectural decision.

## Engineering Principles

- KISS: expose two existing flows without inventing a combined creation wizard.
- YAGNI: do not change backend contracts, right-click menus, or creation semantics.
- DRY: share the existing dialog and mutation ownership between branch and repository-row surfaces.
- SOLID: keep repository creation interaction state separate from unrelated branch, terminal, merge, and destructive actions.
