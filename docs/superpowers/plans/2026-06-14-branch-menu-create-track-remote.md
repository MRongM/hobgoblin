# Branch Menu Create And Track Remote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branch dropdown actions for creating a local branch from the selected branch and creating a local tracking branch from a selected remote-tracking ref.

**Architecture:** Keep UI state in branch write dialogs, route mutations through the existing `RepoBranchAction` store pipeline, and extend `RepoBackend` so local and SSH repositories share the same action semantics. The two actions create branches only; they do not checkout, create worktrees, pull into worktrees, or push.

**Tech Stack:** React, Zustand, Hono server routes, TypeScript strip-only runtime, Bun, Vitest, Git CLI, SSH remote command adapter.

**Project Note:** This repository instruction says not to plan or execute git commits unless explicitly requested, so this plan intentionally has no commit steps.

---

## File Structure

- Create: `src/web/components/branch-list/branch-create-model.ts`
  - Pure branch-name validation and remote-ref choice helpers used by dialogs.
- Create: `src/web/components/branch-list/branch-create-model.test.ts`
  - Unit tests for duplicate filtering, derivation, and validation keys.
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
  - Add `CreateBranchDialog` and `PullRemoteBranchDialog`.
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
  - Add jsdom tests for the new dialogs.
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
  - Add menu items and submit new repo branch actions.
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
  - Assert new menu item ids appear in the main action group.
- Modify: `src/web/hooks/branch-action-state.ts`
  - Add item ids and busy mapping for new branch action kinds.
- Modify: `src/web/stores/repos/branch-action-types.ts`
  - Add `createBranch` and `trackRemoteBranch` action variants.
- Modify: `src/web/stores/repos/operations.ts`
  - Add operation reasons for the new branch actions.
- Modify: `src/web/stores/repos/action-labels.ts`
  - Add loading, queued, and success label handling.
- Modify: `src/web/stores/repos/types.ts`
  - Add result event action variants.
- Modify: `src/web/stores/repos/branch-actions.ts`
  - Route new actions through operation target, event metadata, and RPC.
- Modify: `src/web/stores/repos/branch-actions.test.ts`
  - Add store scheduling, target, RPC, and result metadata tests.
- Modify: `src/web/repo-client.ts`
  - Add client functions for the new server routes.
- Modify: `src/web/repo-client.test.ts`
  - Assert request shapes.
- Modify: `src/server/routes/repo.ts`
  - Add `/create-branch` and `/track-remote-branch`.
- Modify: `src/server/modules/repo-write-paths.ts`
  - Add write-path functions with backend dispatch and invalidation.
- Modify: `src/server/modules/repo-backend.ts`
  - Add backend interface methods and local/remote implementations.
- Modify: `src/server/modules/repo.test.ts`
  - Assert backend dispatch and invalidation for local and remote flows.
- Modify: `src/system/git/branches.ts`
  - Add local Git command helpers.
- Create: `src/system/git/branches.test.ts`
  - Unit tests for command construction and invalid input.
- Modify: `src/shared/worktree-create.ts`
  - Export `isRemoteTrackingRef` so branch helpers can validate remote refs.
- Modify: `src/shared/worktree-create.test.ts`
  - Assert exported validation behavior.
- Modify: `src/system/ssh/commands.ts`
  - Add remote command kinds for branch creation and tracking.
- Modify: `src/system/ssh/commands.test.ts`
  - Assert quoted remote command scripts.
- Modify: `src/system/ssh/git.ts`
  - Add remote branch creation helpers.
- Modify: `src/system/ssh/git.test.ts`
  - Assert validation and remote command dispatch.
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add action labels, dialog copy, validation messages, and success/loading text.

## Task 1: Pure Branch Creation Model

**Files:**
- Create: `src/web/components/branch-list/branch-create-model.ts`
- Create: `src/web/components/branch-list/branch-create-model.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/web/components/branch-list/branch-create-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  branchNameValidationKey,
  remoteTrackingBranchChoices,
} from '#/web/components/branch-list/branch-create-model.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

function branch(name: string): RepoBranchState {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abc1234',
    lastCommitMessage: 'message',
    lastCommitDate: '2024-01-01T00:00:00.000Z',
    lastCommitAuthor: 'dev',
  }
}

describe('branch create model', () => {
  test('validates empty invalid and duplicate branch names', () => {
    const branches = [branch('main'), branch('feature/existing')]

    expect(branchNameValidationKey('', branches)).toBe('action.create-branch-name-required')
    expect(branchNameValidationKey('-bad', branches)).toBe('action.create-worktree-branch-invalid')
    expect(branchNameValidationKey('feature/existing', branches)).toBe('action.create-worktree-branch-exists')
    expect(branchNameValidationKey('feature/new', branches)).toBeNull()
  })

  test('builds remote choices and filters derived local branch duplicates', () => {
    const branches = [branch('main'), branch('feature/existing')]

    expect(
      remoteTrackingBranchChoices(
        [
          'origin/main',
          'origin/feature/existing',
          'origin/feature/new',
          'origin/HEAD',
          'bad remote/feature',
        ],
        branches,
      ),
    ).toEqual([
      { remoteRef: 'origin/feature/new', defaultLocalBranch: 'feature/new' },
    ])
  })
})
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```text
bun run test src/web/components/branch-list/branch-create-model.test.ts
```

Expected: fail because `src/web/components/branch-list/branch-create-model.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/web/components/branch-list/branch-create-model.ts`:

```ts
import { validateBranchName } from '#/shared/refnames.ts'
import { deriveLocalBranchFromRemoteRef } from '#/shared/worktree-create.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

export type BranchNameValidationKey =
  | 'action.create-branch-name-required'
  | 'action.create-worktree-branch-invalid'
  | 'action.create-worktree-branch-exists'

export interface RemoteTrackingBranchChoice {
  remoteRef: string
  defaultLocalBranch: string
}

export function localBranchNameSet(branches: RepoBranchState[]): Set<string> {
  return new Set(branches.map((branch) => branch.name))
}

export function branchNameValidationKey(
  branchName: string,
  branches: RepoBranchState[],
): BranchNameValidationKey | null {
  const trimmed = branchName.trim()
  if (!trimmed) return 'action.create-branch-name-required'
  if (!validateBranchName(trimmed).ok) return 'action.create-worktree-branch-invalid'
  if (localBranchNameSet(branches).has(trimmed)) return 'action.create-worktree-branch-exists'
  return null
}

export function remoteTrackingBranchChoices(
  remoteRefs: string[],
  branches: RepoBranchState[],
): RemoteTrackingBranchChoice[] {
  const localNames = localBranchNameSet(branches)
  return remoteRefs.flatMap((remoteRef) => {
    const defaultLocalBranch = deriveLocalBranchFromRemoteRef(remoteRef)
    if (!defaultLocalBranch || localNames.has(defaultLocalBranch)) return []
    return [{ remoteRef, defaultLocalBranch }]
  })
}
```

- [ ] **Step 4: Run helper tests and verify pass**

Run:

```text
bun run test src/web/components/branch-list/branch-create-model.test.ts
```

Expected: pass.

## Task 2: Dialog Tests For New Branch Flows

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

- [ ] **Step 1: Write failing dialog tests**

Extend the import:

```ts
import {
  CommitDialog,
  CreateBranchDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
```

Extend repo-client mock:

```ts
vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
}))
```

Extend `mocks`:

```ts
const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
}))
```

Add these tests before the helper functions:

```ts
describe('CreateBranchDialog', () => {
  test('submits a typed branch name from the selected base branch', async () => {
    const onCreate = vi.fn(async () => {})

    render(
      <CreateBranchDialog
        open
        branch={repoBranch('feature/base')}
        allBranches={[repoBranch('feature/base')]}
        busy={false}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    )

    setInputValue('#create-branch-name', 'feature/new')
    clickButtonByText('action.create-branch-confirm')
    await flush()

    expect(onCreate).toHaveBeenCalledWith('feature/new')
  })

  test('rejects duplicate branch names before submit', async () => {
    const onCreate = vi.fn(async () => {})

    render(
      <CreateBranchDialog
        open
        branch={repoBranch('feature/base')}
        allBranches={[repoBranch('feature/base'), repoBranch('feature/existing')]}
        busy={false}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    )

    setInputValue('#create-branch-name', 'feature/existing')

    expect(document.body.textContent).toContain('action.create-worktree-branch-exists')
    expect(buttonByText('action.create-branch-confirm').disabled).toBe(true)
    expect(onCreate).not.toHaveBeenCalled()
  })
})

describe('PullRemoteBranchDialog', () => {
  test('loads remote refs filters duplicates and submits tracking branch input', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce([
      'origin/feature/existing',
      'origin/feature/new',
    ])
    const onTrack = vi.fn(async () => {})

    render(
      <PullRemoteBranchDialog
        open
        repoId="/repo"
        allBranches={[repoBranch('feature/existing')]}
        busy={false}
        onClose={vi.fn()}
        onTrack={onTrack}
      />,
    )
    await flush()

    expect(document.body.textContent).toContain('origin/feature/new')
    expect(document.body.textContent).not.toContain('origin/feature/existing')
    expect(input('#pull-remote-local-branch').value).toBe('feature/new')

    clickButtonByText('action.pull-remote-branch-confirm')
    await flush()

    expect(onTrack).toHaveBeenCalledWith({
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
    })
  })
})
```

Add helpers near the existing test helpers:

```ts
function repoBranch(name: string) {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abc1234',
    lastCommitMessage: 'message',
    lastCommitDate: '2024-01-01T00:00:00.000Z',
    lastCommitAuthor: 'dev',
  }
}

function input(selector: string): HTMLInputElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input: ${selector}`)
  return element
}

function setInputValue(selector: string, value: string) {
  const element = input(selector)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
```

- [ ] **Step 2: Run dialog tests and verify failure**

Run:

```text
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: fail because `CreateBranchDialog` and `PullRemoteBranchDialog` are not exported.

## Task 3: Implement Dialogs And Menu Wiring

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

- [ ] **Step 1: Add dialog implementations**

In `src/web/components/branch-list/BranchWriteDialogs.tsx`, import the new helpers and remote branch client:

```ts
import { Input } from '#/web/components/ui/input.tsx'
import { getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import {
  branchNameValidationKey,
  remoteTrackingBranchChoices,
} from '#/web/components/branch-list/branch-create-model.ts'
```

Add exported dialog types and components after `MergeDialog`:

```tsx
interface CreateBranchDialogProps {
  open: boolean
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  busy: boolean
  onClose: () => void
  onCreate: (branchName: string) => Promise<void>
}

export function CreateBranchDialog({
  open,
  branch,
  allBranches,
  busy,
  onClose,
  onCreate,
}: CreateBranchDialogProps) {
  const t = useT()
  const [branchName, setBranchName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'createBranch'>()
  const validationKey = branchNameValidationKey(branchName, allBranches)
  const pending = busy || isPending

  useEffect(() => {
    if (!open) {
      setBranchName('')
      setError(null)
    }
  }, [open])

  async function handleConfirm() {
    if (validationKey || pending) return
    setError(null)
    await run('createBranch', async () => {
      try {
        await onCreate(branchName.trim())
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog open={open} onOpenChange={(o) => !o && !pending && onClose()} title={t('action.create-branch-title')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="create-branch-base">{t('action.create-branch-base-label')}</FieldLabel>
          <Input id="create-branch-base" value={branch.name} readOnly className="font-mono text-xs" />
        </Field>
        <Field data-invalid={validationKey ? true : undefined}>
          <FieldLabel htmlFor="create-branch-name">{t('action.create-branch-name-label')}</FieldLabel>
          <Input
            id="create-branch-name"
            autoFocus
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder={t('action.create-worktree-branch-placeholder')}
            aria-invalid={!!validationKey}
          />
          <FieldError reserveHeight aria-live="polite" aria-atomic="true">
            {validationKey ? t(validationKey) : ''}
          </FieldError>
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!!validationKey || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t('action.create-branch-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

interface PullRemoteBranchDialogProps {
  open: boolean
  repoId: string
  allBranches: RepoBranchState[]
  busy: boolean
  onClose: () => void
  onTrack: (input: { localBranch: string; remoteRef: string }) => Promise<void>
}

export function PullRemoteBranchDialog({
  open,
  repoId,
  allBranches,
  busy,
  onClose,
  onTrack,
}: PullRemoteBranchDialogProps) {
  const t = useT()
  const [remoteRefs, setRemoteRefs] = useState<string[]>([])
  const [remoteRef, setRemoteRef] = useState('')
  const [localBranch, setLocalBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'trackRemoteBranch'>()
  const choices = remoteTrackingBranchChoices(remoteRefs, allBranches)
  const selected = choices.find((choice) => choice.remoteRef === remoteRef) ?? choices[0]
  const effectiveRemoteRef = selected?.remoteRef ?? ''
  const effectiveLocalBranch = localBranch.trim() || selected?.defaultLocalBranch || ''
  const validationKey = branchNameValidationKey(effectiveLocalBranch, allBranches)
  const pending = busy || isPending

  useEffect(() => {
    if (!open) {
      setRemoteRefs([])
      setRemoteRef('')
      setLocalBranch('')
      setLoading(false)
      setLoadFailed(false)
      setError(null)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setLoadFailed(false)
    void getRepositoryRemoteBranches(repoId, ctrl.signal)
      .then((refs) => {
        if (ctrl.signal.aborted) return
        setRemoteRefs(refs)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setRemoteRefs([])
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [open, repoId])

  useEffect(() => {
    if (!open || !selected) return
    if (!remoteRef) setRemoteRef(selected.remoteRef)
    if (!localBranch.trim()) setLocalBranch(selected.defaultLocalBranch)
  }, [localBranch, open, remoteRef, selected])

  async function handleConfirm() {
    if (!effectiveRemoteRef || validationKey || pending) return
    setError(null)
    await run('trackRemoteBranch', async () => {
      try {
        await onTrack({ localBranch: effectiveLocalBranch, remoteRef: effectiveRemoteRef })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog open={open} onOpenChange={(o) => !o && !pending && onClose()} title={t('action.pull-remote-branch-title')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="pull-remote-ref">{t('action.pull-remote-branch-remote-label')}</FieldLabel>
          <Select
            value={effectiveRemoteRef}
            onValueChange={(next) => {
              const nextChoice = choices.find((choice) => choice.remoteRef === next)
              setRemoteRef(next)
              setLocalBranch(nextChoice?.defaultLocalBranch ?? '')
            }}
            disabled={choices.length === 0 || loading}
          >
            <SelectTrigger id="pull-remote-ref" className="w-full">
              <SelectValue placeholder={t('action.create-worktree-remote-placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.remoteRef} value={choice.remoteRef} textValue={choice.remoteRef}>
                  <span className="truncate">{choice.remoteRef}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription reserveHeight aria-live="polite" aria-atomic="true">
            {loading
              ? t('action.create-worktree-remote-loading')
              : loadFailed
                ? t('action.pull-remote-branch-load-failed')
                : choices.length === 0
                  ? t('action.create-worktree-remote-empty')
                  : ''}
          </FieldDescription>
        </Field>
        <Field data-invalid={validationKey ? true : undefined}>
          <FieldLabel htmlFor="pull-remote-local-branch">{t('action.create-worktree-local-branch-label')}</FieldLabel>
          <Input
            id="pull-remote-local-branch"
            value={localBranch}
            onChange={(e) => setLocalBranch(e.target.value)}
            placeholder={selected?.defaultLocalBranch || t('action.create-worktree-local-branch-placeholder')}
            aria-invalid={!!validationKey}
          />
          <FieldError reserveHeight aria-live="polite" aria-atomic="true">
            {validationKey ? t(validationKey) : ''}
          </FieldError>
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!effectiveRemoteRef || !!validationKey || pending || loading}>
            {pending && <Loader2 className="animate-spin" />}
            {t('action.pull-remote-branch-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
```

- [ ] **Step 2: Wire menu items in `useBranchWriteActions`**

Update imports:

```ts
import { GitBranch, GitMerge, RadioTower, RotateCcw, SendHorizontal } from 'lucide-react'
import {
  CheckoutToDialog,
  CommitDialog,
  CreateBranchDialog,
  MergeDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
```

Add dialog state:

```ts
const createBranchDialog = useRetainedDialogState<string>()
const pullRemoteBranchDialog = useRetainedDialogState<string>()
```

Select `runBranchAction` from the store:

```ts
const runBranchAction = useReposStore((s) => s.runBranchAction)
```

Add handlers through the existing branch action pipeline:

```ts
async function submitBranchWriteAction(action: Parameters<typeof runBranchAction>[1]) {
  const result = await runBranchAction(repo.id, action, { token: repo.instanceToken })
  if (!result) return
  if (!result.ok) throw new Error(result.message)
}
```

Use it in the two handlers:

```ts
async function handleCreateBranch(newBranch: string) {
  await submitBranchWriteAction({ kind: 'createBranch', branch: newBranch, baseBranch: branch.name })
  createBranchDialog.close()
}

async function handleTrackRemoteBranch(input: { localBranch: string; remoteRef: string }) {
  await submitBranchWriteAction({ kind: 'trackRemoteBranch', localBranch: input.localBranch, remoteRef: input.remoteRef })
  pullRemoteBranchDialog.close()
}
```

Add menu items before `checkoutTo`:

```ts
{
  id: 'createBranch',
  label: t('action.create-branch'),
  title: t('action.create-branch-title'),
  disabled: false,
  visible: true,
  icon: createElement(GitBranch),
  onSelect: () => createBranchDialog.openWith(''),
},
{
  id: 'pullRemoteBranch',
  label: t('action.pull-remote-branch'),
  title: t('action.pull-remote-branch-title'),
  disabled: repo.remote.hasRemotes === false,
  visible: repo.remote.hasRemotes !== false,
  icon: createElement(RadioTower),
  onSelect: () => pullRemoteBranchDialog.openWith(''),
},
```

Render dialogs:

```tsx
<CreateBranchDialog
  open={createBranchDialog.open}
  branch={branch}
  allBranches={allBranches}
  busy={repo.operations.branchAction.phase !== 'idle'}
  onClose={createBranchDialog.close}
  onCreate={handleCreateBranch}
/>
<PullRemoteBranchDialog
  open={pullRemoteBranchDialog.open}
  repoId={repo.id}
  allBranches={allBranches}
  busy={repo.operations.branchAction.phase !== 'idle'}
  onClose={pullRemoteBranchDialog.close}
  onTrack={handleTrackRemoteBranch}
/>
```

- [ ] **Step 3: Add menu item id tests**

Update expected visible main item ids in `src/web/hooks/useBranchActionItems.test.tsx`:

```ts
expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
  'pull',
  'push',
  'createWorktree',
  'sync',
  'createBranch',
  'pullRemoteBranch',
  'checkoutTo',
  'merge',
  'commit',
])
```

- [ ] **Step 4: Run UI tests**

Run:

```text
bun run test src/web/components/branch-list/branch-create-model.test.ts src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/hooks/useBranchActionItems.test.tsx
```

Expected: fail on missing branch action ids/types until Task 4 adds them.

## Task 4: Store And Client Branch Action Pipeline

**Files:**
- Modify: `src/web/hooks/branch-action-state.ts`
- Modify: `src/web/stores/repos/branch-action-types.ts`
- Modify: `src/web/stores/repos/operations.ts`
- Modify: `src/web/stores/repos/action-labels.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/branch-actions.ts`
- Modify: `src/web/stores/repos/branch-actions.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

- [ ] **Step 1: Add failing store and client tests**

In `src/web/stores/repos/branch-actions.test.ts`, extend queued local action test cases:

```ts
['createBranch', { kind: 'createBranch', branch: 'feature/new', baseBranch: 'feature/a' }, 'repo.createBranch'],
[
  'trackRemoteBranch',
  { kind: 'trackRemoteBranch', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
  'repo.trackRemoteBranch',
],
```

Add operation state test:

```ts
test('tracks create branch operation state while the action is running', async () => {
  let release!: () => void
  installGoblinTestBridge({
    'repo.createBranch': () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, message: 'ok' })
      }),
    'repo.snapshot': async () => ({
      branches: [createBranchSnapshot('feature/a'), createBranchSnapshot('feature/new')],
      current: 'feature/a',
    }),
    'repo.status': async () => [],
    'repo.pullRequests': async () => [],
  })

  const work = useReposStore
    .getState()
    .runBranchAction(REPO_ID, { kind: 'createBranch', branch: 'feature/new', baseBranch: 'feature/a' })

  expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
    phase: 'running',
    reason: 'branch:createBranch',
    target: 'feature/new',
  })

  release()
  await work

  expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
    phase: 'idle',
    target: null,
  })
})

test('records track remote branch metadata on result events', async () => {
  installGoblinTestBridge({
    'repo.trackRemoteBranch': async () => ({ ok: true, message: 'ok' }),
    'repo.snapshot': async () => ({
      branches: [createBranchSnapshot('feature/a'), createBranchSnapshot('feature/new')],
      current: 'feature/a',
    }),
    'repo.status': async () => [],
    'repo.pullRequests': async () => [],
  })

  await useReposStore.getState().runBranchAction(
    REPO_ID,
    { kind: 'trackRemoteBranch', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
    { token: 1 },
  )

  expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
    kind: 'result',
    result: { ok: true, message: 'ok' },
    action: {
      kind: 'trackRemoteBranch',
      branch: 'feature/new',
      remoteRef: 'origin/feature/new',
    },
  })
})
```

In `src/web/repo-client.test.ts`, add:

```ts
test('requests branch creation through the embedded server', async () => {
  installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, message: 'ok' }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const { createRepositoryBranch } = await import('#/web/repo-client.ts')
  await expect(createRepositoryBranch('/repo', 'feature/new', 'main', undefined, 'source_1')).resolves.toEqual({
    ok: true,
    message: 'ok',
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/repo/create-branch',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
      body: JSON.stringify({ cwd: '/repo', branch: 'feature/new', baseBranch: 'main', sourceToken: 'source_1' }),
    }),
  )
})

test('requests tracking branch creation through the embedded server', async () => {
  installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, message: 'ok' }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const { trackRepositoryRemoteBranch } = await import('#/web/repo-client.ts')
  await expect(trackRepositoryRemoteBranch('/repo', 'feature/new', 'origin/feature/new', undefined, 'source_1')).resolves.toEqual({
    ok: true,
    message: 'ok',
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/repo/track-remote-branch',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
      body: JSON.stringify({ cwd: '/repo', localBranch: 'feature/new', remoteRef: 'origin/feature/new', sourceToken: 'source_1' }),
    }),
  )
})
```

- [ ] **Step 2: Run store and client tests and verify failure**

Run:

```text
bun run test src/web/stores/repos/branch-actions.test.ts src/web/repo-client.test.ts
```

Expected: fail on missing action variants, bridge paths, and client functions.

- [ ] **Step 3: Add action types and labels**

In `src/web/stores/repos/branch-action-types.ts` add:

```ts
| { kind: 'createBranch'; branch: string; baseBranch: string }
| { kind: 'trackRemoteBranch'; localBranch: string; remoteRef: string }
```

In `src/web/stores/repos/operations.ts`, extend `RepoBranchActionReason`:

```ts
| 'branch:createBranch'
| 'branch:trackRemoteBranch'
```

In `src/web/hooks/branch-action-state.ts`, extend `BranchActionItemId`:

```ts
| 'createBranch'
| 'pullRemoteBranch'
```

Map action kinds:

```ts
case 'createBranch':
  return 'createBranch'
case 'trackRemoteBranch':
  return 'pullRemoteBranch'
```

In `src/web/stores/repos/types.ts`, extend `RepoEventAction`:

```ts
| { kind: 'createBranch'; branch: string; baseBranch: string }
| { kind: 'trackRemoteBranch'; branch: string; remoteRef: string }
```

In `src/web/stores/repos/action-labels.ts`, extend loading and queued maps:

```ts
createBranch: 'action.create-branch-loading',
trackRemoteBranch: 'action.pull-remote-branch-loading',
```

```ts
createBranch: 'action.create-branch-queued',
trackRemoteBranch: 'action.pull-remote-branch-queued',
```

Extend success labels:

```ts
case 'createBranch':
  return { labelKey: 'action.create-branch-created-title' }
case 'trackRemoteBranch':
  return { labelKey: 'action.pull-remote-branch-created-title' }
```

- [ ] **Step 4: Add client functions**

In `src/web/repo-client.ts` add:

```ts
export async function createRepositoryBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/create-branch', { cwd, branch, baseBranch, sourceToken }, { signal })
}

export async function trackRepositoryRemoteBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/track-remote-branch', { cwd, localBranch, remoteRef, sourceToken }, { signal })
}
```

- [ ] **Step 5: Route actions in store**

In `src/web/stores/repos/branch-actions.ts`, import the new client functions:

```ts
createRepositoryBranch,
trackRepositoryRemoteBranch,
```

Extend `BRANCH_ACTION_REASON_BY_KIND`:

```ts
createBranch: 'branch:createBranch',
trackRemoteBranch: 'branch:trackRemoteBranch',
```

Extend `branchActionOperationTarget`:

```ts
case 'createBranch':
  return action.branch
case 'trackRemoteBranch':
  return action.localBranch
```

Extend `branchActionEventAction`:

```ts
case 'createBranch':
  return { kind: action.kind, branch: action.branch, baseBranch: action.baseBranch }
case 'trackRemoteBranch':
  return { kind: action.kind, branch: action.localBranch, remoteRef: action.remoteRef }
```

Extend `runBranchActionRpc`:

```ts
case 'createBranch':
  return createRepositoryBranch(repoId, action.branch, action.baseBranch, signal, sourceToken)
case 'trackRemoteBranch':
  return trackRepositoryRemoteBranch(repoId, action.localBranch, action.remoteRef, signal, sourceToken)
```

- [ ] **Step 6: Run pipeline tests**

Run:

```text
bun run test src/web/stores/repos/branch-actions.test.ts src/web/repo-client.test.ts src/web/hooks/useBranchActionItems.test.tsx
```

Expected: pass after server bridge mocks are updated by `installGoblinTestBridge` dynamically; if bridge path validation fails, add the two method names to the test bridge type helper in `src/web/stores/repos/test-utils.ts` following the existing RPC map pattern.

## Task 5: Local Server Backend And Git Commands

**Files:**
- Modify: `src/shared/worktree-create.ts`
- Modify: `src/shared/worktree-create.test.ts`
- Modify: `src/system/git/branches.ts`
- Create: `src/system/git/branches.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo.test.ts`

- [ ] **Step 1: Write failing shared and local Git tests**

In `src/shared/worktree-create.test.ts`, add:

```ts
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'

test('validates remote tracking refs for branch creation', () => {
  expect(isRemoteTrackingRef('origin/feature/a')).toBe(true)
  expect(isRemoteTrackingRef('origin/HEAD')).toBe(false)
  expect(isRemoteTrackingRef('bad remote/feature/a')).toBe(false)
})
```

Create `src/system/git/branches.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createBranch, createTrackingBranch } from '#/system/git/branches.ts'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    gitResultWithOptions: gitResultWithOptionsMock,
  }
})

describe('branch creation helpers', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'ok' })
  })

  test('creates a branch from a local base branch', async () => {
    const signal = new AbortController().signal

    await expect(createBranch('/repo', 'feature/new', 'main', signal)).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--',
      'feature/new',
      'main',
    )
  })

  test('creates a local tracking branch from a remote ref', async () => {
    const signal = new AbortController().signal

    await expect(createTrackingBranch('/repo', 'feature/new', 'origin/feature/new', signal)).resolves.toEqual({
      ok: true,
      message: 'ok',
    })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--track',
      '--',
      'feature/new',
      'origin/feature/new',
    )
  })

  test('rejects invalid branch inputs before running git', async () => {
    await expect(createBranch('/repo', '-bad', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createTrackingBranch('/repo', 'feature/new', 'origin/HEAD')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```text
bun run test src/shared/worktree-create.test.ts src/system/git/branches.test.ts
```

Expected: fail because `isRemoteTrackingRef`, `createBranch`, and `createTrackingBranch` are not exported.

- [ ] **Step 3: Export remote ref validation**

In `src/shared/worktree-create.ts`, change:

```ts
function isRemoteTrackingRef(ref: string): boolean {
```

to:

```ts
export function isRemoteTrackingRef(ref: string): boolean {
```

- [ ] **Step 4: Implement local Git helpers**

In `src/system/git/branches.ts`, import:

```ts
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'
```

Add:

```ts
export async function createBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch) || !isSafeBranchName(baseBranch)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return gitResultWithOptions(cwd, { signal }, 'branch', '--', branch, baseBranch)
}

export async function createTrackingBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(localBranch) || !isRemoteTrackingRef(remoteRef)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return gitResultWithOptions(cwd, { signal }, 'branch', '--track', '--', localBranch, remoteRef)
}
```

- [ ] **Step 5: Add backend tests**

In `src/server/modules/repo.test.ts`, extend mocks:

```ts
createBranch: vi.fn(),
createTrackingBranch: vi.fn(),
createRemoteBranch: vi.fn(),
createRemoteTrackingBranch: vi.fn(),
```

Extend `vi.mock('#/system/git/branches.ts')`:

```ts
createBranch: mocks.createBranch,
createTrackingBranch: mocks.createTrackingBranch,
```

Extend `vi.mock('#/system/ssh/git.ts')`:

```ts
createRemoteBranch: mocks.createRemoteBranch,
createRemoteTrackingBranch: mocks.createRemoteTrackingBranch,
```

Set defaults in `beforeEach`:

```ts
mocks.createBranch.mockResolvedValue({ ok: true, message: 'created local' })
mocks.createTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked local' })
mocks.createRemoteBranch.mockResolvedValue({ ok: true, message: 'created remote' })
mocks.createRemoteTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked remote' })
```

Add tests:

```ts
describe('branch creation write paths', () => {
  test('creates a local branch and publishes invalidation', async () => {
    const { createRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(createRepositoryBranch('/tmp/repo', 'feature/new', 'main', undefined, 'source_1')).resolves.toEqual({
      ok: true,
      message: 'created local',
    })

    expect(mocks.createBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/new', 'main', undefined)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'source_1',
    })
  })

  test('creates a local tracking branch and publishes invalidation', async () => {
    const { trackRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      trackRepositoryRemoteBranch('/tmp/repo', 'feature/new', 'origin/feature/new', undefined, 'source_1'),
    ).resolves.toEqual({
      ok: true,
      message: 'tracked local',
    })

    expect(mocks.createTrackingBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/new', 'origin/feature/new', undefined)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'source_1',
    })
  })
})
```

- [ ] **Step 6: Implement server routes, write paths, and backend**

In `src/server/routes/repo.ts`, import:

```ts
createRepositoryBranch,
trackRepositoryRemoteBranch,
```

Add routes:

```ts
app.post('/create-branch', async (c) => {
  const body = await c.req.json().catch(() => null)
  const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
  const branch = typeof body?.branch === 'string' ? body.branch : ''
  const baseBranch = typeof body?.baseBranch === 'string' ? body.baseBranch : ''
  const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
  return c.json(
    await jsonOr(
      () => createRepositoryBranch(cwd, branch, baseBranch, c.req.raw.signal, sourceToken),
      { ok: false, message: 'error.failed-read-repo' },
      'create-branch',
    ),
  )
})

app.post('/track-remote-branch', async (c) => {
  const body = await c.req.json().catch(() => null)
  const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
  const localBranch = typeof body?.localBranch === 'string' ? body.localBranch : ''
  const remoteRef = typeof body?.remoteRef === 'string' ? body.remoteRef : ''
  const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
  return c.json(
    await jsonOr(
      () => trackRepositoryRemoteBranch(cwd, localBranch, remoteRef, c.req.raw.signal, sourceToken),
      { ok: false, message: 'error.failed-read-repo' },
      'track-remote-branch',
    ),
  )
})
```

In `src/server/modules/repo-backend.ts`, import local helpers and remote helpers:

```ts
createBranch as createLocalBranch,
createTrackingBranch,
```

```ts
createRemoteBranch,
createRemoteTrackingBranch,
```

Extend `RepoBackend`:

```ts
createBranch(branch: string, baseBranch: string, signal?: AbortSignal): Promise<ExecResult>
trackRemoteBranch(localBranch: string, remoteRef: string, signal?: AbortSignal): Promise<ExecResult>
```

Local implementation:

```ts
async createBranch(branch, baseBranch, signal) {
  if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
  return await createLocalBranch(repoId, branch, baseBranch, signal)
},
async trackRemoteBranch(localBranch, remoteRef, signal) {
  if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
  return await createTrackingBranch(repoId, localBranch, remoteRef, signal)
},
```

Remote implementation:

```ts
async createBranch(branch, baseBranch, signal) {
  return await createRemoteBranch(target, { branch, baseBranch, signal })
},
async trackRemoteBranch(localBranch, remoteRef, signal) {
  return await createRemoteTrackingBranch(target, { localBranch, remoteRef, signal })
},
```

In `src/server/modules/repo-write-paths.ts`, add:

```ts
export async function createRepositoryBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.createBranch(branch, baseBranch, signal),
      sourceToken,
    )
  })
}

export async function trackRepositoryRemoteBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.trackRemoteBranch(localBranch, remoteRef, signal),
      sourceToken,
    )
  })
}
```

- [ ] **Step 7: Run local backend tests**

Run:

```text
bun run test src/shared/worktree-create.test.ts src/system/git/branches.test.ts src/server/modules/repo.test.ts
```

Expected: pass after Task 6 adds SSH helper exports.

## Task 6: SSH Remote Branch Creation

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Write failing SSH tests**

In `src/system/ssh/commands.test.ts`, add:

```ts
test('renders quoted remote branch creation commands', () => {
  expect(
    buildRemoteCommandInvocation(TARGET, {
      type: 'gitBranchCreate',
      path: '/srv/repo',
      branch: "feature/user's-work",
      baseBranch: 'main',
    }).script,
  ).toBe("git -C '/srv/repo' branch -- 'feature/user'\\''s-work' 'main'")

  expect(
    buildRemoteCommandInvocation(TARGET, {
      type: 'gitBranchTrackRemote',
      path: '/srv/repo',
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
    }).script,
  ).toBe("git -C '/srv/repo' branch --track -- 'feature/new' 'origin/feature/new'")
})
```

In `src/system/ssh/git.test.ts`, extend imports:

```ts
createRemoteBranch,
createRemoteTrackingBranch,
```

Add:

```ts
test('createRemoteBranch runs branch creation in the remote repo', async () => {
  const run = vi.fn(async () => okRemoteResult('created'))

  const result = await createRemoteBranch(TARGET, {
    branch: 'feature/new',
    baseBranch: 'main',
    run: run as any,
  })

  expect(result).toEqual({ ok: true, message: 'created' })
  expect(run).toHaveBeenCalledWith(
    { type: 'gitBranchCreate', path: '/srv/repo', branch: 'feature/new', baseBranch: 'main' },
    TARGET,
    { signal: undefined, timeoutMs: 180_000 },
  )
})

test('createRemoteTrackingBranch runs tracking branch creation in the remote repo', async () => {
  const run = vi.fn(async () => okRemoteResult('tracked'))

  const result = await createRemoteTrackingBranch(TARGET, {
    localBranch: 'feature/new',
    remoteRef: 'origin/feature/new',
    run: run as any,
  })

  expect(result).toEqual({ ok: true, message: 'tracked' })
  expect(run).toHaveBeenCalledWith(
    { type: 'gitBranchTrackRemote', path: '/srv/repo', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
    TARGET,
    { signal: undefined, timeoutMs: 180_000 },
  )
})

test('remote branch creation rejects invalid branch refs before running remote commands', async () => {
  const run = vi.fn()

  await expect(createRemoteBranch(TARGET, { branch: '-bad', baseBranch: 'main', run: run as any })).resolves.toEqual({
    ok: false,
    message: 'error.invalid-arguments',
  })
  await expect(
    createRemoteTrackingBranch(TARGET, { localBranch: 'feature/new', remoteRef: 'origin/HEAD', run: run as any }),
  ).resolves.toEqual({
    ok: false,
    message: 'error.invalid-arguments',
  })

  expect(run).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run SSH tests and verify failure**

Run:

```text
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: fail because command kinds and helpers do not exist.

- [ ] **Step 3: Add remote command kinds and scripts**

In `src/system/ssh/commands.ts`, extend `RemoteCommandKind`:

```ts
| { type: 'gitBranchCreate'; path: string; branch: string; baseBranch: string }
| { type: 'gitBranchTrackRemote'; path: string; localBranch: string; remoteRef: string }
```

Add `scriptForCommand` cases:

```ts
case 'gitBranchCreate':
  return `git -C ${shellQuote(command.path)} branch -- ${shellQuote(command.branch)} ${shellQuote(command.baseBranch)}`
case 'gitBranchTrackRemote':
  return `git -C ${shellQuote(command.path)} branch --track -- ${shellQuote(command.localBranch)} ${shellQuote(command.remoteRef)}`
```

- [ ] **Step 4: Add SSH Git helpers**

In `src/system/ssh/git.ts`, import:

```ts
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'
```

Add:

```ts
export async function createRemoteBranch(
  target: RemoteRepoTarget,
  input: { branch: string; baseBranch: string; signal?: AbortSignal; run?: RemoteGitRunner },
): Promise<ExecResult> {
  if (!isSafeBranchName(input.branch) || !isSafeBranchName(input.baseBranch)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const run: RemoteGitRunner = input.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'gitBranchCreate', path: target.remotePath, branch: input.branch, baseBranch: input.baseBranch },
    target,
    { signal: input.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  return remoteExecResult(result)
}

export async function createRemoteTrackingBranch(
  target: RemoteRepoTarget,
  input: { localBranch: string; remoteRef: string; signal?: AbortSignal; run?: RemoteGitRunner },
): Promise<ExecResult> {
  if (!isSafeBranchName(input.localBranch) || !isRemoteTrackingRef(input.remoteRef)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const run: RemoteGitRunner = input.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'gitBranchTrackRemote', path: target.remotePath, localBranch: input.localBranch, remoteRef: input.remoteRef },
    target,
    { signal: input.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  return remoteExecResult(result)
}
```

- [ ] **Step 5: Run SSH tests**

Run:

```text
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts
```

Expected: pass.

## Task 7: I18n And Final Verification

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Existing tests: `src/shared/i18n/dictionaries.test.ts`, `src/shared/i18n/snapshot.test.ts`

- [ ] **Step 1: Add i18n keys**

Add matching keys to all four dictionaries. English:

```ts
'action.create-branch': 'Create Branch...',
'action.create-branch-title': 'Create branch',
'action.create-branch-base-label': 'Base branch',
'action.create-branch-name-label': 'New branch name',
'action.create-branch-name-required': 'Enter a branch name.',
'action.create-branch-confirm': 'Create branch',
'action.create-branch-loading': 'Creating branch...',
'action.create-branch-queued': 'Waiting to create branch...',
'action.create-branch-created-title': 'Created branch',
'action.pull-remote-branch': 'Pull Remote...',
'action.pull-remote-branch-title': 'Pull remote branch',
'action.pull-remote-branch-remote-label': 'Remote branch',
'action.pull-remote-branch-load-failed': 'Could not load remote branches.',
'action.pull-remote-branch-confirm': 'Create tracking branch',
'action.pull-remote-branch-loading': 'Creating tracking branch...',
'action.pull-remote-branch-queued': 'Waiting to create tracking branch...',
'action.pull-remote-branch-created-title': 'Created tracking branch',
```

Chinese:

```ts
'action.create-branch': '新建分支...',
'action.create-branch-title': '新建分支',
'action.create-branch-base-label': '基础分支',
'action.create-branch-name-label': '新分支名',
'action.create-branch-name-required': '请输入分支名。',
'action.create-branch-confirm': '创建分支',
'action.create-branch-loading': '正在创建分支...',
'action.create-branch-queued': '等待创建分支...',
'action.create-branch-created-title': '已创建分支',
'action.pull-remote-branch': '拉取远程...',
'action.pull-remote-branch-title': '拉取远程分支',
'action.pull-remote-branch-remote-label': '远程分支',
'action.pull-remote-branch-load-failed': '无法加载远程分支。',
'action.pull-remote-branch-confirm': '创建跟踪分支',
'action.pull-remote-branch-loading': '正在创建跟踪分支...',
'action.pull-remote-branch-queued': '等待创建跟踪分支...',
'action.pull-remote-branch-created-title': '已创建跟踪分支',
```

Japanese:

```ts
'action.create-branch': '新規ブランチ...',
'action.create-branch-title': '新規ブランチ',
'action.create-branch-base-label': 'ベースブランチ',
'action.create-branch-name-label': '新しいブランチ名',
'action.create-branch-name-required': 'ブランチ名を入力してください。',
'action.create-branch-confirm': 'ブランチを作成',
'action.create-branch-loading': 'ブランチを作成中...',
'action.create-branch-queued': 'ブランチ作成待機中...',
'action.create-branch-created-title': 'ブランチを作成しました',
'action.pull-remote-branch': 'リモートを取得...',
'action.pull-remote-branch-title': 'リモートブランチを取得',
'action.pull-remote-branch-remote-label': 'リモートブランチ',
'action.pull-remote-branch-load-failed': 'リモートブランチを読み込めませんでした。',
'action.pull-remote-branch-confirm': '追跡ブランチを作成',
'action.pull-remote-branch-loading': '追跡ブランチを作成中...',
'action.pull-remote-branch-queued': '追跡ブランチ作成待機中...',
'action.pull-remote-branch-created-title': '追跡ブランチを作成しました',
```

Korean:

```ts
'action.create-branch': '새 브랜치...',
'action.create-branch-title': '새 브랜치',
'action.create-branch-base-label': '기준 브랜치',
'action.create-branch-name-label': '새 브랜치 이름',
'action.create-branch-name-required': '브랜치 이름을 입력하세요.',
'action.create-branch-confirm': '브랜치 만들기',
'action.create-branch-loading': '브랜치 만드는 중...',
'action.create-branch-queued': '브랜치 만들기 대기 중...',
'action.create-branch-created-title': '브랜치가 만들어졌습니다',
'action.pull-remote-branch': '원격 가져오기...',
'action.pull-remote-branch-title': '원격 브랜치 가져오기',
'action.pull-remote-branch-remote-label': '원격 브랜치',
'action.pull-remote-branch-load-failed': '원격 브랜치를 불러올 수 없습니다.',
'action.pull-remote-branch-confirm': '추적 브랜치 만들기',
'action.pull-remote-branch-loading': '추적 브랜치 만드는 중...',
'action.pull-remote-branch-queued': '추적 브랜치 만들기 대기 중...',
'action.pull-remote-branch-created-title': '추적 브랜치가 만들어졌습니다',
```

- [ ] **Step 2: Run targeted tests**

Run:

```text
bun run test src/web/components/branch-list/branch-create-model.test.ts src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/hooks/useBranchActionItems.test.tsx src/web/stores/repos/branch-actions.test.ts src/web/repo-client.test.ts src/shared/worktree-create.test.ts src/system/git/branches.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: pass.

- [ ] **Step 3: Run project verification**

Run:

```text
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands pass.

- [ ] **Step 4: Review diff**

Run:

```text
git diff -- docs/superpowers/specs/2026-06-14-branch-menu-create-track-remote-design.md docs/superpowers/plans/2026-06-14-branch-menu-create-track-remote.md src
```

Expected: diff contains only the branch dropdown create/track remote changes and the approved spec/plan docs.

## Self-Review

Spec coverage:

- Menu adds `新建分支...` and `拉取远程...`: Tasks 3 and 7.
- New branch name input: Tasks 2 and 3.
- Remote branch selection and local name derivation: Tasks 1, 2, and 3.
- No checkout, worktree, pull, or push side effects: Tasks 4, 5, and 6 route to branch creation commands only.
- Local and SSH support: Tasks 5 and 6.
- Existing scheduler, invalidation, refresh, and result path reuse: Task 4 and Task 5.
- Validation and duplicate filtering: Tasks 1, 2, 5, and 6.
- Tests and verification: Tasks 1 through 7.

Placeholder scan:

- No `TBD`, `TODO`, or incomplete sections.
- Each task has concrete file paths, code snippets, commands, and expected outcomes.

Type consistency:

- Store action kind is `trackRemoteBranch`.
- Menu item id is `pullRemoteBranch`.
- Client function is `trackRepositoryRemoteBranch`.
- Backend method is `trackRemoteBranch`.
- System helpers are `createTrackingBranch` and `createRemoteTrackingBranch`.
