# Worktree Switch Remote Branch Design

## Goal

Extend the existing worktree **Switch branch** action so its branch picker accepts both local branches and remote-tracking branch refs. Selecting a remote ref creates a uniquely named local tracking branch and switches the targeted worktree to it in one explicit Git operation.

## Domain language

This feature uses the `CONTEXT.md` term **Worktree branch switch**. It changes the checked-out local branch of the exact branch action target worktree; it is not selected-branch navigation.

- A local selection identifies an existing local branch.
- A remote selection identifies an exact remote-tracking ref plus the new local tracking branch name.
- The default local name is derived by removing the remote prefix, for example `origin/feature/a` becomes `feature/a`.
- The user may edit that local name before switching.
- An existing local branch is never overwritten. A conflicting default name is shown as a validation error until the user enters a unique valid name.
- Remote selection never creates a detached checkout.

## Considered approaches

### 1. Dedicated atomic switch target — selected

Pass a discriminated local-or-remote target through the existing worktree checkout boundary. Local targets use the existing `git switch`; remote targets use one `git switch --track -c` command and then record branch-creation provenance.

This keeps local and remote identity explicit, supports a user-selected local name, performs one Git state transition, and gives local and SSH repositories the same behavior.

### 2. Compose “create tracking branch” then “switch branch”

This reuses two existing write paths but creates a half-success state when branch creation succeeds and switching fails. It also publishes multiple invalidations and makes retry behavior harder to explain. Rejected.

### 3. Pass the remote ref to generic `git switch` and rely on Git guessing

This is smaller but does not preserve explicit local-versus-remote identity, cannot support a custom local branch name, and varies with Git ambiguity and guessing rules. Rejected.

## Shared model

Add a focused shared model for the transport and write boundary:

```ts
type WorktreeBranchSwitchTarget =
  | { kind: 'localBranch'; branch: string }
  | { kind: 'remoteBranch'; remoteRef: string; localBranch: string }
```

The normalizer trims inputs, validates local branch names with `isSafeBranchName`, and validates remote refs with `isRemoteTrackingRef`. A stable key helper prefixes identities with `local:` or `remote:` so a local branch named like a remote ref cannot collide in the picker.

## Dialog behavior

`CheckoutToDialog` loads remote-tracking refs when opened while retaining the existing local branch list. The picker:

- excludes the worktree's current local branch from local candidates;
- includes every valid remote-tracking ref returned by the repository read path;
- labels remote choices with the existing localized Remote marker;
- provides the existing branch search input across local and remote choices;
- keeps local choices usable if remote loading fails;
- shows loading, empty, and load-failure descriptions without blocking local switching.

Selecting a remote choice reveals a local branch name input. It starts with the derived name and uses the existing branch-name validation rules against all local branches. Selecting a local choice hides that field.

Dialog state is interaction-local and resets on close. Remote ref loading is abortable when the dialog closes or its repository changes.

## Write path

The web client sends `{ repoId, worktreePath, target }` to the existing `/api/repo/checkout-in-worktree` route. The route normalizes `target` and delegates to the repository write path. The write path validates the repository locator and worktree path, then calls the repository backend and publishes the existing repository-snapshot invalidation only after a successful mutation.

The backend accepts the discriminated target:

- `localBranch`: run the current checkout implementation;
- `remoteBranch`: validate both names, create and switch to the tracking branch atomically, and best-effort record `hobgoblin-created-from` provenance.

Local repositories execute Git directly. SSH repositories add one quoted remote command with identical semantics. No implicit fetch is added: the dialog uses the repository's current remote-tracking snapshot, and existing fetch/refresh actions remain responsible for network synchronization.

## Error and safety behavior

- Invalid transport inputs return `error.invalid-arguments` before Git execution.
- A duplicate or invalid local branch name blocks dialog submission.
- Git remains authoritative for dirty-worktree conflicts, branches checked out in another worktree, and refs that disappear after the dialog loads.
- A failed atomic switch does not leave a newly created local branch behind.
- No force, reset, overwrite, detached checkout, or implicit network operation is introduced.
- The dialog remains open and shows the returned diagnostic after failure.

## State and realtime

Picker selection, search, remote loading, and error state are local React state. Repository branch/worktree truth remains runtime-coherent and server-owned. A successful switch reuses repository snapshot invalidation and targeted refetch; no new realtime stream or restorable state is required.

## Verification

Tests cover:

- shared target normalization, validation, and collision-free keys;
- local atomic tracking switch command and provenance recording;
- quoted SSH command generation and SSH Git runner delegation;
- local and SSH repository backend dispatch plus snapshot invalidation;
- route and web-client payload handling;
- dialog remote loading, combined filtering, derived/editable local name, duplicate-name blocking, local fallback on load failure, and remote submission;
- existing local-only switching behavior.

Final verification runs `bun run typecheck`, `bun run test`, and `bun run check:architecture`.
