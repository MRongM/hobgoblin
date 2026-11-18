# Terminal File Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** completed and verified on 2026-10-23.

The 2026-10-25 [entry-points extension](2026-10-25-file-preview-entry-points.md) supersedes this initial plan's terminal-only state ownership and contained-absolute-path restriction.

**Goal:** Add a temporary, read-only terminal file preview that opens supported terminal paths in a resizable desktop side pane or a dismissible compact surface while preserving existing reveal and editor actions.

**Architecture:** Keep preview state local to `TerminalSlot`, carry recognized `FilePathTarget` values through the existing terminal link provider, and keep file reads behind the existing `/api/repo/file-tree/read-text-file` and `/api/repo/file-tree/read-binary-file` server boundaries. A focused preview component owns request cancellation, stale-result suppression, rendering, size/error states, and image data cleanup; no session or server persistence is added.

**Tech Stack:** React, TypeScript strip-only mode, `react-resizable-panels` via `SplitPane`, existing repo client/server file-tree APIs, Vitest and Testing Library, shared i18n dictionaries.

## Global Constraints

- Use explicit repo aliases with `.ts`/`.tsx` extensions and pin any new package versions exactly; this slice adds no packages.
- Keep renderer-local preview interaction state out of session restore, runtime-coherent stores, and cross-window sync.
- Preserve the existing single-click reveal fallback, double-click editor activation, terminal attachment identity, and branch-workspace terminal entry points.
- Read files through the authenticated server file-tree routes with root containment; never use renderer `fs` or `file://` URLs.
- Keep text reads at `FILE_TREE_TEXT_FILE_MAX_BYTES` (1 MiB) and image reads at a 20 MiB client limit; unsupported, missing, binary-text, oversized, and invalid-image states are explicit and localized.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

### Task 1: Carry preview activation through terminal path links

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-path-links.ts`
- Modify: `src/web/components/terminal/terminal-path-links.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

**Interfaces:**
- `TerminalSessionAttachHandlers.onOpenPathPreview?: (target: FilePathTarget) => boolean` returns `true` when the target was opened in preview and `false` when the provider must use reveal fallback.
- `registerTerminalRelativePathLinkProvider` accepts a preview-handler getter in addition to reveal and editor getters; double-click remains editor-only.
- `TerminalSessionView.setOpenPathPreviewHandler` and `ManagedTerminalSession.attach` forward and clear the handler alongside existing link handlers.

- [x] **Step 1: Add the preview callback type and failing provider tests.**

  Add the optional handler to `TerminalSessionAttachHandlers`, extend the provider signature, and add tests proving a single click calls preview first, while a `false` return calls reveal and a double click still calls the editor handler.

- [x] **Step 2: Run the focused link tests and verify the new tests fail.**

  Run `bunx vitest run src/web/components/terminal/terminal-path-links.test.ts`.
  Expected: the new preview assertions fail before implementation wiring is complete.

- [x] **Step 3: Implement the forwarding path.**

  Store the handler in `TerminalSessionView`, pass it to `registerTerminalRelativePathLinkProvider`, set it from `ManagedTerminalSession.attach`, clear it in `detach`, and pass a stable callback from `TerminalSlot` that returns whether the selected target is a supported preview type.

- [x] **Step 4: Run focused terminal tests.**

  Run `bunx vitest run src/web/components/terminal/terminal-path-links.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSlot.test.tsx`.
  Expected: PASS, including existing reveal/editor behavior.

### Task 2: Add preview target classification and read transport

**Files:**
- Create: `src/web/components/terminal/terminal-file-preview.ts`
- Create: `src/web/components/terminal/terminal-file-preview.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

**Interfaces:**
- `TerminalFilePreviewKind = 'text' | 'image'`.
- `TerminalFilePreviewTarget = { repoId: string; worktreePath: string; target: FilePathTarget; relativePath: string; kind: TerminalFilePreviewKind }`.
- `terminalFilePreviewKind(path: string): TerminalFilePreviewKind | null` recognizes the design's source/config/text extensions and image extensions, plus common extensionless source/config names.
- `readTerminalFilePreview(target, signal?)` selects the text endpoint for text targets and the binary endpoint with `20 * 1024 * 1024` for image targets.

- [x] **Step 1: Write classification and transport tests.**

  Cover supported text extensions, supported image extensions, unsupported extensions, case-insensitive matching, relative and contained absolute targets, and propagation of an `AbortSignal` through the client read call.

- [x] **Step 2: Implement classification and the missing text client function.**

  Add `readRepositoryFileTreeTextFile(repoId, worktreePath, filePath, signal?)` to `repo-client.ts`; classify only the explicit supported types and return `null` for unsupported paths. Keep the existing `FilePathTarget.line` and `.column` fields untouched.

- [x] **Step 3: Implement `readTerminalFilePreview`.**

  Resolve relative targets against `worktreePath`; accept absolute targets only when `worktreeRelativePathFromAbsolute` confirms containment. Return the existing server result shape plus the selected kind and relative path, and pass cancellation to `postServerJson`.

- [x] **Step 4: Run the focused helper and client tests.**

  Run `bunx vitest run src/web/components/terminal/terminal-file-preview.test.ts src/web/repo-client.test.ts`.
  Expected: PASS.

### Task 3: Build the read-only preview surface

**Files:**
- Create: `src/web/components/terminal/TerminalFilePreview.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Create: `src/web/components/terminal/TerminalFilePreview.test.tsx`

**Interfaces:**
- `TerminalFilePreviewProps = { target: TerminalFilePreviewTarget; onClose: () => void; compact?: boolean }`.
- The component renders a header with basename, worktree-relative path, line/column metadata, close button, loading state, localized read error, plain selectable text with line numbers, or an aspect-preserving image.

- [x] **Step 1: Write component tests for lifecycle and rendering.**

  Mock `readTerminalFilePreview` and cover loading, text content and referenced line reveal, image data URL rendering, read errors, invalid image errors, rapid target changes where the older promise cannot replace the newer result, and close/unmount cancellation.

- [x] **Step 2: Implement the component request lifecycle.**

  Create an `AbortController` per target, abort on target change/unmount, guard state updates with a request token, clear content before each request, and derive a `data:<mime>;base64,<bytes>` source for images. Use `URL.revokeObjectURL` only if an object URL is introduced; the initial implementation may keep image bytes as a data URL.

- [x] **Step 3: Implement safe text and image presentation.**

  Escape text through React rendering, show line numbers in a scrollable `pre`, use `img` with `object-fit: contain` and an `onError` localized invalid-image state, and keep HTML/Markdown as source text. Use sentence-case labels and the existing `Button` primitive.

- [x] **Step 4: Add styles and all locale keys.**

  Add focused preview classes for header, path, body, line numbers, image, states, and compact mode. Add identical key sets to all four dictionaries, including close, loading, unsupported, invalid image, and read-failure copy.

- [x] **Step 5: Run the focused component tests and dictionary checks.**

  Run `bunx vitest run src/web/components/terminal/TerminalFilePreview.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts`.
  Expected: PASS.

### Task 4: Integrate local state and desktop/compact layouts in `TerminalSlot`

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`

**Interfaces:**
- `TerminalSlot` owns `previewTarget: TerminalFilePreviewTarget | null` and a local `previewSize` percentage initialized to `40`.
- Changing `repoRoot` or `worktreePath` clears the target; selecting another file replaces it; terminal attachment and selected internal terminal remain untouched.

- [x] **Step 1: Add integration tests before layout code.**

  Cover preview opening from a supported single-click path, reveal fallback for an unsupported path, replacing the target, close, clearing on worktree change, and retaining terminal host/attachment during preview transitions. Cover both ordinary and branch-workspace panel fixtures through the existing mocked `TerminalSlot` contract.

- [x] **Step 2: Add the local target and size state.**

  Build the target only after `terminalFilePreviewKind` accepts the path and `worktreeRelativePathFromAbsolute` validates absolute paths; include `repoRoot`, `worktreePath`, target, relative path, and kind. Defer supported single-click activation briefly so a physical double-click can still reach the editor action before the layout changes; cancel pending activation on editor action, close, scope change, and unmount. Clear the selected target in an effect keyed by repository/worktree identity.

- [x] **Step 3: Add the desktop split.**

  Keep the existing terminal surface and preview in a stable `SplitPane`, using `afterSize={previewSize}`, `onAfterSizeChange={setPreviewSize}`, minimum widths that preserve a usable terminal and preview, and the preview as the trailing panel. Use the existing collapse support when closed so the terminal fills the available space without replacing its host or attachment. Keep preview interactions outside the terminal's keyboard and clipboard event boundary.

- [x] **Step 4: Add the compact surface behavior.**

  On mobile/compact layouts, keep the terminal mounted but render the preview as the visible full-width surface with an explicit close action; avoid a narrow two-column split. Ensure focus mode and bottom docks do not create a second terminal shell around the preview.

- [x] **Step 5: Run terminal and workspace integration tests.**

  Run `bunx vitest run src/web/components/terminal/TerminalSlot.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`.
  Expected: PASS, including existing terminal continuity and branch-workspace rendering.

### Task 5: Full verification and review

**Files:**
- Modify: `docs/superpowers/specs/2026-10-23-terminal-file-preview-design.md` only if implementation clarifications discovered during testing need recording.

- [x] **Step 1: Run the complete required checks.**

  Run `bun run typecheck`, `bun run test`, and `bun run check:architecture`.
  Expected: all commands exit successfully.

- [x] **Step 2: Review the final diff against the design.**

  Confirm no renderer filesystem access, no persistence or realtime changes, no editor double-click regression, no branch-workspace-only path, no unsupported file auto-preview, and no unbounded reads.

- [x] **Step 3: Perform the available visual smoke check.**

  Start the existing desktop/Web runtime if available and manually exercise open, replace, resize, close, compact dismiss, text line metadata, image failure, and terminal interaction continuity.


## Completion evidence

- `bun run typecheck`: all three projects passed.
- `bun run test`: 453 test files passed, 1 skipped; 4,936 tests passed, 17 skipped.
- `bun run check:architecture`: import boundaries passed.
- `bun run build:web`: passed.
- Final code review: approved after fixing physical double-click arbitration.
- Chromium smoke checks exercised real terminal links and server file reads: text
  with referenced lines, SVG decoding, target replacement, divider resizing,
  missing/invalid/oversized files, closing and continued terminal input, narrow
  desktop focus restoration, and mobile touch activation and dismissal.
- A physical compact double-click regression was reproduced before the fix and
  passed after the pending single-click preview was cancelled by editor activation.

The split remains mounted and uses collapse support to preserve the terminal
host. A supported single click uses a fixed 500 ms arbitration window before
opening its preview. Neither preview selection nor pane size is persisted.
