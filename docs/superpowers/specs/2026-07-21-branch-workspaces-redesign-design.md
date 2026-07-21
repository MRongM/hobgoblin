# Branch Workspaces Redesign

**Date:** 2026-07-21  
**Status:** Approved — implementation in progress

## Subject, audience, and job

This design replaces cross-repository “batch worktree” controls with **branch workspaces**: durable, branch-named folders inside a configured multi-repository workspace. A branch workspace gathers a selected subset of repository worktrees plus selected workspace-root files or folders into one folder context that can be edited, opened in an external terminal, and used by Hobgoblin internal terminals.

The primary user is a developer who needs one task branch to span different branches and bases across several independent repositories without turning those repositories into a monorepo or another top-level project.

## Problem

The current workspace worktree flow applies one create or remove request to every configured repository and places each worktree beside its source repository. Progress is in memory, the UI presents the operation as a batch, and successful create/remove operations rewrite a managed block in `AGENTS.md`. This model has four problems:

- there is no durable object representing the cross-repository working context;
- worktrees for one task are not contained by one actionable folder;
- repository membership and base branches cannot vary per task;
- folder-level actions, terminals, recovery, ordering, and deletion safety have no stable owner.

The redesign must introduce that owner without pretending a branch workspace is itself a Git repository or a new project.

## Goals

- Create one stable `goblin-<branch-slug>` folder for a common target branch.
- Let every branch workspace select a non-empty subset of configured repositories and choose a base branch independently for each selected repository.
- Allow selected non-repository direct children of the parent workspace root to be linked or copied into the branch workspace.
- Treat the branch workspace item as indivisible: one name, one folder, one lifecycle, and folder-scoped actions.
- Persist intent and incremental progress so partial operations and external drift remain visible and repairable after restart.
- Put branch workspace items in the same lower-left contextual list position currently used by repository worktrees.
- Let each parent workspace collapse its upper repository list without hiding the active lower contextual list.
- Support local and SSH workspaces with the same semantics.
- Remove all future `AGENTS.md` synchronization from create and delete flows.
- Preserve current worktree bootstrap previews and approval behavior for every newly materialized repository worktree.

## Non-goals

- Migrating or claiming existing flat repository-only worktrees.
- Turning a branch workspace into a `Project`, `RepoState`, monorepo, or nested collection of repository panels.
- Removing individual members, changing an auxiliary entry between link and copy, or changing a member base after it has been added.
- Synchronizing copied auxiliary content with its source or merging it back.
- Tracking external terminal processes after Hobgoblin opens them.
- Automatically cleaning historic Hobgoblin-managed blocks from existing `AGENTS.md` files.
- Adding cross-repository Git status, history, branch switching, or pull controls inside a branch workspace.

## Explored approaches

### 1. Explicit branch-workspace slice plus folder context — selected

Add a server-owned branch-workspace registry, dedicated read/write/source modules, and a renderer folder-context model. Git members remain repository worktrees, but the branch workspace is the durable orchestration and navigation boundary.

This keeps the domain honest, survives missing files, supports repair, and lets terminal/file actions operate on the containing folder. The cost is an explicit vertical slice and a small extension to terminal target resolution.

### 2. Represent each branch workspace as a synthetic repository or plain workspace

This could reuse more existing renderer components immediately, but it would place non-Git folders into `RepoState`, make repository selectors and lifecycle scans special-case synthetic entries, and risk presenting branch workspace members as nested repository contexts. Rejected because the apparent reuse moves complexity into every consumer of the repository model.

### 3. Discover branch workspaces from `goblin-*` directories and Git worktrees

This avoids a registry, but the filesystem cannot recover selected membership, copy-versus-link intent, branch provenance, manual order, partial deletion progress, or whether an unavailable entry should be repaired or forgotten. Rejected because observed state cannot be authoritative for this lifecycle.

## Domain model

### Identity and containment

A branch workspace belongs to exactly one configured workspace and has a stable generated identifier. Within that parent, the normalized Git target branch name is unique: creating the same branch again means extending the existing branch workspace with missing members, not creating a second item.

The directory name is readable and cross-platform safe:

```text
<workspace-root>/goblin-<branch-slug>
```

If slug normalization collides with another branch or any existing root entry, append a short hash derived from the full branch name. Persist the selected absolute/logical path and never recompute it for that branch workspace.

Every repository member is placed directly beneath that folder using its configured workspace name:

```text
/workspace/
  api/
  web/
  README.md
  goblin-feature-auth/
    api/                 # linked worktree from /workspace/api
    web/                 # linked worktree from /workspace/web
    README.md            # link or independent copy
```

Repository worktrees remain independent Git operation boundaries. The containing folder is the unit for branch-workspace navigation, editing, terminals, repair, and removal.

### Authoritative and observed state

The server-owned application-data registry is authoritative for:

- branch workspace identity, parent root, target branch, stable directory path, and manual order;
- desired repository and auxiliary membership;
- per-repository base branch and target-branch provenance;
- auxiliary materialization mode and the baseline fingerprint of completed copies;
- durable item-level progress for the current or last incomplete operation.

Git and the filesystem are observed state. Reads reconcile the manifest with actual worktrees, paths, links, copied content, and availability. Missing or moved materialization changes the read-model lifecycle to `needs-repair`; it does not silently recreate or remove the manifest.

### Persisted shape

The implementation should use string-literal unions, not TypeScript enums. The registry is versioned and follows the existing atomic temporary-file-plus-rename pattern.

```ts
interface BranchWorkspaceRegistry {
  version: 1
  workspaces: Array<{
    rootId: string
    branchWorkspaces: BranchWorkspaceManifest[] // array order is display order
  }>
}

interface BranchWorkspaceManifest {
  id: string
  rootId: string
  branch: string
  directoryName: string
  path: string
  repositories: BranchWorkspaceRepositoryMember[]
  auxiliaryEntries: BranchWorkspaceAuxiliaryEntry[]
  operation?: BranchWorkspaceOperationSnapshot
}

interface BranchWorkspaceRepositoryMember {
  repositoryName: string
  targetBranch: string
  baseBranch: string
  branchOrigin: 'created' | 'pre-existing'
  worktreePath: string
  progress: 'pending' | 'complete' | 'removed' | 'failed'
  lastError?: string
}

interface BranchWorkspaceAuxiliaryEntry {
  name: string
  mode: 'symlink' | 'copy'
  sourcePath: string
  targetPath: string
  copyBaseline?: string
  progress: 'pending' | 'complete' | 'removed' | 'failed'
  lastError?: string
}

interface BranchWorkspaceOperationSnapshot {
  kind: 'create' | 'extend' | 'repair' | 'remove'
  phase: 'pending' | 'running' | 'cancelled' | 'failed'
  startedAt: string
}
```

The exact wire DTOs may omit source-only fields, but they must preserve the distinctions above. An operation recorded as `running` when the process restarts is normalized to the corresponding incomplete lifecycle; it is never assumed to still be executing.

### Read-model lifecycle

The read layer projects persisted intent, observed state, and the active server operation into one discriminated lifecycle:

```text
ready
  ├─ create / extend / repair running ─> active
  ├─ drift detected ──────────────────> needs-repair
  └─ remove running ──────────────────> active

active(create|extend|repair)
  ├─ all complete ────────────────────> ready
  └─ fail / cancel / restart ─────────> create-incomplete or needs-repair

active(remove)
  ├─ all complete ────────────────────> manifest removed
  └─ fail / cancel / restart ─────────> delete-incomplete
```

- `ready`: all desired entries match their expected paths and no deletion is pending.
- `create-incomplete`: initial creation or extension has pending/failed entries but the folder remains usable for completed content.
- `needs-repair`: previously completed materialization or the root folder has drifted.
- `delete-incomplete`: removal started but did not finish; the item cannot be reopened or receive new terminals.
- `active`: a runtime overlay containing operation kind, current step, completed count, total count, and cancellation capability.

## Feature and process ownership

### Shared contracts

Add branch-workspace manifest/read/plan/result contracts under `src/shared/`. Keep operation plans separate from durable manifests: plans describe a point-in-time preflight and carry a deterministic token, while manifests retain durable intent and progress.

Use explicit `.ts` imports and string-literal unions so Node.js strip-only execution remains valid.

### Server layers

Use a dedicated vertical slice:

- **source:** atomic registry persistence and local/SSH filesystem primitives;
- **read:** registry lookup, candidate discovery, Git/filesystem reconciliation, lifecycle projection;
- **write:** create/extend/repair/remove planning and sequential execution;
- **boundary:** thin Hono routes that validate input, delegate, and map cancellation/results.

Do not add a generic service or manager. Repository Git operations continue through existing repository write paths; branch-workspace writes orchestrate them but do not reimplement Git.

Only one branch-workspace write operation may run per parent root. Reads continue during an operation and expose its progress. Different parent roots may operate independently.

### Renderer ownership

TanStack Query owns server branch-workspace snapshots. The repo Zustand store owns only navigation projection and restorable selection needed to compose the existing workspace shell. Dialog input and optimistic drag state remain local interaction state.

Server mutations publish a branch-workspace invalidation event. Connected renderers invalidate and refetch only the affected parent-root snapshot. Progress is discrete operation state, so it does not justify polling or a streaming channel; the initiating renderer may keep its existing request/result progress while other clients converge by invalidation.

## Create and extend flow

### Dialog semantics

The existing “batch create” surface becomes **新增子工作区**. It contains:

- one common target branch name;
- a non-empty subset of configured repositories;
- one base branch selector per selected repository, defaulting to that repository's default branch;
- direct workspace-root auxiliary candidates, unchecked by default;
- for each selected auxiliary entry, a mode defaulting to symbolic link with an explicit copy alternative.

Unselected or unavailable repositories do not block creation. A selected unavailable repository cannot pass preflight. Repository execution order follows configured workspace order; auxiliary entries follow their displayed selection order.

If the branch already owns a manifest, the dialog is an additive extension: existing members are shown as fixed, and only missing repositories or auxiliary entries may be selected. Existing members cannot be removed, have their base changed, or switch materialization mode.

### Preflight plan

The server plan performs all read-only validation and returns a token plus exact steps and approvals:

1. Normalize the parent root and require a ready workspace configuration.
2. Resolve the existing branch workspace by exact target branch, or allocate a stable directory name for a new one.
3. Verify every selected repository still belongs to the configuration and is available on the same local host or SSH target.
4. Resolve the expected worktree path under the branch workspace.
5. Resolve branch state independently per repository:
   - target branch missing: plan a new branch from the selected base and record `created` provenance;
   - target branch exists with no worktree: plan a worktree for the existing branch and record `pre-existing` provenance;
   - target branch is already checked out at the exact expected path: verify repository identity and mark the step satisfied;
   - target branch is checked out anywhere else: block; never move or claim it.
6. Generate the existing worktree-bootstrap preview for every worktree that will be added. Preserve its trust/hash approval requirements.
7. Discover auxiliary candidates with `lstat` from direct root children, excluding configured repositories, registered branch-workspace directories, and application temporary entries.
8. Require every auxiliary target to be absent. If a source is a symlink, link mode links to the root entry while copy mode dereferences the source root for the snapshot. Preserve nested symlinks inside copied directories.
9. If a symlink source resolves outside the workspace root, show the resolved path and require a separate approval for either mode.
10. Revalidate all containment, branch, bootstrap, source, target, and collision assumptions immediately before execution. A stale plan is rejected rather than partially applying a different plan.

### Execution

After all required approvals:

1. Persist the new or extended manifest and pending steps before filesystem mutation.
2. Create the branch-workspace directory if absent.
3. Materialize repository worktrees sequentially in configured order, atomically recording progress after each step.
4. Materialize auxiliary entries sequentially and record progress after each step.
5. For a copied entry, compute and persist a deterministic content fingerprint after the copy succeeds.
6. Reconcile the final observed state and mark the item `ready` only if every desired entry is satisfied.

There is no automatic rollback. On failure or cancellation, completed work and its manifest progress remain. Retry replans only pending/failed steps and recognizes exact already-satisfied worktree paths. If bootstrap configuration changed, retry shows a new preview and requires the appropriate approval again.

## Auxiliary entry semantics

### Symbolic link

- The target inside the branch workspace is a symlink to the parent root's direct child entry.
- Deleting the branch workspace unlinks only this link and never follows or deletes the source target.
- Editing content through the link edits the source and the UI preserves link affordances.
- Link creation failure is explicit on local and SSH workspaces; there is no fallback to copy.

### Copy

- The target is an independent, one-time snapshot with no later synchronization or merge-back behavior.
- A root symlink source is dereferenced when copied; nested symlinks are preserved as links.
- The baseline fingerprint uses a stable, sorted recursive traversal of entry types, relative names, file content, permissions relevant to copying, and nested symlink target text. It does not follow nested symlinks.
- Removal compares the current fingerprint with the baseline. A mismatch requires separate destructive approval.
- A missing copied target may be explicitly repaired from the source's current content as a new baseline. Repair is allowed only while the target is absent and never overwrites an existing path.

## Repair and external drift

Every read reconciles without mutation. Examples of drift include a missing/renamed root directory, a member worktree missing from its expected path, a link with the wrong target, a missing copied snapshot, or an unexpected top-level entry.

The item remains listed as `needs-repair` with inspectable per-entry diagnostics. Explicit repair may:

- recreate a missing branch-workspace root at its persisted path after collision checks;
- rematerialize a repository member only when its target branch is not checked out elsewhere;
- recreate a missing or incorrect symbolic link after removing only the managed link itself;
- create a new copy baseline from the current source only when the target is absent;
- mark exact expected worktrees as satisfied after repository identity validation.

Repair never silently adopts a different path, overwrites an existing copy, claims an elsewhere worktree, drops manifest membership, or changes materialization mode. The alternative is whole-item removal through the normal delete preflight.

## Delete flow

The existing “batch remove” surface becomes **删除子工作区** and is available on each branch workspace item. Keeping repository branches is the default. Optional local and upstream branch cleanup remains available only where provenance and branch protection allow it.

### Preflight

Deletion scans the complete folder and every manifest member before mutation:

- A dirty, locked, or primary worktree blocks deletion with no force bypass.
- A target branch checked out somewhere other than its recorded expected path blocks deletion.
- Modified copied entries require separate destructive approval.
- Unregistered content under the branch-workspace root requires separate destructive approval.
- Symbolic links are inspected and removed with no-follow semantics.
- All server-owned internal terminal sessions whose current working directory is the root or any descendant are listed and require separate approval to close.
- External terminals are not tracked; the confirmation copy states this limitation.
- Local/upstream cleanup is offered only for branches recorded as `created`; pre-existing target branches are always retained.
- Protected branches and invalid/stale upstream relationships cannot be cleaned up.

All approvals are represented in the plan token. Before executing, the server rechecks safety and rejects stale assumptions.

### Execution

1. Close every approved internal terminal before any filesystem or Git mutation. If any close fails, abort with no filesystem changes.
2. Persist the `remove` operation state.
3. Remove managed worktrees sequentially through existing repository write paths, recording progress after each member.
4. Perform approved branch cleanup for eligible `created` branches. Network Git operations remain cancellable and sequential.
5. Unlink managed symlinks, remove approved copied content, and remove explicitly approved unregistered content without following links.
6. Remove the containing branch-workspace directory only after every managed and approved entry is gone.
7. Remove the manifest only after the folder, worktrees, and requested cleanup are complete.

Failure or cancellation leaves a `delete-incomplete` item with completed steps recorded. It cannot be opened or receive new terminals; its only primary action is to continue deletion after a fresh preflight. No force option bypasses worktree dirtiness, locks, primary-worktree status, path identity, terminal-close failure, or branch protection.

## Folder context and terminal model

A branch workspace is an explicit **folder context**, not a synthetic repository. Add a branch-workspace context adapter containing the parent root id, manifest id, display branch, persisted root path, availability, and capabilities. File tree, editor, external-terminal, and internal-terminal consumers receive this adapter through their existing capability boundaries.

Internal terminal creation must distinguish folder target kinds without inserting the folder into `RepoState`:

```ts
type TerminalFolderTarget =
  | { kind: 'plain-workspace'; rootId: string; path: string }
  | {
      kind: 'branch-workspace'
      rootId: string
      branchWorkspaceId: string
      branch: string
      path: string
    }
```

The existing repository-worktree target remains unchanged. Extend terminal creation with an explicit branch-workspace target carrying the manifest id; the server validates that id and exact path against the authoritative manifest before creation. After validation, reuse the existing stable terminal grouping key of parent root plus persisted branch-workspace path. This keeps terminal session storage compatible while preventing collision with a repository worktree or the parent Overview.

Terminal count, unread bell, and output-activity badges on an item include only internal sessions scoped to that branch-workspace root. They do not aggregate terminals attached to contained repository worktrees. The internal-terminal action activates the folder context, restores its last selected root-scoped session, and creates one only when none exists.

Delete preflight enumerates server-owned sessions across terminal scopes and matches their recorded terminal target path—the launch working directory encoded by the session descriptor—using normalized same-host descendant checks. This includes root-scoped branch-workspace terminals and repository terminals launched for member worktrees. It deliberately does not claim to observe a shell's later interactive `cd`, which the PTY catalog does not track. Once an item enters `delete-incomplete`, terminal creation is denied at both UI and server boundaries.

## File-tree protections

The parent overview continues to show registered `goblin-*` directories in its ordinary root file tree. They are browsable there, but their top-level rename, move, and delete commands are disabled and rejected by the server. Users must delete them through the branch-workspace lifecycle.

Inside an active branch workspace:

- managed repository member roots and auxiliary roots are visible and browsable;
- those top-level roots cannot be renamed, moved, or deleted through generic file actions;
- content inside repository worktrees and copied roots keeps normal file actions;
- operations through a symbolic-link root act on its source target and the UI displays link semantics;
- generic file APIs revalidate protected paths server-side, so browser clients cannot bypass UI guards.

## Workspace navigation and A-v2 layout

The workspace repository rail keeps its upper repository section:

```text
Workspace repositories
  Overview
  api
  web

Contextual lower list
  when Overview is active: branch workspace items
  when api/web is active: that repository's existing worktree list
```

This lower list is the exact location previously occupied by Git worktrees; no branch-workspace switcher is added to the workspace title bar. Selecting a branch workspace leaves Overview as the active parent section and highlights the branch-workspace row as the concrete context. The root file tree and terminal areas retain their positions.

The **工作区仓库** section header gains the same chevron/button affordance and accessible expanded state as the project-list collapse control. Expansion is stored independently per parent workspace and defaults to expanded for roots with no saved value. Collapsing hides only the Overview and configured-repository rows; it does not change selection and does not hide the lower branch-workspace/Git-worktree list, header actions, or configuration/error status. Re-expanding restores the rows in place without rescanning or refetching.

A branch workspace item is non-expandable and labelled by the common target branch, not the generated directory name. Ready items inherit applicable folder-row behaviors:

- activate/open;
- open in editor;
- open external terminal;
- open/restore internal terminal;
- internal terminal count badge;
- unread bell badge and output-activity indication;
- drag reorder;
- delete.

Lifecycle modifies the action set:

- `active`: progress and cancel only;
- `create-incomplete` or `needs-repair`: inspect/open completed content and retry/repair;
- `delete-incomplete`: continue deletion and inspect errors only;
- `ready`: all actions.

New items append to the persisted array order. Drag reorder persists through the branch-workspace write path. Extend and repair never change position.

The parent toolbar renames the existing batch pull action to **拉取全部仓库** and retains its current configured-repository behavior. It is not a branch-workspace item action.

## Restorable selection

Replace the parent-only `workspaceActiveRepoByRoot` concept with a tagged restorable workspace context capable of representing:

```ts
type RestorableWorkspaceContext =
  | { kind: 'overview' }
  | { kind: 'repository'; repositoryId: string }
  | { kind: 'branch-workspace'; branchWorkspaceId: string }
```

The persistence migration maps the old root/null selection to `overview` and a valid old repository id to `repository`. Activating a branch workspace stores its stable id. On restore, a missing, unavailable, or deletion-incomplete target falls back to Overview without mutating the manifest. Selection is restorable state, not runtime-coherent state.

Add `workspaceRepositoryListExpandedByRoot: Record<string, boolean>` to the same restorable session projection. A missing entry means expanded, preserving current behavior and providing a migration-free default. Toggling one parent root does not affect other multi-repository workspaces, does not require cross-window runtime synchronization, and is pruned when that parent project is removed.

## Workspace configuration constraints

Configured repository membership remains the candidate pool for future branch workspaces. Configuration is still explicitly ordered and additive/removable at the parent level, except that saving a configuration which removes a repository referenced by any branch-workspace manifest is rejected. The response lists affected branch workspace names so the user can delete those items first. Hobgoblin never cascades repository configuration changes into destructive branch-workspace cleanup.

Repository reordering changes future operation order and repository navigation only; it does not reorder existing branch-workspace members or item positions.

## Local and SSH parity

The same plan, manifest, lifecycle, containment, and confirmation contracts apply locally and over SSH. All paths for one branch workspace must resolve on the parent workspace's host and SSH target. Local/remote differences stay behind existing system/source boundaries.

Remote filesystem and Git calls remain cancellable where the existing primitives permit it. Unsupported remote symlink or copy behavior fails explicitly with a per-entry error. There is no automatic symlink-to-copy fallback and no silent local execution for a remote workspace.

## `AGENTS.md` behavior removal

Creation, extension, repair, and deletion do not read, create, update, or remove `AGENTS.md`. Remove the workspace inventory synchronization calls, their source module, dedicated tests, managed-block error messages, and now-unused translations. Existing managed blocks remain untouched as ordinary user files.

This removal is independent of branch-workspace success: there is no post-operation documentation sync that can turn a completed filesystem operation into an application-level failure.

## Error handling and cancellation

- Plan failures are read-only and return field/member-specific errors where possible.
- Every execution validates its plan token immediately before mutation.
- Cancellation stops before the next sequential step; an in-flight Git/SSH/filesystem primitive receives the abort signal when supported.
- Completed progress is persisted after each step; no rollback is attempted.
- Only one operation per parent root can mutate branch workspaces at a time.
- Registry corruption is surfaced as unavailable configuration/data; the server never replaces an unreadable registry with an empty one.
- Atomic registry writes use a sibling temporary file and rename, with serialized writes per data file.
- Unexpected paths and symlinks are inspected with `lstat`; recursive removal never follows a symbolic link.
- Every client-visible error uses an i18n key and keeps raw local/remote paths limited to intentional diagnostic/confirmation fields.

## Implementation boundaries

The eventual implementation should proceed as vertical, testable slices:

1. shared contracts, registry source, reconciliation read model, and configuration-reference guard;
2. create/extend plans and persistent execution, including bootstrap and auxiliary materialization;
3. repair/delete plans, terminal shutdown, path protection, and `AGENTS.md` sync removal;
4. renderer queries, restorable tagged selection, explicit folder context, and terminal targeting;
5. A-v2 list/dialog/actions/reorder UI, lifecycle copy, i18n, and end-to-end verification.

This sequence is guidance for the later implementation plan, not authorization to implement or commit in this design step.

## Testing and verification

### Source and normalization

- Registry round-trip, atomic write, serialized concurrent writes, missing/corrupt versions, duplicate roots/branches, invalid names/paths, and stable array order.
- Directory slug generation, collision hash, path persistence, local/SSH normalization, and containment rejection.
- Auxiliary candidate exclusion, symlink resolution, outside-root approval metadata, copy fingerprint stability, and no-follow behavior.

### Planning and execution

- New branch, pre-existing branch, exact expected worktree, elsewhere worktree, unavailable selected repository, different bases, bootstrap approval, and stale-plan rejection.
- Additive extension, duplicate selection, prohibited removal/mode change, append order, sequential progress, cancel, retry, restart recovery, and no rollback.
- Missing root/member/link/copy repair, copy repair only when absent, and refusal to overwrite or claim unrelated paths.
- Dirty/locked/primary worktree blockers; modified copies; unmanaged files; descendant terminals; terminal close failure before mutation; branch provenance/protection; optional upstream cleanup; partial delete retry; manifest removal only at completion.
- Parent configuration removal guard lists every affected branch workspace.

### Renderer and integration

- Overview displays the branch-workspace list in the existing worktree slot; repository selection restores its Git worktree list.
- Branch workspace selection keeps the Overview section active and renders one folder file tree plus root-scoped internal terminals.
- Every ready item action targets the branch root; count, unread bell, and activity badges ignore contained repository terminal sessions.
- Lifecycle-specific actions, cancellation, repair, deletion continuation, drag order, and disabled terminal creation for delete-incomplete items.
- Per-parent repository-list collapse hides only Overview/repository rows, retains the contextual lower list and header/status actions, restores after relaunch, and defaults to expanded for old sessions.
- Old restorable selection migration and missing-target fallback.
- Cross-window branch-workspace invalidation performs a targeted refetch.
- Parent and child managed-root file protections hold in both UI and server APIs.
- Local and SSH flows expose identical choices and explicit failures.
- English, Simplified Chinese, Japanese, and Korean labels cover new controls and errors.

### Repository checks

Run focused tests plus:

```sh
bun run typecheck
bun run check:architecture
bun run test
```

## Acceptance criteria

- A user can create `goblin-<branch-name>` under a configured workspace from any non-empty repository subset, with a different base branch per repository.
- All selected worktrees live directly inside that folder and use one common target branch name.
- Selected root entries can independently be linked or copied with the specified source, repair, and deletion safety semantics.
- The durable item survives restart, partial failure, unavailable repositories, and external path drift without being silently recreated or dropped.
- Retrying continues only incomplete work and preserves completed members; deletion removes worktrees and the containing folder only after safety checks.
- The Overview lower list replaces the former Git-worktree slot with non-expandable branch workspace items; selecting a repository restores the repository worktree list.
- The upper workspace-repository list can be collapsed per parent with the project-list interaction pattern while the active contextual lower list remains usable.
- Each ready item supports folder activation, editor, external terminal, internal terminal, terminal count, unread bell/activity, reorder, and delete.
- An active branch workspace shows one folder file tree and root-scoped terminals without nested repository Git panels.
- Internal descendant terminals are explicitly approved and successfully closed before deletion mutates files.
- Repository branches are retained by default; optional cleanup affects only eligible branches created by the branch workspace.
- Parent configuration cannot remove a referenced repository.
- No create/delete path reads or writes `AGENTS.md`, and historic managed blocks are unchanged.
- All behavior is available for local and SSH configured workspaces without silent fallback.

## Principles

- **KISS:** one explicit domain object owns the folder lifecycle; repository Git writes remain in existing repository paths.
- **YAGNI:** no flat-worktree migration, member subtraction, copy sync, nested Git UI, or external-terminal tracking.
- **DRY:** file/editor/terminal capabilities are adapted to a folder context instead of copied into a second fake repository model.
- **SOLID:** registry source, reconciliation read, mutation write, HTTP boundary, and renderer projection each retain one responsibility.

## Self-review

- Placeholder scan: no unresolved placeholder marker or deferred product decision.
- Domain consistency: terms match `CONTEXT.md`; branch workspace, workspace worktree, repository-only worktree, and auxiliary entry remain distinct.
- State consistency: manifests are authoritative runtime-coherent server data; navigation selection and per-parent repository-list expansion are restorable; dialogs remain local.
- Safety consistency: all destructive exceptions are explicit plan approvals, while dirty/locked/primary worktrees, path identity, terminal-close failure, and protected branches remain hard blockers.
- Architecture consistency: renderer code does not perform filesystem/Git business logic, and branch folders do not enter `RepoState`.
- Scope consistency: existing repository-only worktrees and pull behavior remain intact; `AGENTS.md` history is not rewritten.
