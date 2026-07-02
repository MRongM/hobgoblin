# Branch Action Split Button Design

Date: 2026-07-02

## Context

The branch action UI currently uses a single dropdown trigger for branch actions in branch rows and focus-mode branch controls. Users want the action dropdown to gain a button on its left side, remember the last clicked operation, and default to the edit operation.

Existing action definitions already flow through `BranchActionItem` groups from `useBranchActionItems`. The design keeps that model intact and changes only the renderer-side control that presents and remembers a quick action.

## Decisions

- Use a split button layout.
- The left button directly executes the remembered quick action.
- The right button opens the existing full action dropdown.
- The default quick action is `editor`, shown as the localized edit label.
- Remember the quick action per repository and per branch, keyed by `repoId` plus `branch.name`.
- Remember only non-destructive actions.
- If the remembered action is no longer visible or enabled, fall back to `editor`.
- If `editor` is also unavailable, show the edit button disabled.
- Keep this as renderer memory state; do not persist to app settings or repo snapshots.

## Interaction

Each branch action control becomes:

1. A left quick-action button.
2. A right dropdown trigger.

Clicking the quick-action button runs the resolved quick action through the same async/busy path as menu actions.

Clicking a non-destructive dropdown item runs that item and updates the remembered action for that branch. For example, if the user chooses Terminal on `feature/a`, the left quick button for `feature/a` becomes Terminal. Other branches keep their own remembered action, defaulting to Edit unless changed.

Clicking a destructive dropdown item, such as delete branch or remove worktree, runs the existing action and confirmation flow but does not change the remembered quick action.

## Component Boundaries

`useBranchActionItems` remains responsible for building action groups. It should not own quick-action memory.

`BranchActionsDropdown` becomes the split-button presenter. It receives enough identity to remember by branch:

- `repoId`
- `branchName`
- existing action groups

Call sites already have this context:

- `BranchRowActions`
- focus-mode branch actions in `RepoToolbar`
- focus-mode branch actions in `TopbarRepoControls`
- any direct `BranchActionsMenu` wrapper that has `repo` and `branch`

The remembered value stores only `BranchActionItem['id']`, never labels, callbacks, or full item objects. This keeps state small and avoids stale behavior when branch capabilities change.

## State And Resolution

The split button maintains a renderer-memory map:

```ts
Map<string, BranchActionItem['id']>
```

The key is a stable composition of repository id and branch name, for example `repoId + "\0" + branchName`.

Resolution order:

1. Look up remembered action id for the branch key.
2. If missing, use `editor`.
3. Find the matching visible, non-destructive action item.
4. If the item is missing or disabled, try `editor`.
5. If `editor` is missing or disabled, render a disabled edit quick button.

The full dropdown continues to show the existing grouped actions, including disabled and destructive items.

## Error Handling

The quick button uses the same disabled, loading, and busy rules as dropdown items. If any action is already pending, both the quick action and menu items should be blocked consistently.

Action failures remain handled by the existing action callbacks and repo store result/toast paths. The split button does not introduce new Git or backend operations.

## Testing

Focused test coverage should verify:

- The split control renders a quick edit button by default.
- Selecting a non-destructive dropdown item updates the quick button for that repo/branch.
- Remembered actions are isolated per branch.
- Destructive dropdown items execute but do not become the quick action.
- A remembered unavailable action falls back to edit.
- If edit is unavailable, the quick button is disabled.
- Existing dropdown grouping, disabled state, loading state, shortcut display, and destructive styling remain intact.

Useful commands:

```sh
bun run test -- src/web/components/BranchActionsMenu.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx
bun run typecheck
```

Run `bun run check:architecture` if implementation crosses current web/shared/server boundaries.

## Non-Goals

- Do not persist quick-action preferences across app restarts.
- Do not add backend APIs.
- Do not change existing branch action capability rules.
- Do not allow destructive actions to become the quick action.
- Do not refactor unrelated branch list, toolbar, or store code.
