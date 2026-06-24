# Terminal Stability Port Design

## Background

Hobgoblin already has several terminal improvements that must be preserved:

- external terminal input box and custom command buttons
- repository-relative path links in terminal output
- large shared terminal scrollback
- viewer output summaries
- configurable terminal font size

The reference project at `/Users/longjiang/Desktop/src/tries/2026-05-25-goblin/goblin` contains deeper terminal stability work. Its useful parts are not a single UI component; they are a set of protocol, server lifecycle, renderer projection, authority, geometry, and replay-safety changes.

This design ports the high-value stability pieces without replacing current Hobgoblin terminal features or restructuring unrelated workspace-pane code.

## Goals

- Prevent blank first paint after terminal creation.
- Create and attach terminals with measured geometry instead of defaulting to `80x24` and resizing later.
- Make server ownership the source of truth for write, resize, restart, and takeover.
- Route all renderer terminal writes through one authority gate.
- Prevent replay or snapshot hydration side effects from writing hidden protocol replies back to the PTY.
- Keep existing terminal UX features intact.
- Keep changes scoped to terminal shared types, terminal server runtime, terminal renderer projection, and terminal tests.

## Non-Goals

- Do not replace the current terminal files wholesale with reference-project files.
- Do not migrate the reference workspace-pane terminal tab model.
- Do not remove external input, custom buttons, path links, scrollback retention, or viewer output summaries.
- Do not add persistent terminal logs, infinite scrollback, or disk-backed output history.
- Do not modify port-forwarding files or unrelated dirty worktree changes.
- Do not move terminal protocol types into new shared files unless implementation pressure proves the current single-file boundary unworkable.

## Approach

Use a stability-first phased port.

The implementation should copy behavior, not file structure. Reference code can guide the patch, but Hobgoblin's current module boundaries remain canonical:

- `src/shared/terminal.ts` remains the shared protocol and validation boundary.
- `src/server/terminal/**` remains the server runtime and PTY boundary.
- `src/web/components/terminal/**` remains the renderer projection and xterm view boundary.
- `src/web/renderer-terminal-bridge.ts` remains the terminal transport bridge.

This avoids a broad rewrite while still addressing the root causes behind first-frame races, incorrect initial geometry, ownership drift, and replay input leaks.

## Shared Protocol

Extend the existing `src/shared/terminal.ts` protocol in place.

Add terminal lifecycle phases:

```ts
type TerminalSessionPhase = 'opening' | 'restarting' | 'open' | 'error' | 'closed'
```

Update successful `TerminalAttachResult` to require:

- `sessionId`
- `processName`
- `canonicalTitle`
- `phase`
- `message`
- `snapshot`
- `snapshotSeq`
- `controller`
- `canonicalCols`
- `canonicalRows`

Update successful `TerminalCatalogMutationResult` so `create` carries the same first-frame fields plus:

- `action`
- `key`
- `sessions`

Update successful `TerminalTakeoverResult` to carry:

- `sessionId`
- `role`
- `controllerStatus`
- `controller`
- `canonicalCols`
- `canonicalRows`
- `phase`

Update `TerminalOwnershipEvent` to include `phase`, so realtime ownership events and takeover responses have a shape the renderer can apply through the same projection path.

Remove the active `grace` ownership semantics. The server should clear the controller slot on disconnect; reconnection and user intent are handled by owner-scoped auto-claim and explicit takeover.

## Server Runtime

Keep the current worker-backed terminal runtime naming and boundaries. Do not migrate reference-project `pty-supervisor` naming unless required by local code.

### Ownership Model

Change `terminal-ownership.ts` from a single attachment model to a multi-attachment model:

```ts
interface TerminalOwnershipState {
  attachments: Map<string, TerminalAttachmentState>
  controller: TerminalController | null
  claimedByOwner: boolean
  cols: number
  rows: number
}
```

Rules:

- `write`, `resize`, and `restart` require the caller's attachment to be the current controller.
- `takeover` is the only action that may preempt an existing controller.
- Disconnecting the controller attachment clears `controller` immediately.
- Once the owner has claimed a session, `claimedByOwner` stays true for that session lifetime.
- When no controller is present, a connected attachment from the same owner can auto-claim.

Add a small authority helper in `terminal-ownership.ts`:

```ts
type TerminalAuthorityAction = 'write' | 'resize' | 'restart' | 'takeover'
type TerminalAuthorityReason = 'not-controller' | 'session-unowned' | 'unknown-attachment'
```

Use it consistently from `TerminalSessionManager` so each action does not reimplement ownership rules.

### Lifecycle

Add `phase` and `message` to `TerminalSession`.

Session lifecycle:

- New session starts as `opening`.
- Successful spawn becomes `open`.
- Restart sets `restarting`.
- Restart failure leaves the session present as `error` with a message.
- New create spawn failure removes the just-created session so the catalog does not surface a zombie terminal.
- Close marks `closed` before disposal.

### First-Frame Contract

`attach`, `restart`, and `create` must return an authoritative first frame:

- server-side headless xterm snapshot
- `snapshotSeq`
- process name
- canonical title
- ownership projection source data
- canonical geometry
- phase and message

`create` must not rely on a later `sessions-changed` sync or snapshot fetch for first paint. The returned `sessions` list is still useful for tab projection, but the create response itself is the source of truth for the created session's visible first frame.

### Takeover Contract

`takeover` returns an authoritative ownership snapshot. The renderer applies the response immediately and treats the follow-up realtime ownership event as idempotent.

Failure mapping:

- invalid input: `error.invalid-arguments`
- lost controller / viewer trying controller-only action: `error.not-controller`
- attachment unavailable during takeover: `error.unavailable`
- malformed create response in renderer: `error.terminal-create-failed`

## Terminal Catalog

Keep `TerminalCatalog` responsible for choosing terminal ids and validating repo/worktree inputs.

Changes:

- `create` passes measured `cols`, `rows`, and `attachmentId` into `ensureSession`.
- `create` returns the first-frame payload from `ensureSession`.
- `create` verifies that `sessions` contains the returned created/restored session.
- `nextTerminalId` keeps the current smallest-available id behavior.
- Remote terminal behavior keeps the current tmux and invocation logic unless a direct conflict appears during implementation.

## Renderer Runtime

### Authority Gate

Add a renderer authority gate in `src/web/components/terminal/authority-gate.ts`.

Responsibilities:

- Cache the current renderer attachment role.
- Allow writes immediately when role is `controller`.
- For viewer writes, issue `takeover`, apply the response, then allow the write.
- Deny writes when the session is gone, the bridge is unavailable, or the server rejects takeover.
- Provide the same takeover path for the manual Take Over button and automatic write promotion.

Every write path should continue entering through `TerminalSessionRegistry.writeInput`, then `ManagedTerminalSession.writeInput`, then the authority gate:

- xterm keyboard input
- external input submission
- custom buttons
- mobile toolbar
- paste/drop file path insertion
- command bridge writes

### Input Attribution

Introduce a small terminal input envelope:

```ts
type TerminalInput =
  | { origin: 'user-intent'; source: 'keyboard' | 'paste' | 'drop' | 'toolbar' | 'command' | 'xterm'; data: string }
  | { origin: 'terminal-emulator'; source: 'data'; data: string }
```

`TerminalSessionView` should classify xterm input using xterm core user-input attribution when available, with a conservative fallback for keyboard and paste events.

`ManagedTerminalSession` must drop terminal-emulator input while replay/hydration is active. User-intent input remains allowed and still goes through the authority gate.

### Geometry

Create focused renderer geometry helpers:

- preload the configured terminal font
- measure cell size for the current terminal font settings
- propose `{ cols, rows }` from the host box
- wait for the host to become measurable with `ResizeObserver` and abort support

Important adaptation: unlike the reference project, Hobgoblin has runtime terminal font settings. Geometry helpers must use the current configured font size instead of hardcoding the reference constants.

`TerminalSessionView.openTerminal()` should accept measured geometry:

```ts
openTerminal(geometry: { cols: number; rows: number }, onInput: ...)
```

Avoid spawning the PTY at `80x24` and fixing it later. If the host cannot become measurable, fail the attach/create path with an explicit retryable error rather than silently using a default.

### First-Frame Hydration

`TerminalSessionRegistry.createTerminal()` should:

1. Wait for or resolve measured geometry for the worktree host.
2. Call `terminalBridge.create()` with geometry and attachment id.
3. Validate that the result has `sessionId`, `snapshot`, and `snapshotSeq`.
4. Set the preferred selected terminal key.
5. Reconcile using the create response's `sessions` and a snapshot map containing the returned first frame.

`ManagedTerminalSession` should:

- apply attach results with phase/message/canonical size
- apply takeover results synchronously
- treat realtime ownership events as idempotent updates
- keep viewer output summaries and current external-input behavior

## UI Behavior

Keep current terminal UI surfaces:

- external input box
- custom buttons
- mobile toolbar
- path drop/paste handling
- viewer overlay and output summary
- search overlay
- progress indicator
- path links

Adjust mode handling so phase and ownership are explicit:

- `opening`: show opening or empty-state UI as current code allows
- `restarting`: show opening/restarting status
- `open + controller`: allow terminal input controls
- `open + viewer/unowned`: show viewer overlay and takeover path
- `error + controller`: show error with restart
- `error + viewer/unowned`: show viewer overlay, takeover first

Do not stack restart controls on top of viewer-only state.

## Testing

Add focused tests near the changed boundaries.

Shared protocol:

```bash
bun run test src/shared/terminal.test.ts
```

Coverage:

- phase values validate
- create result first-frame fields validate
- takeover result fields validate
- ownership event phase validates

Server:

```bash
bun run test src/server/terminal/terminal-ownership.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal-catalog.test.ts
```

Coverage:

- multi-attachment ownership
- controller disconnect clears controller
- owner sticky auto-claim
- viewer write denied
- takeover preempts
- create/attach/restart return first-frame snapshots
- create spawn failure does not leave zombie sessions
- restart failure enters error and can retry
- takeover returns role, phase, and canonical size
- catalog create includes the created session in `sessions`

Renderer:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSlot.test.tsx
```

Coverage:

- replay-time terminal-emulator input is not written to PTY
- viewer write performs takeover before write
- takeover response immediately updates controller state
- attach uses measured geometry
- create response snapshot hydrates without later snapshot fetch
- external input, buttons, paste, and drop still write through the unified path

Full verification:

```bash
bun run typecheck
bun run check:architecture
```

## Manual Acceptance

- New local terminal opens with a visible prompt on first paint.
- Initial shell prompt width matches the actual pane width.
- Opening the same terminal in two windows/tabs shows one controller and one viewer.
- Typing in a viewer automatically takes over and writes to that window's PTY.
- Manual takeover updates UI immediately without waiting for a later event.
- Restart failure shows a recoverable error instead of a blank terminal.
- Switching away and back preserves scrollback and path links.
- External input, custom buttons, mobile toolbar, and file path paste/drop still work.
- Snapshot hydration does not produce hidden input in the shell.

## Implementation Notes

- Preserve current user changes in unrelated files.
- Prefer narrow patches over file replacement.
- Keep imports using repo aliases with explicit `.ts` / `.tsx` extensions.
- Avoid unsupported TypeScript features for Node strip-only mode.
- Add only comments that explain non-obvious lifecycle or protocol constraints.
