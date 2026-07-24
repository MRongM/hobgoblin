# Terminal creation interactive readiness design

Date: 2026-07-24

## Goal

Keep the terminal loading status visible from the user's open action until the
selected internal terminal is rendered and ready for input. On desktop, the
loading-to-ready transition focuses the terminal before the browser paints the
state without the loading status, so the cursor becomes the visible readiness
cue.

## Readiness definition

Terminal creation has two sequential pending periods:

1. **Creation request pending**: the renderer is waiting for the server to
   create or restore the session and return the authoritative first frame.
2. **Terminal render pending**: a registered `ManagedTerminalSession` is
   opening xterm, attaching to the server session, replaying the first frame,
   and waiting for the browser to receive a paint opportunity.

The terminal is ready only after both periods have ended. This is an
interaction-readiness definition, not a process-lifecycle claim.

Literal cursor-element detection is not the readiness source. Full-screen
terminal applications may intentionally hide the cursor, and compact/mobile
surfaces must not open the virtual keyboard automatically. Instead, successful
attach, replay completion, and a post-replay paint opportunity form the stable
readiness boundary. Desktop focus happens in the same React commit that removes
the loading status, before that commit is painted.

## Approaches considered

1. Add a minimum loading duration. This makes the indicator more noticeable
   but can report completion before the terminal is usable.
2. Keep the registry creation counter pending until a view-ready callback.
   This couples request lifetime to view mounting and can leave background
   creations pending indefinitely.
3. Publish renderer-local render pending state from the managed session and let
   `TerminalSlot` combine it with creation pending. This matches existing state
   ownership and cannot leak when a view is not mounted.

Use the third approach.

## Design

- Add optional `renderPending` to `TerminalSnapshot`. Production managed
  sessions publish `true` until xterm attach, replay, and a post-replay paint
  opportunity complete. Omitted means no renderer wait is active, preserving
  compatibility with lightweight projections and tests.
- `ManagedTerminalSession` owns this state because it owns xterm and the
  attach/replay lifecycle. It clears the state only after finalization and
  publishes a fresh snapshot.
- Errors and disposed sessions do not publish render pending; existing error
  presentation remains authoritative.
- `TerminalSlot` shows the existing status while creation, registered-session
  opening, or render pending is active.
- A loading status is centered while the first terminal is being created or
  its renderer is still pending. Creating an additional terminal while the
  current one remains usable keeps the status compact at the bottom-right so
  it does not cover the current terminal.
- Desktop auto-focus waits for render pending to clear. The layout effect
  focuses the textarea before the ready commit paints. Mobile behavior remains
  non-auto-focusing.

No server contract, persistence, cross-window state, timeout, artificial delay,
or optimistic session identity is added.

## Error handling

- Creation failure clears `creating` through the existing `finally` path.
- Attach or replay failure enters the existing session error phase. The loading
  status yields to the error presentation rather than waiting for readiness.
- View recovery resets render pending and republishes readiness after the
  replacement xterm completes the same lifecycle.

## Verification

- Managed-session tests prove render pending exists before attach completion
  and clears only after the terminal start pipeline settles.
- Terminal-slot tests prove an open server session remains loading while render
  pending, then focuses and hides loading when readiness is published.
- Tests preserve compact loading for additional terminals and no mobile
  auto-focus.
- Run focused tests, typecheck, the full suite, formatting, and the architecture
  check.

## Grill findings

- “Cursor visible” and “terminal interactive” are not identical on mobile or in
  cursor-hiding TUIs; renderer readiness is the stable canonical condition.
- Readiness belongs to the managed renderer session, not the server session and
  not a component-local timer.
- The change extends an existing transient snapshot and remains reversible, so
  it needs neither an ADR nor a glossary update.
