# Mobile Web Terminal Interaction Performance Design

## Background

The Mobile Web internal terminal currently behaves differently after the local attachment becomes the controller. Viewer and unowned attachments use a renderer-owned touch gesture to scroll xterm history, while a controller falls back to the browser/xterm touch path. On iOS Safari in particular, that makes controlled terminal scrolling feel less direct or unavailable.

Controlled input has a second latency source. User input is already microtask-batched and sent through the acknowledged terminal bridge, but every authoritative PTY output chunk is held until the next animation frame before it is written to xterm. A delayed mobile frame can therefore turn an otherwise fast local echo into a visible pause followed by a burst.

This design extends the existing read-only terminal work in [2026-07-19-terminal-readonly-viewer-design.md](./2026-07-19-terminal-readonly-viewer-design.md). It changes only Mobile Web interaction and renderer output scheduling; ownership and server protocols remain unchanged.

## Goals

- Give controller, viewer, and unowned Mobile Web attachments the same direct single-finger vertical gesture.
- Scroll normal terminal history without scrolling the Hobgoblin page.
- Preserve xterm wheel semantics for alternate-screen and mouse-tracking applications such as `vim`, `less`, and `tmux`.
- Preserve the terminal's current focus and virtual-keyboard state while dragging.
- Continue a manual vertical drag with decelerating inertia after release, without bounce.
- Replace the controller's floating Mobile Web helper buttons with a terminal-bottom command deck modeled on the Android/Termux extra-key layout.
- Bring current-worktree terminal switching, command composition, and width presentation into the command deck without adding shared or persisted state.
- Remove Hobgoblin's animation-frame wait from the first authoritative output after real user input.
- Keep ordinary sustained output frame-batched.
- Support current iOS Safari and Android Chrome, with iOS as the primary target.

## Non-Goals

- Do not change controller selection, takeover, write authorization, or resize authorization.
- Do not make a terminal drag scroll the surrounding page.
- Do not add bounce, a spring animation, or page-level inertial scrolling.
- Do not synthesize local terminal echo. Password entry, shell line discipline, and full-screen applications must remain authoritative.
- Do not transmit input-method pre-edit text. Only text committed through xterm's existing user-input path is terminal input.
- Do not replace the acknowledged WebSocket protocol or add input streaming in this iteration.
- Do not attribute SSH or remote-host network latency to the Hobgoblin renderer.

## Interaction Contract

### Single-finger gesture

A primary touch starts as an undecided terminal interaction. Movement inside an 8-pixel slop remains untouched so a tap retains xterm's ordinary focus and keyboard behavior. Once vertical movement dominates and reaches the threshold, the interaction becomes a terminal scroll gesture:

- movement follows the finger directly;
- vertical page panning is suppressed;
- accumulated pixels are converted to whole terminal rows;
- release continues the measured drag velocity as terminal-only inertia and decelerates to a stop;
- no takeover or terminal write is requested;
- the existing focus and virtual-keyboard state is not changed explicitly.

If horizontal movement dominates, the renderer abandons its gesture and leaves the event to ordinary browser/xterm interaction.

### Inertia lifecycle

Inertia begins only after an actual vertical drag with recent non-trivial velocity. It reuses the same pixel-to-row accumulation and `scrollByTouch` route as direct movement, so normal history, alternate-screen applications, and mouse-tracking applications retain their established semantics. Velocity is bounded and decays on animation frames until it falls below the stop threshold; there is no overscroll or bounce state.

A new primary touch cancels active inertia before starting another gesture. Pointer cancellation never starts inertia. Session selection, attachment-role changes, terminal closure, and component disposal cancel any scheduled frame so motion cannot leak into another terminal or authority state.

### Controller command deck

The Mobile Web terminal command deck is controller-only and sits in the existing bottom dock. Its measured height is reserved inside the terminal frame, so the deck never floats over terminal output. Existing custom terminal buttons remain in the same dock above the deck. Search and read-only ownership surfaces keep their current positions.

The first two horizontally scrollable rows follow the Android/Termux order exactly:

```text
ESC  /  -  HOME  ↑  END  PGUP
TAB  CTRL  ALT  ←  ↓  →  PGDN
```

`CTRL` and `ALT` are visible one-shot modifiers for the next extra-key action. Pressing an active modifier cancels it. Direct action-row terminal inputs clear both modifiers. Extra-key translation observes xterm's application cursor mode so full-screen applications retain their expected cursor sequences.

The third horizontally scrollable row contains the Web-applicable Android actions:

```text
ENTER  ⌫  CTRL+C  CTRL+L  T↑  T↓  Compose  Fit/Original width
```

- `T↑` and `T↓` cycle in stable order through sessions in the current worktree and are disabled when only one session exists. They do not add cross-project or global switching.
- `Compose` toggles a single-line, renderer-local draft field. Sending non-empty text writes the original text plus `\r`, clears the draft, and keeps the normal controller authority path. Switching terminal resets the draft and modifiers.
- Width presentation defaults to `Fit width`. `Original width` gives the xterm frame a 720-pixel minimum width and allows native horizontal panning; returning to fit resets the horizontal offset. The choice is temporary renderer state and is not persisted or synchronized.
- Reconnect, close, appearance, focus, and clipboard actions remain in their existing Web surfaces and are not duplicated.

### Terminal routing

`TerminalSlot` owns gesture recognition, but it does not decide what scrolling means. It sends row deltas and touch coordinates through `TerminalSessionRegistry` and `ManagedTerminalSession` to `TerminalSessionView`.

`TerminalSessionView` routes by xterm state:

- normal buffer with no mouse tracking: call `term.scrollLines()` to move history directly;
- alternate buffer: dispatch line-mode wheel events through xterm so the foreground application receives its normal up/down navigation;
- active mouse tracking: dispatch line-mode wheel events through xterm with the touch coordinates so xterm can encode the application's mouse protocol correctly.

This keeps xterm as the authority for terminal application semantics and avoids duplicating VT protocol logic in Hobgoblin.

## Input-Latency Contract

`ManagedTerminalSession.writeInput()` already receives attributed input:

- `user-intent` covers direct keyboard input, committed input-method text, paste, toolbar actions, and other explicit user input;
- `terminal-emulator` covers protocol replies generated by xterm.

After an authorized, non-empty user-intent input, the managed session marks exactly one future authoritative output flush as latency-sensitive. When the next output for the active session arrives:

1. append it to any output already waiting in order;
2. cancel the pending renderer animation-frame flush;
3. write the complete pending output to xterm immediately;
4. consume the latency-sensitive marker.

Later output returns to the existing animation-frame batch. Terminal-emulator protocol replies do not set the marker. Ownership loss, session replacement, view destruction, restart, and disposal clear it so it cannot leak into another authority or terminal lifecycle.

The output remains server-authoritative. This optimization removes only a renderer scheduling delay and does not invent visible characters.

## Architecture Boundaries

- `TerminalSlot` owns browser gesture recognition.
- `MobileTerminalCommandDeck` owns command-deck presentation, one-shot modifier UI, and the ephemeral Compose draft.
- `TerminalSessionRegistry` routes the selected terminal key.
- `ManagedTerminalSession` owns terminal lifecycle, input attribution, authority checks, and output scheduling.
- `TerminalSessionView` owns xterm APIs, extra-key mode translation, and DOM event adaptation.
- The terminal bridge, server, and PTY retain protocol and data authority.

No main/server/shared import boundary changes are required. The change is local and reversible, so no ADR is required.

## Testing

Automated tests cover:

- controller, viewer, and unowned Mobile Web roles sharing the vertical gesture;
- mouse input, taps, slop, and horizontal drags remaining outside the custom scroll path;
- release velocity producing decelerating terminal-only inertia;
- new touch and pointer cancellation stopping or suppressing inertia;
- the exact two Android/Termux extra-key rows and one-shot modifier behavior;
- action-row terminal input, current-worktree cycling, Compose submission/reset, and width toggling;
- command-deck bottom-dock placement, dynamic terminal clearance, and absence from the top-right float group;
- normal-buffer history using `scrollLines()`;
- alternate-buffer and mouse-tracking modes receiving line-mode wheel events with coordinates;
- ordinary output remaining animation-frame batched;
- pending ordered output flushing immediately with the first output after user intent;
- only one output flush receiving priority;
- terminal-emulator protocol input not receiving user-input priority;
- type and architecture compatibility for all terminal context consumers.

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## Real-Device Acceptance

Use a current iPhone/iPad Safari session as the primary check and Android Chrome as the secondary check. Connect over the same LAN to a Hobgoblin server running a local native shell. Test SSH and tmux separately as regression cases.

1. In a normal shell, drag vertically as controller, viewer, and unowned attachment. The terminal follows the finger, the page remains fixed, and release continues with smooth deceleration without bounce.
2. Open `vim`, `less`, and tmux. As controller, vertical drags retain the foreground application's wheel/navigation behavior.
3. Start with the virtual keyboard closed and then open. A drag preserves the current state in both cases; a tap retains ordinary terminal focus behavior.
4. Confirm the command deck appears below the controller terminal, never covers the last visible row, and retains both horizontally scrollable Termux rows plus the Web action row when custom buttons are also visible.
5. Verify extra arrows in a normal shell, `vim`, `less`, and tmux; verify `CTRL`/`ALT` active labels and direct `CTRL+C`/`CTRL+L` actions.
6. Switch between at least two current-worktree terminals, submit a Compose command, and toggle between 720-pixel original width and fitted width. Confirm no state leaks to another terminal draft.
7. Record at least 100 direct Latin/numeric inputs and committed CJK inputs. Measure from the committed user-input event to the corresponding authoritative output entering xterm. Record median, p95, and maximum.
8. On the same-LAN local-shell baseline, target p95 at or below 100 ms and no pause longer than 150 ms followed by a burst.

System keyboard animation and input-method candidate UI are excluded from the input-latency measurement. External SSH round-trip time is reported separately.
