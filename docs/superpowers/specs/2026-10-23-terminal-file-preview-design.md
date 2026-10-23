# Terminal File Preview Design

Status: proposed for user review. Implementation has not started.

## Goal and terminology

A temporary file preview is a read-only pane on the right of the active terminal.
Clicking another supported file path replaces its content in the same pane.
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

- The pane starts closed and opens when a supported terminal file link is clicked.
- One pane shows one file at a time; the next click replaces the current target.
- The header shows the file name, its worktree-relative path, and a close button.
- The terminal stays mounted and usable while the preview opens or changes.
- The divider is resizable, using the existing panel primitives. The initial
  preview occupies approximately 40% of the terminal area, subject to usable
  minimum widths; the width remains local to this visit.
- Existing double-click-to-open-in-editor remains available.
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
not infer a shell working directory from terminal output. Absolute paths are
eligible only when they resolve inside the current worktree under the existing
path-semantics rules. Existing path-recognition limitations remain explicit.

Read through the existing server-backed file-tree binary-read boundary, which
already supports local and SSH repositories. Add cancellable client transport if
needed. Keep file access and validation on the server/system side, with ordinary
authentication and root-containment checks; do not read through Electron renderer
privileges or file:// URLs.

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
