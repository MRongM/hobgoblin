# Internal Terminal tmux Close Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unchecked-by-default option to the single internal-terminal close dialog that safely ends only that terminal's exact Hobgoblin tmux session.

**Architecture:** Retain the deterministic tmux name and working directory on the server-owned terminal session, project only a `tmuxBacked` boolean into renderer summaries, and extend the terminal close mutation with a boolean intent. Checked closes are resolved entirely from server-owned metadata, verify exact name and path through the tmux adapter, and preserve the internal terminal when tmux execution fails.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Bun, Vitest, React 19, Valibot, Hono terminal WebSocket protocol, node-pty, tmux, typed SSH command adapter.

## Global Constraints

- Apply only to closing one internal terminal; bulk close and close-other actions do not gain tmux controls.
- Show the checkbox only when the targeted terminal summary reports `tmuxBacked: true` for a server-retained `hobgoblin-v1-*` identity.
- Default the checkbox to unchecked and reset it whenever a close dialog opens.
- Never derive eligibility from the current local or remote tmux preference.
- The renderer sends only a server terminal session ID and boolean intent; it never chooses a tmux name.
- Validate names with `^hobgoblin-v1-[a-f0-9]{24}$` and match the retained working directory exactly before killing.
- Checked tmux failures leave the internal terminal open; an already-missing tmux session completes the close.
- Local Windows sessions have no tmux identity; SSH sessions remain supported on every renderer host.
- Preserve Node.js strip-only compatibility: no enum, runtime namespace, parameter property, or import alias syntax.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions and keep architecture boundaries green.
- Do not create commits or perform branch operations unless the user explicitly authorizes them.

---

## File Structure

- `src/system/local-terminal.ts`, `src/system/remote-terminal.ts`: expose the deterministic tmux name alongside managed launch invocations.
- `src/system/tmux-cleanup.ts`, `src/system/ssh/commands.ts`: validate and kill one current-protocol tmux session by exact name.
- `src/server/modules/tmux-cleanup.ts`: resolve local/SSH hosts, verify exact name plus path, and classify closed/missing/failed outcomes.
- `src/shared/terminal.ts`: define the renderer-safe tmux eligibility projection, checked-close input, and structured close result.
- `src/server/terminal/terminal-catalog.ts`, `terminal-session-manager.ts`: retain runtime-coherent tmux identity metadata.
- `src/server/terminal/terminal.ts` and terminal facade/host/worker protocol files: orchestrate checked close before deleting the server terminal record.
- `src/web/components/terminal/types.ts`, `TerminalSessionRegistry.ts`: project identity and make single-terminal close awaitable.
- `src/web/components/terminal/TerminalTabs.tsx`: render and reset the confirmation checkbox and report checked failures.
- Four locale dictionaries and tmux documentation: define user-facing copy and document runtime identity use.

---

### Task 1: Exact tmux Name Support in System Adapters

**Files:**

- Modify: `src/system/local-terminal.test.ts`
- Modify: `src/system/local-terminal.ts`
- Modify: `src/system/remote-terminal.test.ts`
- Modify: `src/system/remote-terminal.ts`
- Modify: `src/system/tmux-cleanup.test.ts`
- Modify: `src/system/tmux-cleanup.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/commands.ts`

**Interfaces:**

- Produces: `LocalTerminalInvocation.tmuxSessionName: string`
- Produces: `RemoteTerminalInvocation.tmuxSessionName: string | null`
- Produces: `killLocalTmuxSessionByName(sessionName, options): Promise<TmuxCommandResult>`
- Produces: `isTmuxSessionMissingMessage(message): boolean`
- Produces: remote command `{ type: 'tmuxKillSessionByName'; sessionName: string }`

- [x] **Step 1: Write failing invocation metadata tests**

Add assertions that tmux-enabled local and remote invocations return `hobgoblin-v1-aebf050981ac829e36100020`, while a plain remote invocation returns `null` and a disabled/Windows local invocation remains `null` as today.

```ts
expect(invocation?.tmuxSessionName).toBe('hobgoblin-v1-aebf050981ac829e36100020')
expect(buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET)?.tmuxSessionName).toBeNull()
```

- [x] **Step 2: Run invocation tests and verify RED**

Run: `bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts`

Expected: FAIL because invocation results do not expose `tmuxSessionName`.

- [x] **Step 3: Return the already-computed deterministic name**

Add `tmuxSessionName` to both invocation interfaces. Return the non-null name from the local tmux invocation and return `options.useTmux === true ? buildTmuxSessionName(descriptor) : null` from the remote invocation without recalculating commands in callers.

```ts
export interface RemoteTerminalInvocation {
  command: 'ssh'
  args: string[]
  script: string
  shellCommand: string
  tmuxSessionName: string | null
}
```

- [x] **Step 4: Run invocation tests and verify GREEN**

Run: `bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing exact-name kill tests**

Cover local argument-array execution, invalid/legacy name rejection, missing-session classification, remote script construction, and shell-injection rejection.

```ts
await expect(killLocalTmuxSessionByName(CURRENT_NAME, { run })).resolves.toEqual({ ok: true, message: '' })
expect(run).toHaveBeenCalledWith(['kill-session', '-t', CURRENT_NAME], undefined)
expect(() =>
  buildRemoteCommandInvocation(TARGET, {
    type: 'tmuxKillSessionByName',
    sessionName: 'hobgoblin-v1-bad; touch /tmp/example',
  }),
).toThrow('error.invalid-arguments')
expect(isTmuxSessionMissingMessage("can't find session: example")).toBe(true)
```

- [x] **Step 6: Run adapter tests and verify RED**

Run: `bun run test src/system/tmux-cleanup.test.ts src/system/ssh/commands.test.ts`

Expected: FAIL because exact-name kill APIs and the typed SSH command do not exist.

- [x] **Step 7: Implement validated exact-name execution**

Reuse `isHobgoblinTmuxSessionName` before constructing local args or remote shell. Keep the existing session-ID command unchanged for directory-level cleanup. Export a missing-message predicate covering no server, failed server connection, no sessions, and cannot-find-session responses.

```ts
export async function killLocalTmuxSessionByName(
  sessionName: string,
  options: LocalTmuxCommandOptions = {},
): Promise<TmuxCommandResult> {
  if (!isHobgoblinTmuxSessionName(sessionName)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await (options.run ?? runLocalTmuxCommand)(['kill-session', '-t', sessionName], options.signal)
  return result.ok ? { ok: true, message: result.stderr } : { ok: false, message: result.message }
}
```

- [x] **Step 8: Run all Task 1 tests and verify GREEN**

Run: `bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts src/system/tmux-cleanup.test.ts src/system/ssh/commands.test.ts`

Expected: PASS.

### Task 2: Exact Host-aware tmux Close Orchestration

**Files:**

- Modify: `src/server/modules/tmux-cleanup.test.ts`
- Modify: `src/server/modules/tmux-cleanup.ts`

**Interfaces:**

- Consumes: `killLocalTmuxSessionByName`, `isTmuxSessionMissingMessage`, and remote `tmuxKillSessionByName`
- Produces: `closeAssociatedTmuxSessionByName(input, dependencies?, signal?): Promise<TerminalTmuxCloseResult>`
- Produces: `TerminalTmuxCloseResult = { ok: true; status: 'closed' | 'missing' } | { ok: false; message: string }`

- [x] **Step 1: Write failing local and SSH exact-close tests**

Test that the operation filters by both exact normalized path and exact current-protocol name, kills only the matching name, treats absent and race-disappeared sessions as missing, and preserves command/SSH failures.

```ts
await expect(
  closeAssociatedTmuxSessionByName(
    {
      projectRoot: '/work/repo',
      itemPath: '/work/feature',
      sessionName: FIRST_NAME,
    },
    { platform: 'linux', listLocal, killLocalByName },
  ),
).resolves.toEqual({ ok: true, status: 'closed' })
expect(killLocalByName).toHaveBeenCalledWith(FIRST_NAME, { signal: undefined })
```

- [x] **Step 2: Run the server module test and verify RED**

Run: `bun run test src/server/modules/tmux-cleanup.test.ts`

Expected: FAIL because `closeAssociatedTmuxSessionByName` and `killLocalByName` do not exist.

- [x] **Step 3: Extend the existing host runtime without duplicating resolution**

Add `killName` to the private `TmuxRuntime`, wire it to local exact-name execution or the typed SSH command, and implement exact list filtering with existing `associatedSessions`.

```ts
const session = associatedSessions(listed.sessions, runtime.targetPath).find(
  (candidate) => candidate.sessionName === input.sessionName,
)
if (!session) return { ok: true, status: 'missing' }
const killed = await runtime.killName(input.sessionName)
if (killed.ok) return { ok: true, status: 'closed' }
return isTmuxSessionMissingMessage(killed.message)
  ? { ok: true, status: 'missing' }
  : { ok: false, message: killed.message }
```

- [x] **Step 4: Run Task 2 tests and verify GREEN**

Run: `bun run test src/server/modules/tmux-cleanup.test.ts`

Expected: PASS, including existing directory cleanup tests.

### Task 3: Retain tmux Identity in the Terminal Runtime and Protocol

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/shared/terminal.test.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal-session-manager.test.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Test catalog behavior in: `src/server/terminal/terminal.test.ts`
- Modify: `src/system/ssh/commands.ts`

**Interfaces:**

- Produces: optional `tmuxBacked?: boolean` on `TerminalSessionSummary`, with absence interpreted as false
- Produces: manager ensure input fields `tmuxSessionName?: string` and `tmuxWorkingDirectory?: string`
- Produces: server session fields `tmuxSessionName: string | null` and `tmuxWorkingDirectory: string | null`

- [x] **Step 1: Write failing manager metadata tests**

Create a manager session with exact tmux metadata, assert list projections report only `tmuxBacked: true`, assert `getSession` privately retains the name and working directory, and assert an existing session ignores later preference-derived replacement metadata.

```ts
manager.ensureSession({
  ...baseInput,
  tmuxSessionName: CURRENT_NAME,
  tmuxWorkingDirectory: '/work/feature',
})
expect((await manager.listSessions('/work/repo'))[0]?.tmuxBacked).toBe(true)
```

- [x] **Step 2: Write failing catalog projection tests**

Assert local and remote tmux-enabled creation pass the invocation name/path into `manager.ensureSession`, while plain creation omits both fields. Assert restoration retains the manager's original identity when preferences later change.

- [x] **Step 3: Run manager and catalog tests and verify RED**

Run: `bun run test src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts`

Expected: FAIL because terminal sessions do not retain tmux metadata.

- [x] **Step 4: Add runtime-coherent metadata and shared normalization**

Store normalized nullable fields at new-session creation, include only `tmuxBacked: tmuxSessionName !== null` in `TerminalSessionSummary`, and accept an optional boolean in `TerminalSessionSummarySchema` for reload compatibility. Pass `invocation.tmuxSessionName` plus the canonical terminal working directory from both local and remote catalog paths.

```ts
const tmuxSessionName = input.tmuxSessionName ?? null
const tmuxWorkingDirectory = tmuxSessionName ? (input.tmuxWorkingDirectory ?? null) : null
```

Do not persist these fields outside the in-memory server terminal session.

- [x] **Step 5: Run Task 3 tests and verify GREEN**

Run: `bun run test src/shared/terminal.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts`

Expected: PASS.

### Task 4: Add Checked Close to the Terminal Write Protocol

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/shared/terminal.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/terminal/terminal-facade.ts`
- Modify: `src/server/terminal/terminal-worker-protocol.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`
- Modify: `src/server/terminal/terminal-worker-host.test.ts`
- Modify: `src/server/terminal/terminal-worker-runtime.test.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/renderer-terminal-bridge.ts`
- Modify: `src/web/terminal.ts`
- Modify: `src/web/terminal.test.ts`
- Modify: `src/web/stores/repos/test-utils.ts`

**Interfaces:**

- Produces: `TerminalSessionInput = { sessionId: string; closeTmuxSession?: boolean }`
- Produces: `TerminalCloseResult = { ok: true } | { ok: false; message: string }`
- Changes: terminal socket/worker/renderer `close` output from `boolean` to `TerminalCloseResult`

- [x] **Step 1: Write failing shared protocol tests**

Assert normalization accepts absent/boolean `closeTmuxSession`, rejects non-booleans, and accepts structured close response payload typing.

```ts
expect(
  normalizeTerminalClientMessage({
    type: 'request',
    requestId: 'req_12345678',
    action: 'close',
    input: { sessionId: VALID_SESSION_ID, closeTmuxSession: true },
  }),
).not.toBeNull()
```

- [x] **Step 2: Write failing server close tests**

Use an injectable `closeTmuxSession` dependency. Cover unchecked no-op, checked exact metadata forwarding, already-missing success, tmux failure preserving `manager.getSession`, missing metadata rejection, and client inability to supply a name.

```ts
const result = await closeServerTerminal(
  CLIENT_ID,
  {
    sessionId,
    closeTmuxSession: true,
  },
  { closeTmuxSession },
)
expect(closeTmuxSession).toHaveBeenCalledWith({
  projectRoot: '/work/repo',
  itemPath: '/work/feature',
  sessionName: CURRENT_NAME,
})
expect(result).toEqual({ ok: true })
```

- [x] **Step 3: Run protocol/server tests and verify RED**

Run: `bun run test src/shared/terminal.test.ts src/server/terminal/terminal.test.ts`

Expected: FAIL because close input/result and server orchestration are not implemented.

- [x] **Step 4: Implement async fail-closed server orchestration**

Validate the optional boolean even for direct function callers. Resolve server-owned metadata before awaiting. For checked requests, call `closeAssociatedTmuxSessionByName`; return its failure unchanged and do not call `manager.closeOwnedSession`. For success/missing, close any remaining manager record and publish existing invalidation.

```ts
export type TerminalCloseResult = { ok: true } | { ok: false; message: string }

export async function closeServerTerminal(
  clientId: string,
  input: TerminalSessionInput,
  dependencies: TerminalCloseDependencies = {},
): Promise<TerminalCloseResult> {
  // validation, exact server metadata lookup, optional tmux close, internal close
}
```

- [x] **Step 5: Thread the result through worker and renderer bridges**

Replace only the `close` output type in `TerminalHost`, `TerminalFacade`, `TerminalWorkerResponseOutputs`, `TerminalWorkerHost`, `RendererTerminalBridge`, and the socket overload. Keep write/resize/reorder mutation outputs as booleans.

- [x] **Step 6: Run worker and bridge tests and verify GREEN**

Run: `bun run test src/server/terminal/terminal.test.ts src/server/terminal/terminal-worker-host.test.ts src/server/terminal/terminal-worker-runtime.test.ts src/web/terminal.test.ts`

Expected: PASS.

### Task 5: Renderer Checkbox and Awaitable Single-terminal Close

**Files:**

- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
- Modify: affected panel/toolbar tests when their context callback type changes

**Interfaces:**

- Produces: `TerminalSessionSummary.tmuxBacked?: boolean`
- Produces: `TerminalCloseOptions = { closeTmuxSession?: boolean }`
- Changes: `closeTerminalAndDismissDetailIfLast(key, scope, options?): Promise<TerminalCloseResult>`
- Changes: `TerminalTabs.onClose(key, options?): void | Promise<TerminalCloseResult>`

- [x] **Step 1: Write failing registry projection and close tests**

Assert reconciliation projects `tmuxBacked` into the worktree summary. Preserve the current immediate normal close and its existing `{ sessionId }` disposal call. Assert checked close sends `{ sessionId, closeTmuxSession: true }`, successful results remove the local session without a duplicate close, and failures retain it.

```ts
terminalCalls.close.mockResolvedValue({ ok: false, message: 'error.tmux-command-failed' })
await expect(
  registry.closeTerminalAndDismissDetailIfLast(key, scope, {
    closeTmuxSession: true,
  }),
).resolves.toEqual({ ok: false, message: 'error.tmux-command-failed' })
expect(registry.worktreeSnapshot(worktreeKey).sessions).toHaveLength(1)
```

- [x] **Step 2: Run registry tests and verify RED**

Run: `bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts`

Expected: FAIL because summaries and close callbacks lack tmux metadata/options.

- [x] **Step 3: Implement awaitable registry close**

Copy `tmuxBacked === true` into `TerminalDescriptor` and renderer summaries. Keep unchecked close on the existing synchronous `closeTerminal` path. For checked close only, await `terminalBridge.close`, remove the local session with `{ closeSession: false }` after `{ ok: true }`, and leave it unchanged on `{ ok: false }`. Convert transport rejection into `{ ok: false, message: 'error.tmux-command-failed' }` so the dialog never leaks an unhandled promise rejection.

- [x] **Step 4: Write failing dialog tests**

Cover hidden checkbox for plain sessions, unchecked default for tmux sessions, checked intent, cancel/reopen reset, failure toast with retained dialog/tab, and unchanged bulk dialogs.

```ts
expect(document.querySelector('[role="checkbox"]')).toHaveAttribute('data-state', 'unchecked')
act(() => document.querySelector<HTMLElement>('[role="checkbox"]')?.click())
await act(async () => clickElementByText('terminal.close-confirm-confirm'))
expect(onClose).toHaveBeenCalledWith('t1', { closeTmuxSession: true })
```

- [x] **Step 5: Run dialog tests and verify RED**

Run: `bun run test src/web/components/terminal/TerminalTabs.test.tsx`

Expected: FAIL because the dialog has no tmux checkbox or async failure path.

- [x] **Step 6: Reuse `ConfirmCheckbox` in the existing dialog**

Store `closeTmuxSession` in `TerminalTabs`, reset it before every single-close request and on cancel, and render the checkbox plus warning only when `pendingCloseSession.tmuxBacked` is true. Keep `confirmClose` non-`async`: finish synchronously when `onClose` returns `void`, and return a chained promise only for checked close. This preserves the current unchecked interaction while allowing `ConfirmDialog` to show pending state for checked execution. Close/refocus only on success and show a translated destructive error toast on checked failure.

- [x] **Step 7: Update the three terminal panel adapters**

Return the registry promise from the branch detail, branch workspace, and plain workspace `handleCloseTerminal` callbacks. Do not add the option to context-menu scope close or any bulk action.

- [x] **Step 8: Run Task 5 tests and verify GREEN**

Run: `bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalTabs.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`

Expected: PASS.

### Task 6: Copy, Documentation, and Full Verification

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: locale consistency tests if snapshots require it
- Modify: `CONTEXT.md`
- Modify: `docs/terminal-tmux-protocol.md`
- Modify: `docs/superpowers/specs/2026-07-23-terminal-tmux-close-option-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-terminal-tmux-close-option.md`

**Interfaces:**

- Produces locale keys: `terminal.close-tmux-session`, `terminal.close-tmux-session-hint`, `terminal.close-tmux-session-failed`

- [x] **Step 1: Add consistent locale copy**

Use concise destructive copy. Chinese must use “内部终端” and `tmux session`, for example:

```ts
'terminal.close-tmux-session': '同时关闭 tmux session',
'terminal.close-tmux-session-hint': '这会结束其中运行的进程，并断开连接到该 session 的其他客户端。',
'terminal.close-tmux-session-failed': '无法关闭 tmux session',
```

- [x] **Step 2: Document the runtime binding and exact close behavior**

Add a `Tmux-backed internal terminal` term to `CONTEXT.md`. Extend `docs/terminal-tmux-protocol.md` with a runtime-binding section stating that the server retains the computed name and initial working directory for the in-memory terminal lifetime and may use them to close exactly one session after explicit confirmation.

- [x] **Step 3: Run focused feature tests**

Run all tests named in Tasks 1–5.

Expected: PASS with zero failures.

- [x] **Step 4: Run repository type and architecture checks**

Run: `bun run typecheck`

Expected: all TypeScript configurations and architecture preflight pass.

Run: `bun run check:architecture`

Expected: PASS with no main/web/server/shared boundary violations.

- [x] **Step 5: Run the full test suite**

Run: `bun run test`

Expected: PASS with zero failures.

- [x] **Step 6: Check formatting and diff hygiene**

Run: `bun run format:check`

Expected: task files pass; if repository baseline files fail, format only task-owned files and report the pre-existing baseline separately.

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 7: Review final diff without committing**

Run: `git status --short` and `git diff --stat`.

Expected: only feature, tests, and documentation files are changed; no commit, push, merge, reset, or branch operation is performed.
