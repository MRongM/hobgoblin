# Terminal Goblin Input Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace output-depth-based xterm input attribution with the reference Goblin user-input attribution model while keeping replay and snapshot hydration safe.

**Architecture:** `TerminalSessionView` owns xterm input attribution through core `onUserInput` or DOM/key fallback markers. `ManagedTerminalSession` owns replay boundaries and writes normal output directly to xterm. `TerminalSessionState` and `TerminalSessionRuntime` track replay generations so stale async write callbacks cannot close newer replay windows.

**Tech Stack:** TypeScript, React renderer-side terminal code, `@xterm/xterm@6.0.0`, Vitest/jsdom, Bun.

**Project Safety:** Commit steps are intentionally omitted because `AGENTS.md` says not to plan or execute git commits or branch operations unless the user explicitly requests them.

---

## File Map

- Modify: `src/web/components/terminal/terminal-input.ts`
  - Add shared input helper functions and exported source aliases.
- Modify: `src/web/components/terminal/terminal-session-state.ts`
  - Add replay generation bookkeeping and `discardReplay()`.
- Modify: `src/web/components/terminal/terminal-session-runtime.ts`
  - Expose replay generation return values and discard API.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Replace `outputWriteDepth` attribution with Goblin-style core/fallback attribution.
  - Remove `writeOutput()` and protocol reply stripping from the attribution path.
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
  - Use `isTerminalEmulatorInput()`, direct live output writes, local callback-based `termWrite()`, and generation-aware replay finishing.
- Modify: `src/web/components/terminal/terminal-session-state.test.ts`
  - Cover stale replay generation behavior.
- Modify: `src/web/components/terminal/terminal-session-runtime.test.ts`
  - Cover runtime generation behavior and summary updates.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Add xterm core/fallback attribution test support and behavior coverage.

---

### Task 1: Add Replay Generation Guard

**Files:**
- Modify: `src/web/components/terminal/terminal-session-state.test.ts`
- Modify: `src/web/components/terminal/terminal-session-runtime.test.ts`
- Modify: `src/web/components/terminal/terminal-session-state.ts`
- Modify: `src/web/components/terminal/terminal-session-runtime.ts`

- [ ] **Step 1: Write failing state tests for replay generations**

In `src/web/components/terminal/terminal-session-state.test.ts`, add these tests after `buffers replay output until replay completes`:

```ts
  test('ignores stale replay finish calls without closing the active replay window', () => {
    const state = new TerminalSessionState()

    const firstGeneration = state.beginReplay(1)
    expect(firstGeneration).toBe(1)
    expect(state.captureReplayOutput({ sessionId: 'session-1', data: 'first-live', seq: 2, processName: 'zsh' })).toBe(
      true,
    )

    const secondGeneration = state.beginReplay(2)
    expect(secondGeneration).toBe(2)
    expect(state.captureReplayOutput({ sessionId: 'session-1', data: 'second-live', seq: 3, processName: 'zsh' })).toBe(
      true,
    )

    expect(state.finishReplay(firstGeneration)).toEqual([])
    expect(state.isReplaying()).toBe(true)
    expect(state.captureReplayOutput({ sessionId: 'session-1', data: 'second-newer', seq: 4, processName: 'zsh' })).toBe(
      true,
    )

    expect(state.finishReplay(secondGeneration)).toEqual([
      { sessionId: 'session-1', data: 'second-live', seq: 3, processName: 'zsh' },
      { sessionId: 'session-1', data: 'second-newer', seq: 4, processName: 'zsh' },
    ])
    expect(state.isReplaying()).toBe(false)
  })

  test('discardReplay only clears the matching replay generation', () => {
    const state = new TerminalSessionState()

    const firstGeneration = state.beginReplay(1)
    const secondGeneration = state.beginReplay(2)

    state.discardReplay(firstGeneration)
    expect(state.isReplaying()).toBe(true)
    expect(state.captureReplayOutput({ sessionId: 'session-1', data: 'live', seq: 3, processName: 'zsh' })).toBe(true)

    state.discardReplay(secondGeneration)
    expect(state.isReplaying()).toBe(false)
    expect(state.captureReplayOutput({ sessionId: 'session-1', data: 'after', seq: 4, processName: 'zsh' })).toBe(false)
  })
```

- [ ] **Step 2: Write failing runtime test for replay generations**

In `src/web/components/terminal/terminal-session-runtime.test.ts`, add this test after `routes output, ownership, replay, and takeover through runtime state`:

```ts
  test('keeps stale replay completions from closing a newer replay window', () => {
    const runtime = new TerminalSessionRuntime()
    runtime.applyAttachResult(
      {
        ok: true,
        sessionId: 'session-1',
        replay: '',
        replaySeq: 0,
        replayTruncated: false,
        processName: 'zsh',
        canonicalTitle: null,
        snapshot: '',
        snapshotSeq: 0,
        controller: { attachmentId: 'attachment_remote', status: 'connected' },
        phase: 'open',
        message: null,
        role: 'viewer',
        controllerStatus: 'connected',
        canonicalCols: 120,
        canonicalRows: 40,
      },
      { cols: 100, rows: 30 },
    )

    const firstGeneration = runtime.beginReplay(1)
    const secondGeneration = runtime.beginReplay(2)

    expect(runtime.handleOutput({ sessionId: 'session-1', data: 'live', seq: 3, processName: 'zsh' })).toEqual({
      changed: false,
      output: null,
      summaryChanged: false,
    })
    expect(runtime.finishReplay(firstGeneration)).toEqual([])
    expect(runtime.isReplaying()).toBe(true)

    expect(runtime.finishReplay(secondGeneration)).toEqual([
      { sessionId: 'session-1', data: 'live', seq: 3, processName: 'zsh' },
    ])
    expect(runtime.isReplaying()).toBe(false)
    expect(runtime.snapshot().outputSummary).toBe('live')
  })
```

- [ ] **Step 3: Run replay state/runtime tests and verify failure**

Run:

```bash
bun run test "src/web/components/terminal/terminal-session-state.test.ts" "src/web/components/terminal/terminal-session-runtime.test.ts"
```

Expected: FAIL because `beginReplay()` returns `void`, `finishReplay()` does not accept a generation, and `discardReplay()` does not exist.

- [ ] **Step 4: Implement generation tracking in `TerminalSessionState`**

In `src/web/components/terminal/terminal-session-state.ts`, replace the replay buffer state definition with:

```ts
  private replayBufferState: {
    replayBoundarySeq: number | null
    replayPendingOutput: TerminalOutputEvent[]
    replayGeneration: number
  } = {
    replayBoundarySeq: null,
    replayPendingOutput: [],
    replayGeneration: 0,
  }
```

Replace the existing replay methods with:

```ts
  beginReplay(replaySeq: number): number {
    this.replayBufferState.replayBoundarySeq = replaySeq
    this.replayBufferState.replayPendingOutput = []
    this.replayBufferState.replayGeneration += 1
    return this.replayBufferState.replayGeneration
  }

  isReplaying(): boolean {
    return this.replayBufferState.replayBoundarySeq !== null
  }

  captureReplayOutput(event: TerminalOutputEvent): boolean {
    if (this.replayBufferState.replayBoundarySeq === null) return false
    this.replayBufferState.replayPendingOutput.push(event)
    return true
  }

  finishReplay(replayGeneration?: number): TerminalOutputEvent[] {
    if (
      replayGeneration !== undefined &&
      this.replayBufferState.replayGeneration !== replayGeneration
    ) {
      return []
    }
    const replaySeq = this.replayBufferState.replayBoundarySeq
    const pendingOutput = this.replayBufferState.replayPendingOutput.splice(0)
    this.replayBufferState.replayBoundarySeq = null
    if (replaySeq === null) return []
    return pendingOutput.filter((event) => event.seq > replaySeq)
  }

  discardReplay(replayGeneration?: number): void {
    if (
      replayGeneration !== undefined &&
      this.replayBufferState.replayGeneration !== replayGeneration
    ) {
      return
    }
    this.replayBufferState.replayBoundarySeq = null
    this.replayBufferState.replayPendingOutput = []
  }
```

Leave `resetTransientState()` clearing `replayBoundarySeq` and `replayPendingOutput`; it does not need to reset `replayGeneration`.

- [ ] **Step 5: Expose generation APIs through `TerminalSessionRuntime`**

In `src/web/components/terminal/terminal-session-runtime.ts`, replace the replay methods with:

```ts
  beginReplay(replaySeq: number): number {
    return this.state.beginReplay(replaySeq)
  }

  finishReplay(replayGeneration?: number): TerminalOutputEvent[] {
    const events = this.state.finishReplay(replayGeneration)
    for (const event of events) this.state.appendOutputSummary(event.data)
    return events
  }

  discardReplay(replayGeneration?: number): void {
    this.state.discardReplay(replayGeneration)
  }

  isReplaying(): boolean {
    return this.state.isReplaying()
  }
```

- [ ] **Step 6: Run replay state/runtime tests and verify pass**

Run:

```bash
bun run test "src/web/components/terminal/terminal-session-state.test.ts" "src/web/components/terminal/terminal-session-runtime.test.ts"
```

Expected: PASS for both files.

---

### Task 2: Add Terminal Input Helpers

**Files:**
- Modify: `src/web/components/terminal/terminal-input.ts`

- [ ] **Step 1: Replace the terminal input type module**

Replace the full contents of `src/web/components/terminal/terminal-input.ts` with:

```ts
export type TerminalUserInputSource = 'keyboard' | 'paste' | 'drop' | 'toolbar' | 'command' | 'xterm'
export type TerminalEmulatorInputSource = 'data'

export type TerminalInput =
  | {
      origin: 'user-intent'
      source: TerminalUserInputSource
      data: string
    }
  | {
      origin: 'terminal-emulator'
      source: TerminalEmulatorInputSource
      data: string
    }

export function userTerminalInput(data: string, source: TerminalUserInputSource): TerminalInput {
  return { origin: 'user-intent', source, data }
}

export function terminalEmulatorInput(data: string, source: TerminalEmulatorInputSource): TerminalInput {
  return { origin: 'terminal-emulator', source, data }
}

export function isTerminalEmulatorInput(input: TerminalInput): boolean {
  return input.origin === 'terminal-emulator'
}
```

- [ ] **Step 2: Run typecheck for helper exports**

Run:

```bash
bun run typecheck
```

Expected at this point: PASS or unrelated existing dirty-worktree failures. If it fails on `terminal-input.ts`, fix only the exported type/helper names shown in the error and rerun this command.

---

### Task 3: Update Test Double and Add Attribution Tests

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add xterm mock support for core and fallback attribution**

Inside the `vi.hoisted(() => { ... })` block in `src/web/components/terminal/ManagedTerminalSession.test.ts`, add this variable after `const progressAddons: any[] = []`:

```ts
  let coreUserInputEnabled = true
```

In `class MockTerminal`, replace the `_core` field with these fields and getter:

```ts
    private readonly charSizeService = { measure: vi.fn() }
    private readonly coreService = {
      onUserInput: vi.fn((cb: () => void) => {
        this.coreUserInputHandlers.push(cb)
        return {
          dispose: vi.fn(
            () => (this.coreUserInputHandlers = this.coreUserInputHandlers.filter((handler) => handler !== cb)),
          ),
        }
      }),
    }
    get _core() {
      return coreUserInputEnabled
        ? { _charSizeService: this.charSizeService, coreService: this.coreService }
        : { _charSizeService: this.charSizeService }
    }
```

Add these private fields next to the existing handler arrays:

```ts
    private coreUserInputHandlers: Array<() => void> = []
    private keyHandlers: Array<(event: { key: string; domEvent: KeyboardEvent }) => void> = []
```

Add this method after `onBinary(...)`:

```ts
    onKey(cb: (event: { key: string; domEvent: KeyboardEvent }) => void) {
      this.keyHandlers.push(cb)
      return { dispose: vi.fn(() => (this.keyHandlers = this.keyHandlers.filter((handler) => handler !== cb))) }
    }
```

Add these emit helpers after `emitData(data: string)`:

```ts
    emitCoreUserData(data: string) {
      for (const handler of this.coreUserInputHandlers) handler()
      this.emitData(data)
    }

    emitKeyData(data: string) {
      const domEvent = new KeyboardEvent('keydown')
      for (const handler of this.keyHandlers) handler({ key: data, domEvent })
      this.emitData(data)
    }

    emitBinary(data: string) {
      for (const handler of this.binaryHandlers) handler(data)
    }

    emitPaste(text: string) {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: (type: string) => (type === 'text/plain' ? text : ''),
        },
      })
      this.textarea?.dispatchEvent(event)
    }

    emitTextInput(data: string) {
      const event = new InputEvent('input', {
        bubbles: true,
        data,
        inputType: 'insertText',
      })
      this.textarea?.dispatchEvent(event)
    }
```

In the object returned from `vi.hoisted`, add:

```ts
    setCoreUserInputEnabled: (enabled: boolean) => {
      coreUserInputEnabled = enabled
    },
```

In `beforeEach`, after clearing addon failures, add:

```ts
  xtermMocks.setCoreUserInputEnabled(true)
```

- [ ] **Step 2: Replace replay input tests with Goblin attribution contract**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, replace the existing test named `forwards user input while replay is being written` with:

```ts
  test('drops bare xterm data while replay is being written', async () => {
    terminalCalls.attach.mockResolvedValueOnce(
      attachResult('session-1', { replay: 'history', replaySeq: 1, snapshot: 'history', snapshotSeq: 1 }),
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushUntil(() => xtermMocks.terminals[0])
    const term = xtermMocks.terminals[0]!
    let finishReplayWrite = () => {}
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      finishReplayWrite = () => callback?.()
    })
    await flushUntil(() => term.write.mock.calls.some((call: unknown[]) => call[0] === 'history'))

    term.emitData('input during replay')
    finishReplayWrite()
    await flushUntil(() => session.snapshot().phase === 'open')
    await flushTerminalStart()

    expect(terminalCalls.write).not.toHaveBeenCalled()
  })

  test('forwards core-attributed user input while replay is being written', async () => {
    terminalCalls.attach.mockResolvedValueOnce(
      attachResult('session-1', { replay: 'history', replaySeq: 1, snapshot: 'history', snapshotSeq: 1 }),
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushUntil(() => xtermMocks.terminals[0])
    const term = xtermMocks.terminals[0]!
    let finishReplayWrite = () => {}
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      finishReplayWrite = () => callback?.()
    })
    await flushUntil(() => term.write.mock.calls.some((call: unknown[]) => call[0] === 'history'))

    term.emitCoreUserData('input during replay')
    finishReplayWrite()
    await flushUntil(() => session.snapshot().phase === 'open')
    await flushTerminalStart()

    expect(terminalCalls.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'input during replay' })
  })
```

- [ ] **Step 3: Replace protocol reply replay expectation**

In the test named `drops terminal protocol replies generated while replay is being written`, replace this expectation:

```ts
    expect(terminalCalls.write.mock.calls.map(([input]: [TerminalWriteInput]) => input.data)).toEqual([
      'input during replay',
    ])
```

with:

```ts
    expect(terminalCalls.write).not.toHaveBeenCalled()
```

The `TerminalWriteInput` import remains used elsewhere in the file.

- [ ] **Step 4: Add fallback and binary attribution tests**

Add these tests after `forwards terminal-emulator replies outside replay`:

```ts
  test('forwards fallback keyboard-attributed data while replay is being written', async () => {
    xtermMocks.setCoreUserInputEnabled(false)
    terminalCalls.attach.mockResolvedValueOnce(
      attachResult('session-1', { replay: 'history', replaySeq: 1, snapshot: 'history', snapshotSeq: 1 }),
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushUntil(() => xtermMocks.terminals[0])
    const term = xtermMocks.terminals[0]!
    let finishReplayWrite = () => {}
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      finishReplayWrite = () => callback?.()
    })
    await flushUntil(() => term.write.mock.calls.some((call: unknown[]) => call[0] === 'history'))

    term.emitKeyData('fallback-key')
    finishReplayWrite()
    await flushUntil(() => session.snapshot().phase === 'open')
    await flushUntil(() => terminalCalls.write.mock.calls.length > 0)

    expect(terminalCalls.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'fallback-key' })
  })

  test('forwards fallback paste-attributed data while replay is being written', async () => {
    xtermMocks.setCoreUserInputEnabled(false)
    terminalCalls.attach.mockResolvedValueOnce(
      attachResult('session-1', { replay: 'history', replaySeq: 1, snapshot: 'history', snapshotSeq: 1 }),
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushUntil(() => xtermMocks.terminals[0])
    const term = xtermMocks.terminals[0]!
    let finishReplayWrite = () => {}
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      finishReplayWrite = () => callback?.()
    })
    await flushUntil(() => term.write.mock.calls.some((call: unknown[]) => call[0] === 'history'))

    term.emitPaste('line one\nline two')
    term.emitData('line one\rline two')
    finishReplayWrite()
    await flushUntil(() => session.snapshot().phase === 'open')
    await flushUntil(() => terminalCalls.write.mock.calls.length > 0)

    expect(terminalCalls.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'line one\rline two' })
  })

  test('forwards binary terminal input while replay is being written', async () => {
    terminalCalls.attach.mockResolvedValueOnce(
      attachResult('session-1', { replay: 'history', replaySeq: 1, snapshot: 'history', snapshotSeq: 1 }),
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushUntil(() => xtermMocks.terminals[0])
    const term = xtermMocks.terminals[0]!
    let finishReplayWrite = () => {}
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      finishReplayWrite = () => callback?.()
    })
    await flushUntil(() => term.write.mock.calls.some((call: unknown[]) => call[0] === 'history'))

    term.emitBinary('\x1b[M !!')
    finishReplayWrite()
    await flushUntil(() => session.snapshot().phase === 'open')
    await flushUntil(() => terminalCalls.write.mock.calls.length > 0)

    expect(terminalCalls.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: '\x1b[M !!' })
  })
```

- [ ] **Step 5: Add active-view hydration suppression test**

After `resets an existing terminal view when hydrate switches to a different session id`, add:

```ts
  test('drops emulator replies produced by active-view snapshot hydration', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.write.mockClear()
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      term.emitData('\x1b[1;1R')
      callback?.()
    })

    session.hydrate({
      sessionId: 'session-remote',
      processName: 'node',
      role: 'viewer',
      controllerStatus: 'connected',
      canonicalCols: 120,
      canonicalRows: 40,
      snapshot: 'remote-screen',
      snapshotSeq: 5,
    })
    await flushTerminalStart()

    expect(term.reset).toHaveBeenCalled()
    expect(term.write).toHaveBeenCalledWith('remote-screen', expect.any(Function))
    expect(terminalCalls.write).not.toHaveBeenCalled()
  })
```

- [ ] **Step 6: Add stale active-view hydration callback test**

After the active-view hydration suppression test, add:

```ts
  test('stale active-view hydration callback does not close a newer replay window', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    const callbacks: Array<() => void> = []
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      if (callback) callbacks.push(callback)
    })

    session.hydrate({
      sessionId: 'session-remote-a',
      processName: 'node',
      role: 'viewer',
      controllerStatus: 'connected',
      canonicalCols: 120,
      canonicalRows: 40,
      snapshot: 'remote-screen-a',
      snapshotSeq: 5,
    })
    session.hydrate({
      sessionId: 'session-remote-b',
      processName: 'node',
      role: 'viewer',
      controllerStatus: 'connected',
      canonicalCols: 120,
      canonicalRows: 40,
      snapshot: 'remote-screen-b',
      snapshotSeq: 6,
    })

    expect(callbacks).toHaveLength(2)
    callbacks[0]!()
    xtermMocks.terminals[0]!.emitData('\x1b[1;1R')
    await flushTerminalStart()
    expect(terminalCalls.write).not.toHaveBeenCalled()

    callbacks[1]!()
    await flushTerminalStart()
    expect(session.currentSessionId()).toBe('session-remote-b')
  })
```

- [ ] **Step 7: Run attribution tests and verify failure**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: FAIL because `TerminalSessionView` still treats bare `onData` as user intent outside `outputWriteDepth`, lacks core/fallback attribution, and `applyHydratedSnapshotToActiveView()` does not open a replay boundary.

---

### Task 4: Implement Goblin-Style Input Attribution in TerminalSessionView

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Update terminal input imports**

In `src/web/components/terminal/terminal-session-view.ts`, replace:

```ts
import type { TerminalInput } from '#/web/components/terminal/terminal-input.ts'
```

with:

```ts
import {
  terminalEmulatorInput,
  userTerminalInput,
  type TerminalInput,
  type TerminalUserInputSource,
} from '#/web/components/terminal/terminal-input.ts'
```

- [ ] **Step 2: Replace output-depth fields with attribution fields**

In `TerminalSessionView`, remove:

```ts
  private outputWriteDepth = 0
```

Add these fields near `safariShiftKeyResolver`:

```ts
  private pendingCoreUserInput = 0
  private pendingFallbackUserInput: Array<{ data: string; source: TerminalUserInputSource }> = []
```

- [ ] **Step 3: Update openTerminal event wiring**

In `openTerminal()`, replace:

```ts
    this.disposables.push(term.onData((data) => this.handleTerminalData(data)))
    this.disposables.push(
      term.onBinary((data) => this.handlers.onInput({ origin: 'user-intent', source: 'xterm', data })),
    )
```

with:

```ts
    const hasCoreUserInputAttribution = this.installCoreUserInputAttribution(term)
    if (!hasCoreUserInputAttribution) this.installFallbackUserInputAttribution(term)
    this.disposables.push(term.onData((data) => this.handlers.onInput(this.inputFromXtermData(data, 'data'))))
    this.disposables.push(term.onBinary((data) => this.handlers.onInput(this.inputFromXtermData(data, 'binary'))))
```

- [ ] **Step 4: Remove `writeOutput()` from the view**

Delete this method from `TerminalSessionView`:

```ts
  writeOutput(data: string, callback?: () => void): void {
    const term = this.term
    if (!term) {
      callback?.()
      return
    }
    this.outputWriteDepth += 1
    term.write(data, () => {
      this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
      callback?.()
    })
  }
```

- [ ] **Step 5: Reset attribution state on destroy**

In `destroyTerminal()`, replace:

```ts
    this.outputWriteDepth = 0
    this.safariShiftKeyResolver.reset()
```

with:

```ts
    this.safariShiftKeyResolver.reset()
    this.pendingCoreUserInput = 0
    this.pendingFallbackUserInput = []
```

- [ ] **Step 6: Use terminal input helpers for keyboard handlers**

In `installKeyboardHandlers()`, replace:

```ts
        onInput({ origin: 'user-intent', source: 'keyboard', data: optionInput })
```

with:

```ts
        onInput(userTerminalInput(optionInput, 'keyboard'))
```

In the same method, replace:

```ts
        onInput({ origin: 'user-intent', source: 'keyboard', data: safariShiftInput })
```

with:

```ts
        onInput(userTerminalInput(safariShiftInput, 'keyboard'))
```

- [ ] **Step 7: Replace `handleTerminalData()` with Goblin attribution helpers**

Delete the full `handleTerminalData(data: string): void` method.

Add these methods where `handleTerminalData()` was:

```ts
  private installCoreUserInputAttribution(term: XTermTerminal): boolean {
    const coreService = xtermCoreUserInputService(term)
    if (!coreService) return false
    this.disposables.push(
      coreService.onUserInput(() => {
        this.pendingCoreUserInput += 1
      }),
    )
    return true
  }

  private installFallbackUserInputAttribution(term: XTermTerminal): void {
    this.disposables.push(term.onKey(({ key }) => this.queueFallbackUserInput(key, 'keyboard')))
    const markPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return
      const text = event.clipboardData?.getData('text/plain')
      if (text) this.queueFallbackUserInput(textForTerminalPaste(text, term.modes.bracketedPasteMode), 'paste')
    }
    const markTextInput = (event: Event) => {
      if (!(event instanceof InputEvent)) return
      if (event.data && event.inputType === 'insertText') this.queueFallbackUserInput(event.data, 'keyboard')
    }
    this.xtermHost.addEventListener('paste', markPaste, true)
    this.xtermHost.addEventListener('input', markTextInput, true)
    this.disposables.push({
      dispose: () => {
        this.xtermHost.removeEventListener('paste', markPaste, true)
        this.xtermHost.removeEventListener('input', markTextInput, true)
      },
    })
  }

  private inputFromXtermData(data: string, source: 'data' | 'binary'): TerminalInput {
    if (source === 'binary') return userTerminalInput(data, 'xterm')
    if (source === 'data' && this.pendingCoreUserInput > 0) {
      this.pendingCoreUserInput -= 1
      return userTerminalInput(data, 'xterm')
    }
    const fallback = source === 'data' ? this.consumeFallbackUserInput(data) : null
    if (fallback) return userTerminalInput(data, fallback.source)
    return terminalEmulatorInput(data, source)
  }

  private queueFallbackUserInput(data: string, source: TerminalUserInputSource): void {
    if (!data) return
    const entry = { data, source }
    this.pendingFallbackUserInput.push(entry)
    window.setTimeout(() => {
      const index = this.pendingFallbackUserInput.indexOf(entry)
      if (index !== -1) this.pendingFallbackUserInput.splice(index, 1)
    }, 0)
  }

  private consumeFallbackUserInput(data: string): { data: string; source: TerminalUserInputSource } | null {
    const index = this.pendingFallbackUserInput.findIndex((entry) => entry.data === data)
    if (index === -1) return null
    const [entry] = this.pendingFallbackUserInput.splice(index, 1)
    return entry ?? null
  }
```

- [ ] **Step 8: Replace protocol-strip helpers with xterm core helper**

At the bottom of `terminal-session-view.ts`, delete:

```ts
const TERMINAL_PROTOCOL_REPLY_PATTERN =
  /(?:\x1b\[\??\d+n)|(?:\x1b\[\??\d+;\d+R)|(?:\x1b\[(?:[?>])?[0-9;]*c)|(?:\x1b\](?:4;\d+|10|11|12);[^\x07\x1b]*(?:\x07|\x1b\\))/g

function stripTerminalProtocolReplies(data: string): string {
  return data.replace(TERMINAL_PROTOCOL_REPLY_PATTERN, '')
}
```

Add this code above `function cancelScheduledAnimationFrame(frame: number): void`:

```ts
interface XtermCoreUserInputService {
  onUserInput: (listener: () => void) => { dispose: () => void }
}

function xtermCoreUserInputService(term: XTermTerminal): XtermCoreUserInputService | null {
  const coreService = (term as unknown as { _core?: { coreService?: { onUserInput?: unknown } } })._core?.coreService
  const onUserInput = coreService?.onUserInput
  if (!coreService || typeof onUserInput !== 'function') return null
  return {
    onUserInput: (listener) => onUserInput.call(coreService, listener) as { dispose: () => void },
  }
}

function textForTerminalPaste(text: string, bracketedPasteMode: boolean): string {
  const normalized = text.replace(/\r?\n/g, '\r')
  return bracketedPasteMode ? `\x1b[200~${normalized}\x1b[201~` : normalized
}
```

- [ ] **Step 9: Run view-focused typecheck through terminal tests**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: still FAIL because `ManagedTerminalSession` still calls `view.writeOutput()` and does not use generation-aware replay finishing.

---

### Task 5: Update ManagedTerminalSession Output and Replay Boundaries

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`

- [ ] **Step 1: Import the emulator helper**

In `src/web/components/terminal/ManagedTerminalSession.ts`, replace:

```ts
import type { TerminalInput } from '#/web/components/terminal/terminal-input.ts'
```

with:

```ts
import { isTerminalEmulatorInput, type TerminalInput } from '#/web/components/terminal/terminal-input.ts'
```

- [ ] **Step 2: Use the helper in `writeInput()`**

Replace:

```ts
    if (typeof input !== 'string' && input.origin === 'terminal-emulator' && this.runtime.isReplaying()) return
```

with:

```ts
    if (typeof input !== 'string' && isTerminalEmulatorInput(input) && this.runtime.isReplaying()) return
```

- [ ] **Step 3: Make `replayActiveView()` generation-aware and direct-write**

Replace the body of `replayActiveView()` with:

```ts
    const replayGeneration = this.runtime.beginReplay(replaySeq)
    try {
      if (replayTruncated) term.reset()
      if (replay) await termWrite(term, replay)
    } finally {
      if (this.currentStart(token, term)) {
        for (const event of this.runtime.finishReplay(replayGeneration)) this.queueOutput(event.data)
      } else {
        this.runtime.discardReplay(replayGeneration)
      }
    }
```

- [ ] **Step 4: Make `preloadHydratedSnapshot()` generation-aware and direct-write**

Replace `preloadHydratedSnapshot()` with:

```ts
  private async preloadHydratedSnapshot(token: number, term: XTermTerminal): Promise<boolean> {
    const hydratedSnapshot = this.hydratedSnapshot
    if (!hydratedSnapshot || !this.currentStart(token, term)) return false
    const replayGeneration = this.runtime.beginReplay(hydratedSnapshot.snapshotSeq)
    try {
      term.reset()
      if (hydratedSnapshot.snapshot) await termWrite(term, hydratedSnapshot.snapshot)
      return this.currentStart(token, term)
    } finally {
      if (this.currentStart(token, term)) {
        this.runtime.finishReplay(replayGeneration)
      } else {
        this.runtime.discardReplay(replayGeneration)
      }
    }
  }
```

- [ ] **Step 5: Make active-view snapshot hydration replay-safe**

Replace `applyHydratedSnapshotToActiveView()` with:

```ts
  private applyHydratedSnapshotToActiveView(): void {
    const term = this.view.currentTerminal()
    const hydratedSnapshot = this.hydratedSnapshot
    if (!term || !hydratedSnapshot) return
    const replayGeneration = this.runtime.beginReplay(hydratedSnapshot.snapshotSeq)
    try {
      term.reset()
      if (!hydratedSnapshot.snapshot) {
        this.finishActiveHydratedSnapshotReplay(term, replayGeneration)
        return
      }
      term.write(hydratedSnapshot.snapshot, () => {
        if (this.disposed) {
          this.runtime.discardReplay(replayGeneration)
          return
        }
        this.finishActiveHydratedSnapshotReplay(term, replayGeneration)
      })
    } catch (err) {
      this.runtime.discardReplay(replayGeneration)
      throw err
    }
  }

  private finishActiveHydratedSnapshotReplay(term: XTermTerminal, replayGeneration: number): void {
    if (this.view.currentTerminal() === term) {
      for (const event of this.runtime.finishReplay(replayGeneration)) this.queueOutput(event.data)
    } else {
      this.runtime.discardReplay(replayGeneration)
    }
  }
```

- [ ] **Step 6: Direct-write live output flush**

Replace the last line of `flushOutput()`:

```ts
    this.view.writeOutput(output)
```

with:

```ts
    this.view.currentTerminal()?.write(output)
```

- [ ] **Step 7: Replace `writeOutputToView()` with local `termWrite()` helper**

Delete:

```ts
  private writeOutputToView(data: string): Promise<void> {
    return new Promise((resolve) => {
      this.view.writeOutput(data, resolve)
    })
  }
```

Add this helper after the class:

```ts
function termWrite(term: XTermTerminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    term.write(data, resolve)
  })
}
```

- [ ] **Step 8: Run terminal session tests and verify pass**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: PASS.

---

### Task 6: Final Verification

**Files:**
- No source edits in this task.

- [ ] **Step 1: Search for removed output-depth attribution**

Run:

```bash
rg -n "outputWriteDepth|writeOutput\\(|stripTerminalProtocolReplies|TERMINAL_PROTOCOL_REPLY_PATTERN" "src/web/components/terminal"
```

Expected: no matches.

- [ ] **Step 2: Search for direct output flush**

Run:

```bash
rg -n "currentTerminal\\(\\)\\?\\.write\\(output\\)|termWrite\\(term, replay\\)|termWrite\\(term, hydratedSnapshot\\.snapshot\\)" "src/web/components/terminal/ManagedTerminalSession.ts"
```

Expected: matches for direct live flush and callback-based replay/hydration writes.

- [ ] **Step 3: Run focused terminal tests**

Run:

```bash
bun run test "src/web/components/terminal/terminal-session-state.test.ts" "src/web/components/terminal/terminal-session-runtime.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 6: Review git diff without reverting unrelated work**

Run:

```bash
git diff -- "src/web/components/terminal/terminal-input.ts" "src/web/components/terminal/terminal-session-state.ts" "src/web/components/terminal/terminal-session-runtime.ts" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.ts" "src/web/components/terminal/terminal-session-state.test.ts" "src/web/components/terminal/terminal-session-runtime.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: diff contains only terminal input attribution, replay generation, direct output flush, and tests described in this plan.

---

## Self-Review Checklist

- Spec coverage: input helpers, view attribution, direct output flush, replay generation, active-view hydration boundary, and verification are all mapped to tasks.
- Type consistency: `TerminalUserInputSource`, `TerminalEmulatorInputSource`, `TerminalInput`, `beginReplay()`, `finishReplay()`, and `discardReplay()` signatures are consistent across state/runtime/view/session snippets.
- Scope control: the plan does not change server replay/snapshot generation, terminal geometry, theme, fit, scroll, search, image, progress, links, settings, or user-visible controls.
