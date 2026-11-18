# File preview entry points implementation plan

**Goal:** Single-click supported documents in the terminal or file area to toggle one read-only preview, including absolute paths outside the project on the same host.

**Architecture:** Keep preview selection and pending click timers in a renderer-local React context shared by the current workspace. The existing terminal pane presents it when mounted; the workspace presents a fallback pane when browsing files without a terminal surface. An independent authenticated read endpoint handles absolute files without changing file-tree write or containment contracts.

**Constraints:** Preserve existing uncommitted work, terminal identity, double-click editor activation, directory expansion and modified-click selection. No persistence, realtime channel, dependencies, Git writes or branch operations.

- [x] Add behavioral regressions for same-file toggle, equivalent relative/absolute targets, file-area activation, modified clicks, and external absolute links.
- [x] Share the local preview controller between file tree and terminal; cancel pending actions on double click, close, source unmount and scope change. Keep preview usable without an active terminal and in compact layouts.
- [x] Add a server-owned absolute-file read boundary with fixed text/image limits and local/SSH host routing; cover validation, missing files, directories and oversized files.
- [x] Extend link recognition for external absolute paths, quoted paths containing spaces, and known extensionless/dotfile names; keep unsupported-file reveal and double-click editor behavior.
- [x] Update preview terminology/design and run focused tests, `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

File identity uses the normalized absolute path plus repository/host identity, ignoring line/column references. A new document replaces the existing target; activating the same document closes it. Supported types stay aligned with the existing text/source and browser-image preview implementation.

## Verification

- `bun run test`: 454 test files passed, 4,999 tests passed, 17 skipped.
- `bun run typecheck`, `bun run check:architecture`, `bun run build:web`, and `git diff --check`: passed.
- Browser verification with an isolated local server and generic temporary fixtures: file-area open/close without a terminal, external absolute terminal-path preview, and repeated terminal-path activation closing the pane while retaining the session.
- Review findings resolved with regressions: compact fallback positioning/focus, pending source-unmount cancellation, server-side Windows UNC rejection, and known extensionless terminal filename recognition.
