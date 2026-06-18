# File Tree Context Menu Upload Design

## Goal

Add an `Upload file` action to the project file tree context menu.

Users can right-click the file tree, choose one or more local files through the native file picker, and upload those files into the selected local or remote worktree directory. The feature reuses the existing file transfer path so validation, size limits, automatic copy names, local writes, remote SSH writes, and repo invalidation stay centralized.

## Non-Goals

- No directory selection from the upload dialog.
- No overwrite behavior or conflict-resolution dialog.
- No custom transfer progress panel.
- No new renderer-side filesystem writes.
- No changes to the existing drag/drop or paste upload semantics.
- No broad refactor of the file tree transfer modules.

## Existing Context

`ProjectFileTree` already supports context menu actions such as copy path, download, new folder, refresh, open in editor, open in terminal, rename, and delete.

The file tree already has upload-capable transfer plumbing:

- `transferRepositoryFiles()` in `src/web/repo-client.ts` is the renderer entry point.
- `transferRepositoryFiles()` in `src/server/modules/repo-file-transfer.ts` dispatches local and remote targets.
- `copyLocalPathsToLocalTarget()` and related helpers in `src/system/file-tree/transfer.ts` handle local path sources.
- Remote targets use the existing SSH transfer helpers through `src/system/ssh/git.ts`.

The missing capability is a deliberate right-click UI entry that lets users pick local files. The native bridge currently exposes an `openDirectoryDialog`, but not a multi-file picker.

## Recommended Approach

Add a narrow native file picker bridge and reuse the existing `localPaths` transfer source.

The native side owns only file selection:

- Add an `open-file-dialog` renderer capability.
- Add a shell IPC channel for selecting files.
- Use Electron `dialog.showOpenDialog()` with `properties: ['openFile', 'multiSelections']`.
- Return selected local absolute file paths, or an empty array when the user cancels.

The web side owns only interaction orchestration:

- Add `chooseFileTreeUploadFiles()` to `src/web/app-shell-client.ts`.
- Add `Upload file` to file tree row and empty-area context menus.
- Resolve the upload target using the same file tree target rule as paste/drop.
- Call `transferRepositoryFiles()` with `source.kind === 'localPaths'`.

The server side remains the transfer authority:

- Validate the target path is inside the active worktree.
- Validate local source paths through existing local transfer inventory.
- Enforce size limits.
- Resolve destination name collisions by automatic copy names.
- Write to local or remote targets through the existing transfer modules.
- Publish repo invalidation after successful writes.

This keeps the design simple and avoids duplicating transfer behavior in the renderer.

## Interaction Semantics

The context menu action is named `Upload file` and should use a standard upload icon.

Target directory resolution:

1. Right-click a directory or symlink-to-directory: upload into that directory.
2. Right-click a file, symlink-to-file, or virtual node: upload into its parent directory.
3. Right-click the empty file tree area: upload into the active worktree root.

File picker behavior:

- The dialog supports selecting one or more files.
- The dialog does not allow selecting directories.
- Canceling the dialog produces no transfer request.
- Selected files are sent as:

```ts
{
  kind: 'localPaths',
  items: selectedPaths.map((path) => ({ path })),
}
```

Conflict behavior:

- Existing files are never overwritten.
- Destination conflicts use the existing server naming strategy:
  - `file.txt`
  - `file copy.txt`
  - `file copy 2.txt`

Remote behavior:

- Remote repositories are supported.
- The selected files are local source paths.
- The transfer target can be a remote worktree directory.
- Existing local-to-remote transfer behavior performs the upload.

## Availability

The menu action is shown only when all of these are true:

- The selected repository has an active worktree path.
- The renderer native bridge exposes `open-file-dialog`.
- The context target resolves to a valid destination directory inside the worktree.

Pure web runtimes do not expose the native file picker. In that case, the upload menu action is hidden to avoid presenting an impossible action.

## Error Handling

Keep the first version lightweight:

- User cancels the file picker: silently return.
- Native bridge is unavailable: do not show the action.
- Transfer returns `ok: false`: surface the existing transfer error message in the file tree action path.
- Partial failures keep the existing `copied`, `renamed`, and `failed` result semantics.
- Successful uploads refresh the target directory.

No new bulk result dialog is required. The existing transfer layer already reports per-entry outcomes for future UI improvements.

## Data Flow

1. User opens the context menu on a file tree row or the empty file tree area.
2. User selects `Upload file`.
3. Renderer resolves the target directory from the context target.
4. Renderer calls `chooseFileTreeUploadFiles()`.
5. Native shell bridge opens the multi-file dialog.
6. Renderer receives selected file paths.
7. Renderer calls `transferRepositoryFiles()` with a `localPaths` source.
8. Server validates source and target paths, enforces transfer limits, and copies files.
9. Server invalidates the repo snapshot after successful writes.
10. Renderer refreshes the target directory.

## Files and Boundaries

Expected implementation touch points:

- `src/shared/bootstrap.ts`
  - Add `open-file-dialog` to `RendererNativeCapability` and Electron capabilities.
- `src/shared/ipc-channels.ts`
  - Add a shell channel for file selection.
- `src/preload/preload.cjs`
  - Expose `shell.openFileDialog()`.
- `src/main/shell-bridge.ts`
  - Handle trusted file dialog IPC.
- `src/web/renderer-bridge-types.ts`
  - Add the shell method type.
- `src/web/vite-env.d.ts`
  - Add the native shell method type.
- `src/web/app-shell-client.ts`
  - Add capability helper and `chooseFileTreeUploadFiles()`.
- `src/web/components/file-tree/ProjectFileTree.tsx`
  - Add context menu item and invoke the existing transfer flow.
- `src/shared/i18n/*.ts`
  - Add upload menu labels and any small error/status text.

The design does not require changing the server transfer contract or the system transfer implementation.

## Testing

Focused tests should cover the new boundary and UI entry:

- `src/main/shell-bridge.test.ts`
  - Registers the new shell handler.
  - Rejects untrusted senders.
  - Calls `dialog.showOpenDialog()` with `openFile` and `multiSelections`.
  - Returns an empty array when canceled.
- `src/main/preload.test.ts`
  - Forwards `openFileDialog()` to the new IPC channel.
- `src/web/app-shell-client.test.ts`
  - Returns selected file paths through `chooseFileTreeUploadFiles()`.
  - Falls back to an empty array when the native bridge is unavailable.
- `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Row context menu upload targets a directory row directly.
  - Row context menu upload targets a file row's parent directory.
  - Empty-area context menu upload targets the worktree root.
  - Canceling the file picker does not call `transferRepositoryFiles()`.
  - Multiple selected files become a single `localPaths` transfer request.

Existing transfer tests continue to cover size limits, automatic copy names, containment checks, local writes, and remote writes.

## Principle Fit

- KISS: add one narrow native picker capability and reuse the existing transfer API.
- YAGNI: no directory upload, overwrite prompts, progress panel, or custom result dialog.
- DRY: keep all copy, conflict, size, and remote behavior in the existing transfer layer.
- SOLID: native selection, renderer orchestration, and server transfer responsibilities remain separate.
