# Terminal File Preview Design

Status: extended on 2026-10-25 with file-area activation, same-file toggling, and external absolute paths.

## Goal and terminology

A temporary file preview is a read-only pane on the right of the active terminal.
Terminal links and file-area rows share this preview. Clicking another supported file path replaces its content in the same pane; clicking the same file again closes it, even when the two clicks use equivalent relative/absolute paths or different line references.
Closing the pane returns its space to the terminal. This is renderer-local
interaction state, with no session restoration or cross-window synchronization.

## Alternatives

1. A dedicated right-hand terminal pane (recommended). Keeps the terminal visible
   and lets users inspect output files without navigating away or changing the
   existing file-area selection.
2. A preview tab in the existing file area. Reuses that surface but its placement
   depends on the workspace layout and terminal focus presentation.
3. A separate native/browser window. Provides more space but introduces window
   lifecycle and focus management for a temporary interaction.

## Proposed interaction

- The pane starts closed and opens when a supported terminal file link or file-area row is clicked.
- One pane shows one file at a time; another file replaces it and the same file closes it.
- The header shows the file name, its worktree-relative path (or absolute path for an external file), and a close button.
- When no terminal surface is mounted, the current workspace/file area supplies a fallback preview. Compact and narrow layouts show it full-width without mounting another resizable split.
- File-area modified clicks preserve multi-selection, directory clicks preserve expansion, and double-click editor activation cancels pending preview changes.
- The terminal stays mounted and usable while the preview opens or changes.
- Keep the terminal's layout ancestry stable across preview transitions. Reuse
  the existing split's collapse support when the preview is closed so closing
  returns all available space without recreating the terminal host.
- The divider is resizable, using the existing panel primitives. The initial
  preview occupies approximately 40% of the terminal area, subject to usable
  minimum widths; the width remains local to this visit.
- Existing double-click-to-open-in-editor remains available.
- A supported single click waits 500 ms for double-click intent before changing
  the terminal layout. Double-click editor activation cancels that pending
  preview; closing, changing repository/worktree, and unmounting also cancel it.
- Unsupported links retain the existing file-tree reveal behavior where present.
- Changing repository or worktree clears the preview. Changing terminal within
  the same worktree may retain it; a new file click always replaces it.
- On compact Web layouts, the same preview becomes a dismissible full-width
  surface so it cannot squeeze the terminal into an unusable narrow column.

## File support

- Text: plain text, Markdown source, logs, JSON/JSONL, YAML, TOML, XML, CSV/TSV,
  INI/config files, shell scripts, and common source-code files. Show selectable,
  escaped plain text with line numbers and scrolling. HTML and Markdown remain
  source text in this first version.
- Images: PNG, JPEG, GIF, WebP, SVG, BMP, ICO, and AVIF, as supported by the browser.
  Fit images inside the pane while preserving aspect ratio. SVG is displayed
  through an image element rather than injected into the document.
- Text reads are bounded to 1 MiB; image reads are bounded to 20 MiB. Oversized,
  missing, unreadable, binary-text, and invalid-image files show an explicit
  localized state inside the pane.
- PDF, Office documents, archives, TIFF/HEIC conversion, editing, rendered HTML,
  Markdown rendering, and automatic filesystem watching are outside this slice.

## Architecture and data flow

Reuse terminal-path-links.ts and the shared file-path-target.ts recognition.
Introduce a preview activation callback carrying the recognized file target
without changing editor activation. Preserve available line/column information;
a text preview can reveal its referenced line.

Each preview target includes repository identity, worktree path, and file target.
Relative paths retain the existing worktree-root interpretation; this feature does
not infer a shell working directory from terminal output. Absolute paths may identify files outside the current worktree on the same host. Quoted absolute paths containing spaces and paths wrapped after directory separators are recognized; UNC paths remain unsupported.

Read contained files through the existing server-backed file-tree text and binary boundaries. External files use a separate authenticated read-only preview endpoint: the server validates and normalizes the absolute path, resolves the repository's host, selects the parent read directory, and applies fixed text/image limits. Existing file-tree containment and write contracts remain unchanged. Transport is cancellable; no Electron renderer privileges or file:// URLs are used.

Keep loading/error/content lifecycle in a focused preview component or read hook.
Cancel or disregard obsolete requests when the target changes or the pane closes.
A slower response for file A must never replace a newer selection of file B.
Release any image object URLs when their target changes or the pane unmounts.
There is no new write path, persistence layer, or realtime channel.

Integrate the reusable pane at terminal presentation boundaries covering ordinary
worktrees, detached worktrees, plain workspaces, branch-workspace root terminals,
and member terminals. Preserve terminal identity and attachment ownership during
preview transitions. The primary application under src/ is the acceptance target.

## Verification

Focused behavior tests cover supported-type dispatch, unsupported-path fallback,
double-click editor activation, rapid file changes, close during loading,
worktree-change cleanup, referenced text lines, image errors, size limits, and
terminal continuity. Exercise both ordinary and branch-workspace presentations.
Reuse existing backend tests for file-access boundaries; add tests only for newly
introduced behavior.

Run bun run typecheck, bun run test, and bun run check:architecture. Visually check
the open, replace, resize, and close flow in an available desktop or Web runtime.
