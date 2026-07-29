# Android Plain Workspaces Design

## Goal

Let Hobgoblin Android save and open a readable remote directory as a Project even when the directory has no Git metadata, while preserving the existing remote Git project experience and stored records.

## Domain language

The canonical term is **Plain workspace**, not “non-Git repository”. A Project is either:

- a Git repository, with Branches, Worktrees, and Terminals capabilities; or
- a Plain workspace, with the remote directory as its root and Terminals capability.

Both Android project kinds remain bound to one authenticated SSH host and one absolute remote path. Local Android projects, multi-repository workspaces, file editing, and automatic background reprobes are outside this change.

## User experience

- The existing `Add project` flow remains the only entry point.
- The user selects an authenticated server and an absolute remote directory exactly as today.
- `Save project` probes the selected path once:
  - a Git work tree is saved as a Git repository project, using its canonical top-level path;
  - any other readable directory is saved as a Plain workspace, using its resolved directory path;
  - a missing or unreadable path is rejected.
- The Projects list shows a stable `Git repository` or `Plain workspace` label.
- Opening a Git project preserves Branches, Worktrees, and Terminals.
- Opening a Plain workspace goes directly to its Terminals surface. It never loads a Git snapshot or offers branch/worktree actions.
- Project terminals, external Termux launch, deletion of the local project record, and host-deletion cleanup work for both kinds.

Selecting a directory nested inside an existing Git work tree preserves current Android behavior: it resolves to and saves the Git top level. Opening such a nested directory explicitly as Plain is outside this change.

## Architecture

### Project profile

The Android project profile gains an explicit `RemoteProjectKind` with `GitRepository` and `PlainWorkspace`. Existing four-field persisted records decode as `GitRepository`; newly encoded records include the kind as a fifth field. This is an additive local-storage migration and does not rewrite remote data.

The existing project identifier continues to populate the terminal record's legacy `repositoryId` association field. Renaming that durable terminal field is deliberately deferred because it would require an unrelated terminal-storage migration.

### Remote inspection

`RemoteRepositoryGitService` keeps the SSH/host-key boundary but adds a project inspection operation. Its remote script first proves the selected path is a readable directory and resolves its physical path. It then attempts Git top-level inspection:

- success returns `GitRepository`, canonical Git top level, current ref, and default branch;
- Git unavailable or no work tree returns `PlainWorkspace` and the resolved selected directory;
- path access failure remains an error.

Snapshot, branch, and worktree operations remain Git-only and are not weakened to support Plain workspaces.

### Capability-driven workspace UI

The workspace tabs are derived from project kind:

- Git repository: Branches, Worktrees, Terminals;
- Plain workspace: Terminals only.

The initial tab and refresh behavior use the same capability decision. Plain workspaces do not invoke `onLoadSnapshot`, so the UI cannot accidentally execute Git commands for them. Existing terminal workspace options naturally reduce to the project root because there are no Git worktrees.

## Alternatives considered

### Recommended: automatic probe with a persisted project kind

This matches the desktop model, keeps the add flow simple, supports stable capability gating after relaunch, and preserves old records through a small codec migration.

### Explicit Git/Plain selector

This allows opening a nested directory inside a Git repository as Plain, but adds a choice most users should not need and can produce a misleading classification. Deferred until a concrete nested-workspace requirement appears.

### Infer kind every time a project opens

This avoids storing a kind but adds network latency and lets capabilities change unexpectedly between launches. Rejected because the project list and navigation need a stable local model.

## Error and safety behavior

- Missing, non-directory, or unreadable paths are not saved.
- Host-key trust and saved-private-key authentication remain mandatory through the existing SSH service boundary.
- A normal Git “not a repository” result is classification, not an error.
- Git snapshot failures for Git projects keep the current stale/error behavior.
- A saved Plain workspace stays Plain until it is removed and added again; this change does not add background kind reprobes.
- Plain workspaces never expose Git writes.
- Deleting either project kind removes only the Android record and associated local terminal runtime state; it never deletes the remote directory.

## Testing

- Profile/store tests cover both kinds, legacy four-field decoding, and new five-field round trips.
- SSH service tests cover Git classification, Plain workspace fallback, and inaccessible-directory failure.
- Setup state tests cover project construction from both inspection kinds.
- Workspace state tests prove Plain workspaces expose only Terminals and default to that tab.
- Project list tests cover kind labels and shared terminal targeting.
- App compilation proves the project kind is wired through setup, persistence, navigation, and terminal creation.
- Final verification uses the Android unit suite and Debug APK assembly only.

## Acceptance criteria

1. An authenticated Android host can save a readable absolute remote directory without Git metadata as a Project.
2. Existing stored Git projects remain readable and retain Git capabilities.
3. Plain workspaces are visibly distinguished from Git repositories.
4. Opening a Plain workspace performs no Git snapshot request and shows only the Terminals capability.
5. Internal SSH terminals and external Termux commands start at the Plain workspace root.
6. Missing or unreadable remote paths fail before a project record is saved.
7. Project and host deletion retain their current local-only/cleanup semantics.
