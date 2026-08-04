# Mobile Web Terminal Selection Copy and Canonical Viewer Design

## Background

Mobile Web terminal touches currently arbitrate between controller focus, terminal-only vertical scrolling, inertial scrolling, horizontal width panning, and the right-edge history scrubber. They do not expose a deliberate text-selection gesture. xterm's normal selection path is mouse-oriented, so Mobile Web users cannot reliably select terminal text and copy it without interfering with terminal scrolling or input.

Read-only terminal attachments have a separate correctness defect. A viewer locally fits xterm to the phone viewport while the PTY and foreground application continue emitting VT control sequences for the controller's canonical geometry. A tmux status-line redraw aimed at the canonical final row is clamped to the viewer's smaller final row. When the canonical-width status text wraps in that smaller xterm, every redraw advances scrollback and repeats the status fragments across the screen.

A minimal headless-xterm reproduction confirms the geometry mismatch: eight redraws of canonical row 40 keep `baseY` at `0` in a `120x40` terminal, but advance `baseY` to `16` when parsed by a `40x20` terminal. Filtering the tmux status row or periodically clearing the screen would hide the symptom while leaving all cursor-addressed terminal applications incorrect.

## Goals

- Let Mobile Web controller, viewer, and unowned attachments long-press a terminal word, drag to extend the selection, and explicitly copy the selected text.
- Preserve the existing tap, vertical terminal-scroll, inertia, horizontal-pan, edge-scrubber, focus, input-authority, and TUI mouse semantics outside an explicit long press.
- Parse viewer and unowned terminal output at the server's canonical columns and rows.
- Keep read-only Mobile Web terminal text at its configured size and expose canonical width through local horizontal panning.
- Reuse xterm's word, wrapped-line, wide-character, emoji, reverse-drag, and selection-rendering behavior.
- Reuse one clipboard writer with a secure-context API path and an insecure-context textarea fallback.
- Keep all selection text and interaction state renderer-local and ephemeral.

## Non-Goals

- Do not change PTY, WebSocket, realtime, terminal ownership, takeover, or resize protocols.
- Do not add native DOM terminal selection, a second terminal renderer, or a static text mirror.
- Do not filter tmux output, disable the tmux status line, or alter a shared tmux session.
- Do not add automatic copy, selection handles, persisted selection state, synchronized selection, or a user setting.
- Do not change Desktop terminal selection behavior or Android native terminal behavior.
- Do not add a dependency.

## Domain Model

### Mobile Web terminal text selection

A renderer-local selection initiated when a primary touch stays within the existing 8-pixel terminal touch slop for 500 milliseconds. The long press selects the xterm word under the touch. Continued movement extends xterm's selection, release exposes one local Copy action, and successful copy clears the selection.

The interaction is independent of terminal authority. A viewer may select and copy without writing, resizing, or taking over. A controller's explicit long press forces local selection even when the foreground application has enabled terminal mouse reporting; ordinary non-long-press vertical drags continue to preserve the existing TUI wheel path.

### Read-only canonical terminal surface

A viewer or unowned xterm parses the shared VT stream at the server's canonical columns and rows. The phone viewport is only a local presentation window over that canonical surface. It may pan horizontally at the configured font size, but viewport layout, font loading, ResizeObserver callbacks, and browser resize events never replace the emulator geometry or publish a PTY resize.

## Architecture

The change remains inside the existing terminal feature slice.

### `TerminalSessionView`

`TerminalSessionView` owns xterm geometry, selection, and clipboard-independent terminal operations:

- Track whether automatic local fitting is enabled.
- Open a known read-only attachment at canonical geometry before applying its hydrated snapshot.
- Resize a viewer or unowned xterm to updated canonical geometry before later output is parsed.
- Suppress local `FitAddon` changes while read-only without suppressing controller fitting.
- Adapt a Mobile Web long press into xterm's established mouse selection engine: word selection on start, selection extension on move, and selection completion on release.
- Expose only narrow methods to read and clear xterm selection.

The selection adapter uses xterm's DOM event boundary instead of duplicating terminal-buffer word parsing. When terminal mouse reporting disables ordinary selection, the adapter supplies the platform-appropriate force-selection modifier only for the explicit long-press gesture.

### `ManagedTerminalSession`

`ManagedTerminalSession` owns authority-aware view mode and routes narrow selection operations:

- Controller attachments enable local fit and retain the existing debounced server resize path.
- Viewer and unowned attachments disable local fit, apply canonical geometry, and never publish resize.
- Initial hydrated read-only sessions choose canonical geometry before replay.
- Controller-to-viewer transitions keep the xterm instance, discard pending input/resize work, and realign it to canonical geometry.
- Viewer-to-controller takeover keeps the xterm instance, enables local fit, and resumes the existing resize path.
- Selection operations never enter `writeInput()`, `writeWithTerminalAuthority()`, or `takeover()`.

### Registry and context

The existing registry/context route exposes focused operations for the selected session:

- begin a Mobile Web word selection at client coordinates;
- extend it at client coordinates;
- finish or cancel it;
- read and clear selected text.

These operations are synchronous renderer actions. They do not create protocol messages or shared state.

### `TerminalSlot`

`TerminalSlot` keeps browser gesture arbitration and ephemeral UI state:

- Start a 500-millisecond long-press timer for a primary touch.
- Reuse the existing 8-pixel slop before committing to selection, vertical scrolling, or horizontal panning.
- Cancel the timer and enter existing terminal scrolling when vertical movement dominates.
- Cancel the timer and leave horizontal movement to the canonical-width scroll container when horizontal movement dominates.
- On timeout, cancel inertia, capture the pointer, begin xterm word selection, and route later movement to selection extension.
- On release, finish selection and show a theme-token Copy button near the release point only when selected text remains non-empty.
- Clear the interaction on pointer cancellation, terminal/session/role/phase changes, an outside terminal tap, or unmount.

The copy button uses the existing Button primitive, a minimum 44-pixel touch target, and a viewport-clamped position that avoids the read-only status surface, command dock, and edge scrubber.

### Clipboard writer

A focused terminal clipboard helper owns text writes for both OSC 52 and the new selection action:

1. Prefer `navigator.clipboard.writeText()` when available.
2. If it rejects or is unavailable, create a hidden read-only textarea, select its contents, call `document.execCommand('copy')`, remove it, and restore the previously focused element without scrolling.
3. Report a boolean result to explicit UI callers.
4. Preserve OSC 52's best-effort, non-blocking behavior and its rule that clipboard read-back queries are never answered.

Successful selection copy clears xterm selection and dismisses the action. Total failure retains both, emits a localized error toast, and permits retry.

## Gesture Contract

One primary touch begins undecided.

- Movement within 8 pixels keeps the 500-millisecond long-press candidate alive.
- Vertical movement beyond 8 pixels before the timeout commits to the existing direct terminal scroll and inertia path.
- Horizontal movement beyond 8 pixels before the timeout abandons custom handling so native horizontal panning remains available.
- Reaching 500 milliseconds without leaving slop commits to local selection.
- Movement after selection begins extends the selection and suppresses page scroll, terminal scrolling, and terminal mouse input.
- Pointer release completes selection and may expose Copy.
- Pointer cancellation clears the in-progress selection and never exposes Copy.

An ordinary controller tap retains xterm focus and keyboard behavior. An ordinary viewer or unowned tap retains `inputmode=none` behavior. A new primary touch cancels active inertia before arbitration, as it does today.

## Canonical Geometry Contract

- An already-known viewer or unowned session opens xterm with valid canonical geometry rather than measured local geometry.
- If attach changes an assumed controller into a viewer, canonical geometry is applied before the authoritative replay.
- Every ownership event carrying changed canonical columns or rows updates a read-only xterm.
- Local container and font events may repaint a read-only xterm but never alter its columns or rows.
- A read-only host exposes horizontal overflow and keeps normal configured font size; it does not CSS-scale text to fit.
- A successful takeover immediately returns the current xterm to measured local fit and lets the controller publish the resulting canonical resize.
- If canonical geometry is temporarily invalid, the current geometry is retained until a valid authoritative size arrives.

## Error and Lifecycle Handling

- A long press outside the xterm screen, on the edge scrubber, on the read-only status surface, or on the command dock does not begin selection.
- An empty xterm selection never shows Copy.
- Before copying, read the current xterm selection again; if output trimming or a buffer switch cleared it, dismiss the action without writing the clipboard.
- Selection copy failure does not write terminal input, request takeover, or clear the selection.
- Session replacement, restart, exit, role change, responsive-mode exit, and component disposal cancel timers, release pointer capture when held, dismiss Copy, and clear xterm selection.
- Search, links, terminal output, buffer changes, and scrollback trimming continue through xterm's existing behavior.

## Testing

### Gesture and UI tests

- A sub-500-millisecond tap, movement within slop, a vertical drag, and a horizontal drag do not begin selection.
- A 500-millisecond hold begins word selection; later movement extends it; release shows Copy only for non-empty text.
- Pointer cancellation and lifecycle changes clean up timers, capture, selection, and action state.
- Controller, viewer, and unowned roles expose selection without calling write, resize, or takeover.
- Existing vertical scrolling, inertia, horizontal panning, edge scrubbing, controller focus, and read-only keyboard suppression remain intact.
- The copy action has a 44-pixel target, uses localized text, and is placed outside the bottom overlays.

### Managed-session and geometry tests

- An initially hydrated viewer opens at canonical geometry before replay.
- An attach result that changes the local attachment to viewer applies canonical geometry before replay.
- Controller-to-viewer and canonical resize events realign the existing xterm without bridge resize.
- Local ResizeObserver, buffer, and font events do not fit a read-only xterm.
- Viewer-to-controller takeover restores local fit and controller resize authority.
- A headless-xterm final-row redraw regression proves canonical parsing keeps `baseY` stable and avoids repeated status lines.

### Selection and clipboard tests

- The selection adapter delegates word and drag selection to xterm for ordinary text, CJK, wide cells, emoji, wrapped lines, and reverse drags.
- Explicit selection forces local selection under terminal mouse reporting without changing ordinary mouse behavior.
- Clipboard API success, API rejection with textarea fallback success, and total failure return correct results and restore focus.
- OSC 52 continues to write best-effort and never answers read-back queries.

### Verification

Run focused terminal tests during each red-green cycle, followed by:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## Real-Device Acceptance

1. On current iOS Safari and Android Chrome, long-press ordinary shell text as controller, viewer, and unowned; drag in both directions and copy the exact selected text.
2. Verify normal taps, vertical scroll/inertia, horizontal canonical-width panning, and the edge scrubber retain their existing behavior.
3. Verify long press locally selects in tmux, `vim`, and `less`, while ordinary vertical drags retain their existing TUI wheel semantics.
4. Control a wide tmux session from Desktop and observe it read-only from Mobile Web. Let the tmux status line refresh repeatedly; the mobile screen must not accumulate repeated status rows or advance scrollback from status redraw alone.
5. Pan horizontally at normal font size and confirm the canonical terminal remains readable.
6. Take over from Mobile Web and confirm xterm fits the mobile viewport, publishes the new controller geometry, and restores input and keyboard behavior.
7. Verify selection copy through HTTPS Clipboard API and a LAN HTTP session using the textarea fallback.

## Design Principles

- **KISS:** correct the emulator geometry at the renderer boundary and reuse xterm selection behavior.
- **YAGNI:** no settings, protocol fields, native handles, mirrored renderer, or automatic copy.
- **DRY:** one clipboard writer serves OSC 52 and explicit selection copy.
- **SOLID:** browser gesture state stays in `TerminalSlot`, authority and lifecycle stay in `ManagedTerminalSession`, and xterm mechanics stay in `TerminalSessionView`.

No ADR is required because the change restores an existing renderer contract, stays local to the terminal feature, and remains reversible.
