# Worktree Menu Sync Actions Design

## Goal

Expose the existing repository-scoped `New worktree` and `Sync` actions from both interaction menus of ordinary and branch workspace member worktree rows:

- The row-end More menu.
- The row right-click context menu.

## Scope

In scope:

- Add `action.create-worktree` and `action.refresh` to ordinary and branch workspace member worktree More menus.
- Add the same two actions to both worktree row representations' right-click context menus.
- Reuse the existing connected worktree dialog, branch-action write path, bootstrap preflight, repository sync pipeline, busy state, disabled state, and error reporting.
- Keep the action order `New worktree`, then `Sync`, matching the existing `mainItems` projection.
- Keep both actions available from the context menu even when inline row actions are hidden.

Out of scope:

- Branch rows without a linked worktree.
- Detached worktree rows.
- New server routes, Git commands, state, realtime paths, translations, or dialog behavior.
- Changes to the repository-level project menus or explorer toolbar, where the existing actions already remain available.

## Explored Approaches

### 1. Extend the existing worktree action projection (recommended)

Change `projectWorktreeListItemActions` so both worktree policies include the two existing main actions in the More menu and project the same actions into a focused context-menu group. `BranchRow` already wires that projection into `WorkspaceItemContextMenu`; `BranchWorkspaceMemberRow` wires the same group while preserving its member-only lifecycle exclusions.

This keeps capability, busy, label, icon, and callback behavior owned by `useBranchActionItems`, preserves one action source, and keeps member-only lifecycle restrictions directly testable.

### 2. Recreate both actions inside `BranchRow`

`BranchRow` could call repository Store mutations and open its own worktree dialog. This would duplicate action policy, pending state, error handling, and retained dialog ownership, so it is rejected under DRY and SOLID.

### 3. Render every More-menu action in the context menu

The context menu could consume every projected menu group. This would expose unrelated Git and destructive actions beyond the request and would change a deliberately smaller right-click surface, so it is rejected under YAGNI.

## Interaction Design

The ordinary and member worktree More menus retain their existing groups. Their repository-action group contains the existing actions in source order, including `New worktree` and `Sync` after pull/push. Member rows continue to omit checkout and independent removal actions.

The right-click menu keeps the existing editor and terminal group first. A new worktree-action group follows it:

1. `New worktree`
2. `Sync`

The existing close-terminal and tmux-cleanup groups remain after a separator. Selecting `New worktree` opens the existing connected dialog. Selecting `Sync` runs the existing repository-wide `syncAndRefresh(repo.id, { token })` path. Menu selection does not select or navigate the row.

Both entries use their existing disabled and busy states. The context menu disables a busy action in the same way as the More menu.

## Architecture and Data Flow

`useBranchActionItems` remains the single owner of the two actions:

- `createWorktree.item` owns label, icon, retained dialog, branch-action availability, and submission.
- `sync` owns label, icon, repository operation availability, and `syncAndRefresh` dispatch.

`projectWorktreeListItemActions` performs presentation policy only:

- Ordinary worktree: include `createWorktree` and `sync` in both requested menu surfaces.
- Branch workspace member: include the same two repository-scoped actions while continuing to exclude checkout, checkout-to, individual worktree cleanup/removal, and branch deletion.
- Non-worktree branch: preserve its existing projection.

`BranchRow` selects the member policy when its existing `branchWorkspaceMember` marker is true, so repository-list representations of a member worktree expose the new entries without losing member lifecycle restrictions.

`BranchWorkspaceMemberRow` passes the projected context actions to `WorkspaceItemContextMenu` and retains the existing branch-action dialog host. When a member target cannot be resolved, its placeholder action groups expose both entries disabled rather than creating a second callback or mutation path.

`WorkspaceItemContextMenu` gains a small optional list of already-localized context actions. It only renders that group; it does not own repository logic or translate action semantics.

Because the right-click menu remains available when inline actions are hidden, a worktree row keeps the existing branch-action dialog host mounted in that state. Inline panels remain hidden; only the retained dialogs needed by context actions stay mounted.

No new state is introduced. Repository data remains runtime-coherent and server-owned through the existing refresh/write paths; menu open state and the retained dialog remain renderer-local.

## Error Handling

- A concurrent branch action keeps `New worktree` disabled or busy through the existing hook state.
- A concurrent manual refresh or fetch keeps `Sync` disabled and busy.
- Stale repository tokens, Git/SSH failures, bootstrap failures, and refresh failures retain their current reporting paths.
- The context menu does not add error interception or a second mutation lane.

## Testing

Use TDD at the renderer projection and component boundaries:

- First change the projection test so both ordinary and member worktree More menus and context groups require both actions while member lifecycle exclusions remain unchanged.
- Run that focused test and observe the expected failure caused by the current exclusions.
- Implement the minimal projection change and make the test pass.
- Add failing context-menu, `BranchRow`, and `BranchWorkspaceMemberRow` tests for order, unavailable state, and callback dispatch.
- Wire the context action group and make the focused component tests pass.
- Run `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Domain Model and Decisions

The feature uses existing terms and does not alter the domain model:

- A `Repository` remains the single Git operation boundary.
- An ordinary worktree action may dispatch a repository-wide synchronization.
- A branch workspace member worktree remains governed by its parent lifecycle while exposing repository-scoped worktree creation and refresh actions that do not change branch workspace membership.

The `Branch workspace member summary` glossary entry is updated inline to distinguish these repository-scoped actions from prohibited member lifecycle actions. No ADR is justified because this is a reversible UI entry-point change with no new architectural boundary.

## Engineering Principles

- KISS: change one projection and one generic context action group.
- YAGNI: expose only the requested actions and preserve all other menu scope.
- DRY: reuse existing action objects, dialog, callbacks, and mutation paths.
- SOLID: keep action behavior in hooks, presentation policy in the projection, and rendering in the context-menu component.
