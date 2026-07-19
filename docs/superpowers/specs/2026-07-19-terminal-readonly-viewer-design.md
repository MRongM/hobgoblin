# Terminal Read-Only Viewer Design

## Background

When another attachment takes control of an internal terminal, the current page becomes a `viewer`. The renderer currently destroys or avoids creating the viewer's xterm instance, hides the terminal host, and replaces it with a full-surface overlay containing only a short plain-text output summary. That preserves ownership safety, but it makes the terminal look unavailable and loses normal terminal viewing behavior.

The desired behavior is a first-class read-only terminal: keep the full xterm visible and live while clearly explaining that another client controls input. A viewer may scroll, select, copy, open links, and search. It may not write, paste, drop paths, send mouse protocol input, resize the PTY, or take control implicitly.

## Goals

- Keep the real xterm visible and current for `viewer` and `unowned` attachments.
- Preserve scrolling, selection, copying, terminal links, and search in read-only mode.
- Block every input path before it can write or trigger an implicit takeover.
- Keep explicit takeover available through one persistent action.
- Render viewer terminals at the server's canonical geometry without sending resize mutations.
- Preserve the existing server-owned terminal ownership model and realtime protocol.
- Keep the change inside the existing terminal renderer slice and shared translations.

## Non-Goals

- Do not change `clientId`, `attachmentId`, controller selection, or server takeover rules.
- Do not persist terminal ownership or viewer presentation state.
- Do not add terminal logs, a second terminal renderer, or a static DOM snapshot implementation.
- Do not alter controller terminal behavior, terminal settings, custom buttons, or mobile input controls.
- Do not add dependencies or introduce a new color palette.

## Domain Model

- **Controller attachment:** the attachment allowed to write and resize the server-backed terminal.
- **Viewer attachment:** a connected attachment that receives and renders terminal output but cannot mutate the terminal.
- **Unowned attachment:** a connected attachment viewing a terminal that currently has no controller. It is read-only while the renderer projection remains unowned; existing server attach and reconnect rules may still select a connected controller automatically.
- **Explicit takeover:** the only renderer-side viewer action that requests control. Terminal input never implies takeover, while existing server-side automatic controller selection remains unchanged.
- **Canonical geometry:** the server-owned terminal dimensions. Viewers render at these dimensions and do not publish local fit results.

These terms already match `CONTEXT.md`, `docs/renderer-model.md`, and the shared terminal protocol. No glossary or ADR change is required.

## Architecture

Keep the current boundaries:

- `TerminalSessionState` remains the renderer projection of phase, attachment role, and canonical geometry.
- `ManagedTerminalSession` owns xterm lifecycle, output delivery, input gating, and resize authority.
- `TerminalSlot` owns the visible status surface and browser interaction affordances.
- The terminal bridge and server continue to own attach, output streaming, write authorization, resize authorization, and takeover.

Separate three concepts that are currently coupled:

1. **Has a live view:** any open selected attachment may mount and hydrate xterm.
2. **Can render output:** any live xterm may parse streamed output.
3. **Can control the PTY:** only a controller may write or resize.

The implementation must not use `canResize()` as a proxy for whether an xterm should exist or receive output. It remains an authority check for server resize mutations.

## Session Lifecycle

### Initial viewer attachment

1. The registry hydrates the session metadata and first-frame snapshot as it does today.
2. When `TerminalSlot` attaches a visible host, `ManagedTerminalSession` creates xterm even when the attachment is a viewer.
3. The session attaches through the existing bridge and replays the authoritative snapshot.
4. If the returned role is not controller, xterm is resized to canonical geometry and no resize mutation is sent.
5. Later output events are queued into the live xterm.

### Controller becomes viewer

1. The ownership event updates the renderer attachment role and canonical geometry.
2. The existing xterm remains mounted and keeps its scrollback.
3. Pending input and resize work is discarded.
4. Xterm is aligned to canonical geometry.
5. Later output continues to render.

### Viewer becomes controller

1. Only the explicit takeover button calls the takeover path.
2. A successful authoritative response updates the role.
3. The existing xterm remains mounted.
4. The visible host is fitted, and any resulting controller resize follows the existing debounced resize path.
5. Controller-only mobile and custom-button controls become available again.

### Unowned attachment recovery

An unowned projection remains viewable and input-gated while it is unowned. This renderer change does not alter the existing server rule that may automatically choose a connected controller during attach or reconnect. If the projection remains unowned, the explicit takeover action stays available.

## Input Safety

`ManagedTerminalSession.writeInput()` is the final renderer boundary shared by xterm keyboard and mouse data, paste, drag-and-drop path insertion, the mobile toolbar, custom buttons, and command writes.

When the current attachment is not a controller:

- discard input before calling the input activity callback;
- do not buffer input;
- do not call the bridge write method;
- do not call takeover;
- do not change focus or ownership state.

`writeWithTerminalAuthority()` becomes a write authorization gate, not an acquisition gate. It writes only for a current controller. This keeps the safety invariant at both the managed-session boundary and the bridge-facing authority boundary.

`TerminalSlot` also suppresses viewer drag-enter, drag-over, and drop handling so it never shows a misleading drop affordance. Plain text and mouse protocol input emitted by xterm still reach the managed-session guard and are discarded. Search shortcuts remain available because they are renderer-local viewing actions.

## UI Design

The terminal remains the visual subject. Replace the full viewer overlay with a compact ownership status surface anchored to the lower-right edge of the terminal.

```text
┌────────────────── live terminal output ──────────────────┐
│ $ bun run test                                           │
│ ✓ 128 tests passed                                       │
│                                                          │
│                           ┌─────────────────────────────┐ │
│                           │ Read-only · controlled      │ │
│                           │ elsewhere        [Take over]│ │
│                           └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Copy

- Chinese: `只读 · 其他客户端正在控制`
- English: `Read-only · controlled by another client`
- Japanese and Korean use equivalent plain descriptions.
- The action retains the existing localized `terminal.takeover` label.
- The unowned state uses equivalent wording that describes the current read-only absence of a controller without promising how the server selects the next controller.

### Visual tokens

Do not hardcode a new light-only palette. Use the existing theme semantic tokens. The light-theme reference values are:

- terminal surface `#FFFFFF`
- foreground `#1F2328`
- muted foreground `#59636E`
- border `#D0D7DE`
- brand/action `#1F883D`

The status surface uses the existing toolbar background, toolbar border, muted foreground, control radius, shadow, and Button primitive. Terminal content continues using the configured terminal monospace family; status copy continues using the application UI family.

The memorable element is the narrow ownership rail over a fully live terminal. It encodes actual authority instead of decorating the page.

### Layout and accessibility

- Anchor the status surface at the existing terminal overlay offset.
- Keep it content-sized with a constrained maximum width and responsive wrapping.
- Use a translucent theme surface only if the existing toolbar token already provides sufficient contrast; do not tint the terminal content.
- Give the message `role="status"`, `aria-live="polite"`, and atomic ownership copy.
- Keep `aria-readonly="true"` on the terminal host for viewer and unowned attachments.
- Keep the takeover button keyboard reachable with the existing visible focus treatment.
- The status surface captures pointer events only for its button; the remaining terminal stays scrollable and selectable.
- Respect existing reduced-motion behavior; add no ownership animation.

## Error and Edge Cases

- If takeover is pending, disable the action and retain the existing ellipsis label.
- If takeover fails, leave the terminal visible and read-only; existing bridge behavior may allow retry.
- If canonical geometry is temporarily unavailable, keep the measured view until authoritative geometry arrives; never send a viewer resize.
- If ownership changes during buffered input or resize work, clear the pending work before it reaches the bridge.
- If a viewer receives output during replay, preserve the existing replay sequence boundary and flush only post-snapshot events into xterm.
- If the session enters an error or closed phase, retain the existing phase-specific UI instead of showing the viewer status.

## Testing

### Authority gate

- controller input writes once;
- viewer and unowned input neither take over nor write;
- missing sessions do not write.

### Managed terminal session

- a hydrated viewer creates and keeps a live xterm when attached;
- viewer output writes into xterm instead of summary-only projection;
- controller-to-viewer ownership changes preserve the xterm;
- viewer-to-controller changes reuse the xterm and restore resize authority;
- viewer keyboard, paste, mouse protocol, command, and drop input cannot call takeover or write;
- viewer resize observations do not call the bridge resize method;
- replay ordering remains correct for viewers.

### Terminal slot

- the terminal host remains visible and marked read-only;
- the compact ownership status and takeover action render;
- the legacy full-surface viewer overlay and output summary do not render;
- viewer drag-and-drop does not show a drop hint or write;
- explicit takeover calls the existing context action;
- controller-only controls remain hidden for viewers.

### Verification

Run focused terminal tests, then:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## Acceptance Criteria

1. Opening the same internal terminal in two clients shows full terminal output in both.
2. The viewer continues to receive live terminal output without replacing it with a text summary.
3. The viewer can scroll, select, copy, open links, and search.
4. Keyboard, paste, drag/drop, mouse protocol, toolbar, button, and command input never write or implicitly take over from a viewer.
5. A persistent read-only ownership status explains why input is unavailable.
6. For a viewer controlled by another client, clicking `Take over` is the only renderer interaction that requests control; existing server-side automatic selection for an unowned attach or reconnect remains unchanged.
7. Ownership changes preserve terminal scrollback and do not flash a blank terminal.
8. Controller terminal behavior and server ownership semantics remain unchanged.
