# Windows Terminal IME Anchor Design

## Problem

On Windows 11, Microsoft Pinyin can keep its native pre-edit and candidate UI outside the browser composition-event path. During the observed Codex TUI reproduction, no `compositionstart`, `compositionupdate`, or `compositionend` event was emitted. Depending on the native input cycle, xterm either consumed the keydown before the adapter saw it or the adapter received `keydown(key="Process", keyCode=229)` followed by printable keyup events. `beforeinput` and `input` arrived only when a Chinese phrase was committed.

The existing Windows workaround begins its position lock only on `compositionstart`. It therefore remains inactive in this real path. While Codex renders progress, xterm synchronizes its hidden textarea to the terminal buffer cursor. The captured trace moved the textarea from `left: 14px; top: 168px` to output positions as far away as `left: 896px; top: 658px`. Windows uses that textarea layout position for its native candidate UI, so the candidate window can jump to the output cursor and return on the next input update.

The existing `MutationObserver` correction is also asynchronous. Even where standard composition events exist, xterm can change the textarea's computed layout before the observer restores the inline styles. Native Windows IME positioning can observe that intermediate layout.

## Goals

- Keep Microsoft Pinyin's candidate anchor at the logical terminal input position while Codex or another terminal application continues rendering output.
- Support both standard browser composition events and the Windows TSF path that exposes only orphaned printable `keyup` events before committed `beforeinput`/`input`.
- Let each committed Chinese phrase advance the anchor to the terminal application's newly rendered logical cursor before the next phrase begins.
- Preserve continuous PTY output, terminal focus, xterm input, candidate selection, and standard non-Windows behavior.
- Remove any layout interval in which xterm output can move the locked textarea or composition view.

## Non-Goals

- Do not defer, buffer, or reorder PTY output during IME input.
- Do not change ConPTY, terminal color synchronization, terminal ownership, or server state.
- Do not implement a native TSF addon or patch xterm internals.
- Do not lock textarea width. Standard composition text must still grow horizontally so its caret and candidate UI can follow the pre-edit text.
- Do not apply the workaround outside Windows.

## Architecture

The behavior remains a renderer-local adapter in `terminal-ime-position.ts`, installed immediately after `term.open(...)`. It owns only the Windows textarea/composition-view layout contract and remains disposable with the xterm instance.

The adapter supports two input paths:

1. **Standard composition**: `compositionstart` establishes an anchor and `compositionend` releases it. Existing xterm composition-view activity remains authoritative for key-driven finalization.
2. **Opaque Windows TSF composition**: a printable `keyup` for which the adapter observed no matching printable `keydown` establishes an anchor. Microsoft Pinyin exposes its ongoing pre-edit keydowns as `Process`/229 or lets xterm consume them before the adapter, while ordinary terminal typing emits committed `beforeinput`/`input` before keyup and does not enter this state.

Both paths use the same layout lock and cleanup. This is renderer presentation state, not terminal session state, so it is neither persisted nor synchronized.

## Synchronous Layout Lock

When an anchor is active, the adapter sets CSS custom properties containing its `left` and `top` and adds a lock class to the textarea and composition view. `terminal-session.css` applies those properties with `!important`:

```css
.goblin-managed-terminal-host .goblin-terminal-ime-anchor {
  left: var(--goblin-terminal-ime-anchor-left) !important;
  top: var(--goblin-terminal-ime-anchor-top) !important;
}
```

xterm may continue assigning ordinary inline `left` and `top` values during output. Those assignments no longer change computed layout while the class is present, so Windows cannot observe an intermediate output-cursor position. Releasing the lock removes the class and custom properties, immediately exposing xterm's current inline position.

The existing observer/timer restoration is removed because it corrects after mutation instead of preventing layout movement. Render listeners are no longer needed for position restoration.

## Opaque TSF Event State

The adapter tracks physical keys whose `keydown` reached the textarea.

- On `keydown`, record the key identity. `Process`/229 retains an opaque anchor because Microsoft Pinyin emits it for every character in an ongoing pre-edit. Any other normal keydown releases opaque state. Standard composition continues to use xterm's `.composition-view.active` state to decide whether the key finalized composition.
- On `keyup`, remove a matching recorded key. A matching pair is ordinary browser input and does not start an opaque anchor.
- An unmatched printable `keyup` starts opaque anchoring at the textarea's current xterm position. Later unmatched printable keyups retain the same anchor.
- An unmatched `Backspace` retains an existing opaque anchor because it edits the native pre-edit string, but does not start one by itself.
- `Escape`, blur, disposal, or a normal keydown releases opaque anchoring.
- `beforeinput`/`input` releases opaque anchoring before committed text advances the terminal input. The commit keyup is suppressed so it cannot immediately create a false anchor; the next phrase starts at xterm's newly synchronized position.

Key identity uses `event.code` when present and falls back to `event.key`, allowing tests and older event implementations to behave consistently.

## Anchor Selection

Standard composition keeps the existing cursor/cell calculation because the textarea may not have a trustworthy inline position before the first input or after resize.

Opaque TSF anchoring first reads the textarea's current inline `left` and `top`, since that is the position Windows used when it opened the native candidate UI. If either value is unavailable, it falls back to the terminal cursor/cell calculation.

The anchor is recalculated only when a new standard or opaque composition begins. Output renders cannot move it. After a committed phrase releases the anchor, xterm can synchronize to the terminal application's logical input cursor before the next phrase establishes a new anchor.

## Cleanup And Failure Behavior

- Blur, composition completion, cancellation paths, and disposal remove both lock classes, both custom properties, and tracked key state.
- Missing textarea, screen, or composition view leaves xterm unchanged.
- Non-Windows platforms return a no-op disposable.
- A false opaque-state detection affects only the hidden input element's position until the next ordinary keydown, `beforeinput`, blur, or disposal; it never blocks input or terminal output.

## Testing

Unit tests in `terminal-ime-position.test.ts` will cover:

- unmatched printable `keyup` starts a lock without any composition event;
- repeated xterm inline position mutations cannot change the CSS anchor contract;
- matching keydown/keyup ordinary typing does not start opaque anchoring;
- repeated Microsoft Pinyin `Process`/229 keydowns retain the original opaque anchor;
- committed `beforeinput` releases the lock and the next unmatched printable `keyup` anchors at the new logical cursor;
- Backspace retains, Escape releases, blur releases, and disposal cleans the opaque state;
- standard composition, first input, resize fallback, custom Ctrl+V veto, and non-Windows behavior remain covered.

The terminal integration test will use the xterm mock to reproduce continuous renders while the opaque TSF state is active. The CSS contract test will verify the priority rule exists in `terminal-session.css`.

Manual Windows 11 verification runs a native Microsoft Pinyin sequence while the terminal alternates its xterm cursor between an output row and the logical input row every 90 ms. The native pre-edit and candidate window must remain at the logical input cursor, advance after each committed phrase, and never jump to a progress/output cursor.

## Alternatives Rejected

- **Idle timeout after printable input**: slow input can exceed any chosen timeout and reproduce the bug; ordinary English typing would also be unnecessarily covered.
- **Lock whenever the terminal is focused**: prevents xterm from following legitimate cursor movement in ordinary shells and full-screen terminal applications.
- **Defer PTY output**: this behavior was intentionally removed from the project, breaks live terminal rendering, and can accumulate unbounded output during a long candidate session.
- **MutationObserver-only restoration**: runs after xterm has already changed layout and cannot prevent Windows from observing the transient position.
- **Native TSF integration**: would require a native addon or Electron/Chromium changes for a renderer-local compatibility issue.

## Architecture Review

- The change stays under `src/web/**` and introduces no main/server imports, preserving enforced architecture boundaries.
- The adapter is a small terminal presentation helper rather than new shared state or a runtime facade.
- Continuous output and server-first terminal behavior remain unchanged.
- No new domain term or irreversible application-level decision is introduced, so `CONTEXT.md` and an ADR do not need changes.
