# Inline Commit And Merge Conflict AI Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository instructions override the generic plan template: do not create git commits unless the user explicitly asks.

**Goal:** Make branch `Commit` open an inline branch-row form, and make merge conflicts offer provider-specific AI handoff buttons that prefill the worktree terminal input without executing anything.

**Architecture:** Keep commit and merge in the existing branch-write action flow. Add structured merge-conflict classification in shared/system layers, expose a narrow terminal external-input fill bridge, and keep AI handoff UI inside the existing merge dialog error area.

**Tech Stack:** React, Zustand, Vitest/jsdom, Bun, local/SSH Git backend, existing terminal session registry and external input.

---

## File Map

- Modify `src/shared/git-types.ts`: extend `ExecResult` with optional `reason`.
- Create `src/shared/git-conflicts.ts`: shared unmerged-status detection.
- Create `src/shared/git-conflicts.test.ts`: focused tests for Git porcelain conflict codes.
- Modify `src/system/git/merge.ts`: classify local merge failures with status inspection.
- Modify `src/system/git/merge.test.ts`: cover local conflict and non-conflict failure classification.
- Modify `src/system/ssh/git.ts`: classify remote merge failures with existing `gitStatus`.
- Modify `src/system/ssh/git.test.ts`: cover remote conflict and non-conflict merge failures.
- Create `src/web/components/terminal/terminal-external-input-fill.ts`: worktree-keyed fill handler registry.
- Modify `src/web/components/terminal/terminal-session-command-bridge.ts`: expose `fillExternalInput`.
- Modify `src/web/components/terminal/TerminalSessionRegistry.ts`: delegate `fillExternalInput`.
- Modify `src/web/components/terminal/TerminalSessionProvider.tsx`: publish `fillExternalInput` on the command bridge.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: register fill handler when the external input is available.
- Modify `src/web/components/terminal/TerminalSlot.test.tsx`: assert fill updates draft and does not call `writeInput`.
- Create `src/web/components/branch-list/useCommitMessageGeneration.ts`: extract provider probing and message generation behavior.
- Create `src/web/components/branch-list/InlineCommitForm.tsx`: inline commit form.
- Modify `src/web/components/branch-list/BranchWriteDialogs.tsx`: remove/stop using global commit dialog, preserve checkout/merge/create/remote dialogs, update merge result handling.
- Modify `src/web/hooks/useBranchWriteActions.tsx`: open inline commit state, return `inlinePanel`, return merge `ExecResult`.
- Modify `src/web/hooks/useBranchActionItems.ts`: include `inlinePanel` in `BranchActionItemGroups`.
- Modify `src/web/components/branch-list/BranchRow.tsx`: render action controls and inline panel in-row.
- Modify `src/web/components/BranchActionsMenu.tsx`: keep dropdown presentational and reusable for row action rendering.
- Create `src/web/hooks/useMergeConflictAiActions.ts`: provider availability, terminal ensure/select, command prefill.
- Create `src/web/hooks/useMergeConflictAiActions.test.tsx`: verify prefill behavior and disabled state.
- Modify `src/web/components/branch-list/BranchWriteDialogs.test.tsx`: update commit tests to `InlineCommitForm`, add merge conflict AI button tests.
- Modify `src/web/components/branch-list/BranchRow.test.tsx`: cover inline panel placement.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`: add concise copy for AI handoff buttons and disabled/error states while preserving existing dirty changes.

## Task 1: Add Shared Merge Conflict Types And Helpers

**Files:**
- Modify: `src/shared/git-types.ts`
- Create: `src/shared/git-conflicts.ts`
- Create: `src/shared/git-conflicts.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/shared/git-conflicts.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { hasUnmergedStatusEntries, isUnmergedStatusEntry } from '#/shared/git-conflicts.ts'

describe('git conflict status helpers', () => {
  test.each([
    ['DD'],
    ['AU'],
    ['UD'],
    ['UA'],
    ['DU'],
    ['AA'],
    ['UU'],
  ])('treats %s as unmerged', (code) => {
    expect(isUnmergedStatusEntry({ x: code[0]!, y: code[1]! })).toBe(true)
  })

  test.each([
    [' M'],
    ['M '],
    ['A '],
    ['D '],
    ['??'],
    ['R '],
  ])('does not treat %s as unmerged', (code) => {
    expect(isUnmergedStatusEntry({ x: code[0]!, y: code[1]! })).toBe(false)
  })

  test('detects any unmerged entry in a status list', () => {
    expect(
      hasUnmergedStatusEntries([
        { x: ' ', y: 'M' },
        { x: 'U', y: 'U' },
      ]),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
bun run test src/shared/git-conflicts.test.ts
```

Expected: fail because `src/shared/git-conflicts.ts` does not exist.

- [ ] **Step 3: Extend `ExecResult` and implement helper**

Modify `src/shared/git-types.ts`:

```ts
export type GitFailureReason = 'merge-conflict'

export interface ExecResult {
  ok: boolean
  message: string
  reason?: GitFailureReason
}
```

Create `src/shared/git-conflicts.ts`:

```ts
import type { StatusEntry } from '#/shared/git-types.ts'

const UNMERGED_STATUS_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export function isUnmergedStatusEntry(entry: Pick<StatusEntry, 'x' | 'y'>): boolean {
  return UNMERGED_STATUS_CODES.has(`${entry.x}${entry.y}`)
}

export function hasUnmergedStatusEntries(entries: Array<Pick<StatusEntry, 'x' | 'y'>>): boolean {
  return entries.some(isUnmergedStatusEntry)
}
```

- [ ] **Step 4: Run the helper tests and typecheck the shared change**

Run:

```bash
bun run test src/shared/git-conflicts.test.ts
bun run typecheck
```

Expected: helper tests pass; typecheck passes.

## Task 2: Classify Local And Remote Merge Conflicts

**Files:**
- Modify: `src/system/git/merge.ts`
- Modify: `src/system/git/merge.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Add failing local merge tests**

Modify `src/system/git/merge.test.ts` so the helper mock exposes both `gitResultWithOptions` and `git`:

```ts
const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: vi.fn((cwd: string, args: string[], opts: unknown) => gitMock(cwd, args, opts)),
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})
```

Add tests:

```ts
test('marks failed merge as merge-conflict when status has unmerged entries', async () => {
  gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'CONFLICT (content)' })
  gitMock.mockResolvedValueOnce('UU src/app.ts\u0000')

  const result = await mergeBranch('/repo/worktree', 'main')

  expect(result).toEqual({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })
  expect(gitMock).toHaveBeenCalledWith('/repo/worktree', ['status', '--porcelain', '-z'], { signal: undefined })
})

test('does not mark failed merge as conflict when status has no unmerged entries', async () => {
  gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'fatal: not something we can merge' })
  gitMock.mockResolvedValueOnce(' M src/app.ts\u0000')

  const result = await mergeBranch('/repo/worktree', 'missing')

  expect(result).toEqual({ ok: false, message: 'fatal: not something we can merge' })
})
```

- [ ] **Step 2: Run local merge tests and verify they fail**

Run:

```bash
bun run test src/system/git/merge.test.ts
```

Expected: fail because `mergeBranch` does not inspect status.

- [ ] **Step 3: Implement local merge classification**

Modify `src/system/git/merge.ts`:

```ts
import { isSafeBranchName } from '#/shared/refnames.ts'
import { git, gitResultWithOptions } from '#/system/git/helper.ts'
import { parseStatus } from '#/system/git/parsers.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import type { ExecResult } from '#/shared/git-types.ts'

/**
 * Merge the given local branch into the current branch of the worktree at cwd.
 * Runs `git merge -- <branch>`. On conflict the caller receives the git stderr.
 */
export async function mergeBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await gitResultWithOptions(cwd, { signal }, 'merge', '--', branch)
  if (result.ok || signal?.aborted) return result
  return await withMergeConflictReason(cwd, result, signal)
}

async function withMergeConflictReason(
  cwd: string,
  result: ExecResult,
  signal?: AbortSignal,
): Promise<ExecResult> {
  try {
    const status = await git(cwd, ['status', '--porcelain', '-z'], { signal })
    if (signal?.aborted) return result
    return hasUnmergedStatusEntries(parseStatus(status)) ? { ...result, reason: 'merge-conflict' } : result
  } catch {
    return result
  }
}
```

- [ ] **Step 4: Add failing remote merge tests**

In `src/system/ssh/git.test.ts`, add near the existing `mergeRemoteBranch` tests:

```ts
test('mergeRemoteBranch marks failed merge as merge-conflict when remote status has unmerged entries', async () => {
  const run = vi.fn(async (command: { type: string }) => {
    switch (command.type) {
      case 'gitWorktreeList':
        return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
      case 'gitMerge':
        return { ok: false, stdout: '', stderr: 'CONFLICT (content)', message: 'CONFLICT (content)' }
      case 'gitStatus':
        return okRemoteResult('UU src/app.ts\u0000')
      default:
        return okRemoteResult('')
    }
  })

  const result = await mergeRemoteBranch(TARGET, '/srv/repo', 'feature/test', { run: run as any })

  expect(result).toEqual({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })
  expect(run).toHaveBeenCalledWith(
    { type: 'gitStatus', path: '/srv/repo' },
    TARGET,
    { signal: undefined },
  )
})

test('mergeRemoteBranch keeps non-conflict merge failures unclassified', async () => {
  const run = vi.fn(async (command: { type: string }) => {
    switch (command.type) {
      case 'gitWorktreeList':
        return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
      case 'gitMerge':
        return { ok: false, stdout: '', stderr: 'fatal: bad revision', message: 'fatal: bad revision' }
      case 'gitStatus':
        return okRemoteResult(' M src/app.ts\u0000')
      default:
        return okRemoteResult('')
    }
  })

  const result = await mergeRemoteBranch(TARGET, '/srv/repo', 'feature/test', { run: run as any })

  expect(result).toEqual({ ok: false, message: 'fatal: bad revision' })
})
```

- [ ] **Step 5: Run remote merge tests and verify they fail**

Run:

```bash
bun run test src/system/ssh/git.test.ts -- -t "mergeRemoteBranch"
```

Expected: fail because `mergeRemoteBranch` does not inspect remote status after failed merge.

- [ ] **Step 6: Implement remote merge classification**

Modify imports in `src/system/ssh/git.ts`:

```ts
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
```

Modify `mergeRemoteBranch`:

```ts
  const result = await run(
    { type: 'gitMerge', path: known.path, branch },
    target,
    { signal: options.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  const execResult = remoteExecResult(result)
  if (execResult.ok || options.signal?.aborted) return execResult
  const status = await run({ type: 'gitStatus', path: known.path }, target, { signal: options.signal })
  if (options.signal?.aborted || !status.ok) return execResult
  return hasUnmergedStatusEntries(parseStatus(status.stdout))
    ? { ...execResult, reason: 'merge-conflict' }
    : execResult
```

- [ ] **Step 7: Run merge classification tests**

Run:

```bash
bun run test src/shared/git-conflicts.test.ts src/system/git/merge.test.ts
bun run test src/system/ssh/git.test.ts -- -t "mergeRemoteBranch"
```

Expected: all pass.

## Task 3: Expose A Safe Terminal External Input Fill Bridge

**Files:**
- Create: `src/web/components/terminal/terminal-external-input-fill.ts`
- Modify: `src/web/components/terminal/terminal-session-command-bridge.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Add failing tests for external input fill**

In `src/web/components/terminal/TerminalSlot.test.tsx`, add a test near existing external input tests:

```ts
import { fillTerminalExternalInput } from '#/web/components/terminal/terminal-external-input-fill.ts'
```

Add:

```ts
test('fills terminal external input without writing to the PTY', async () => {
  const writeInput = vi.fn()
  const context = terminalContext({ writeInput })
  renderTerminalSlot({
    context,
    settings: { terminalExternalInputEnabled: true },
  })
  await flush()

  const filled = fillTerminalExternalInput('/tmp/repo\u0000/tmp/worktree', 'codex exec "resolve conflicts"')

  expect(filled).toBe(true)
  expect(textarea('.goblin-terminal-external-input__control').value).toBe('codex exec "resolve conflicts"')
  expect(writeInput).not.toHaveBeenCalled()
})

test('does not register external input fill when external input is disabled', async () => {
  const writeInput = vi.fn()
  const context = terminalContext({ writeInput })
  renderTerminalSlot({
    context,
    settings: { terminalExternalInputEnabled: false },
  })
  await flush()

  expect(fillTerminalExternalInput('/tmp/repo\u0000/tmp/worktree', 'codex exec')).toBe(false)
  expect(writeInput).not.toHaveBeenCalled()
})
```

Use the existing `controllerFixture()`, `terminalContext(...)`, and `setInputValue(...)` helpers from `TerminalSlot.test.tsx`. The new test should follow the same render pattern used by `renders external input when enabled for writable controller sessions`: create a container/root, set `runtimeSettingsMocks.terminalExternalInputEnabled = true`, render `TerminalSlot` inside `TerminalSessionContext.Provider` and `TerminalSessionReadContext.Provider`, then query `.goblin-terminal-external-input__control`.

- [ ] **Step 2: Run terminal slot tests and verify they fail**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx -- -t "external input"
```

Expected: fail because `terminal-external-input-fill.ts` does not exist.

- [ ] **Step 3: Create the fill handler registry**

Create `src/web/components/terminal/terminal-external-input-fill.ts`:

```ts
type TerminalExternalInputFillHandler = (value: string) => boolean

const handlers = new Map<string, TerminalExternalInputFillHandler>()

export function setTerminalExternalInputFillHandler(
  worktreeTerminalKey: string,
  handler: TerminalExternalInputFillHandler,
): () => void {
  handlers.set(worktreeTerminalKey, handler)
  return () => {
    if (handlers.get(worktreeTerminalKey) === handler) handlers.delete(worktreeTerminalKey)
  }
}

export function fillTerminalExternalInput(worktreeTerminalKey: string, value: string): boolean {
  return handlers.get(worktreeTerminalKey)?.(value) ?? false
}
```

- [ ] **Step 4: Register fill handler from `TerminalSlot`**

Modify `src/web/components/terminal/TerminalSlot.tsx` imports:

```ts
import { setTerminalExternalInputFillHandler } from '#/web/components/terminal/terminal-external-input-fill.ts'
```

Add after `fillExternalInput`:

```ts
  useEffect(() => {
    if (!showExternalInput) return
    return setTerminalExternalInputFillHandler(terminalWorktreeKey, (value) => {
      fillExternalInput(value)
      return true
    })
  }, [fillExternalInput, showExternalInput, terminalWorktreeKey])
```

- [ ] **Step 5: Expose fill through command bridge**

Modify `src/web/components/terminal/terminal-session-command-bridge.ts`:

```ts
interface TerminalSessionCommandBridge {
  worktreeSnapshot: (worktreeTerminalKey: string) => WorktreeTerminalSnapshot
  createTerminal: (base: TerminalSessionBase) => Promise<string>
  selectTerminal: (worktreeTerminalKey: string, key: string) => void
  fillExternalInput: (worktreeTerminalKey: string, value: string) => boolean
}
```

Modify `src/web/components/terminal/TerminalSessionRegistry.ts`:

```ts
import { fillTerminalExternalInput } from '#/web/components/terminal/terminal-external-input-fill.ts'
```

Add public method:

```ts
  fillExternalInput = (worktreeTerminalKey: string, value: string): boolean => {
    return fillTerminalExternalInput(worktreeTerminalKey, value)
  }
```

Modify `src/web/components/terminal/TerminalSessionProvider.tsx` where `setTerminalSessionCommandBridge` is called:

```ts
    setTerminalSessionCommandBridge({
      worktreeSnapshot: registry.worktreeSnapshot,
      createTerminal: registry.createTerminal,
      selectTerminal: registry.selectTerminal,
      fillExternalInput: registry.fillExternalInput,
    })
```

- [ ] **Step 6: Run terminal fill tests**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx -- -t "external input"
bun run test src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: tests pass. Update every `TerminalSessionCommandBridge` object literal in `TerminalSessionProvider.test.tsx` to include `fillExternalInput: vi.fn(() => false)` when the typecheck requires it.

## Task 4: Build Merge Conflict AI Command And Handoff Hook

**Files:**
- Create: `src/web/hooks/useMergeConflictAiActions.ts`
- Create: `src/web/hooks/useMergeConflictAiActions.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Write failing hook tests**

Create `src/web/hooks/useMergeConflictAiActions.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  bridge: {
    worktreeSnapshot: vi.fn(),
    createTerminal: vi.fn(),
    selectTerminal: vi.fn(),
    fillExternalInput: vi.fn(),
  },
  showRepoBranchDetailTab: vi.fn(),
  setDetailCollapsed: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
}))

vi.mock('#/web/components/terminal/terminal-session-command-bridge.ts', () => ({
  readTerminalSessionCommandBridge: () => mocks.bridge,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
  useRuntimeTerminalSettings: () => ({ terminalExternalInputEnabled: true }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: true, claude: true })
  mocks.bridge.worktreeSnapshot.mockReturnValue({ count: 0, selectedDescriptor: null, sessions: [], worktreeTerminalKey: '/repo\u0000/worktree' })
  mocks.bridge.createTerminal.mockResolvedValue('/repo\u0000/worktree\u0000terminal-1')
  mocks.bridge.fillExternalInput.mockReturnValue(true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

describe('useMergeConflictAiActions', () => {
  test('creates a worktree terminal and fills external input without executing', async () => {
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'codex')!.onSelect()
    })

    expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
      repoRoot: '/repo',
      branch: 'feature/conflict',
      worktreePath: '/worktree',
    })
    expect(mocks.bridge.fillExternalInput).toHaveBeenCalledWith('/repo\u0000/worktree', expect.stringContaining('codex exec'))
    expect(mocks.bridge.fillExternalInput.mock.calls[0]![1]).not.toContain('\r')
  })

  test('uses the selected terminal when one already exists', async () => {
    mocks.bridge.worktreeSnapshot.mockReturnValue({
      count: 1,
      selectedDescriptor: { key: '/repo\u0000/worktree\u0000terminal-1' },
      sessions: [{ key: '/repo\u0000/worktree\u0000terminal-1' }],
      worktreeTerminalKey: '/repo\u0000/worktree',
    })
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'claude')!.onSelect()
    })

    expect(mocks.bridge.createTerminal).not.toHaveBeenCalled()
    expect(mocks.bridge.selectTerminal).toHaveBeenCalledWith('/repo\u0000/worktree', '/repo\u0000/worktree\u0000terminal-1')
    expect(mocks.bridge.fillExternalInput).toHaveBeenCalledWith('/repo\u0000/worktree', expect.stringContaining('claude --print'))
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useMergeConflictAiActions>) => void }) {
  const value = useMergeConflictAiActions({
    repoId: '/repo',
    branch: 'feature/conflict',
    worktreePath: '/worktree',
    navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
    setDetailCollapsed: mocks.setDetailCollapsed,
  })
  onReady(value)
  return null
}
```

- [ ] **Step 2: Run hook tests and verify they fail**

Run:

```bash
bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
```

Expected: fail because the hook does not exist.

- [ ] **Step 3: Implement AI command builder and hook**

Create `src/web/hooks/useMergeConflictAiActions.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'
import { COMMIT_MESSAGE_PROVIDERS, type CommitMessageProvider, type CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import { getCommitMessageProviders } from '#/web/repo-client.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { readTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
import { useT } from '#/web/stores/i18n.ts'

interface MergeConflictAiActionsInput {
  repoId: string
  branch: string
  worktreePath: string
  navigation: { showRepoBranchDetailTab: (repoId: string, branch: string, tab: 'terminal') => void }
  setDetailCollapsed: (collapsed: boolean) => void
}

interface MergeConflictAiAction {
  provider: CommitMessageProvider
  label: string
  title: string
  disabled: boolean
  pending: boolean
  onSelect: () => Promise<void>
}

const EMPTY_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export function useMergeConflictAiActions(input: MergeConflictAiActionsInput): {
  actions: MergeConflictAiAction[]
  error: string | null
} {
  const t = useT()
  const { terminalExternalInputEnabled } = useRuntimeTerminalSettings()
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_PROVIDERS)
  const [pending, setPending] = useState<CommitMessageProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setProviders(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(EMPTY_PROVIDERS)
      })
    return () => controller.abort()
  }, [])

  const actions = useMemo<MergeConflictAiAction[]>(() => {
    return COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider]).map((provider) => ({
      provider,
      label: t(`action.merge-conflict-ai-${provider}`),
      title: terminalExternalInputEnabled
        ? t('action.merge-conflict-ai-title')
        : t('action.merge-conflict-ai-external-input-required'),
      disabled: !terminalExternalInputEnabled || pending !== null,
      pending: pending === provider,
      onSelect: async () => {
        if (!terminalExternalInputEnabled || pending !== null) return
        setPending(provider)
        setError(null)
        try {
          const ok = await prefillMergeConflictCommand(input, provider)
          if (!ok) setError(t('action.merge-conflict-ai-prefill-failed'))
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setPending(null)
        }
      },
    }))
  }, [input, pending, providers, t, terminalExternalInputEnabled])

  return { actions, error }
}

async function prefillMergeConflictCommand(
  input: MergeConflictAiActionsInput,
  provider: CommitMessageProvider,
): Promise<boolean> {
  const bridge = readTerminalSessionCommandBridge()
  if (!bridge) return false
  const scope = worktreeTerminalKey(input.repoId, input.worktreePath)
  input.navigation.showRepoBranchDetailTab(input.repoId, input.branch, 'terminal')
  input.setDetailCollapsed(false)
  const snapshot = bridge.worktreeSnapshot(scope)
  const key = snapshot.selectedDescriptor?.key ?? snapshot.sessions[0]?.key ?? null
  if (key) bridge.selectTerminal(scope, key)
  else await bridge.createTerminal({ repoRoot: input.repoId, branch: input.branch, worktreePath: input.worktreePath })

  await Promise.resolve()
  return bridge.fillExternalInput(scope, buildMergeConflictAiCommand(provider))
}

export function buildMergeConflictAiCommand(provider: CommitMessageProvider): string {
  const prompt = 'Resolve the current Git merge conflicts in this working tree. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue.'
  if (provider === 'codex') return `codex exec --skip-git-repo-check ${JSON.stringify(prompt)}`
  return `claude --print ${JSON.stringify(prompt)}`
}
```

- [ ] **Step 4: Add i18n keys**

Add these keys to all dictionaries. English values:

```ts
'action.merge-conflict-ai-title': 'AI handoff',
'action.merge-conflict-ai-codex': 'Codex',
'action.merge-conflict-ai-claude': 'Claude',
'action.merge-conflict-ai-external-input-required': 'Enable terminal external input to prefill this command',
'action.merge-conflict-ai-prefill-failed': 'Could not fill the terminal input.',
```

Chinese values:

```ts
'action.merge-conflict-ai-title': 'AI 接管',
'action.merge-conflict-ai-codex': 'Codex',
'action.merge-conflict-ai-claude': 'Claude',
'action.merge-conflict-ai-external-input-required': '需要先开启终端外部输入框才能预填命令',
'action.merge-conflict-ai-prefill-failed': '无法填入终端输入框。',
```

Japanese values:

```ts
'action.merge-conflict-ai-title': 'AI ハンドオフ',
'action.merge-conflict-ai-codex': 'Codex',
'action.merge-conflict-ai-claude': 'Claude',
'action.merge-conflict-ai-external-input-required': 'このコマンドを入力するにはターミナル外部入力を有効にしてください',
'action.merge-conflict-ai-prefill-failed': 'ターミナル入力に挿入できませんでした。',
```

Korean values:

```ts
'action.merge-conflict-ai-title': 'AI 인계',
'action.merge-conflict-ai-codex': 'Codex',
'action.merge-conflict-ai-claude': 'Claude',
'action.merge-conflict-ai-external-input-required': '이 명령을 미리 입력하려면 터미널 외부 입력을 켜세요',
'action.merge-conflict-ai-prefill-failed': '터미널 입력에 채울 수 없습니다.',
```

Preserve unrelated edits already present in the i18n files.

- [ ] **Step 5: Run hook tests**

Run:

```bash
bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
```

Expected: pass.

## Task 5: Create Inline Commit Form And Extract Commit Message Generation

**Files:**
- Create: `src/web/components/branch-list/useCommitMessageGeneration.ts`
- Create: `src/web/components/branch-list/InlineCommitForm.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

- [ ] **Step 1: Move commit dialog tests to inline form expectations**

In `src/web/components/branch-list/BranchWriteDialogs.test.tsx`, update imports:

```ts
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
```

Update the existing `CommitDialog AI generation` describe block to render `InlineCommitForm`:

```tsx
render(<InlineCommitForm repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
```

Update selectors from `#commit-message` to `#inline-commit-message`.

Add a submit behavior test:

```ts
test('submits trimmed commit message and closes after success', async () => {
  const onCommit = vi.fn(async () => {})
  const onClose = vi.fn()

  render(<InlineCommitForm repoId="/repo" worktreePath="/repo" onClose={onClose} onCommit={onCommit} />)
  await flush()
  setTextareaValue('#inline-commit-message', '  feat: inline commit  ')
  clickButtonByText('action.commit-confirm')
  await flush()

  expect(onCommit).toHaveBeenCalledWith('feat: inline commit')
  expect(onClose).toHaveBeenCalled()
})
```

Add failure preservation test:

```ts
test('keeps message visible when commit fails', async () => {
  const onCommit = vi.fn(async () => {
    throw new Error('nothing to commit')
  })
  const onClose = vi.fn()

  render(<InlineCommitForm repoId="/repo" worktreePath="/repo" onClose={onClose} onCommit={onCommit} />)
  await flush()
  setTextareaValue('#inline-commit-message', 'feat: inline commit')
  clickButtonByText('action.commit-confirm')
  await flush()

  expect(textarea('#inline-commit-message').value).toBe('feat: inline commit')
  expect(document.body.textContent).toContain('nothing to commit')
  expect(onClose).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run inline form tests and verify they fail**

Run:

```bash
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "InlineCommitForm|CommitDialog AI generation"
```

Expected: fail because `InlineCommitForm` does not exist.

- [ ] **Step 3: Extract commit message generation hook**

Create `src/web/components/branch-list/useCommitMessageGeneration.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { COMMIT_MESSAGE_PROVIDERS, type CommitMessageProvider, type CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'

const EMPTY_COMMIT_MESSAGE_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export function useCommitMessageGeneration(input: {
  repoId: string
  worktreePath: string
  message: string
  setMessage: (message: string) => void
  setError: (message: string | null) => void
  formatError: (message: string) => string
}) {
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_COMMIT_MESSAGE_PROVIDERS)
  const [generating, setGenerating] = useState<CommitMessageProvider | null>(null)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const messageRef = useRef(input.message)

  useEffect(() => {
    messageRef.current = input.message
  }, [input.message])

  useEffect(() => {
    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then((nextProviders) => {
        if (!controller.signal.aborted) setProviders(nextProviders)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(EMPTY_COMMIT_MESSAGE_PROVIDERS)
      })
    return () => {
      controller.abort()
      generationAbortRef.current?.abort()
    }
  }, [])

  async function generate(provider: CommitMessageProvider) {
    if (!input.repoId || !input.worktreePath || generating) return
    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setGenerating(provider)
    input.setError(null)
    setPendingGeneratedMessage(null)
    try {
      const result = await generateRepositoryCommitMessage(input.repoId, input.worktreePath, provider, controller.signal)
      if (controller.signal.aborted) return
      if (!result.ok) {
        const nextError = input.formatError(result.message)
        if (nextError) input.setError(nextError)
        return
      }
      if (messageRef.current.trim()) setPendingGeneratedMessage(result.message)
      else input.setMessage(result.message)
    } catch (err) {
      if (!controller.signal.aborted) input.setError(input.formatError(err instanceof Error ? err.message : String(err)))
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
        setGenerating(null)
      }
    }
  }

  function applyPendingGeneratedMessage() {
    if (!pendingGeneratedMessage) return
    input.setMessage(pendingGeneratedMessage)
    setPendingGeneratedMessage(null)
    input.setError(null)
  }

  return {
    availableProviders: COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider]),
    generating,
    pendingGeneratedMessage,
    setPendingGeneratedMessage,
    generate,
    applyPendingGeneratedMessage,
  }
}
```

- [ ] **Step 4: Implement `InlineCommitForm`**

Create `src/web/components/branch-list/InlineCommitForm.tsx`:

```tsx
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useCommitMessageGeneration } from '#/web/components/branch-list/useCommitMessageGeneration.ts'

interface InlineCommitFormProps {
  repoId: string
  worktreePath: string
  onClose: () => void
  onCommit: (message: string) => Promise<void>
}

export function InlineCommitForm({ repoId, worktreePath, onClose, onCommit }: InlineCommitFormProps) {
  const t = useT()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'commit'>()
  const generation = useCommitMessageGeneration({
    repoId,
    worktreePath,
    message,
    setMessage,
    setError,
    formatError: (value) => formatCommitMessageGenerationError(t, value),
  })

  async function handleConfirm() {
    const trimmed = message.trim()
    if (!trimmed) return
    setError(null)
    await run('commit', async () => {
      try {
        await onCommit(trimmed)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="col-span-full border-t border-border/70 bg-muted/35 px-4 py-3" onClick={(e) => e.stopPropagation()}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
      >
        <Field>
          <div className="flex min-h-7 items-center justify-between gap-3">
            <FieldLabel htmlFor="inline-commit-message">{t('action.commit-message-label')}</FieldLabel>
            {generation.availableProviders.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {generation.availableProviders.map((provider) => (
                  <CommitGenerateButton
                    key={provider}
                    provider={provider}
                    generating={generation.generating}
                    disabled={isPending}
                    onGenerate={generation.generate}
                  />
                ))}
              </div>
            )}
          </div>
          <textarea
            id="inline-commit-message"
            className="w-full min-h-[64px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={t('action.commit-message-placeholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isPending}
          />
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!message.trim() || isPending || generation.generating !== null}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('action.commit-confirm')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={generation.pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={() => generation.setPendingGeneratedMessage(null)}
        onConfirm={generation.applyPendingGeneratedMessage}
      />
    </div>
  )
}

function CommitGenerateButton({
  provider,
  generating,
  disabled,
  onGenerate,
}: {
  provider: CommitMessageProvider
  generating: CommitMessageProvider | null
  disabled: boolean
  onGenerate: (provider: CommitMessageProvider) => Promise<void>
}) {
  const t = useT()
  const isGeneratingProvider = generating === provider
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      data-provider={provider}
      disabled={disabled || generating !== null}
      aria-busy={isGeneratingProvider ? true : undefined}
      title={t(`action.commit-generate-${provider}`)}
      onClick={() => void onGenerate(provider)}
    >
      {isGeneratingProvider ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {isGeneratingProvider ? t('action.commit-generate-loading') : t(`action.commit-generate-${provider}`)}
    </Button>
  )
}

function formatCommitMessageGenerationError(t: (key: string) => string, message: string): string {
  if (message === 'cancelled') return ''
  return message.startsWith('error.') ? t(message) : message
}
```

- [ ] **Step 5: Run inline form tests**

Run:

```bash
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "InlineCommitForm|CommitDialog AI generation"
```

Expected: updated tests pass.

## Task 6: Render Inline Commit Under The Target Branch Row

**Files:**
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/hooks/useBranchActionItems.ts`
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/BranchActionsMenu.tsx`
- Modify: `src/web/components/branch-list/BranchRow.test.tsx`

- [ ] **Step 1: Add a failing row-level inline panel test**

In `src/web/components/branch-list/BranchRow.test.tsx`, replace the `BranchActionsMenu` mock with a mock that exposes an inline panel for one test:

```ts
vi.mock('#/web/hooks/useBranchActionItems.ts', () => ({
  useBranchActionItems: () => ({
    patchItems: [],
    mainItems: [],
    externalItems: [],
    destructiveItems: [],
    dialogs: null,
    inlinePanel: <div data-testid="inline-commit-form">inline commit</div>,
  }),
}))

vi.mock('#/web/components/BranchActionsMenu.tsx', async () => {
  const actual = await vi.importActual<typeof import('#/web/components/BranchActionsMenu.tsx')>('#/web/components/BranchActionsMenu.tsx')
  return {
    ...actual,
    BranchActionsDropdown: () => <button type="button" aria-label="action.menu">...</button>,
  }
})
```

Add:

```ts
test('renders inline action panel below the branch row content', () => {
  const repo = emptyRepo('/tmp/repo', 'repo')
  const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

  render(
    <ul>
      <BranchRow
        repo={repo}
        branch={branch}
        selected={null}
        onSelectBranch={vi.fn()}
        onOpenBranchStatus={vi.fn()}
        selectedRef={createRef<HTMLLIElement>()}
      />
    </ul>,
  )

  const panel = document.body.querySelector('[data-testid="inline-commit-form"]')
  expect(panel).not.toBeNull()
  expect(panel?.parentElement?.className).toContain('col-span-full')
})
```

Keep the existing `BranchActionsMenu` mock removed or replaced for this test file so `BranchRow` can exercise the new `useBranchActionItems` path. The mock block above supplies `inlinePanel` and a simple `BranchActionsDropdown`, which is enough for the existing row summary tests and the new inline panel test.

- [ ] **Step 2: Run row test and verify it fails**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx -- -t "inline action panel"
```

Expected: fail because `BranchRow` does not render `inlinePanel`.

- [ ] **Step 3: Extend action item group type**

Modify `src/web/hooks/useBranchActionItems.ts`:

```ts
export interface BranchActionItemGroups {
  patchItems: BranchActionItem[]
  mainItems: BranchActionItem[]
  externalItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel?: ReactNode
}
```

Return `inlinePanel: writeActions.inlinePanel` at the bottom of `useBranchActionItems`.

- [ ] **Step 4: Update branch write actions to return inline commit panel**

Modify `src/web/hooks/useBranchWriteActions.tsx`:

```ts
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
```

Change `BranchWriteActions`:

```ts
interface BranchWriteActions {
  mainItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel?: ReactNode
}
```

Replace `commitDialog` with:

```ts
const inlineCommit = useRetainedDialogState<string>()
```

Change commit menu item:

```ts
{
  id: 'commit',
  label: t('action.commit'),
  title: t('action.commit-title'),
  disabled: branchActionBusy,
  visible: hasWorktree,
  icon: createElement(SendHorizontal),
  onSelect: () => inlineCommit.openWith(worktreePath ?? ''),
}
```

Change `handleCommit`:

```ts
async function handleCommit(message: string) {
  if (!worktreePath) return
  const result = await commitRepositoryChanges(repo.id, worktreePath, message)
  setLastResult(repo.id, result, repo.instanceToken)
  if (!result.ok) throw new Error(result.message)
}
```

Remove `<CommitDialog ... />` from `dialogs`.

Add before return:

```ts
  const inlinePanel = inlineCommit.open && worktreePath ? (
    <InlineCommitForm
      repoId={repo.id}
      worktreePath={worktreePath}
      onClose={inlineCommit.close}
      onCommit={handleCommit}
    />
  ) : null
```

Return:

```ts
return { mainItems, destructiveItems, dialogs, inlinePanel }
```

- [ ] **Step 5: Render dropdown and inline panel from `BranchRow`**

Modify `src/web/components/branch-list/BranchRow.tsx` imports:

```ts
import { BranchActionsDropdown } from '#/web/components/BranchActionsMenu.tsx'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'
```

Replace the current `<BranchActionsMenu ... />` block with a small child component:

```tsx
      {showActions && (
        <BranchRowActions
          repo={repo}
          branch={branch}
          actionMenuOpen={actionMenuOpen}
          onActionMenuOpenChange={onActionMenuOpenChange}
        />
      )}
```

Add below `BranchRow`:

```tsx
function BranchRowActions({
  repo,
  branch,
  actionMenuOpen,
  onActionMenuOpenChange,
}: {
  repo: BranchActionRepo
  branch: RepoBranchState
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
}) {
  const actions = useBranchActionItems(repo, branch)
  return (
    <>
      <div className="pointer-events-none relative z-20 flex shrink-0 items-center py-1 pr-4">
        <div className="pointer-events-auto">
          <BranchActionsDropdown
            patchItems={actions.patchItems}
            mainItems={actions.mainItems}
            externalItems={actions.externalItems}
            destructiveItems={actions.destructiveItems}
            open={actionMenuOpen}
            onOpenChange={onActionMenuOpenChange}
          />
        </div>
      </div>
      {actions.inlinePanel ? (
        <div className="col-span-full" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
          {actions.inlinePanel}
        </div>
      ) : null}
      {actions.dialogs}
    </>
  )
}
```

- [ ] **Step 6: Keep `BranchActionsMenu` usable**

Modify `src/web/components/BranchActionsMenu.tsx` so it destructures `inlinePanel` but does not render it:

```ts
export function BranchActionsMenu({ repo, branch, open, onOpenChange }: Props) {
  const { patchItems, mainItems, externalItems, destructiveItems, dialogs } = useBranchActionItems(repo, branch)
  ...
}
```

No behavior change is needed for this component because `BranchRow` now owns inline placement.

- [ ] **Step 7: Run row and action tests**

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected: tests pass.

## Task 7: Add Merge Dialog AI Handoff UI

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

- [ ] **Step 1: Add failing merge dialog tests**

In `src/web/components/branch-list/BranchWriteDialogs.test.tsx`, import `MergeDialog`:

```ts
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
import {
  CreateBranchDialog,
  MergeDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
```

Mock `useMergeConflictAiActions`:

```ts
const mergeAiMocks = vi.hoisted(() => ({
  actions: [
    { provider: 'codex', label: 'Codex', title: 'AI handoff', disabled: false, pending: false, onSelect: vi.fn() },
    { provider: 'claude', label: 'Claude', title: 'AI handoff', disabled: false, pending: false, onSelect: vi.fn() },
  ],
  error: null,
}))

vi.mock('#/web/hooks/useMergeConflictAiActions.ts', () => ({
  useMergeConflictAiActions: () => mergeAiMocks,
}))
```

Add tests:

```tsx
describe('MergeDialog AI handoff', () => {
  test('does not show AI buttons for ordinary merge errors', async () => {
    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: 'fatal: bad revision' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()

    expect(document.body.textContent).toContain('fatal: bad revision')
    expect(queryButtonByText('Codex')).toBeNull()
  })

  test('shows AI buttons for merge conflict errors', async () => {
    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()

    expect(document.body.textContent).toContain('CONFLICT (content)')
    expect(buttonByText('Codex')).not.toBeNull()
    expect(buttonByText('Claude')).not.toBeNull()
  })
})
```

Add this helper near the existing select helpers:

```ts
function selectFirstMergeCandidate() {
  openSelect('#merge-select')
  const item = document.body.querySelector<HTMLElement>('[role="option"]')
  if (!item) throw new Error('Missing merge candidate option')
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
```

- [ ] **Step 2: Run merge dialog tests and verify they fail**

Run:

```bash
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "MergeDialog AI handoff"
```

Expected: fail because `MergeDialog` still expects `onMerge` to throw and does not render AI buttons.

- [ ] **Step 3: Change `MergeDialog` contract to return `ExecResult`**

Modify `MergeDialogProps` in `src/web/components/branch-list/BranchWriteDialogs.tsx`:

```ts
import type { ExecResult } from '#/shared/git-types.ts'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'

interface MergeDialogProps {
  open: boolean
  repoId: string
  worktreePath: string
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  onClose: () => void
  onMerge: (sourceBranch: string) => Promise<ExecResult>
}
```

Inside `MergeDialog`, add state:

```ts
const [errorReason, setErrorReason] = useState<ExecResult['reason'] | null>(null)
const navigation = useMainWindowNavigation()
const setDetailCollapsed = useReposStore((s) => s.setDetailCollapsed)
const mergeConflictAi = useMergeConflictAiActions({
  repoId,
  branch: branch.name,
  worktreePath,
  navigation,
  setDetailCollapsed,
})
```

Reset `errorReason` alongside `error` when closed.

Change `handleConfirm`:

```ts
  async function handleConfirm() {
    if (!selected) return
    setError(null)
    setErrorReason(null)
    await run('merge', async () => {
      try {
        const result = await onMerge(selected)
        if (!result.ok) {
          setError(result.message)
          setErrorReason(result.reason ?? null)
          return
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setErrorReason(null)
      }
    })
  }
```

Render conflict buttons after error:

```tsx
        {error && <DialogError>{error}</DialogError>}
        {errorReason === 'merge-conflict' && mergeConflictAi.actions.length > 0 && (
          <div className="rounded-md border border-border bg-muted/35 p-2">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{t('action.merge-conflict-ai-title')}</div>
            <div className="flex flex-wrap gap-2">
              {mergeConflictAi.actions.map((action) => (
                <Button
                  key={action.provider}
                  type="button"
                  variant="outline"
                  size="sm"
                  title={action.title}
                  disabled={action.disabled}
                  onClick={() => void action.onSelect()}
                >
                  {action.pending && <Loader2 className="animate-spin" />}
                  {action.label}
                </Button>
              ))}
            </div>
            {mergeConflictAi.error && <p className="mt-2 text-xs text-destructive">{mergeConflictAi.error}</p>}
          </div>
        )}
```

- [ ] **Step 4: Update `useBranchWriteActions` merge handler**

Modify `src/web/hooks/useBranchWriteActions.tsx`:

```ts
async function handleMerge(sourceBranch: string): Promise<ExecResult> {
  if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
  const result = await mergeRepositoryBranch(repo.id, worktreePath, sourceBranch)
  setLastResult(repo.id, result, repo.instanceToken)
  if (result.ok) mergeDialog.close()
  return result
}
```

Pass new props:

```tsx
      <MergeDialog
        open={mergeDialog.open}
        repoId={repo.id}
        worktreePath={worktreePath ?? ''}
        branch={branch}
        allBranches={allBranches}
        onClose={mergeDialog.close}
        onMerge={handleMerge}
      />
```

- [ ] **Step 5: Run merge dialog and hook tests**

Run:

```bash
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "MergeDialog AI handoff"
bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
```

Expected: tests pass.

## Task 8: Remove Global Commit Dialog Usage And Clean Imports

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`

- [ ] **Step 1: Remove unused commit dialog code**

In `src/web/components/branch-list/BranchWriteDialogs.tsx`, remove:

- `CommitDialog`
- `formatCommitMessageGenerationError`
- commit-message generation imports that are no longer used by remaining dialogs:
  - `COMMIT_MESSAGE_PROVIDERS`
  - `CommitMessageProvider`
  - `CommitMessageProviderAvailability`
  - `generateRepositoryCommitMessage`
  - `getCommitMessageProviders`
  - `Sparkles`
  - `useRef`
  - `ConfirmDialog`

Keep checkout, merge, create branch, and pull remote branch dialogs intact.

- [ ] **Step 2: Ensure no stale imports remain**

Run:

```bash
bun run typecheck
```

Expected: any stale imports or removed exports are reported. Fix only errors related to this feature.

- [ ] **Step 3: Run focused branch write tests**

Run:

```bash
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
bun run test src/web/components/branch-list/BranchRow.test.tsx
```

Expected: pass.

## Task 9: Full Verification

**Files:**
- No planned source edits unless verification exposes a defect in the implemented feature.

- [ ] **Step 1: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: pass. If it fails, fix imports by respecting:

- `src/web/**` must not import `src/main/**`.
- `src/server/**` and `src/shared/**` must not import `electron`.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: pass.

- [ ] **Step 4: Manual verification**

Run the app in the usual project dev flow, then verify:

1. Open a repo with a dirty worktree.
2. Select `Commit` from the branch row menu.
3. Confirm the form expands under that exact branch row.
4. Confirm another branch row can still be selected and other menus can still open.
5. Enter a message and commit. Confirm the form closes on success.
6. Trigger a commit failure. Confirm the form remains open and preserves the typed message.
7. Create a merge conflict.
8. Open `Merge`, run the merge, and confirm the merge dialog error area shows `Codex` / `Claude` buttons only for the conflict.
9. Click a provider. Confirm the branch terminal tab opens or selects the target worktree terminal.
10. Confirm the terminal external input contains the AI command and the command has not executed.
11. Trigger a non-conflict merge failure and confirm the AI buttons do not appear.

## Self-Review Checklist

- Spec coverage:
  - Inline commit form is covered by Tasks 5, 6, and 8.
  - Merge conflict classification is covered by Tasks 1 and 2.
  - Merge dialog AI buttons are covered by Tasks 4 and 7.
  - Terminal prefill without execution is covered by Tasks 3 and 4.
  - Verification is covered by Task 9.
- No git commit steps are included because repository instructions forbid planning commits unless explicitly requested.
- No automatic AI execution, `git add`, `git commit`, or `git merge --continue` appears in implementation steps.
- Type names are consistent: `ExecResult.reason`, `merge-conflict`, `fillExternalInput`, `InlineCommitForm`.
