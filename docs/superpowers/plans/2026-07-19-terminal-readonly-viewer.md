# Terminal Read-Only Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a live, fully viewable xterm in viewer/unowned attachments while ensuring terminal input never requests takeover and the explicit takeover button remains the only renderer-side viewer acquisition action.

**Architecture:** Decouple xterm view lifecycle and output parsing from controller-only write/resize authority inside `ManagedTerminalSession`. Replace the summary-only full overlay in `TerminalSlot` with a compact status surface, and simplify the authority gate so input cannot acquire control implicitly.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, xterm.js, Tailwind CSS 4 plus terminal component CSS, Vitest, Bun.

## Global Constraints

- Preserve the server-owned `clientId` / `attachmentId` ownership protocol.
- `viewer` and `unowned` projections are read-only until an authoritative server update makes them controller; preserve existing server-side automatic controller selection for unowned attach/reconnect.
- Preserve viewer scrolling, selection, copying, links, and search.
- Do not add dependencies or persistent state.
- Use repository alias imports with explicit `.ts` / `.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Reuse existing semantic theme tokens and UI primitives.
- Keep translations privacy-safe and use sentence case.
- Do not create Git commits or branches unless the user requests them.

---

### Task 1: Make Terminal Writes Controller-Only

**Files:**

- Modify: `src/web/components/terminal/authority-gate.test.ts`
- Modify: `src/web/components/terminal/authority-gate.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`

**Interfaces:**

- Consumes: `TerminalAttachmentSnapshot.role` and `TerminalAuthorityBridge.write()`.
- Produces: `writeWithTerminalAuthority(input): Promise<boolean>` that writes only when the current attachment role is `controller`.
- Produces: `ManagedTerminalSession.writeInput()` that discards viewer/unowned input before activity attribution or buffering.

- [ ] **Step 1: Replace implicit-takeover authority tests with read-only tests**

Update `authority-gate.test.ts` so the bridge contains only `write`, the controller test still expects one write, and viewer/unowned cases expect `false` and no write:

```ts
test.each(['viewer', 'unowned'] as const)('does not write for a %s attachment', async (role) => {
  const bridge = { write: vi.fn(async () => true) }

  await expect(
    writeWithTerminalAuthority({
      data: 'pwd',
      getSessionId: () => 'session-1',
      getAttachment: () =>
        attachment({
          role,
          active: false,
          canTakeover: true,
          controllerStatus: role === 'viewer' ? 'connected' : 'none',
        }),
      bridge,
    }),
  ).resolves.toBe(false)

  expect(bridge.write).not.toHaveBeenCalled()
})
```

Remove `TerminalTakeoverResult`, `takeoverResult()`, `currentSize`, `bridge.takeover`, and `applyTakeover` from this test file.

- [ ] **Step 2: Add a managed-session viewer input regression test**

Replace the existing `promotes viewer input through takeover before writing` test with:

```ts
test('drops viewer input without taking over or reporting input activity', async () => {
  terminalCalls.attach.mockResolvedValueOnce(
    attachResult('session-1', {
      controller: { attachmentId: 'attachment_remote', status: 'connected' },
      canonicalCols: 120,
      canonicalRows: 40,
    }),
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const onInput = vi.fn()
  const session = new ManagedTerminalSession(descriptor, vi.fn(), null, undefined, undefined, undefined, onInput)
  hydrateManagedSession(session)
  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().attachment?.role === 'viewer')

  xtermMocks.terminals[0]!.emitData('blocked')
  session.writeInput('command input')
  await flushTerminalStart()

  expect(terminalCalls.takeover).not.toHaveBeenCalled()
  expect(terminalCalls.write).not.toHaveBeenCalled()
  expect(onInput).not.toHaveBeenCalled()
})
```

Update the earlier mirror resize test so its input assertions also expect neither takeover nor write.

- [ ] **Step 3: Run the focused tests and verify the old behavior fails**

Run:

```bash
bun run test -- src/web/components/terminal/authority-gate.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: viewer/unowned tests fail because the authority gate currently requests takeover and the managed session buffers viewer input.

- [ ] **Step 4: Simplify the authority gate**

Replace `authority-gate.ts` with a controller-only boundary:

```ts
import type { TerminalWriteInput } from '#/shared/terminal.ts'
import type { TerminalAttachmentSnapshot } from '#/web/components/terminal/types.ts'

export interface TerminalAuthorityBridge {
  write(input: TerminalWriteInput): Promise<boolean>
}

export async function writeWithTerminalAuthority(input: {
  data: string
  getSessionId: () => string | null
  getAttachment: () => TerminalAttachmentSnapshot | null | undefined
  bridge: TerminalAuthorityBridge
}): Promise<boolean> {
  const sessionId = input.getSessionId()
  if (!sessionId || input.getAttachment()?.role !== 'controller') return false
  return await input.bridge.write({ sessionId, data: input.data })
}
```

- [ ] **Step 5: Guard and drain managed input by current authority**

In `ManagedTerminalSession.writeInput()`, preserve the replay guard and then require controller authority before extracting data, invoking `onInput`, or buffering:

```ts
writeInput(input: string | TerminalInput): void {
  if (typeof input !== 'string' && isTerminalEmulatorInput(input) && this.runtime.isReplaying()) return
  if (!this.runtime.currentSessionId() || !this.runtime.canResize()) return
  const data = typeof input === 'string' ? input : input.data
  this.onInput?.(this.descriptor)
  this.pendingWriteBuffer += data
  this.scheduleInputFlush()
}
```

In `flushInput()`, clear `pendingWriteBuffer` before checking authority so an ownership change cannot retain stale input:

```ts
private flushInput(): void {
  if (this.disposed) return
  const data = this.pendingWriteBuffer
  this.pendingWriteBuffer = ''
  if (!data || !this.runtime.currentSessionId() || !this.runtime.canResize()) return
  void writeWithTerminalAuthority({
    data,
    getSessionId: () => this.runtime.currentSessionId(),
    getAttachment: () => this.runtime.snapshot().attachment,
    bridge: terminalBridge,
  }).catch(() => {})
}
```

- [ ] **Step 6: Run focused authority tests**

Run the command from Step 3.

Expected: PASS; controller writes still work, and viewer/unowned input neither takes over nor writes.

---

### Task 2: Keep a Live Xterm for Read-Only Attachments

**Files:**

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-session-runtime.test.ts`
- Modify: `src/web/components/terminal/terminal-session-runtime.ts`
- Modify: `src/web/components/terminal/terminal-session-state.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`

**Interfaces:**

- Consumes: existing attach snapshots, output events, ownership events, and canonical dimensions.
- Produces: one xterm instance that survives controller/viewer ownership changes and receives live output in both roles.
- Removes: obsolete `TerminalSnapshot.outputSummary` and output-summary-specific notification granularity.

- [ ] **Step 1: Add failing viewer lifecycle tests**

Add focused cases to `ManagedTerminalSession.test.ts`:

```ts
test('opens and streams output into xterm for an initially hydrated viewer', async () => {
  terminalCalls.attach.mockResolvedValueOnce(
    attachResult('session-1', {
      controller: { attachmentId: 'attachment_remote', status: 'connected' },
      canonicalCols: 120,
      canonicalRows: 40,
      snapshot: 'viewer-screen',
      snapshotSeq: 1,
    }),
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session, {
    role: 'viewer',
    controllerStatus: 'connected',
    canonicalCols: 120,
    canonicalRows: 40,
    snapshot: 'viewer-screen',
    snapshotSeq: 1,
  })

  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')
  const term = xtermMocks.terminals[0]!
  term.write.mockClear()

  session.handleOutput({ sessionId: 'session-1', data: 'live output', seq: 2, processName: 'zsh' })
  await flushTerminalStart()

  expect(term.write).toHaveBeenCalledWith('live output')
  expect(terminalCalls.resize).not.toHaveBeenCalled()
})

test('preserves one xterm while ownership changes', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)
  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')
  const term = xtermMocks.terminals[0]!

  session.handleOwnership({
    sessionId: 'session-1',
    role: 'viewer',
    controllerStatus: 'connected',
    canonicalCols: 120,
    canonicalRows: 40,
  })
  session.handleOwnership({
    sessionId: 'session-1',
    role: 'controller',
    controllerStatus: 'connected',
    canonicalCols: 120,
    canonicalRows: 40,
  })

  expect(xtermMocks.terminals).toHaveLength(1)
  expect(term.dispose).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the lifecycle tests and verify failure**

Run:

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: initially hydrated viewers do not create xterm, and controller-to-viewer ownership currently disposes it.

- [ ] **Step 3: Start xterm for every visible open attachment**

Change `ManagedTerminalSession.attach()`:

```ts
this.view.attach(host)
if (this.view.currentTerminal()) {
  if (this.runtime.canResize()) this.view.fitSoon()
  else this.applyCanonicalSizeToView()
} else {
  this.start()
}
this.flushPendingFocus()
```

The existing `start()` and attach/replay flow remains the single xterm construction path.

- [ ] **Step 4: Stream output to any live xterm and preserve it across ownership changes**

Update `handleOutput()` so view existence, not controller authority, chooses xterm delivery:

```ts
handleOutput(event: TerminalOutputEvent): void {
  const result = this.runtime.handleOutput(event)
  if (result.changed) this.notify()
  if (!result.output) return
  if (this.view.currentTerminal()) {
    this.queueOutput(result.output)
    return
  }
  if (this.backgroundBellScanner.scan(result.output)) this.handleBell()
}
```

Update `handleOwnership()` so loss of control clears pending control mutations and aligns canonical geometry without destroying xterm; gaining control fits the existing xterm:

```ts
handleOwnership(event: TerminalOwnershipViewModel): void {
  const wasController = this.runtime.canResize()
  const changed = this.runtime.handleOwnership(event)
  const pendingCleared = this.runtime.clearTakeoverPending()
  if (changed) {
    const isController = this.runtime.canResize()
    if (!isController) {
      this.cancelResizeFlush()
      this.pendingResize = null
      this.pendingWriteBuffer = ''
      this.applyCanonicalSizeToView()
    } else if (!wasController) {
      this.view.fitSoon()
    }
  }
  if (changed || pendingCleared) this.notify()
}
```

- [ ] **Step 5: Remove the obsolete output summary projection**

Apply these focused deletions:

- remove `outputSummary` from `TerminalSnapshot`;
- remove the output-summary fields and methods from `TerminalSessionState`;
- make `TerminalSessionRuntime.handleOutput()` return `{ changed, output }`;
- make `finishReplay()` return buffered events without appending summaries;
- change `ManagedTerminalSession` notify callback to `() => void` and remove `TerminalNotifyReason` / `scheduleSummaryNotify()`;
- simplify `TerminalSessionRegistry.notifySession(key)` to always update snapshot and worktree listeners;
- remove the output-summary-specific registry test and adjust runtime result assertions.

The target runtime method is:

```ts
handleOutput(event: TerminalOutputEvent): { changed: boolean; output: string | null } {
  if (event.sessionId !== this.ptySessionId) return { changed: false, output: null }
  const changed = this.state.setProcessName(event.processName)
  if (this.state.captureReplayOutput(event)) return { changed, output: null }
  return { changed, output: event.data }
}
```

- [ ] **Step 6: Run the renderer session suite**

Run:

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/terminal-session-runtime.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: PASS; viewer output uses live xterm, ownership does not recreate xterm, and output-summary code has no remaining references.

---

### Task 3: Replace the Full Viewer Overlay with an Ownership Status Surface

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: `snapshot.attachment.role`, `snapshot.takeoverPending`, and existing context `takeover(key)`.
- Produces: `ViewerStatus` compact live-region UI that never hides the terminal host.

- [ ] **Step 1: Rewrite the TerminalSlot viewer test**

Change the existing viewer test assertions to:

```ts
expect(container.textContent).toContain('terminal.mirror-controlled')
const host = container.querySelector('.goblin-terminal-slot__host')
expect(host?.getAttribute('aria-readonly')).toBe('true')
expect(host?.classList.contains('goblin-terminal-slot__host--hidden')).toBe(false)
expect(container.querySelector('.goblin-terminal-slot__viewer-status')).toBeTruthy()
expect(container.querySelector('.goblin-terminal-slot__viewer-overlay')).toBeNull()
expect(container.querySelector('.goblin-terminal-slot__viewer-output')).toBeNull()
```

Keep the existing button click assertion for `takeover('terminal-1')`.

- [ ] **Step 2: Add a viewer drag/drop regression test**

Render `viewerFixture()` with a mocked `writeInput`, dispatch `dragenter`, `dragover`, and `drop` carrying the existing `GOBLIN_FILE_PATHS_MIME` payload, then assert:

```ts
expect(container.querySelector('.goblin-terminal-slot__drop-overlay')).toBeNull()
expect(writeInput).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run the TerminalSlot test and verify failure**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: the host still has the hidden class, the full viewer overlay renders, and viewer drag/drop can write.

- [ ] **Step 4: Keep the host visible and gate drag/drop presentation**

In `TerminalSlot.tsx`:

- render the host with only `goblin-terminal-slot__host`;
- retain `aria-readonly` for any non-controller open session;
- require `isController` in drag-enter, drag-over, drag-leave, and drop callbacks;
- clear a stale `dragOver` value when `isController` becomes false.

The drop handler authority check must be explicit:

```ts
if (!isController || !key) return
```

- [ ] **Step 5: Replace `ViewerOverlay` with `ViewerStatus`**

Use the existing takeover Button and remove process/title/output-summary presentation:

```tsx
function ViewerStatus({ message, takeoverLabel, takeoverKey, onTakeover, takeoverPending }: ViewerStatusProps) {
  return (
    <div className="goblin-terminal-slot__viewer-status">
      <span className="goblin-terminal-slot__viewer-message" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => takeoverKey && onTakeover(takeoverKey)}
        disabled={!takeoverKey || takeoverPending}
      >
        {takeoverPending ? `${takeoverLabel}…` : takeoverLabel}
      </Button>
    </div>
  )
}
```

- [ ] **Step 6: Replace full-overlay CSS with compact responsive status CSS**

Delete `.goblin-terminal-slot__host--hidden` and all `.goblin-terminal-slot__viewer-overlay`, `__viewer-content`, `__viewer-badge`, `__viewer-meta`, `__viewer-title`, `__viewer-process`, and `__viewer-output` rules.

Add:

```css
.goblin-terminal-slot__viewer-status {
  position: absolute;
  right: var(--goblin-terminal-overlay-offset);
  bottom: var(--goblin-terminal-overlay-offset);
  z-index: 2;
  display: flex;
  max-width: calc(100% - 2 * var(--goblin-terminal-overlay-offset));
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-toolbar-border);
  border-radius: var(--goblin-terminal-float-radius);
  background: color-mix(in srgb, var(--color-toolbar) 94%, transparent);
  padding: var(--goblin-terminal-float-padding);
  color: var(--color-muted-foreground);
  font-size: 12px;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.goblin-terminal-slot__viewer-message {
  min-width: 0;
  line-height: 1.35;
}

@media (max-width: 520px) {
  .goblin-terminal-slot__viewer-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

- [ ] **Step 7: Clarify localized read-only ownership copy**

Update the existing keys without adding new dictionary shape:

```ts
// en
'terminal.mirror-controlled': 'Read-only · controlled by another client',
'terminal.unowned': 'Read-only · no client currently controls this terminal',

// zh
'terminal.mirror-controlled': '只读 · 其他客户端正在控制',
'terminal.unowned': '只读 · 当前没有客户端控制此终端',

// ja
'terminal.mirror-controlled': '読み取り専用 · 別のクライアントが操作中です',
'terminal.unowned': '読み取り専用 · 現在操作中のクライアントはありません',

// ko
'terminal.mirror-controlled': '읽기 전용 · 다른 클라이언트에서 제어 중입니다',
'terminal.unowned': '읽기 전용 · 현재 제어 중인 클라이언트가 없습니다',
```

- [ ] **Step 8: Run UI and dictionary tests**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS; the live host stays visible, the status is compact and accessible, viewer drops are inert, and dictionaries remain aligned.

---

### Task 4: Verify the Integrated Read-Only Terminal

**Files:**

- Inspect only: all files modified by Tasks 1–3.

**Interfaces:**

- Consumes: the completed controller-only authority gate, live viewer xterm lifecycle, and compact ownership status.
- Produces: verified behavior with no architecture or type regressions.

- [ ] **Step 1: Check obsolete viewer-summary references**

Run:

```bash
rg -n "outputSummary|host--hidden|viewer-overlay|viewer-output|promotes.*viewer|promotes.*mirror" src/web/components/terminal
```

Expected: no production references remain; tests may retain negative assertions for removed selectors.

- [ ] **Step 2: Run all terminal tests**

Run:

```bash
bun run test -- src/web/components/terminal src/web/terminal.test.ts src/shared/terminal.test.ts src/server/terminal
```

Expected: PASS.

- [ ] **Step 3: Run project verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully.

- [ ] **Step 4: Inspect the final diff for scope and safety**

Run:

```bash
git diff --check
git diff -- docs/superpowers/specs/2026-07-19-terminal-readonly-viewer-design.md docs/superpowers/plans/2026-07-19-terminal-readonly-viewer.md src/web/components/terminal src/shared/i18n
```

Expected: no whitespace errors, no server ownership changes, no dependency changes, no unsupported TypeScript syntax, and no unrelated files modified.

- [ ] **Step 5: Perform manual UI acceptance when a runnable local app is available**

Open the same internal terminal in two clients and verify:

1. both pages show full live output;
2. the viewer can scroll, select, copy, open links, and search;
3. typing, paste, drop, and mouse protocol input do not write or take over;
4. the read-only status remains visible without covering the terminal;
5. explicit takeover reuses the same terminal view and restores input.

If the environment cannot launch a second client safely, report this manual item as unverified rather than inferring success.
