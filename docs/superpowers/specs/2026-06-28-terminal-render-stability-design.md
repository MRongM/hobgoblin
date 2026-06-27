# Terminal Render Stability Design

## Context

Codex terminal output can be complete in the underlying session data while the visible terminal misses lines in the rendered history. The confirmed behavior is:

- During high-frequency Codex output, the terminal can naturally advance scrollback even when the user does not scroll.
- After output finishes, scrolling back through history can show missing or blank lines.
- Re-entering the session with `codex resume <uuid>` can show the complete content, so the server-side PTY data, replay, and snapshot path are not the primary suspect.

The fix should focus on the front-end xterm rendering layer. It should not change the server output protocol, restart Codex, or close the terminal session.

## Goals

- Keep terminal history readable after high-frequency output.
- Preserve the user's scroll position when they are reading history.
- Keep automatic following behavior when the user is at the bottom.
- Recover from front-end render/cache failures without killing the PTY or restarting Codex.
- Keep the change localized to the terminal view/runtime boundary.

## Non-Goals

- Do not redesign the terminal transport protocol.
- Do not add a user-facing setting for this behavior.
- Do not throttle or pause server-side Codex output.
- Do not treat this as server data loss unless sequence or snapshot evidence later proves otherwise.

## Recommended Approach

Implement front-end xterm render stabilization with a light recovery fallback.

`ManagedTerminalSession` continues to receive realtime output, merge frame-sized output batches, and route them by session. `TerminalSessionView` owns the rendering fix because it already owns xterm, resize, refresh, scroll, and terminal lifecycle behavior.

The design has four parts:

1. Capture xterm viewport and scrollback state around output writes.
2. Mark scrollback as dirty when high-frequency writes grow `baseY` or otherwise advance history.
3. After output settles, repaint without changing the user's scroll position.
4. On user scroll, refresh the visible rows in a throttled way. If this still fails, rebuild only the front-end terminal view from trusted session state.

## Rendering Flow

### Output Write

Before calling `term.write(data, callback)`, `TerminalSessionView` reads the active buffer state:

- `viewportY`
- `baseY`
- `rows`
- whether the terminal is currently at bottom

After the write callback:

- If the user was at bottom before the write, keep existing follow-output behavior.
- If the user was not at bottom, do not call `scrollToBottom()`.
- If `baseY` changed, mark the scrollback render state as dirty.
- Schedule a lightweight repaint instead of repainting every output chunk synchronously.

This keeps the data path unchanged while making the render layer aware that scrollback content may need stabilization.

### Output Settle Repaint

When output has been quiet for a short debounce window, `TerminalSessionView` performs a settle repaint:

- Capture the current `viewportY`.
- Refresh the visible terminal rows.
- Restore the captured scroll location when needed.
- Clear the dirty flag only after the repaint has run.

The repaint must not move the user to the bottom unless they were already following output.

### Scroll-Time Repaint

The xterm viewport receives a throttled scroll listener. When the user scrolls through history:

- Schedule one repaint for the next animation frame.
- Refresh the currently visible rows.
- Do not change `viewportY`.
- Do not call `scrollToBottom()`.

This handles the confirmed case where output completed earlier, but missing lines appear only after the user later scrolls into affected history.

### Front-End View Recovery

If a future implementation can reliably detect a failed repaint, use a front-end-only recovery path:

- Keep the terminal session and PTY alive.
- Destroy and recreate the xterm instance.
- Restore display from the current trusted serialized view or from the server snapshot path.
- Replay only output that is newer than the snapshot sequence.

This is a fallback, not the first response to ordinary scroll events.

## Error Handling

- Refresh failures must not close the session.
- Recovery failures must leave the existing terminal view in place when possible.
- Diagnostic logging should be limited to debug or warn level.
- Do not surface a blocking UI error for a transient repaint issue.

## User Experience

- High-frequency Codex output remains visible at the bottom when the user is following output.
- If the user scrolls up, new output continues to arrive without forcing the viewport to jump.
- After output finishes, historical lines should render completely while scrolling.
- Users should not need to switch sessions or run `codex resume <uuid>` to restore missing rendered lines.

## Test Plan

Add focused tests around the existing terminal test surface:

- High-frequency output schedules a settle repaint.
- `baseY` growth marks scrollback dirty.
- Settle repaint preserves a non-bottom `viewportY`.
- Scroll events schedule a throttled visible-row refresh.
- Scroll-time repaint does not call `scrollToBottom()`.
- Front-end recovery does not call `terminalBridge.close()` and does not close the session.

Use existing xterm mocks where possible. If the mock cannot reproduce real DOM line loss, assert the intended render-stabilization calls and state transitions instead of faking server data loss.

Verification should include:

- `bun run typecheck`
- targeted terminal tests
- `bun run test`

## Design Principles

- KISS: fix the front-end render boundary instead of changing transport or session ownership.
- YAGNI: no new settings or protocol fields until there is evidence they are needed.
- DRY: reuse existing xterm lifecycle, refresh, snapshot, and replay paths.
- SOLID: keep rendering stabilization inside `TerminalSessionView`; keep session routing in `ManagedTerminalSession`; keep authoritative data on the server.
