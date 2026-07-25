# Branch Workspace Dependency Precedence Design

## Goal

Adjust branch-workspace dependency maintenance so an explicitly selected workspace-root dependency takes precedence over same-named ordinary content already present in the branch workspace. Also make symbolic-link materialization independent from source existence at link-creation time, and remove dependency inspection and reconstruction from branch-workspace repair.

This design refines the stateless dependency-maintenance model from `2026-07-24-branch-workspace-dependency-actions-design.md`. It does not turn dependencies into durable branch-workspace members.

## Confirmed Rules

1. Creating a symbolic link does not require the selected source path to exist at materialization time. A dangling absolute symbolic link is valid.
2. A selected dependency has priority over same-named ordinary branch-workspace content and may replace it after plan preview and confirmation.
3. Branch-workspace repair does not inspect dependency sources or targets, does not require dependency checks as a precondition, and does not rebuild dependencies.
4. Repair releases retained pending or failed dependency materialization intent from the manifest while leaving all dependency-related filesystem content unchanged.

## Chosen Direction

Keep dependency maintenance as an explicit, stateless ready-workspace action. Extend its add plan to represent either creation into a missing target or replacement of a previewed existing target.

The selected dependency remains server-derived from the configured workspace root's auxiliary candidates. This prevents clients from supplying arbitrary source or target paths and preserves the existing exclusions for configured repositories, repository worktrees, branch-workspace directories, and application-managed temporary entries.

An occupied target is not rejected. Instead, the plan captures its path kind and fingerprint. Execution rebuilds the plan immediately before writing; any target change invalidates the preview. A confirmed replacement removes only the exact direct-child target without following symbolic links, then materializes the selected dependency.

## Alternatives Considered

### Merge into an existing directory

Rejected. Merge behavior would make precedence ambiguous, leave stale files behind, and require mode-specific conflict rules. Replacement is deterministic and matches the user's explicit priority rule.

### Overwrite without target fingerprinting

Rejected. A path may change between preview and execution. Binding the plan token to the target kind and fingerprint ensures confirmation applies to the exact content that will be removed.

### Persist dependencies and let repair reconcile them

Rejected. This contradicts the one-time materialization model and the confirmed rule that repair must ignore dependencies.

### Replace any client-supplied path

Rejected. Replacement authority is limited to server-derived same-name dependency targets. Repository members and managed paths remain outside the operation's scope.

## Domain Semantics

### Dependency addition

For each selected root candidate, the server inspects the same-named direct child under the ready branch workspace:

- missing target: create the selected copy or symbolic link;
- present target: preview a replacement, bind its kind and fingerprint to the plan, remove that exact target, then materialize the selection.

The operation never merges directory contents. After successful materialization, the result is ordinary branch-workspace content with no durable dependency registry.

### Symbolic-link materialization

Initial selection still comes from the server's current auxiliary candidate list. During execution revalidation, a symbolic-link selection whose source has since disappeared retains the source path from the pending server-owned plan; a copy selection still requires a current source candidate. The final link operation creates an absolute symbolic link to the selected source path without checking whether the source currently resolves. This permits the source to disappear after planning and permits a dangling link as the result.

Symbolic-link mode does not dereference or copy the source, so it never requires the `outside-root-source` approval. Copy mode retains that approval when the selected source resolves outside the workspace boundary.

### Repair

Repair plans only reconcile the branch-workspace root and managed repository-member worktrees. They do not inspect auxiliary dependency paths, add dependency approvals or steps, or invoke dependency materialization.

When repair finalizes the manifest, `auxiliaryEntries` is cleared. Historical pending, failed, or completed dependency intent is therefore released. Existing files, directories, and symbolic links under the branch-workspace root remain untouched unless they are part of another independently managed scope.

Dependency state alone must not create drift or block repair. An interrupted lifecycle operation may still require repair, but repair completion is independent of dependency availability.

## Shared Contract

An add-plan entry includes:

- the server-derived source and target paths;
- selected `copy` or `symlink` mode;
- source kind and workspace-boundary classification;
- previewed target kind;
- a target fingerprint when replacement is required.

The target kind and optional fingerprint are part of the deterministic plan token. No new client-supplied path fields or approval kinds are introduced.

## Server Plan and Execution

### Planning

`branch-workspace-dependency-plan.ts`:

1. requires the selected branch workspace to be ready;
2. reads the server-derived auxiliary candidates;
3. inspects each same-named target;
4. fingerprints selected occupied targets;
5. requests `outside-root-source` only for outside-root copy entries;
6. emits a deterministic token covering replacement state.

Execution revalidation may reuse a missing symbolic-link source only from the pending server-owned plan that produced the submitted token. It never accepts a fallback source path from the client. The selected workspace must still be ready, and every target is reinspected and, when occupied, refingerprinted. A missing copy source remains unavailable.

### Execution

`branch-workspace-dependency-write-paths.ts` rebuilds the plan before execution using the pending server-owned plan as the symbolic-link source fallback and rejects a stale token. For each add entry, sequentially:

1. if the previewed target was present, remove the exact target through the existing no-follow removal boundary;
2. materialize the copy or symbolic link;
3. record the name as completed only after materialization succeeds.

Execution stops on the first failure and does not roll back earlier entries. If removal succeeds but materialization fails, the current entry is not reported as completed and the next preview reflects live filesystem state. This matches the existing partial-success model and avoids an unsafe implicit backup mechanism.

The local and SSH symbolic-link implementations both omit source-existence checks. Copy behavior is unchanged and still fails when its source cannot be read.

## Renderer

The add dialog lists all eligible root candidates, including those with occupied targets. Occupied selections are clearly labeled as replacements in both selection and preview stages.

The existing preview confirmation is the authorization point for replacement. If any planned add entry replaces content, the execute button uses destructive styling and replacement-specific copy. No second checkbox or separate approval token is added because the exact target is already previewed and fingerprint-bound.

Remove behavior remains unchanged.

## Safety Invariants

- The server, not the client, derives every source and target path.
- Replacement is limited to an exact direct child of a ready branch workspace.
- Configured repositories, all repository worktrees, branch-workspace directories, and managed temporary entries remain excluded as candidates.
- Target fingerprints prevent replacing content different from the previewed content.
- Removal never follows a symbolic link.
- Replacement never merges directories and never traverses beyond the exact target.
- Copy retains workspace-boundary approval; symbolic-link mode does not read or dereference its source.
- A missing source may be retained only for a symbolic link already present in the pending server-owned plan; copy never uses this fallback.
- Repair performs no dependency filesystem reads or writes and clears dependency intent from the repaired manifest.

## Testing

- Planner tests prove occupied targets produce fingerprinted replacement entries and affect the plan token.
- Planner tests prove outside-root approval is required for copy but not symbolic-link mode.
- Planner tests prove execution revalidation retains a disappeared symbolic-link source from the pending server plan while rejecting a disappeared copy source.
- Write-path tests prove no-follow removal occurs before replacement materialization and stale targets are rejected before deletion.
- Local and SSH tests prove a symbolic link may be created without a live source.
- Repair tests prove retained dependency entries create no checks, approvals, steps, or materialization calls and are cleared from the repaired manifest.
- Read-state tests prove dependency absence or mismatch alone does not create drift.
- Dialog tests prove occupied candidates are selectable and replacement previews use destructive confirmation.
- Final verification runs focused tests, `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Non-goals

- No dependency synchronization, merge, update, or rollback mechanism.
- No durable dependency registry or schema migration.
- No repair-time dependency validation, deletion, or recreation.
- No changes to repository-member bootstrap dependencies.
- No arbitrary client-selected filesystem paths.
- No package additions, Git branch creation, commit, or push.
