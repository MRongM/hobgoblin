# Branch Workspace Dependency Actions Design

## Goal

Add **Add dependencies** and **Remove dependencies** actions to every ready branch-workspace item menu. These actions manage branch-workspace root dependencies such as `.env` files and configuration directories sourced from the configured workspace root. They do not manage repository-member worktree bootstrap dependencies.

## Chosen Direction

Use a dedicated dependency-maintenance feature slice rather than adding more modes to the member lifecycle dialog and plan union.

The feature compares two live filesystem views:

- workspace-root auxiliary candidates already discovered by the branch-workspace materialization source;
- same-named direct children inside the selected branch workspace.

A candidate whose target is missing is addable. A candidate whose target exists is removable. Successfully added dependencies remain ordinary branch-workspace content and are not persisted in the branch-workspace manifest. This preserves the existing one-time materialization model and keeps dependency maintenance independent from member drift, repair, reduction, and removal.

## Alternatives Considered

### Extend the existing member lifecycle dialog and plan union

This would reuse more code superficially, but it would couple dependency maintenance to repository membership modes, durable operation recovery, and a large multi-purpose dialog. It also makes adding a dependency look like extending repository membership.

### Persist every successful dependency in the branch-workspace manifest

This would provide provenance, but changes the current domain semantics and introduces new drift, repair, migration, and whole-workspace removal behavior. The requested feature does not require synchronization or durable dependency ownership.

### Dedicated stateless dependency maintenance — selected

This keeps the UI, contract, planner, and write orchestration focused. It reuses only stable source-layer operations: candidate listing, path inspection, copy, symlink, fingerprint, and no-follow deletion.

## Architecture

### Shared contract

`src/shared/branch-workspace-dependencies.ts` owns:

- `add` and `remove` request validation;
- candidate, plan, approval, execute input, and result types;
- duplicate-name and unsafe-name rejection.

No dependency-maintenance types are added to `branch-workspaces.ts`.

### Server read and plan layer

`src/server/modules/branch-workspace-dependency-plan.ts`:

1. reads the selected branch workspace and requires its observed state to be `ready`;
2. reuses the existing workspace auxiliary candidate list;
3. inspects the same-named target under the branch workspace;
4. exposes missing targets for addition and present targets for removal;
5. fingerprints removal targets so execute can reject a stale preview;
6. produces a deterministic plan token.

Only direct-child source and target paths produced by the server are used. Repository names and managed Hobgoblin entries remain excluded by the existing candidate source.

### Server write layer

`src/server/modules/branch-workspace-dependency-write-paths.ts` owns pending plans, cancellation, stale-plan verification, sequential execution, partial-success reporting, and workspace invalidation. It delegates filesystem work to `branch-workspace-materialization-source.ts`.

- Add: copy or create an absolute symbolic link without overwriting an existing target.
- Remove: delete the selected exact direct child without following symbolic links.
- Operations stop on the first error and never roll back completed entries.
- Copying a source that resolves outside the workspace requires the existing `outside-root-source` approval.

The dependency service has its own action state. The renderer disables competing lifecycle actions while it is pending, matching the current separation between lifecycle and batch Git actions.

### Renderer

`BranchWorkspaceDependencyDialog` is a focused two-stage dialog:

1. selection: addable items choose Skip/Copy/Symlink; removable items use checkboxes;
2. preview: show exact planned entries, collect required approval, then execute.

`useBranchWorkspaceDependencyActions` owns transport state, query invalidation, and reset/cancel behavior. `BranchWorkspaceList` remains presentational: it receives `onAddDependencies` and `onRemoveDependencies` callbacks and emits menu intents.

## Safety and Error Handling

- Only ready branch workspaces expose the actions.
- Plans are rebuilt immediately before execution; token mismatch returns a stale-plan error.
- Removal target fingerprints bind confirmation to the previewed content.
- Deletion is always shown with destructive styling.
- Symlink removal unlinks the link and never traverses its target.
- Empty selections and duplicate or unsafe names are rejected.
- A partial result names completed entries; invalidation still runs so the next preview reflects live state.
- Local and SSH workspaces share the existing materialization boundary.

## UI and Copy

Menu order mirrors member actions:

1. Add member worktrees
2. Remove member worktrees
3. Add dependencies
4. Remove dependencies

Dependency actions form their own separated group. Copy remains sentence case in dialogs; the More menu uses the project's existing item-menu copy style. Chinese uses “添加依赖项” and “移除依赖项”. English uses “Add dependencies” and “Remove dependencies”. Japanese and Korean dictionaries receive equivalent keys.

The existing `MaterializationCandidateList` is reused for addition. The current uncommitted styling change in that component is preserved unchanged.

## Testing

- Shared normalization rejects malformed, duplicate, and unsafe requests.
- Planner tests cover add/remove comparison, ready-state enforcement, exclusions, outside-root approval, and removal fingerprints.
- Write-path tests prove red/green behavior for stale plans, approvals, sequential partial completion, no-follow removal delegation, cancellation, and invalidation.
- Route/client tests cover the new boundary.
- Hook/dialog/list/rail tests cover intent wiring, selection, preview, destructive confirmation, successful close, failure retention, and disabled states.
- Final verification runs focused tests, `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Non-goals

- No dependency synchronization or update action.
- No durable dependency registry or schema migration.
- No automatic recreation during repair.
- No repository-member worktree bootstrap changes.
- No deletion of items lacking a current workspace-root counterpart.
- No package additions, Git branch creation, commit, or push.
