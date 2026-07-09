# Terminal Bulk Close Design

Date: 2026-07-08

## Scope

Add one bulk action to the terminal tab dropdown: close every terminal session currently listed in that dropdown.

This feature is limited to the current `TerminalTabs` instance, which represents one worktree terminal group. It does not close terminals from other repositories, other worktrees, parked terminal roots, or hidden app-level sessions outside the current tab list.

## User Behavior

When the compact terminal dropdown is open and at least one terminal exists, the menu shows a destructive action labeled `Close all terminals`.

Selecting the action opens a confirmation dialog. The action must not close anything before confirmation because terminal close ends running shell sessions.

The confirmation dialog says how many terminals will be closed. Confirming calls the existing close path for each session key in the current `sessions` list. Canceling leaves every terminal untouched.

## UI Placement

Place the action in the compact terminal dropdown near the existing `New terminal` item, separated from the session list. Keep `New terminal` available and visually neutral. The bulk close item should read as a destructive maintenance action, not a primary command.

Do not add a new visible toolbar button. The request is specifically for the dropdown menu, and adding another top-level control would increase toolbar noise.

## Component Design

Update `TerminalTabs` only:

- Add internal state for a bulk-close confirmation.
- Add a dropdown item in `renderCompactTabsBody`.
- Reuse the existing `ConfirmDialog` pattern.
- On confirm, snapshot `sessions.map((session) => session.key)` and call the existing `onClose(key)` for each key.

No new terminal registry API is needed. The current single-terminal close callback already owns cleanup and session disposal, so the bulk action should compose that behavior rather than duplicate it.

## Copy

Add i18n keys for:

- `terminal.close-all`
- `terminal.close-all-confirm-title`
- `terminal.close-all-confirm-body`
- `terminal.close-all-confirm-confirm`

The body includes `{count}` so the user can verify the blast radius before confirming.

## Error Handling

The existing close callback has no result channel and existing single-close UI does not surface close failures. The bulk action should preserve that contract. It should close the confirmation dialog before invoking the callbacks and let the underlying terminal close path handle cleanup.

If the session list changes while the confirmation dialog is open, the confirmation should use the current rendered `sessions` list at confirm time. This avoids closing stale keys after terminal state changes.

## Testing

Add focused tests in `TerminalTabs.test.tsx`:

- Compact dropdown shows the bulk close item when sessions exist.
- Clicking the item does not call `onClose` immediately.
- Confirming calls `onClose` once for each current session key.
- Canceling does not call `onClose`.

Run:

- `bun run test "src/web/components/terminal/TerminalTabs.test.tsx"`
- `bun run test "src/shared/i18n/dictionaries.test.ts"`
- `bun run typecheck`
- `bun run test`

## Non-Goals

- No `Close other terminals` action.
- No bulk close for every terminal in every repository.
- No new backend or registry batch-close API.
- No keyboard shortcut.
