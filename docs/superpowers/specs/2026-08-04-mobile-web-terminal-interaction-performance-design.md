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
- Let controller, viewer, and unowned Mobile Web attachments drag from the terminal's right edge to an absolute normal-buffer history position without a persistent slider.
- Replace the controller's floating Mobile Web helper buttons with a terminal-bottom command deck modeled on the Android/Termux extra-key layout.
- Put a local `Back to bottom` action first in the command deck's third row.
- Put the same local `Back to bottom` action immediately left of `Take over terminal` in the read-only status surface.
- Bring current-worktree terminal switching, command composition, and width presentation into the command deck without adding shared or persisted state.
- Add an Android-like Focus action to the third row that temporarily hides the complete auxiliary bottom dock and leaves a top-right exit handle.
- Reduce command-deck key and composer height from 38 to 32 pixels while retaining a 44-pixel minimum key width.
- Keep the system input method closed when a viewer or unowned attachment taps the read-only terminal.
- Enlarge the transient scrubber percentage from 10 to 14 pixels without changing its interaction zone.
- Remove Hobgoblin's animation-frame wait from the first authoritative output after real user input.
- Keep ordinary sustained output frame-batched.
- Support current iOS Safari and Android Chrome, with iOS as the primary target.

## Non-Goals

- Do not change controller selection, takeover, write authorization, or resize authorization.
- Do not make a terminal drag scroll the surrounding page.
- Do not add bounce, a spring animation, or page-level inertial scrolling.
- Do not expose alternate-buffer or mouse-tracking application position as ordinary scrollback.
- Do not synchronize a renderer's history position or scrubber percentage through React state, the terminal bridge, or the server.
- Do not render a persistent custom scrollbar, track, or thumb over terminal output.
- Do not synthesize local terminal echo. Password entry, shell line discipline, and full-screen applications must remain authoritative.
- Do not transmit input-method pre-edit text. Only text committed through xterm's existing user-input path is terminal input.
- Do not replace the acknowledged WebSocket protocol or add input streaming in this iteration.
- Do not hide the Web terminal topbar or enter the existing desktop Terminal focus mode.
- Do not attribute SSH or remote-host network latency to the Hobgoblin renderer.

## Interaction Contract

### Single-finger gesture

A primary touch starts as an undecided terminal interaction. Movement inside an 8-pixel slop remains untouched so a controller tap retains xterm's ordinary focus and keyboard behavior. Viewer and unowned xterm input surfaces remain read-only with `inputmode=none`, so an ordinary tap cannot invoke the system input method. Once vertical movement dominates and reaches the threshold, the interaction becomes a terminal scroll gesture:

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

### Right-edge history scrubber

Every Mobile Web attachment receives a 32-pixel interaction strip at the terminal's right edge. The strip is unavailable when xterm's active buffer is not the normal buffer or has no scrollback. It has no idle rail or thumb, so terminal output keeps the full visual surface.

Touching or dragging within the strip maps the pointer's clamped vertical position directly to `baseY` and calls `scrollToLine()`. Grabbing it cancels active touch inertia. During the interaction, a short terminal-cursor-like tick and 14-pixel percentage readout appear beside the finger; both disappear on release. Keyboard focus reveals the same feedback and supports arrows, Page Up/Down, Home, and End. The strip exposes semantic scrollbar state to assistive technology while `TerminalSessionView` updates its percentage imperatively, outside React state.

This is a local viewing operation for controller, viewer, and unowned attachments. It never writes terminal input, requests takeover, or enters server/realtime state. Its active area reserves clearance for search, the controller command deck, the Focus exit handle, and the read-only status surface.

### Visual direction

The subject is a mobile terminal operator reviewing long-running command output; the page's single job is to expose history without obscuring characters. The reference palette is Terminal ink `#1A1B26`, Output chalk `#C0CAF5`, History signal `#7AA2F7`, Status glass `#24283B`, and Divider steel `#414868`. The implementation maps those roles to the active theme's terminal, brand, toolbar, and border tokens rather than fixing one theme's colors. Terminal output keeps its configured monospace face; the transient percentage uses the system monospace utility stack, while status actions retain the application's UI type.

```text
┌──────────────── terminal output ───────────────┐
│                                                │░ 32 px invisible edge zone
│                                      [ 42% ] ━│  visible only while dragging
│                                                │
└──────── read-only ── [Back to bottom] [Take over]┘
```

The signature element is the transient edge tick: it reads like a terminal cursor locating history, not a browser scrollbar. The initial full-height rail-and-thumb concept was rejected in critique because it remained generic, obscured output, and duplicated xterm's own desktop scrollbar. Motion is limited to a 90 ms feedback reveal and is removed under reduced-motion preferences.

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
Back to bottom  ENTER  ⌫  CTRL+C  CTRL+L  T↑  T↓  Compose  Fit/Original width  Focus
```

- `Back to bottom` stops active touch inertia and calls the selected session's existing local `scrollToBottom()` route. It is the first action-row control and does not change input authority or one-shot modifiers.
- `T↑` and `T↓` cycle in stable order through sessions in the current worktree and are disabled when only one session exists. They do not add cross-project or global switching.
- `Compose` toggles a single-line, renderer-local draft field. Sending non-empty text writes the original text plus `\r`, clears the draft, and keeps the normal controller authority path. Switching terminal resets the draft and modifiers.
- Width presentation defaults to `Fit width`. `Original width` gives the xterm frame a 720-pixel minimum width and allows native horizontal panning; returning to fit resets the horizontal offset. The choice is temporary renderer state and is not persisted or synchronized.
- `Focus` hides the complete bottom dock, including custom terminal buttons and an open Compose field. A compact top-right `Exit focus` handle remains available. The state resets when the selected terminal, attachment role, or mobile presentation changes and is never persisted or synchronized.
- Every command-deck key and the Compose input use a 32-pixel height; keys retain a 44-pixel minimum width so compact vertical density does not reduce their horizontal touch target.
- Reconnect, close, appearance, and clipboard actions remain in their existing Web surfaces and are not duplicated.

### Read-only status actions

Viewer and unowned attachments keep the existing read-only message and takeover authority rules. Their status surface adds `Back to bottom` immediately left of `Take over terminal`. It reuses the same local handler as the command deck, so it cancels current touch motion and returns the selected xterm view to the latest output without requesting ownership. The navigation action uses the quieter ghost treatment; takeover retains the stronger secondary treatment.

The managed terminal also projects attachment authority into xterm's input surface. Viewer and unowned states set `disableStdin`, make the hidden textarea read-only, apply `inputmode=none`, and blur it if ownership is lost while focused. Successful takeover restores stdin, editability, and the default input mode. This prevents a read-only tap from opening the system keyboard while leaving history gestures and takeover independent.

### Terminal routing

`TerminalSlot` owns gesture recognition and the edge-scrubber DOM element, but it does not own xterm scroll metrics or decide what application scrolling means. It passes the element through the existing session-attach handlers; `ManagedTerminalSession` binds it to `TerminalSessionView`, while relative gestures retain their existing registry route.

`TerminalSessionView` routes by xterm state:

- normal buffer with no mouse tracking: call `term.scrollLines()` to move history directly;
- absolute edge scrubbing in the normal buffer: map pointer position to `baseY`, call `term.scrollToLine()`, and resynchronize semantic percentage feedback;
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

- `TerminalSlot` owns browser gesture recognition, inertia cancellation, the edge-scrubber DOM element, read-only action composition, and ephemeral Mobile Web focus presentation.
- `MobileTerminalCommandDeck` owns command-deck presentation, one-shot modifier UI, and the ephemeral Compose draft.
- `TerminalSessionRegistry` routes selected-terminal commands and existing relative touch gestures.
- `ManagedTerminalSession` owns terminal lifecycle, input attribution, authority checks, output scheduling, and projecting current write authority into the view.
- `TerminalSessionView` owns xterm APIs, scroll metrics/scrubber synchronization, extra-key mode translation, read-only textarea mode, and DOM event adaptation.
- The terminal bridge, server, and PTY retain protocol and data authority.

No main/server/shared import boundary changes are required. The change is local and reversible, so no ADR is required.

## Testing

Automated tests cover:

- controller, viewer, and unowned Mobile Web roles sharing the vertical gesture;
- controller, viewer, and unowned roles receiving a draggable absolute edge scrubber without a range input;
- the scrubber mirroring `baseY`/`viewportY` as a percentage, hiding outside normal scrollback, and cancelling active inertia when grabbed;
- the read-only status surface placing `Back to bottom` immediately left of takeover and routing it locally;
- mouse input, taps, slop, and horizontal drags remaining outside the custom scroll path;
- release velocity producing decelerating terminal-only inertia;
- new touch and pointer cancellation stopping or suppressing inertia;
- the exact two Android/Termux extra-key rows and one-shot modifier behavior;
- first-position return-to-bottom, action-row terminal input, current-worktree cycling, Compose submission/reset, and width toggling;
- command-deck bottom-dock placement, dynamic terminal clearance, and absence from the top-right float group;
- Focus placement at the end of the third row, complete bottom-dock hiding, and top-right restoration;
- 32-pixel command-deck controls and the 14-pixel transient history percentage;
- viewer stdin/input-mode suppression and restoration after takeover;
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
3. Start with the virtual keyboard closed and then open as controller. A drag preserves the current state in both cases, and a tap retains ordinary terminal focus behavior. As viewer and unowned, tap without dragging and confirm the system keyboard remains closed; take over and confirm normal keyboard activation returns.
4. Build normal-buffer scrollback, drag along the terminal's right edge to the top, middle, and bottom as controller, viewer, and unowned attachment. Confirm no rail or thumb is visible while idle, the enlarged percentage and position tick appear only during interaction, and the scrubber is unavailable in alternate-screen applications.
5. Confirm the command deck appears below the controller terminal, never covers the last visible row, and retains both horizontally scrollable Termux rows plus the Web action row when custom buttons are also visible. Confirm `Back to bottom` is first and stops any active inertia before returning to the latest output. Confirm 32-pixel-high controls remain usable. Enter Focus from the last third-row action, confirm the entire bottom dock disappears and the top-right exit handle restores it, then confirm switching terminal or losing control exits Focus. In viewer and unowned states, confirm another `Back to bottom` appears immediately left of takeover and works without changing ownership.
6. Verify extra arrows in a normal shell, `vim`, `less`, and tmux; verify `CTRL`/`ALT` active labels and direct `CTRL+C`/`CTRL+L` actions.
7. Switch between at least two current-worktree terminals, submit a Compose command, and toggle between 720-pixel original width and fitted width. Confirm no state leaks to another terminal draft.
8. Record at least 100 direct Latin/numeric inputs and committed CJK inputs. Measure from the committed user-input event to the corresponding authoritative output entering xterm. Record median, p95, and maximum.
9. On the same-LAN local-shell baseline, target p95 at or below 100 ms and no pause longer than 150 ms followed by a burst.

System keyboard animation and input-method candidate UI are excluded from the input-latency measurement. External SSH round-trip time is reported separately.
