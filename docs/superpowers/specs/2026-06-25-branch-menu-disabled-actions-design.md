# Branch Menu Disabled Actions Design

**Date:** 2026-06-25
**Status:** Approved design; implementation not started

## Overview

Branch action menus should show the full branch action surface consistently across every UI entry point that reuses branch actions. Actions that are not currently available should remain visible but disabled, using the existing menu disabled styling and click guards.

This applies to the branch row `...` menu and other shared branch action menu surfaces, including toolbar/detail menu entry points that consume `useBranchActionItems`.

## Goals

- Show all branch action menu items consistently across shared branch action menus.
- Gray out unavailable actions instead of hiding them.
- Keep unavailable actions non-clickable and non-triggerable by keyboard shortcuts.
- Preserve existing loading behavior for running or queued branch operations.
- Keep the change centralized in action item generation rather than duplicating menu-specific rendering logic.

## Non-Goals

- Do not add new branch actions.
- Do not add new dialogs or backend routes.
- Do not change the plain non-Git workspace layout or mount branch actions where branch actions are not currently mounted.
- Do not change command behavior for enabled actions.
- Do not redesign the branch row, toolbar, or dropdown primitives.

## Current Context

`useBranchActionItems` composes branch action groups for the shared branch action UI. `useBranchWriteActions` contributes write actions such as create branch, checkout to, merge, commit, and reset. `BranchActionsDropdown` renders visible items and already uses `DropdownMenuItem disabled`, which grays items out and blocks pointer interaction. `useBranchActionShortcutRegistry` already ignores disabled actions.

The current implementation mixes visibility and capability:

- Some unavailable actions are omitted from arrays entirely.
- Some actions exist but set `visible: false`.
- Some actions exist and set `disabled: true`.

That creates menus whose shape changes by branch, worktree, remote state, and local app availability.

## Design

Use a stable branch action model:

- Branch action items that belong to the shared branch menu are always returned with `visible: true`.
- Availability is represented with `disabled: true`.
- Busy state continues to use `busy: true` and existing loading labels/icons.
- `BranchActionsDropdown` keeps filtering by `visible`, but fewer shared branch actions will be hidden.
- Shortcut registration continues to use `visibleBranchActionItems`, and disabled items remain protected by the existing `if (!item || item.disabled) return` guard.

The rendering layer remains simple. It should not invent fallback items or menu-only state. The action generation hooks own the business rules; the dropdown only displays what it receives.

## Disabled Conditions

The implementation should preserve the existing safety rules and map unavailable capability to disabled items:

| Action | Disabled when |
|---|---|
| Copy patch | Branch has no worktree or worktree has no dirty patch, or a branch action is blocked |
| Checkout | Branch is current, checked out in another worktree, or a branch action is blocked |
| Pull | Branch has no upstream/tracking branch, or a branch action is blocked |
| Push | Repository has no remotes, or a branch action is blocked |
| Create worktree | A branch action is blocked |
| Refresh | Manual refresh/fetch is already busy or a branch action blocks interaction |
| Open in terminal | Branch has no worktree, no supported terminal target is available, or a branch action is blocked |
| Open in editor | Branch has no worktree, no supported editor target is available, or a branch action is blocked |
| Open remote / PR | Repository has no browser/GitHub remote target, or a branch action is blocked |
| Create branch | A branch action is blocked |
| Pull remote branch | Repository has no remotes, or a branch action is blocked |
| Checkout to... | Branch has no worktree, or a branch action is blocked |
| Merge branch... | Branch has no worktree, or a branch action is blocked |
| Commit all changes | Branch has no worktree, or a branch action is blocked |
| Delete branch | Branch is current, has a worktree, is protected, or a branch action is blocked |
| Remove worktree | Branch has no removable non-main worktree, or a branch action is blocked |
| Reset to previous commit | Branch has no worktree, or a branch action is blocked |

Running operations keep the existing target-specific behavior:

- The target action can show its loading label/icon.
- Other actions are disabled without showing incorrect loading state.
- Non-target branches do not display another branch's busy label.

## Component Boundaries

### `useBranchActionItems`

Return the complete shared action groups. Replace capability-based omission with disabled flags for base actions, external actions, and destructive actions.

### `useBranchWriteActions`

Return write actions with stable visibility. Use `disabled` for no-remotes and no-worktree conditions instead of hiding those items.

### `BranchActionsDropdown`

Keep the existing presentation and disabled behavior. No menu-specific action synthesis should be added.

### `BranchActionControls`

No special behavior is needed. It consumes the same item model. If the full set overflows, the existing auto-collapse logic can continue to collapse into the dropdown menu.

### `useBranchActionShortcutRegistry`

Keep the existing disabled guard. Add or adjust tests if expanded visibility changes shortcut coverage.

## Testing

Focused tests should cover:

- A branch without a worktree still shows worktree-dependent actions as disabled.
- A repository without remotes still shows pull, push, pull-remote-branch, and remote actions as disabled.
- Local unavailable terminal/editor apps still produce disabled external actions.
- Current/protected/worktree branches show delete/remove actions disabled instead of hidden.
- Disabled visible actions are not invoked through keyboard shortcuts.
- Existing busy-state tests still pass: non-target branches are disabled without incorrect loading labels.

## Engineering Principles

- **KISS:** Keep rendering dumb; action hooks decide availability.
- **YAGNI:** Do not add explanation tooltips, new disabled reasons, or new action metadata unless a test requires it.
- **DRY:** Use the existing shared action item model for every menu surface.
- **SOLID:** Keep capability policy in action construction, presentation in dropdown/buttons, and invocation safety in existing action guards.
