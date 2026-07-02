# Terminal Goblin Input Attribution Design

## Context

Current Hobgoblin classifies xterm `onData` by checking whether output is being written through `TerminalSessionView.writeOutput()`. While `outputWriteDepth > 0`, the view strips known terminal protocol replies and treats the remaining bytes as user intent. This protects replay and snapshot hydration from writing emulator-generated replies back into PTY stdin, but it also makes normal output writes part of the input attribution mechanism.

The reference Goblin implementation uses a different boundary. It marks actual xterm user input through `term._core.coreService.onUserInput` when available, falls back to DOM/key attribution when that internal service is missing, and treats unmarked `onData` as `terminal-emulator`. Replay then drops emulator-origin input while still allowing attributed user input.

## Goal

Switch terminal input attribution to the reference Goblin model:

- classify `onData` as user intent only when xterm core or fallback attribution proves it came from user input
- classify unmarked `onData` as terminal-emulator data
- drop terminal-emulator input during replay and snapshot hydration
- restore live output flush to direct `term.write(output)` without coupling it to input attribution
- keep replay and snapshot writes callback-based so replay boundaries close only after xterm has parsed the written data

## Non-Goals

- Do not change server replay or snapshot generation.
- Do not change terminal geometry, theme, fit, scroll, search, image, progress, or link behavior.
- Do not introduce new settings or user-visible controls.
- Do not broaden `TerminalInput` beyond the existing user-intent and terminal-emulator envelope.

## Design

### Terminal Input Helpers

Add small helpers to `src/web/components/terminal/terminal-input.ts` while keeping the current `TerminalInput` union shape:

- `userTerminalInput(data, source)`
- `terminalEmulatorInput(data, source)`
- `isTerminalEmulatorInput(input)`

These helpers mirror the reference Goblin implementation and keep construction sites consistent without adding new fields.

### View-Owned Attribution

Move attribution responsibility fully into `TerminalSessionView`.

Replace `outputWriteDepth` with:

- `pendingCoreUserInput: number`
- `pendingFallbackUserInput: Array<{ data: string; source: TerminalUserInputSource }>`

During `openTerminal()`:

1. Install optional addons and keyboard handlers as today.
2. Try to install xterm core user-input attribution:
   - read `term._core.coreService.onUserInput`
   - if it is callable, subscribe and increment `pendingCoreUserInput` on each event
3. If core attribution is unavailable, install fallback attribution:
   - `term.onKey(({ key }) => queueFallbackUserInput(key, 'keyboard'))`
   - capture `paste` on the xterm host and queue normalized terminal paste text with source `paste`
   - capture `input` on the xterm host and queue inserted text with source `keyboard`
4. Route `term.onData` through `inputFromXtermData(data, 'data')`.
5. Route `term.onBinary` to user intent, matching Goblin's handling for default mouse reports.

`inputFromXtermData()` rules:

- `binary` source is always `user-intent` with source `xterm`
- if `pendingCoreUserInput > 0`, decrement it and return user intent with source `xterm`
- otherwise, consume an exact fallback match and return user intent with that fallback source
- otherwise, return terminal-emulator input with source `data`

Fallback queue entries expire on the next macrotask with `window.setTimeout(..., 0)`, matching the reference behavior and avoiding stale attribution.

### Output Writes

Remove `TerminalSessionView.writeOutput()` and the protocol-reply stripping helper from the attribution path.

`ManagedTerminalSession.flushOutput()` should write live output directly:

```ts
this.view.currentTerminal()?.write(output)
```

Replay and preload hydration should use a local `termWrite(term, data): Promise<void>` helper in `ManagedTerminalSession`:

```ts
function termWrite(term: XTermTerminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    term.write(data, resolve)
  })
}
```

This keeps live output simple while preserving the important callback boundary for replay and snapshot hydration.

### Replay and Snapshot Boundaries

Keep `ManagedTerminalSession.writeInput()` as the replay gate:

- string compatibility input remains user intent
- `TerminalInput` with `origin: 'terminal-emulator'` is dropped while `runtime.isReplaying()` is true
- all other input follows the current authority and write-buffer path

Port the reference Goblin replay generation guard into `terminal-session-state.ts` and `terminal-session-runtime.ts`:

- store `replayGeneration` next to `replayBoundarySeq` and `replayPendingOutput`
- make `beginReplay(replaySeq)` increment and return the current generation
- make `finishReplay(replayGeneration?)` return no events and leave state alone if a stale generation tries to finish a newer replay window
- add `discardReplay(replayGeneration?)` to clear a replay window only when the generation matches

Update all snapshot hydration paths to run inside a replay boundary:

- `replayActiveView()` already begins replay before writing replay output and finishes after callback completion
- `preloadHydratedSnapshot()` already begins replay before writing the hydrated snapshot and finishes after callback completion
- `applyHydratedSnapshotToActiveView()` should also begin replay, reset, write the snapshot with callback completion, and finish or discard the replay window after the callback

Each path must keep the returned replay generation and pass it to `finishReplay()` or `discardReplay()`. This prevents an older async `term.write` callback from closing a newer replay window.

The active-view snapshot path is important because writing serialized xterm state can generate terminal protocol replies. Those replies are render side effects during hydration, not user input.

### Cleanup

`destroyTerminal()` must reset:

- `pendingCoreUserInput`
- `pendingFallbackUserInput`
- the Safari shift-key resolver
- addon and disposable state as it does today

All core and fallback attribution subscriptions must be registered through the existing disposables array.

## Data Flow

Normal user input:

1. xterm emits core `onUserInput` or fallback key/paste/input marker.
2. xterm emits `onData`.
3. `TerminalSessionView` converts it to user-intent `TerminalInput`.
4. `ManagedTerminalSession.writeInput()` forwards it through the existing session write path.

Terminal-emulator protocol reply outside replay:

1. xterm emits unmarked `onData`.
2. `TerminalSessionView` converts it to terminal-emulator `TerminalInput`.
3. `ManagedTerminalSession.writeInput()` forwards it because replay is not active.

Terminal-emulator protocol reply during replay or hydration:

1. replay or snapshot write begins a replay boundary.
2. xterm emits unmarked `onData`.
3. `TerminalSessionView` converts it to terminal-emulator `TerminalInput`.
4. `ManagedTerminalSession.writeInput()` drops it while replay is active.

## Error Handling and Fallbacks

The xterm core user-input service is an internal API. If the service shape changes or is unavailable, the view must fall back to DOM/key attribution instead of failing terminal startup.

If a terminal is destroyed before a replay write callback runs, the implementation should keep the current dispose/current-start guards and use replay generations to avoid closing the wrong replay window.

If a fallback entry does not exactly match an `onData` payload, it is not consumed and the payload is terminal-emulator input. This is intentionally conservative: ambiguous input during replay must not be written to PTY stdin.

## Testing

Update focused terminal tests:

- mock xterm core `coreService.onUserInput`
- add `emitCoreUserData(data)` to the xterm test double
- assert core-attributed user input is forwarded while replay is being written
- assert bare `emitData()` during replay is terminal-emulator input and is dropped
- assert emulator replies outside replay still forward to the PTY
- assert `onBinary` remains user intent
- cover fallback mode by constructing a terminal test double without `coreService.onUserInput`
- cover fallback keyboard and paste attribution
- assert live output flush writes directly to `currentTerminal().write(output)`
- assert `applyHydratedSnapshotToActiveView()` suppresses hydration-generated emulator input through a replay boundary
- assert stale replay write callbacks do not close a newer replay boundary

Run:

- `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"`
- `bun run typecheck`
- `bun run test`

## Risks

- `term._core.coreService.onUserInput` is internal. The fallback path keeps terminal input usable if it disappears, and tests should cover both paths.
- Exact-match fallback attribution may miss complex IME or paste sequences. This is acceptable for replay safety because unmatched input is only dropped during replay; outside replay terminal-emulator input continues to forward.
- Tests that currently treat bare `emitData()` as user input during replay must be updated to use core-attributed data.
- Replay generation adds a small state change, but it is limited to renderer replay bookkeeping and mirrors the reference implementation.

## Success Criteria

- There is no `outputWriteDepth` attribution state in `TerminalSessionView`.
- Live output flush no longer calls `view.writeOutput()`.
- Replay and snapshot writes still wait for xterm write callbacks before finishing replay.
- Stale replay callbacks cannot finish or discard a newer replay boundary.
- During replay/hydration, emulator-origin `onData` is dropped and core/fallback-attributed user input is forwarded.
- Existing terminal behavior outside replay remains compatible with current command, keyboard, binary mouse, paste, and authority-gated write paths.
