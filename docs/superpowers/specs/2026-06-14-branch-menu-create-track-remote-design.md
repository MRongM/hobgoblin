# Branch Menu Create And Track Remote Design

## Goal

Add two branch-row dropdown actions:

- Create a local branch from the selected branch row.
- Create a local tracking branch from a selected remote-tracking branch.

Both actions are branch creation flows only. They must not checkout the new branch, create a worktree, merge, pull into a worktree, or push.

The Chinese UI labels are `新建分支...` and `拉取远程...`. The `拉取远程...` action uses tracking-branch creation semantics, not `git pull` semantics.

## Scope

In scope:

- Add localized `Create Branch...` / `新建分支...` to the branch action dropdown.
- Add localized `Pull Remote...` / `拉取远程...` to the branch action dropdown.
- Require a user-entered local branch name for `Create Branch...` / `新建分支...`.
- Let the user choose a remote-tracking ref for `Pull Remote...` / `拉取远程...`.
- Derive a default local branch name from the remote ref and allow editing it.
- Filter remote refs whose derived local branch already exists.
- Support local repositories and SSH-backed remote repositories through the existing repo backend boundary.
- Reuse the existing branch action scheduler, operation state, result reporting, invalidation, and refresh path.

Out of scope:

- Checking out newly created branches.
- Creating worktrees.
- Pulling remote content into the currently selected branch.
- Pushing newly created branches.
- Fetching automatically before opening the remote branch dialog.
- Redesigning the branch dropdown layout.

## Current Context

The branch dropdown is rendered by `BranchActionsMenu` and receives action groups from `useBranchActionItems`. Existing repository-level branch mutations flow through `RepoBranchAction`, `runBranchAction`, `repo-client`, server routes, `RepoBackend`, and finally local or SSH Git implementations.

The app already has:

- `getRepositoryRemoteBranches()` for listing remote-tracking refs.
- `deriveLocalBranchFromRemoteRef()` for turning refs like `origin/feature-x` into `feature-x`.
- `CreateWorktreeDialog` remote-ref loading patterns that can be reused conceptually without reusing the worktree-specific UI.
- Local and SSH-backed `RepoBackend` implementations for branch, worktree, fetch, pull, push, delete, commit, and merge operations.

## Interaction Design

### Create Branch

The dropdown item label is localized as `Create Branch...` in English and `新建分支...` in Chinese.

Selecting it opens a compact form dialog:

- Base branch: read-only display of the selected row branch.
- New branch name: editable input.
- Cancel and create actions.

Validation:

- Empty name disables submit.
- Invalid branch names show an inline error.
- Existing local branch names show an inline duplicate error.

Submitting creates the branch with the selected row branch as the base. It does not checkout the new branch and does not create a worktree.

### Pull Remote

The dropdown item label is localized as `Pull Remote...` in English and `拉取远程...` in Chinese. Despite the user-facing label, this action creates a local tracking branch from a selected remote-tracking ref. It does not run `git pull`.

Selecting it opens a compact form dialog:

- Remote branch: select populated from `getRepositoryRemoteBranches(repo.id)`.
- Local branch name: editable input.
- Cancel and create actions.

Remote refs are filtered so refs whose derived local branch already exists are not offered. When the user chooses a remote ref, the local branch input defaults to the derived name, such as `feature-x` from `origin/feature-x`. The user may edit that local name before submitting.

If no remote refs are available after filtering, the dialog shows an empty-state message and disables submit. Loading failure is treated as an empty list with a clear inline message.

Submitting creates a local tracking branch. It does not checkout the new branch and does not create a worktree.

## Architecture

Extend the existing branch action pipeline instead of adding direct component-level API calls.

Add two action variants:

```ts
type RepoBranchAction =
  | { kind: 'createBranch'; branch: string; baseBranch: string }
  | { kind: 'trackRemoteBranch'; localBranch: string; remoteRef: string }
```

The action target is the resulting local branch name for both variants. The actions run in the existing write lane, not the network lane. They use already known local refs and remote-tracking refs.

Add backend methods to `RepoBackend`:

```ts
createBranch(branch: string, baseBranch: string, signal?: AbortSignal): Promise<ExecResult>
trackRemoteBranch(localBranch: string, remoteRef: string, signal?: AbortSignal): Promise<ExecResult>
```

Local Git implementation:

```text
git branch -- <branch> <baseBranch>
git branch --track <localBranch> <remoteRef>
```

SSH implementation adds matching remote command kinds and validates names before building the remote command.

UI dialogs can live with the existing branch write dialogs because they are branch write flows. Keep shared validation and candidate helpers pure so they can be unit tested without React.

## Data Flow

Create branch:

1. User chooses `Create Branch...` from a branch row.
2. Dialog opens with the selected branch as `baseBranch`.
3. User enters `branch`.
4. UI validates branch name and duplicates.
5. Renderer submits `RepoBranchAction { kind: 'createBranch', branch, baseBranch }`.
6. Store schedules the action in the write lane.
7. Server resolves local or SSH `RepoBackend`.
8. Backend creates the branch.
9. Snapshot invalidation and refresh update the branch list.

Track remote branch:

1. User chooses `Pull Remote...` from a branch row.
2. Dialog loads remote-tracking refs with `getRepositoryRemoteBranches(repo.id)`.
3. Dialog filters refs whose derived local name already exists.
4. User selects a remote ref and confirms the local branch name.
5. Renderer submits `RepoBranchAction { kind: 'trackRemoteBranch', localBranch, remoteRef }`.
6. Store schedules the action in the write lane.
7. Server resolves local or SSH `RepoBackend`.
8. Backend creates the local tracking branch.
9. Snapshot invalidation and refresh update the branch list.

## Error Handling

Client validation handles empty names, invalid branch names, and duplicate local branch names for immediate feedback.

Server and system layers remain authoritative:

- Invalid arguments return `error.invalid-arguments`.
- Git failures return the existing raw git-backed `ExecResult.message`.
- Race conditions, such as another process creating the branch first, are surfaced through the normal result path.
- Remote branch loading failures show an empty-state message and keep submit disabled.

Busy behavior follows the existing branch action operation state. A branch write action already running or queued blocks these actions.

## Testing

Add focused tests:

- Pure helper filters remote refs whose derived local branch already exists.
- Pure helper keeps only valid remote-tracking refs with derivable local names.
- `Create Branch...` dialog rejects empty, invalid, and duplicate branch names.
- `Create Branch...` dialog submits the expected `createBranch` action.
- `Pull Remote...` dialog loads remote refs, filters duplicates, derives local names, and submits the expected `trackRemoteBranch` action.
- Store tests cover both action kinds, operation targets, result event mapping, scheduling, and refresh after success.
- Repo client and server route tests cover request shape for both actions.
- Local Git tests cover command construction and invalid branch names.
- SSH command tests cover remote command construction for both actions.

## Verification

Run:

```text
bun run typecheck
bun run test
bun run check:architecture
```

Manual checks:

- Create a branch from a selected local branch and confirm the current checkout does not change.
- Track `origin/example` into `example` and confirm the current checkout does not change.
- Confirm remote refs whose local branch already exists do not appear in the tracking dialog.
- Confirm both flows refresh the branch list after success.

## Principles

KISS: Two explicit branch creation actions with no hidden checkout, worktree, pull, or push behavior.

YAGNI: No automatic fetch, no broad dropdown redesign, and no new generic branch workflow framework.

DRY: Reuse the existing branch action scheduler, repo backend abstraction, validation helpers, result reporting, and refresh flow.

SOLID: UI dialogs own interaction state, the store owns scheduling, server routes own RPC normalization, `RepoBackend` owns local versus SSH dispatch, and system Git modules own command construction.
