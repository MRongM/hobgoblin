# Terminal Relative Path Reveal Design

## Goal

Relative file paths printed in a terminal should be clickable. Clicking a valid path should locate the corresponding file in the repository file area.

The first version resolves relative paths against the active worktree root. This matches common tool output such as `src/app.ts`, `./src/app.ts`, and `docs/readme.md:12`, while keeping the terminal backend unchanged.

## Non-Goals

- No tracking of the shell's current working directory after `cd`.
- No support for absolute paths, URLs, remote paths, or paths outside the active worktree.
- No editor launch or file preview on click.
- No terminal server protocol changes.
- No new toast or notification surface for failed reveals.

## Existing Context

The file explorer already has a reveal path flow. `RepoExplorerPane` owns the active explorer tab and creates a `FileTreeRevealRequest` with an incrementing `id`. `ProjectFileTree` receives that request, expands parent directories, selects the target node, and scrolls it into view.

The changes panel already uses this path: changed-file rows call `onRevealPath(relativePath)`, then the explorer switches to `Files` and reveals the target.

Terminal rendering currently lives under `TerminalSlot` and `TerminalSessionView`. The terminal already uses xterm link support for external URLs, but it does not recognize repository-relative file paths or send reveal events to the explorer.

## Recommended Approach

Add a renderer-side terminal path link provider and connect it to the existing file-tree reveal flow.

`TerminalSessionView` should recognize path-like terminal text and call a new terminal handler when the user clicks a valid relative path. `TerminalSlot` should expose that handler as `onRevealPath(relativePath)`. `RepoView` should bridge the terminal event into the same reveal state currently used by `RepoExplorerPane`.

This keeps ownership narrow:

- Terminal components identify and emit candidate paths.
- Workspace components decide how a path affects the explorer UI.
- File tree components continue owning expansion, selection, and scrolling.

No PTY, server, or Git command behavior changes are required.

## Path Rules

The link provider should support these forms:

- `src/file.ts`
- `./src/file.ts`
- `docs/guide.md:12`
- `src/components/App.tsx:12:3`

Before emitting the path, normalize it by:

1. Removing surrounding punctuation that commonly appears in terminal output, such as quotes or trailing commas.
2. Removing a leading `./`.
3. Stripping a line suffix in the forms `:line` and `:line:column`.
4. Rejecting empty results.
5. Rejecting absolute paths.
6. Rejecting URLs.
7. Rejecting paths containing `..` segments.

The emitted value is always a worktree-relative path. Line and column information are intentionally ignored in this phase because the target behavior is locating the file in the file area, not opening an editor at a cursor position.

## Interaction Flow

When a user clicks a valid terminal path:

1. `TerminalSessionView` normalizes the clicked path and calls `onRevealPath(relativePath)`.
2. `TerminalSlot` forwards the relative path without storing explorer state.
3. The workspace-level owner switches the explorer to the `Files` tab.
4. `RepoExplorerPane` creates a new `FileTreeRevealRequest`.
5. `ProjectFileTree` expands parents, selects the target file, and scrolls it into view.

Repeated clicks on the same path should work because the reveal request `id` changes for each reveal.

## Failure Handling

Invalid path candidates should not become clickable links.

If a clicked path cannot be found by the file tree after parent directories are expanded, the UI should remain stable. It should not open an empty editor, create a placeholder node, or switch to an error-only state. The first version should avoid toast noise; missing-path feedback can be added later if user testing shows it is useful.

Directory loading errors should continue to use the file tree's existing inline error behavior.

## Testing

Add focused coverage for the new boundary:

- Path normalization accepts plain relative paths.
- Path normalization accepts leading `./`.
- Path normalization strips `:line` and `:line:column`.
- Path normalization rejects URLs, absolute paths, empty paths, and `..` segments.
- A terminal path click calls `onRevealPath` with the normalized relative path.
- The workspace bridge uses the existing explorer reveal flow so a terminal click switches to `Files` and reveals the file.

Existing file tree reveal tests should remain the source of truth for directory expansion, selection, and scrolling behavior.

## Verification

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## Scope Check

This is a single renderer interaction change. It reuses existing explorer state and file-tree reveal behavior, and it does not require new backend APIs or terminal session protocol changes.
