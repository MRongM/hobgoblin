# Terminal Context Menu Paste Design

**Date:** 2026-08-30

## Goal

Add a localized **Paste** action to the desktop internal-terminal context menu on macOS, Windows, and Linux, in Electron and desktop Web clients.

The action pastes clipboard text into a controlling terminal with the same xterm paste semantics used by keyboard paste. Mobile Web keeps its existing long-press selection and Copy interaction.

## Current Behavior

- A desktop right-click opens Hobgoblin's terminal context menu only when xterm has a non-empty selection.
- The menu contains one **Copy** action and is available to controlling, viewer, and unowned attachments.
- Text from an ordinary `Ctrl/Cmd+V` event is left to xterm.
- `TerminalSlot` separately handles file and image paste events and inserts generated paths.
- Viewer and unowned attachments cannot send terminal input.

## Confirmed Scope

- The new context-menu action supports clipboard text only.
- It is available only when the selected desktop attachment is the controller.
- It does not add context-menu file or image paste.
- Keyboard paste and the existing binary/file paste pipeline remain unchanged.
- Mobile Web receives no new context-menu behavior.

## Considered Approaches

### 1. Renderer clipboard read plus xterm paste facade (selected)

Read text with the browser Clipboard API from the menu's user gesture, then call a narrow terminal-session paste facade that delegates to xterm's public `Terminal.paste(text)` API.

This keeps Electron and Web on one renderer path and preserves xterm behavior such as bracketed paste mode.

### 2. Electron native clipboard bridge plus Web Clipboard API

Read through Electron's `clipboard.readText()` in packaged clients and through `navigator.clipboard.readText()` in browsers.

This could bypass some Electron permission failures, but it introduces IPC and separate platform behavior before evidence shows the shared path is insufficient. Rejected for the first implementation.

### 3. Synthetic DOM paste event

Focus xterm and dispatch a programmatic `paste` event.

Browsers do not grant synthetic events trusted clipboard access, so this cannot reliably implement the action. Rejected.

## Selected Design

### Context-menu state

Replace the current nullable selected-text state with one nullable desktop context-menu record containing:

- the terminal key captured when the menu opens;
- the selected text captured at that moment, including an empty string.

`null` means the menu is closed. An empty `selectionText` can still represent an open controller menu whose only action is **Paste**.

This state remains component-local, ephemeral, unsynchronized, and unpersisted.

### Menu visibility matrix

| Desktop attachment | Selection | Menu contents |
| --- | --- | --- |
| Controller | Non-empty | **Copy**, **Paste** |
| Controller | Empty | **Paste** |
| Viewer or unowned | Non-empty | **Copy** |
| Viewer or unowned | Empty | No Hobgoblin menu |

The menu remains disabled entirely for Mobile Web.

### Paste flow

1. The user right-clicks a controlling desktop terminal.
2. `TerminalSlot` opens the menu even when xterm has no selection.
3. Selecting **Paste** reads the current clipboard text through a focused terminal clipboard helper.
4. A successful non-empty read calls `pasteText(terminalKey, text)` on the terminal facade.
5. The facade delegates registry to managed session to terminal view, where xterm's `Terminal.paste(text)` applies terminal-native paste semantics.
6. The terminal regains focus after a successful paste.
7. Empty clipboard text closes the menu without sending input or showing an error.

Paste is never exposed to viewer or unowned attachments. A missing session at execution time is a no-op at the registry boundary, matching existing terminal facade behavior.

### Copy flow

The existing Copy behavior remains unchanged:

- it appears only for a non-empty captured selection;
- it copies the captured text through `writeTerminalClipboardText`;
- it never clears the xterm selection;
- a failure retains the selection and shows the existing localized error.

## Clipboard Failure Handling

Add `readTerminalClipboardText(): Promise<string | null>` next to the existing terminal clipboard writer.

- Return clipboard text, including `''`, after a successful read.
- Return `null` when `navigator.clipboard.readText` is unavailable or rejects.
- Do not use a hidden textarea or synthetic paste fallback because browsers do not allow those paths to read arbitrary clipboard contents reliably.

On `null`, show a new localized terminal paste-failure toast that directs the user to the keyboard paste shortcut. No terminal input is sent.

## Architecture Boundaries

- The feature remains in `src/web/components/terminal`; no server or Electron-main state is introduced.
- Clipboard and context-menu state are local renderer interaction state.
- The terminal paste facade is a narrow renderer-side command that preserves the existing session/view ownership chain.
- No HTTP, WebSocket, realtime invalidation, persistence, terminal protocol, or PTY contract changes.
- Existing file/image paste remains independent and unchanged.

## Testing

Automated coverage will prove:

- the clipboard helper returns text and reports unavailable/rejected reads as `null`;
- terminal view paste calls xterm `paste` and no-ops without an xterm instance;
- managed session, registry, provider, and typed context expose the paste command consistently;
- controller menus show Paste with and without a selection;
- a selected controller sees Copy before Paste;
- viewer and unowned menus never expose Paste;
- viewer or unowned attachments without a selection still open no custom menu;
- successful text paste targets the captured terminal, uses the paste facade, and refocuses it;
- empty text sends no input;
- clipboard read failure shows the localized error and sends no input;
- Mobile Web retains its existing selection and Copy behavior;
- the complete terminal suite, typecheck, test suite, and architecture guard are executed.

## Out of Scope

- Context-menu file or image paste.
- Native Electron clipboard IPC.
- Changing `Ctrl/Cmd+V` behavior.
- Changing binary paste precedence or temporary-file handling.
- Adding Paste to Mobile Web.
- Taking terminal ownership automatically.
- Persisting clipboard or context-menu state.

## Success Criteria

- Every controlling desktop internal terminal exposes **Paste** on right-click, whether or not text is selected.
- Copy remains available only for non-empty selections and preserves the selection.
- Paste uses xterm's terminal-aware paste semantics and never bypasses attachment authority in the UI.
- Read failures are localized, actionable, and do not send partial input.
- Existing keyboard, binary/file, read-only, and mobile terminal behavior remains intact.
