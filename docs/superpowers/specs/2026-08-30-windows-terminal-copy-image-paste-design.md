# Windows Internal Terminal Copy And Image Paste Design

## Goal

Fix the primary application's Windows internal-terminal clipboard behavior while leaving macOS behavior unchanged:

1. When terminal text is selected, right-click opens a small context menu containing **Copy**.
2. Choosing **Copy** writes the selected text to the system clipboard and keeps the selection visible.
3. Pressing `Ctrl+V` with a Windows clipboard screenshot saves it as a temporary PNG and inserts the resulting shell-escaped path into the active terminal.

The Electron desktop application is the required image-paste target. Windows browser clients retain their existing best-effort DOM clipboard behavior.

## Current Behavior And Root Causes

- xterm already exposes `hasSelection()` and `getSelection()`, and Windows `Ctrl+C` is already left to the browser when a selection exists.
- The mobile terminal has a long-press Copy affordance, but the desktop terminal surface has no selection-aware context menu.
- Terminal paste already prefers `text/plain`, then handles file paths and binary `File` objects from `ClipboardEvent`.
- A Windows screenshot may be present in Electron's native clipboard without appearing in `ClipboardEvent.files` or file-kind items. The renderer therefore reaches the existing binary-paste path with no bytes to save.
- Electron main already reads native clipboard images for file-tree clipboard operations, so native clipboard ownership is established in `src/main/**`.

## Options Considered

### 1. Renderer context menu plus native image-read bridge (selected)

Keep selection interaction and paste routing in `TerminalSlot`. Add a narrow Electron bridge that reads the current clipboard image as a bounded PNG payload. The renderer feeds that payload into the existing local-save or remote-upload path.

This preserves the renderer/main boundary, supports local and remote terminals through existing flows, and avoids changing terminal transport.

### 2. Let Electron main read and save the image directly

This is smaller for local worktrees, but it cannot directly serve SSH or other remote terminals without adding a second transfer path. It also combines clipboard acquisition and destination policy in the main process. Rejected.

### 3. Depend only on DOM `ClipboardEvent` files

This requires no new IPC, but it is the behavior that fails for native Windows screenshot clipboards. Rejected.

## Architecture And Ownership

### Renderer

`src/web/components/terminal/TerminalSlot.tsx` owns:

- deciding whether a Windows desktop terminal selection context menu should open;
- copying the selection through the existing privacy-safe clipboard helper;
- text-first paste classification;
- falling back to the native clipboard image only when no text, copied file path, or DOM binary file is available;
- routing binary payloads through the existing local-save or remote-upload flow;
- inserting returned shell-escaped paths into the selected controller terminal.

The terminal session facade exposes a platform-neutral selected-text reader backed by xterm's `getSelection()`. Copy remains available for controller and read-only attachments because it is renderer-local and does not grant terminal input authority.

### Electron main and preload

A narrow native-shell capability reads the system clipboard image and returns either:

- one PNG payload;
- no image; or
- a bounded validation error.

Electron main remains the only layer importing `electron`. Preload exposes the capability through the existing trusted IPC pattern. Shared code owns the request/result type and size contract. The renderer never imports Electron.

### Server and PTY

No server, terminal session protocol, PTY worker, realtime, or persisted-state changes are required. Context-menu state is local and ephemeral.

## Copy Interaction

1. On Windows, a right-click on the desktop internal-terminal surface reads the current xterm selection.
2. With an empty selection, Hobgoblin does not open its terminal Copy menu.
3. With a non-empty selection, Hobgoblin opens a context menu at the pointer containing one **Copy** action.
4. Selecting **Copy** writes the captured text with `writeTerminalClipboardText`.
5. Success closes the menu and preserves the xterm selection.
6. Failure closes no selection state, preserves the selection, and shows the existing copy-failure toast.

Mobile long-press selection and macOS desktop behavior remain unchanged.

## Windows Paste Policy

For a controlling terminal attachment:

1. If `text/plain` has any length, leave the event to xterm. Whitespace and line breaks count as text.
2. Otherwise, resolve copied native file paths using the existing bridge.
3. Otherwise, collect non-empty DOM `File` objects from the paste event.
4. If neither source exists and the renderer is the Windows Electron desktop application, read one native clipboard image as PNG.
5. For a local terminal, save the resulting payload with the existing bounded temporary-file writer.
6. For a remote terminal, upload it through the existing repository-file transfer flow.
7. Insert returned paths into the terminal using the existing shell escaping.
8. If no usable content exists or acquisition fails, write nothing to the terminal.

The fallback is Windows-only. macOS continues to use its current DOM clipboard path and receives no native-image fallback behavior change.

## Validation And Safety

- Reuse the existing 100 MiB per-file binary clipboard limit.
- Convert the native image to PNG and reject an empty or oversized result before returning bytes to the renderer.
- Keep trusted-sender validation on the new IPC handler.
- Do not persist clipboard content or place it in logs, snapshots, examples, or error messages.
- Do not automatically execute the inserted path.
- Preserve the existing randomized, collision-safe temporary filename policy.

## Error Handling

- Copy failure uses the existing localized `terminal.selection-copy-failed` toast and keeps the selection.
- An empty clipboard or unsupported native image yields no terminal input.
- An oversized or unreadable image yields no partial file or partial terminal input.
- Existing local-save and remote-upload failures keep their current behavior; this change does not introduce a second error model.

## Testing

Automated coverage must prove:

- the Windows terminal context menu opens only for a non-empty selection;
- its Copy action writes the selected text and does not clear the selection;
- copy failure preserves the selection and reports the localized error;
- macOS does not receive the new context-menu behavior;
- a trusted Electron IPC caller can read an image as a bounded PNG payload;
- empty, oversized, and untrusted native clipboard reads are rejected safely;
- Windows image-only paste uses the native payload when DOM files are absent;
- text still wins over image content;
- an existing DOM file or copied file path prevents a redundant native-image read;
- local and remote destinations continue through their existing save/upload paths.

Required verification:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Manual Windows acceptance:

1. Select terminal output, right-click, choose Copy, and verify the clipboard text and visible selection.
2. Copy ordinary and multiline text, press `Ctrl+V`, and verify normal xterm paste.
3. Capture a screenshot, press `Ctrl+V`, and verify a generated `.png` path is inserted without executing it.
4. Repeat in a read-only terminal for Copy; no input authority should be requested.
5. Smoke-test macOS selection and paste behavior for regressions when that environment is available.

## Architecture Stress Review

The repository-declared `/grill-with-docs` skill is absent from this checkout, so this design was checked directly against `docs/arch.md`, `docs/layering.md`, `docs/renderer-model.md`, and `docs/ui-conventions.md`:

- Electron-native access stays in `src/main/**` and crosses preload through a narrow capability.
- The renderer remains a browser client and contains only interaction/paste-routing policy.
- The server-first terminal session model is unchanged because clipboard acquisition is device-local input.
- No forbidden main/web/server/shared imports are introduced.
- No runtime-coherent or restorable state is added for an ephemeral menu or clipboard read.
- The change extends the existing terminal and native-shell feature slices instead of creating a generic service.

## Out Of Scope

- Replacing the application-wide Edit menu.
- Adding Paste to the new terminal context menu.
- Changing macOS clipboard shortcuts or context menus.
- Guaranteeing native clipboard-image access in Windows browser mode.
- Image preview, format selection, automatic cleanup, or automatic command execution.
- Refactoring unrelated terminal selection, file-tree clipboard, or PTY behavior.

## Success Criteria

- Windows users can right-click a terminal selection and copy it without losing the selection.
- A Windows screenshot pasted with `Ctrl+V` becomes a temporary PNG path in the active internal terminal.
- Text paste remains text-first, read-only attachment rules remain intact, and macOS behavior is unchanged.
- Focused tests, full tests, type checking, and the architecture guard pass.
