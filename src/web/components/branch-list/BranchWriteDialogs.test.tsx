// @vitest-environment jsdom

import { act, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  CheckoutToDialog,
  CreateBranchDialog,
  MergeInDialog,
  MergeOutDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
import type { WorktreeBranchSwitchTarget } from '#/shared/worktree-branch-switch.ts'
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import type { RepositoryMergeBranchSelection } from '#/shared/repository-merge-branch.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
  getRepositoryBranchMergeOutPlan: vi.fn(),
}))

const mergeAiMocks = vi.hoisted(() => ({
  actions: [
    {
      provider: 'codex',
      label: 'Codex',
      title: 'AI handoff',
      disabled: false,
      pending: false,
      onSelect: vi.fn(async () => true),
    },
    {
      provider: 'claude',
      label: 'Claude',
      title: 'AI handoff',
      disabled: false,
      pending: false,
      onSelect: vi.fn(async () => true),
    },
  ],
  error: null as string | null,
  input: null as unknown,
}))

const aiTerminalHandoffMocks = vi.hoisted(() => ({
  buildMergeConflictAiPrompt: vi.fn(() => 'worktree conflict prompt'),
  buildMergeConflictAiCommand: vi.fn((provider: string) => `${provider} conflict command`),
  prefillAiTerminalCommand: vi.fn(async () => true),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
  getRepositoryBranchMergeOutPlan: mocks.getRepositoryBranchMergeOutPlan,
}))

vi.mock('#/web/hooks/useMergeConflictAiActions.ts', () => ({
  useMergeConflictAiActions: (input: unknown) => {
    mergeAiMocks.input = input
    return mergeAiMocks
  },
}))

vi.mock('#/web/ai-terminal-handoff.ts', () => aiTerminalHandoffMocks)

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalResizeObserver = globalThis.ResizeObserver

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  mocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  mocks.getRepositoryRemoteBranches.mockResolvedValue([])
  mocks.getRepositoryBranchMergeOutPlan.mockResolvedValue({
    ok: true,
    plan: {
      token: 'sha256:plan',
      repoId: '/repo',
      sourceBranch: 'feature/current',
      sourceWorktreePath: '/repo-feature',
      sourceHead: 'source-head',
      ready: true,
      destinations: [
        {
          destination: { kind: 'local', branch: 'main' },
          head: 'main-head',
          ready: true,
          worktreePath: '/repo-main',
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
      ],
    },
  })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('InlineCommitForm', () => {
  test('shows only available commit message providers', () => {
    render(<InlineCommitFormHarness availableProviders={['codex']} onCommit={vi.fn(async () => {})} />)

    expect(buttonByProvider('codex')).not.toBeNull()
    expect(queryButtonByProvider('claude')).toBeNull()
  })

  test('requests generation from the selected provider', async () => {
    const onGenerate = vi.fn(async () => null)

    render(
      <InlineCommitFormHarness
        availableProviders={['codex', 'claude']}
        onGenerate={onGenerate}
        onCommit={vi.fn(async () => {})}
      />,
    )

    clickButtonByProvider('codex')
    await flush()

    expect(onGenerate).toHaveBeenCalledWith('codex')
  })

  test('shows an off-by-default auto commit and push switch before the provider buttons', () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        onCommit={vi.fn(async () => {})}
        onCommitAndPush={vi.fn(async () => {})}
      />,
    )

    const toggle = switchByLabel('action.commit-auto-commit-and-push')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.compareDocumentPosition(buttonByProvider('codex')) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  test('does not show the auto commit and push switch without push capability', () => {
    render(<InlineCommitFormHarness availableProviders={['codex']} onCommit={vi.fn(async () => {})} />)

    expect(querySwitchByLabel('action.commit-auto-commit-and-push')).toBeNull()
  })

  test('hides manual controls while automation is enabled and restores them when disabled', () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        initialMessage="feat: manual message"
        onCommit={vi.fn(async () => {})}
        onCommitAndPush={vi.fn(async () => {})}
      />,
    )

    expect(document.querySelector('#inline-commit-message')).not.toBeNull()
    expect(queryButtonByText('dialog.cancel')).not.toBeNull()
    expect(queryButtonByText('action.commit-confirm')).not.toBeNull()
    expect(queryButtonByText('action.commit-and-push-confirm')).not.toBeNull()

    clickSwitchByLabel('action.commit-auto-commit-and-push')

    expect(document.querySelector('#inline-commit-message')).toBeNull()
    expect(queryButtonByText('dialog.cancel')).toBeNull()
    expect(queryButtonByText('action.commit-confirm')).toBeNull()
    expect(queryButtonByText('action.commit-and-push-confirm')).toBeNull()

    clickSwitchByLabel('action.commit-auto-commit-and-push')

    expect(textarea('#inline-commit-message').value).toBe('feat: manual message')
    expect(queryButtonByText('dialog.cancel')).not.toBeNull()
    expect(queryButtonByText('action.commit-confirm')).not.toBeNull()
    expect(queryButtonByText('action.commit-and-push-confirm')).not.toBeNull()
  })

  test('only generates a message while automation remains off', async () => {
    const onGenerate = vi.fn(async () => 'feat: generated message')
    const onCommitAndPush = vi.fn(async () => {})

    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        onGenerate={onGenerate}
        onCommit={vi.fn(async () => {})}
        onCommitAndPush={onCommitAndPush}
      />,
    )

    clickButtonByProvider('codex')
    await flush()

    expect(onGenerate).toHaveBeenCalledWith('codex')
    expect(onCommitAndPush).not.toHaveBeenCalled()
  })

  test('commits and pushes the generated message when automation is enabled', async () => {
    const onGenerate = vi.fn(async () => 'feat: generated message')
    const onCommit = vi.fn(async () => {})
    const onCommitAndPush = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        initialMessage="manual message"
        onGenerate={onGenerate}
        onClose={onClose}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    )

    clickSwitchByLabel('action.commit-auto-commit-and-push')
    clickButtonByProvider('codex')
    await flush()

    expect(onGenerate).toHaveBeenCalledWith('codex')
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCommitAndPush).toHaveBeenCalledWith('feat: generated message')
    expect(document.querySelector('#inline-commit-message')).toBeNull()
    expect(document.body.textContent).not.toContain('action.commit-replace-message-title')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('stops automation when message generation fails', async () => {
    const onGenerate = vi.fn(async () => null)
    const onCommit = vi.fn(async () => {})
    const onCommitAndPush = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        onGenerate={onGenerate}
        onClose={onClose}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    )

    clickSwitchByLabel('action.commit-auto-commit-and-push')
    clickButtonByProvider('codex')
    await flush()

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCommitAndPush).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('keeps the generated message and error visible when automatic submission fails', async () => {
    const onCommitAndPush = vi.fn(async () => {
      throw new Error('commit failed')
    })
    const onClose = vi.fn()

    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        onGenerate={vi.fn(async () => 'feat: generated message')}
        onClose={onClose}
        onCommit={vi.fn(async () => {})}
        onCommitAndPush={onCommitAndPush}
      />,
    )

    clickSwitchByLabel('action.commit-auto-commit-and-push')
    clickButtonByProvider('codex')
    await flush()

    expect(document.querySelector('#inline-commit-message')).toBeNull()
    expect(document.body.textContent).toContain('commit failed')
    expect(onClose).not.toHaveBeenCalled()

    clickSwitchByLabel('action.commit-auto-commit-and-push')
    expect(textarea('#inline-commit-message').value).toBe('feat: generated message')
  })

  test('shows raw controlled provider errors', () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        initialError="Codex auth token expired"
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(document.body.textContent).toContain('Codex auth token expired')
  })

  test('asks before applying a pending generated replacement', () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex', 'claude']}
        initialMessage="manual message"
        initialPendingGeneratedMessage="fix: generated replacement"
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(textarea('#inline-commit-message').value).toBe('manual message')
    expect(document.body.textContent).toContain('action.commit-replace-message-title')

    clickButtonByText('action.commit-replace-message-confirm')

    expect(textarea('#inline-commit-message').value).toBe('fix: generated replacement')
  })

  test('submits trimmed commit message and closes after success', async () => {
    const onCommit = vi.fn(async () => {})
    const onClose = vi.fn()

    render(<InlineCommitFormHarness initialMessage="  feat: inline commit  " onClose={onClose} onCommit={onCommit} />)
    clickButtonByText('action.commit-confirm')
    await flush()

    expect(onCommit).toHaveBeenCalledWith('feat: inline commit')
    expect(onClose).toHaveBeenCalled()
  })

  test('submits trimmed commit message through commit and push action', async () => {
    const onCommit = vi.fn(async () => {})
    const onCommitAndPush = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <InlineCommitFormHarness
        initialMessage="  feat: inline commit  "
        onClose={onClose}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    )
    clickButtonByText('action.commit-and-push-confirm')
    await flush()

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCommitAndPush).toHaveBeenCalledWith('feat: inline commit')
    expect(onClose).toHaveBeenCalled()
  })

  test('keeps message visible when commit fails', async () => {
    const onCommit = vi.fn(async () => {
      throw new Error('nothing to commit')
    })
    const onClose = vi.fn()

    render(<InlineCommitFormHarness initialMessage="feat: inline commit" onClose={onClose} onCommit={onCommit} />)
    clickButtonByText('action.commit-confirm')
    await flush()

    expect(textarea('#inline-commit-message').value).toBe('feat: inline commit')
    expect(document.body.textContent).toContain('nothing to commit')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('MergeInDialog', () => {
  test('presents pull-merge-push as the primary and rightmost action', async () => {
    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onPull={vi.fn(async () => ({ ok: true, message: 'pulled' }))}
        onMerge={vi.fn(async () => ({ ok: true, message: 'merged' }))}
        onPush={vi.fn(async () => undefined)}
      />,
    )
    await flush()
    await flush()

    const footer = document.body.querySelector('[data-slot="merge-dialog-form"] [data-slot="dialog-footer"]')
    const buttons = [...(footer?.querySelectorAll<HTMLButtonElement>('button') ?? [])]

    expect(buttons.map((button) => button.textContent)).toEqual([
      'dialog.cancel',
      'action.merge-in-confirm',
      'action.merge-in-and-push-confirm',
    ])
    expect(buttonByText('action.merge-in-confirm').dataset.variant).toBe('outline')
    expect(buttonByText('action.merge-in-and-push-confirm').dataset.variant).toBe('default')
  })

  test('filters merge source branches from the select search input', async () => {
    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main'), repoBranch('release/v2')]}
        onClose={vi.fn()}
        onMerge={vi.fn(async () => ({ ok: true, message: 'merged' }))}
      />,
    )

    openSelect('#merge-select')
    const search = document.body.querySelector<HTMLInputElement>('[aria-label="branches.search-label"]')
    expect(search).not.toBeNull()
    if (!search) return
    changeInput(search, 'release')

    expect(document.body.querySelector('[data-merge-source-key="local:release/v2"]')).not.toBeNull()
    expect(document.body.querySelector('[data-merge-source-key="local:main"]')).toBeNull()
  })

  test('does not show AI buttons for ordinary merge errors', async () => {
    render(
      <MergeInDialog
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
    clickButtonByText('action.merge-in-confirm')
    await flush()

    expect(document.body.textContent).toContain('fatal: bad revision')
    expect(queryButtonByText('Codex')).toBeNull()
  })

  test('shows AI buttons for merge conflict errors', async () => {
    render(
      <MergeInDialog
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
    clickButtonByText('action.merge-in-confirm')
    await flush()

    expect(document.body.textContent).toContain('CONFLICT (content)')
    expect(buttonByText('Codex')).not.toBeNull()
    expect(buttonByText('Claude')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="action.merge-conflict-ai-copy-prompt"]')).not.toBeNull()
  })

  test('adapts a worktree conflict to the shared provider handoff callback', async () => {
    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo-feature"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-in-confirm')
    await flush()

    const input = mergeAiMocks.input as {
      onHandoff: (provider: 'codex' | 'claude') => Promise<boolean>
    }
    await expect(input.onHandoff('codex')).resolves.toBe(true)
    expect(aiTerminalHandoffMocks.buildMergeConflictAiCommand).toHaveBeenCalledWith('codex')
    expect(aiTerminalHandoffMocks.prefillAiTerminalCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: '/repo',
        branch: 'feature/current',
        worktreePath: '/repo-feature',
        command: 'codex conflict command',
      }),
    )
  })

  test('runs pull, merge and push from the pull-merge-push action', async () => {
    const calls: string[] = []
    const onClose = vi.fn(() => calls.push('close'))
    const onPull = vi.fn(async () => {
      calls.push('pull')
      return { ok: true, message: 'pulled' }
    })
    const onMerge = vi.fn(async (source: RepositoryMergeBranchSelection) => {
      calls.push(`merge:${source.kind === 'local' ? source.branch : source.remoteRef}`)
      return { ok: true, message: 'merged' }
    })
    const onPush = vi.fn(async () => {
      calls.push('push')
    })

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={onClose}
        onPull={onPull}
        onMerge={onMerge}
        onPush={onPush}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-in-and-push-confirm')
    await flush()

    expect(onPull).toHaveBeenCalled()
    expect(onMerge).toHaveBeenCalledWith({ kind: 'local', branch: 'main' })
    expect(onPush).toHaveBeenCalled()
    expect(calls).toEqual(['pull', 'merge:main', 'push', 'close'])
  })

  test('keeps same-named local and remote sources distinct and submits the remote identity', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main'])
    const onMerge = vi.fn(async () => ({ ok: true, message: 'merged' }))

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('origin/main')]}
        onClose={vi.fn()}
        onMerge={onMerge}
      />,
    )
    await flush()
    await flush()

    openSelect('#merge-select')
    const localOption = document.body.querySelector<HTMLElement>('[data-merge-source-key="local:origin/main"]')
    const remoteOption = document.body.querySelector<HTMLElement>('[data-merge-source-key="remote:origin/main"]')
    expect(localOption).not.toBeNull()
    expect(remoteOption).not.toBeNull()
    expect(remoteOption?.textContent).toContain('tab.remote-branches')

    act(() => {
      remoteOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.textContent).toContain('action.merge-in-remote-fetch-note')
    expect(buttonByText('action.merge-in-remote-confirm')).not.toBeNull()

    clickButtonByText('action.merge-in-remote-confirm')
    await flush()

    expect(onMerge).toHaveBeenCalledWith({ kind: 'remote', remoteRef: 'origin/main' })
  })

  test('shows remote source loading and empty states without hiding local candidates', async () => {
    let resolveRemoteBranches!: (branches: string[]) => void
    mocks.getRepositoryRemoteBranches.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        resolveRemoteBranches = resolve
      }),
    )

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={vi.fn(async () => ({ ok: true, message: 'merged' }))}
      />,
    )

    expect(document.body.textContent).toContain('action.merge-in-remote-loading')
    openSelect('#merge-select')
    expect(document.body.querySelector('[data-merge-source-key="local:main"]')).not.toBeNull()

    resolveRemoteBranches([])
    await flush()
    await flush()

    expect(document.body.textContent).toContain('action.merge-in-remote-empty')
  })

  test('shows a remote source load failure while preserving local merge', async () => {
    mocks.getRepositoryRemoteBranches.mockRejectedValueOnce(new Error('offline'))

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={vi.fn(async () => ({ ok: true, message: 'merged' }))}
      />,
    )
    await flush()
    await flush()

    expect(document.body.textContent).toContain('action.merge-in-remote-load-failed')
    selectFirstMergeCandidate()
    expect(buttonByText('action.merge-in-confirm').disabled).toBe(false)
  })

  test('keeps long merge errors inside a bounded scroll area', async () => {
    const longError = Array.from({ length: 30 }, (_, index) => `CONFLICT (content): file-${index}.ts`).join('\n')

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: longError, reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-in-confirm')
    await flush()

    const scrollArea = document.body.querySelector('[data-slot="merge-dialog-error-scroll"]')
    const form = document.body.querySelector('[data-slot="merge-dialog-form"]')
    const field = document.body.querySelector('[data-slot="merge-dialog-branch-field"]')
    const error = document.body.querySelector('[data-slot="merge-dialog-error"]')
    const aiPanel = document.body.querySelector('[data-slot="merge-conflict-ai-actions"]')

    expect(scrollArea).not.toBeNull()
    expect(scrollArea?.className).toContain('max-h-')
    expect(form?.className).toContain('min-w-0')
    expect(field?.className).toContain('min-w-0')
    expect(error?.className).toContain('min-w-0')
    expect(aiPanel?.className).toContain('min-w-0')
    expect(document.body.textContent).toContain('CONFLICT (content): file-0.ts')
    expect(document.body.textContent).toContain('CONFLICT (content): file-29.ts')
  })

  test('closes after a successful AI handoff', async () => {
    const onClose = vi.fn()

    render(
      <MergeInDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={onClose}
        onMerge={async () => ({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-in-confirm')
    await flush()
    clickButtonByText('Codex')
    await flush()

    expect(mergeAiMocks.actions[0]!.onSelect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('MergeOutDialog', () => {
  test('presents pull-merge-push as the primary and rightmost action', async () => {
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={vi.fn()}
      />,
    )
    await flush()

    const footer = document.body.querySelector('[data-slot="merge-out-dialog-form"] [data-slot="dialog-footer"]')
    const buttons = [...(footer?.querySelectorAll<HTMLButtonElement>('button') ?? [])]

    expect(buttons.map((button) => button.textContent)).toEqual([
      'dialog.cancel',
      'action.merge-out-confirm',
      'action.merge-out-pull-merge-push-confirm',
    ])
    expect(buttonByText('action.merge-out-confirm').dataset.variant).toBe('outline')
    expect(buttonByText('action.merge-out-pull-merge-push-confirm').dataset.variant).toBe('default')
  })

  test('filters merge destination branches from the select search input', async () => {
    mocks.getRepositoryBranchMergeOutPlan.mockResolvedValueOnce({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: '/repo',
        sourceBranch: 'feature/current',
        sourceWorktreePath: '/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: ['main', 'release/v2'].map((branch) => ({
          destination: { kind: 'local' as const, branch },
          head: `${branch}-head`,
          ready: true,
          requiresTemporaryWorktree: true,
          pullMergePushReady: true,
        })),
      },
    })
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={vi.fn()}
      />,
    )
    await flush()

    openSelect('#merge-out-select')
    const search = document.body.querySelector<HTMLInputElement>('[aria-label="branches.search-label"]')
    expect(search).not.toBeNull()
    if (!search) return
    changeInput(search, 'release')

    expect(document.body.querySelector('[data-merge-destination-key="local:release/v2"]')).not.toBeNull()
    expect(document.body.querySelector('[data-merge-destination-key="local:main"]')).toBeNull()
  })

  test('loads server-planned destinations and keeps the source read-only', async () => {
    mocks.getRepositoryBranchMergeOutPlan.mockResolvedValueOnce({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: '/repo',
        sourceBranch: 'feature/current',
        sourceWorktreePath: '/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: [
          {
            destination: { kind: 'local', branch: 'dirty' },
            head: 'dirty-head',
            ready: false,
            worktreePath: '/repo-dirty',
            requiresTemporaryWorktree: false,
            pullMergePushReady: true,
            blockReason: 'dirty-worktree',
          },
          {
            destination: { kind: 'local', branch: 'main' },
            head: 'main-head',
            ready: true,
            requiresTemporaryWorktree: true,
            pullMergePushReady: false,
          },
        ],
      },
    })

    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={vi.fn()}
      />,
    )
    await flush()

    expect(input('#merge-out-source')).toMatchObject({ value: 'feature/current', readOnly: true })
    openSelect('#merge-out-select')
    const options = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('dirty'),
      expect.stringContaining('main'),
    ])
    expect(options[0]?.getAttribute('aria-disabled')).toBe('true')
    expect(options[0]?.textContent).toContain('action.merge-out-destination-dirty')
    expect(options.some((option) => option.textContent?.includes('feature/current'))).toBe(false)
  })

  test('submits the exact merge-only source and destination identity', async () => {
    const onMergeOut = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const onClose = vi.fn()
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={onClose}
        onMergeOut={onMergeOut}
      />,
    )
    await flush()

    expect(buttonByText('action.merge-out-confirm').disabled).toBe(true)
    selectFirstMergeOutCandidate()
    clickButtonByText('action.merge-out-confirm')
    await flush()

    expect(onMergeOut).toHaveBeenCalledWith({
      repoId: '/repo',
      planToken: 'sha256:plan',
      sourceBranch: 'feature/current',
      sourceWorktreePath: '/repo-feature',
      destination: { kind: 'local', branch: 'main' },
      mode: 'merge',
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('keeps remote mode visible and gates it by destination upstream', async () => {
    mocks.getRepositoryBranchMergeOutPlan.mockResolvedValueOnce({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: '/repo',
        sourceBranch: 'feature/current',
        sourceWorktreePath: '/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: [
          {
            destination: { kind: 'local', branch: 'main' },
            head: 'main-head',
            ready: true,
            requiresTemporaryWorktree: true,
            pullMergePushReady: false,
          },
        ],
      },
    })
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={vi.fn()}
      />,
    )
    await flush()

    selectFirstMergeOutCandidate()
    expect(buttonByText('action.merge-out-pull-merge-push-confirm').disabled).toBe(true)
  })

  test('keeps same-named remote destinations distinct, disables merge-only, and submits synchronized mode', async () => {
    const onMergeOut = vi.fn(async () => ({ ok: true, message: 'merged' }))
    mocks.getRepositoryBranchMergeOutPlan.mockResolvedValueOnce({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: '/repo',
        sourceBranch: 'feature/current',
        sourceWorktreePath: '/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: [
          {
            destination: { kind: 'local', branch: 'origin/main' },
            head: 'local-head',
            ready: true,
            requiresTemporaryWorktree: true,
            pullMergePushReady: false,
          },
          {
            destination: { kind: 'remote', remoteRef: 'origin/main' },
            head: 'remote-head',
            ready: true,
            requiresTemporaryWorktree: true,
            pullMergePushReady: true,
          },
        ],
      },
    })

    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={onMergeOut}
      />,
    )
    await flush()
    openSelect('#merge-out-select')

    expect(document.body.querySelector('[data-merge-destination-key="local:origin/main"]')).not.toBeNull()
    const remoteOption = document.body.querySelector<HTMLElement>('[data-merge-destination-key="remote:origin/main"]')
    expect(remoteOption?.textContent).toContain('tab.remote-branches')
    act(() => {
      remoteOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(buttonByText('action.merge-out-confirm').disabled).toBe(true)
    expect(buttonByText('action.merge-out-pull-merge-push-confirm').disabled).toBe(false)
    expect(document.body.textContent).toContain('action.merge-out-remote-push-note')

    clickButtonByText('action.merge-out-pull-merge-push-confirm')
    await flush()

    expect(onMergeOut).toHaveBeenCalledWith({
      repoId: '/repo',
      planToken: 'sha256:plan',
      sourceBranch: 'feature/current',
      sourceWorktreePath: '/repo-feature',
      destination: { kind: 'remote', remoteRef: 'origin/main' },
      mode: 'pull-merge-push',
    })
  })

  test('refreshes an expired plan without executing again', async () => {
    const onMergeOut = vi.fn(async () => ({ ok: false, message: 'error.merge-out-plan-changed' }))
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={onMergeOut}
      />,
    )
    await flush()
    selectFirstMergeOutCandidate()
    clickButtonByText('action.merge-out-confirm')
    await flush()
    await flush()

    expect(onMergeOut).toHaveBeenCalledTimes(1)
    expect(mocks.getRepositoryBranchMergeOutPlan).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('error.merge-out-plan-changed')
  })

  test('uses only the returned conflict worktree for AI takeover', async () => {
    const onMergeOut = vi.fn(async () => ({
      ok: false,
      message: 'conflict',
      reason: 'merge-conflict' as const,
      conflictWorktree: { branch: 'main', path: '/repo-main' },
    }))
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={onMergeOut}
      />,
    )
    await flush()
    selectFirstMergeOutCandidate()
    clickButtonByText('action.merge-out-confirm')
    await flush()

    expect(buttonByText('Codex')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="action.merge-conflict-ai-copy-prompt"]')).not.toBeNull()
    const input = mergeAiMocks.input as {
      onHandoff: (provider: 'codex' | 'claude') => Promise<boolean>
    }
    await expect(input.onHandoff('claude')).resolves.toBe(true)
    expect(aiTerminalHandoffMocks.prefillAiTerminalCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: '/repo',
        branch: 'main',
        worktreePath: '/repo-main',
        command: 'claude conflict command',
      }),
    )
  })

  test('aborts plan loading when closed', async () => {
    let requestSignal: AbortSignal | undefined
    mocks.getRepositoryBranchMergeOutPlan.mockImplementationOnce(async (_request, signal) => {
      requestSignal = signal
      return await new Promise(() => {})
    })
    render(
      <MergeOutDialog
        open
        repoId="/repo"
        sourceBranch="feature/current"
        sourceWorktreePath="/repo-feature"
        onClose={vi.fn()}
        onMergeOut={vi.fn()}
      />,
    )
    await flush()

    act(() => root?.unmount())
    root = null
    expect(requestSignal?.aborted).toBe(true)
  })
})

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
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/existing', 'origin/feature/new'])
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
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('feature/new')

    clickButtonByText('action.pull-remote-branch-confirm')
    await flush()

    expect(onTrack).toHaveBeenCalledWith({
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
    })
  })

  test('filters remote refs locally with fuzzy search before submit', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/api-client', 'origin/bugfix/login-flow'])
    const onTrack = vi.fn(async () => {})

    render(
      <PullRemoteBranchDialog open repoId="/repo" allBranches={[]} busy={false} onClose={vi.fn()} onTrack={onTrack} />,
    )
    await flush()
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('feature/api-client')

    openSelect('#pull-remote-ref')
    expect(input('#pull-remote-ref-filter').closest('[data-slot="select-content"]')).not.toBeNull()

    setInputValue('#pull-remote-ref-filter', 'fix login')
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('bugfix/login-flow')

    clickButtonByText('action.pull-remote-branch-confirm')
    await flush()

    expect(onTrack).toHaveBeenCalledWith({
      localBranch: 'bugfix/login-flow',
      remoteRef: 'origin/bugfix/login-flow',
    })
  })

  test('keeps remote ref search focused while typing consecutive filters', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce([
      'origin/feature/api-client',
      'origin/bugfix/login-flow',
      'origin/release/searchable-branch',
    ])

    render(
      <PullRemoteBranchDialog open repoId="/repo" allBranches={[]} busy={false} onClose={vi.fn()} onTrack={vi.fn()} />,
    )
    await flush()
    await flush()

    openSelect('#pull-remote-ref')
    const filter = input('#pull-remote-ref-filter')
    filter.focus()
    setInputValue('#pull-remote-ref-filter', 'sea')
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('release/searchable-branch')
    expect(document.activeElement).toBe(filter)

    setInputValue('#pull-remote-ref-filter', 'search')
    await flush()

    expect(input('#pull-remote-ref-filter').value).toBe('search')
    expect(document.activeElement).toBe(filter)
  })

  test('constrains the remote ref dropdown to the trigger width', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce([
      'origin/feature/really-long-remote-branch-name-that-should-not-push-the-popover-sideways',
    ])

    render(
      <PullRemoteBranchDialog open repoId="/repo" allBranches={[]} busy={false} onClose={vi.fn()} onTrack={vi.fn()} />,
    )
    await flush()
    await flush()

    openSelect('#pull-remote-ref')

    expect(input('#pull-remote-ref-filter').closest('[data-slot="select-content"]')?.className).toContain(
      'w-[var(--radix-select-trigger-width)]',
    )
  })
})

describe('CheckoutToDialog', () => {
  test('loads a remote ref and submits its derived local tracking branch', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/remote'])
    const onCheckout = vi.fn(async (_target: WorktreeBranchSwitchTarget) => {})

    render(
      <CheckoutToDialog
        open
        repoId="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onCheckout={onCheckout}
      />,
    )
    await flush()

    selectCheckoutCandidate('remote:origin/feature/remote')

    expect(input('#checkout-to-local-branch').value).toBe('feature/remote')
    clickButtonByText('action.checkout-to-confirm')
    await flush()

    expect(onCheckout).toHaveBeenCalledWith({
      kind: 'remoteBranch',
      remoteRef: 'origin/feature/remote',
      localBranch: 'feature/remote',
    })
  })

  test('requires a unique editable local branch name for a remote ref', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main'])
    const onCheckout = vi.fn(async (_target: WorktreeBranchSwitchTarget) => {})

    render(
      <CheckoutToDialog
        open
        repoId="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onCheckout={onCheckout}
      />,
    )
    await flush()

    selectCheckoutCandidate('remote:origin/main')

    expect(document.body.textContent).toContain('action.create-worktree-branch-exists')
    expect(buttonByText('action.checkout-to-confirm').disabled).toBe(true)

    setInputValue('#checkout-to-local-branch', 'feature/from-origin')
    clickButtonByText('action.checkout-to-confirm')
    await flush()

    expect(onCheckout).toHaveBeenCalledWith({
      kind: 'remoteBranch',
      remoteRef: 'origin/main',
      localBranch: 'feature/from-origin',
    })
  })

  test('keeps local switching available when remote refs fail to load', async () => {
    mocks.getRepositoryRemoteBranches.mockRejectedValueOnce(new Error('offline'))
    const onCheckout = vi.fn(async (_target: WorktreeBranchSwitchTarget) => {})

    render(
      <CheckoutToDialog
        open
        repoId="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onCheckout={onCheckout}
      />,
    )
    await flush()

    expect(document.body.textContent).toContain('action.checkout-to-remote-load-failed')
    selectCheckoutCandidate('local:main')
    clickButtonByText('action.checkout-to-confirm')
    await flush()

    expect(onCheckout).toHaveBeenCalledWith({ kind: 'localBranch', branch: 'main' })
  })

  test('filters local and remote candidates from one search input', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/remote'])

    render(
      <CheckoutToDialog
        open
        repoId="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main'), repoBranch('release/local')]}
        onClose={vi.fn()}
        onCheckout={vi.fn()}
      />,
    )
    await flush()

    openSelect('#checkout-to-select')
    setInputValue('#checkout-to-branch-search', 'remote')
    await flush()

    expect(document.body.querySelector('[data-checkout-target-key="remote:origin/feature/remote"]')).not.toBeNull()
    expect(document.body.querySelector('[data-checkout-target-key="local:main"]')).toBeNull()
    expect(document.body.querySelector('[data-checkout-target-key="local:release/local"]')).toBeNull()
  })
})

function InlineCommitFormHarness({
  availableProviders = [],
  initialMessage = '',
  initialError = null,
  initialPendingGeneratedMessage = null,
  onClose = vi.fn(),
  onCommit,
  onCommitAndPush,
  onGenerate = vi.fn(async () => null),
}: {
  availableProviders?: Array<'codex' | 'claude'>
  initialMessage?: string
  initialError?: string | null
  initialPendingGeneratedMessage?: string | null
  onClose?: () => void
  onCommit: (message: string) => Promise<void>
  onCommitAndPush?: (message: string) => Promise<void>
  onGenerate?: (provider: 'codex' | 'claude') => Promise<string | null>
}) {
  const [message, setMessage] = useState(initialMessage)
  const [error, setError] = useState<string | null>(initialError)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(initialPendingGeneratedMessage)
  return (
    <InlineCommitForm
      message={message}
      error={error}
      availableProviders={availableProviders}
      generating={null}
      pendingGeneratedMessage={pendingGeneratedMessage}
      onMessageChange={setMessage}
      onErrorChange={setError}
      onGenerate={onGenerate}
      onApplyPendingGeneratedMessage={() => {
        if (!pendingGeneratedMessage) return
        setMessage(pendingGeneratedMessage)
        setPendingGeneratedMessage(null)
        setError(null)
      }}
      onClearPendingGeneratedMessage={() => setPendingGeneratedMessage(null)}
      onClose={onClose}
      onCommit={onCommit}
      onCommitAndPush={onCommitAndPush}
    />
  )
}

function render(element: ReactNode) {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => {
    root!.render(element)
  })
}

function textarea(selector: string): HTMLTextAreaElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea: ${selector}`)
  return element
}

function input(selector: string): HTMLInputElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input: ${selector}`)
  return element
}

function changeInput(element: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${selector}`)
  return element
}

function repoBranch(name: string): RepoBranchState {
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

function queryButtonByText(text: string): HTMLButtonElement | null {
  const element = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  return element instanceof HTMLButtonElement ? element : null
}

function buttonByText(text: string): HTMLButtonElement {
  const element = queryButtonByText(text)
  if (!element) throw new Error(`Missing button text: ${text}`)
  return element
}

function queryButtonByProvider(provider: 'codex' | 'claude'): HTMLButtonElement | null {
  const element = document.body.querySelector(`[data-provider="${provider}"]`)
  return element instanceof HTMLButtonElement ? element : null
}

function buttonByProvider(provider: 'codex' | 'claude'): HTMLButtonElement {
  const element = queryButtonByProvider(provider)
  if (!element) throw new Error(`Missing provider button: ${provider}`)
  return element
}

function querySwitchByLabel(label: string): HTMLButtonElement | null {
  const element = document.body.querySelector(`[role="switch"][aria-label="${label}"]`)
  return element instanceof HTMLButtonElement ? element : null
}

function switchByLabel(label: string): HTMLButtonElement {
  const element = querySwitchByLabel(label)
  if (!element) throw new Error(`Missing switch label: ${label}`)
  return element
}

function clickSwitchByLabel(label: string) {
  const element = switchByLabel(label)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function openSelect(selector: string) {
  const element = button(selector)
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })
}

function selectFirstMergeCandidate() {
  openSelect('#merge-select')
  const item = document.body.querySelector<HTMLElement>('[role="option"]')
  if (!item) throw new Error('Missing merge candidate option')
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function selectFirstMergeOutCandidate() {
  openSelect('#merge-out-select')
  const item = document.body.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
  if (!item) throw new Error('Missing merge-out candidate option')
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function selectCheckoutCandidate(key: string) {
  openSelect('#checkout-to-select')
  const item = document.body.querySelector<HTMLElement>(`[data-checkout-target-key="${key}"]`)
  if (!item) throw new Error(`Missing checkout candidate: ${key}`)
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function clickButtonByProvider(provider: 'codex' | 'claude') {
  const element = buttonByProvider(provider)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}
