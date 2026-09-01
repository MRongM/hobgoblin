# Cross-Platform Terminal Selection Copy Design

**Date:** 2026-08-30

## Goal

Make selection-aware right-click Copy available in every desktop-class Hobgoblin internal terminal: macOS, Windows, and Linux, in both Electron and ordinary desktop Web clients.

Mobile Web keeps its existing long-press selection and explicit Copy action.

This design supersedes only the platform scope of the terminal selection context menu in `2026-08-30-windows-terminal-copy-image-paste-design.md`. The Windows native clipboard-image paste design remains unchanged.

## Current Behavior

- The terminal facade exposes the current xterm selection as renderer-local text.
- `TerminalSlot` renders a Radix context menu only when `navigator.platform` identifies Windows and the renderer is not mobile.
- A non-empty selection produces one **Copy** action; an empty selection produces no Hobgoblin menu.
- Copy uses the shared terminal clipboard helper and preserves the xterm selection.
- Mobile Web already provides a separate long-press Copy affordance.
- Automated coverage explicitly asserts that macOS does not receive the desktop context menu.

## Considered Approaches

### 1. One renderer-owned context menu for every desktop-class client (selected)

Remove the Windows platform gate and keep the existing non-mobile gate. Electron and desktop Web clients then share the same Radix menu, selection reader, clipboard helper, error handling, and tests.

This is the smallest change and follows the renderer model: Electron renderers remain specialized browser clients, and native main-process behavior is unnecessary for a renderer-local interaction.

### 2. Native Electron menus plus a renderer menu for Web

Use an Electron native menu in packaged applications and retain a React menu for browsers. This offers more native presentation but duplicates behavior, error handling, and test surfaces. It also requires a native bridge for an interaction already supported in the renderer.

Rejected because the product requirement is behavioral consistency, not a platform-native menu implementation.

### 3. Browser or WebView default context menus

Allow each host environment to decide whether selected xterm text can be copied. This has the least application code but produces inconsistent menus and does not guarantee selection-aware behavior across xterm, Electron, and browsers.

Rejected because it cannot satisfy the cross-platform acceptance criteria reliably.

## Selected Design

### Ownership and state

`TerminalSlot` continues to own the menu's captured selection and open state as short-lived React state. The state is renderer-local, ephemeral, unsynchronized, and unpersisted.

The existing terminal session facade remains the narrow read boundary for current xterm selection text. No terminal protocol, server state, realtime path, persistence, Electron IPC, or main-process menu is added.

### Desktop interaction

For every non-mobile internal terminal, regardless of operating system or whether it runs in Electron or a browser:

1. Right-click asks the selected terminal session for its current selection text.
2. An empty selection does not open a Hobgoblin context menu.
3. A non-empty selection opens the existing Radix context menu at the pointer.
4. The menu contains exactly one localized **Copy** action.
5. Selecting **Copy** writes the captured selection through `writeTerminalClipboardText`.
6. A successful copy closes the menu and preserves the visible xterm selection.
7. A failed copy keeps the selection available and shows the existing localized `terminal.selection-copy-failed` toast.

The behavior applies equally to controlling, read-only, and currently unowned desktop terminal attachments because copying renderer-local selection does not require terminal input authority.

### Mobile interaction

Mobile Web retains the current long-press selection state machine and floating Copy action. The desktop context-menu wrapper remains disabled for mobile renderers, so touch gesture arbitration and native long-press suppression do not change.

### Clipboard behavior

No new clipboard API is introduced. The existing helper first attempts `navigator.clipboard.writeText` and then uses its textarea fallback. The right-click menu does not add Paste, image handling, selection clearing, or terminal input.

## Error Handling

- If the terminal key is unavailable or the selection is empty when the menu attempts to open, no custom menu is shown.
- If clipboard writing fails, show `terminal.selection-copy-failed`, leave the menu/selection recoverable under the existing controlled-menu behavior, and do not clear xterm selection.
- Platform detection is not part of this feature after the change; desktop eligibility depends only on the existing mobile classification.

## Architecture Review

- `docs/arch.md`: the interaction stays in `src/web`; no native-only main-process action is justified.
- `docs/layering.md`: short-lived menu state remains local to the terminal feature and does not need a new layer.
- `docs/state-sync.md`: captured selection and menu state are local interaction state and must not be synchronized or persisted.
- `docs/renderer-model.md`: Electron and Web share one renderer behavior instead of diverging by host.
- `docs/realtime.md`: no new invalidation, streaming, polling, or refetch path is involved.
- `docs/ui-conventions.md`: the existing shadcn/Radix menu primitive and localized sentence-case action are reused.

## Testing

Update `TerminalSlot.test.tsx` so automated coverage proves:

- a non-empty Windows desktop selection opens Copy and copies without clearing selection;
- a non-empty macOS desktop selection opens the same Copy action;
- a non-empty Linux desktop selection opens the same Copy action in Web-equivalent renderer conditions;
- an empty desktop selection opens no Hobgoblin Copy item;
- copy failure reports the localized error and preserves selection;
- a mobile renderer does not receive the desktop context-menu wrapper, preserving the existing long-press path.

Run the focused terminal component tests, then the repository-required typecheck, complete test suite, and architecture guard.

## Out of Scope

- Changing mobile long-press selection or its floating Copy action.
- Adding Paste or other commands to the terminal context menu.
- Changing keyboard shortcuts such as `Cmd+C` or `Ctrl+C`.
- Adding native Electron menus or clipboard IPC.
- Changing image paste behavior.
- Clearing xterm selection after copying.

## Success Criteria

- macOS, Windows, and Linux desktop-class internal terminals expose the same selection-aware right-click Copy action in Electron and desktop Web clients.
- Empty selection, copy failure, attachment authority, and mobile behavior retain the defined boundaries above.
- No server, native shell, terminal protocol, realtime, or persistent-state changes are introduced.
