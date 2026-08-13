# Windows Terminal Text-First Paste Design

## Goal

Make `Ctrl+V` in Hobgoblin's Windows 11 internal terminal follow ordinary clipboard semantics:

1. Paste clipboard text when text is present.
2. Only attempt file or image paste when no text is present.
3. Never forward an unhandled `Ctrl+V` keypress to a terminal program such as Codex merely because the clipboard contains text.

Whitespace and line breaks count as text. If the clipboard exposes both text and binary content, text wins.

## Root Cause

Hobgoblin renders its terminal with xterm.js inside Electron. On Windows, an application-menu accelerator can convert `Ctrl+V` into the browser's standard paste operation. Without that registered accelerator, the keypress can instead reach the PTY as terminal input.

Codex TUI treats a received `Ctrl+V` key event as its clipboard-image shortcut. Its text-paste path expects a terminal paste event. Consequently, forwarding the raw keypress while the clipboard contains text makes Codex try to read an image and report that the clipboard has no image.

The fault is therefore at Hobgoblin's desktop input boundary, not in the PTY protocol or Codex process ownership.

## Options Considered

### 1. Register native edit accelerators and retain renderer content routing (selected)

Register the standard edit accelerators on Windows and Linux. The native `paste` role turns `Ctrl+V` into a paste event. The existing renderer handler then checks text before binary content.

This follows Electron's standard edit-role behavior, preserves xterm's bracketed-paste handling, and requires no clipboard IPC for text.

### 2. Capture `Ctrl+V` in the renderer and read the clipboard directly

This could prevent the key from reaching Codex, but it would duplicate browser paste behavior, require clipboard permissions or new privileged IPC, and risk bypassing xterm's bracketed-paste mode. It is rejected.

### 3. Teach Codex or every terminal program to prefer text

Hobgoblin cannot rely on child applications to compensate for a raw keypress that should have been a host-terminal paste operation. It would also leave other terminal programs exposed to the same input-boundary error. It is rejected.

## Architecture

The change stays within existing ownership boundaries:

- `src/main/menu.ts` owns native application-menu accelerators.
- `src/web/components/terminal/TerminalSlot.tsx` owns terminal paste-event classification and binary/file path insertion.
- xterm.js remains responsible for ordinary text paste and bracketed-paste encoding.
- Existing native shell bridges remain responsible only for resolving clipboard file paths and saving binary clipboard data.
- The server, PTY worker, terminal session protocol, and Codex process remain unchanged.

No new dependency, IPC channel, setting, state model, or realtime path is required.

## Paste Policy

For an interactive controller terminal:

1. Read `event.clipboardData.getData('text/plain')`.
2. If its length is greater than zero, do not call `preventDefault()` or `stopPropagation()`. Let xterm process the text paste normally.
3. Otherwise, inspect direct clipboard files and file-kind clipboard items without a Windows-specific exclusion.
4. Prevent the empty-text paste event from falling through as terminal key input.
5. Resolve native clipboard file paths first; if paths exist, copy or upload them using the existing local/remote flow.
6. If no native paths exist but binary files do, save or upload those files using the existing flow.
7. Insert the returned, shell-escaped paths into the active terminal.
8. If neither text nor usable file/image content exists, do nothing.

The same ordering applies when a clipboard exposes text alongside an image or file: text is pasted and binary handling is not invoked.

## Platform Behavior

- Windows and Linux explicitly register the standard edit accelerators, including `CmdOrCtrl+V` for the native `paste` role.
- macOS continues to use its platform-native edit-role behavior without adding duplicate explicit accelerators.
- Binary paste classification is content-based rather than disabled by platform. A real Windows clipboard image must remain eligible after the text check.
- Web mode continues to rely on the browser's own paste event and permissions; it has no Electron menu accelerator.

## Error Handling

- Text paste does not call native clipboard-image or file APIs, so a text clipboard cannot produce an image-missing error from Hobgoblin.
- Empty or unsupported clipboard content produces no terminal input and no error toast.
- Failure to resolve or save file/image content leaves the terminal unchanged and follows existing result handling.
- The fix does not reinterpret `Alt+V` or other explicit shortcuts owned by a child TUI.

## Testing

Automated regression coverage must prove:

- On non-macOS platforms, the native `paste` role registers `CmdOrCtrl+V`.
- macOS does not receive duplicate explicit edit accelerators.
- A Windows terminal paste containing text is not prevented, does not inspect image items, does not invoke binary-save/file-path handling, and remains available to xterm.
- Text containing only whitespace or line breaks still takes the text path.
- Mixed text and image content takes the text path.
- With no text, a Windows direct clipboard image takes the binary path.
- With no text, a Windows file-kind clipboard item can take the binary path.
- Empty or unusable clipboard content does not write `Ctrl+V` or any path into the PTY.

Verification commands:

```sh
bun run test src/main/menu.test.ts src/web/components/terminal/TerminalSlot.test.tsx
bun run typecheck
bun run test
bun run check:architecture
```

Manual Windows 11 acceptance:

1. Start Codex in a Hobgoblin internal terminal.
2. Copy ordinary text, press `Ctrl+V`, and verify the text appears in the Codex composer without an image error.
3. Repeat with multiline text and text containing only spaces.
4. Copy an image with no text representation, press `Ctrl+V`, and verify Hobgoblin follows its binary-paste path.
5. Copy content that exposes both text and an image, press `Ctrl+V`, and verify only the text is pasted.

## Out of Scope

- Modifying or vendoring Codex CLI.
- Adding a separate clipboard picker or paste mode.
- Changing terminal input attribution, PTY transport, tmux behavior, or remote clipboard ownership.
- Changing explicit image shortcuts implemented by a child terminal application.
- Refactoring unrelated menu, terminal, or clipboard code.

## Success Criteria

- On Windows 11, `Ctrl+V` with text reaches xterm as paste content rather than reaching Codex as a raw image-paste shortcut.
- Text is always evaluated before file/image content.
- Genuine file and image paste remains available when the clipboard has no text.
- The fix is covered by red-green regression tests and all required project checks pass.
