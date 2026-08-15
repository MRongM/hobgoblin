// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CreateWorktreeDialog } from '#/web/components/CreateWorktreeDialog.tsx'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

const repoClientMocks = vi.hoisted(() => ({
  getRepositoryFileTree: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return { ...actual, getRepositoryFileTree: repoClientMocks.getRepositoryFileTree }
})

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const testWindow = window as unknown as { goblinNative?: unknown }
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
  testWindow.goblinNative = {
    homeDir: '/Users/tester',
    initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    pathForFile: () => '',
    invokeRpc: async () => null,
    abortRpc: async () => true,
    onEvent: () => () => {},
  }
  repoClientMocks.getRepositoryFileTree.mockReset()
  repoClientMocks.getRepositoryFileTree.mockResolvedValue({
    ok: true,
    worktreePath: '/tmp/repo-base',
    dirPath: '/tmp/repo-base',
    entries: [
      {
        name: '.env',
        absolutePath: '/tmp/repo-base/.env',
        relativePath: '.env',
        kind: 'file',
      },
    ],
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
  delete testWindow.goblinNative
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  vi.useRealTimers()
})

describe('CreateWorktreeDialog', () => {
  test('focuses the new branch input when opened', () => {
    render(<CreateWorktreeDialog open repo={createRepo()} onClose={vi.fn()} onCreate={vi.fn(async () => {})} />)

    expect(document.activeElement).toBe(input('#cwt-branch'))
  })

  test('prefills a dated feature branch from the current branch', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 29, 12))

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={vi.fn()} onCreate={vi.fn(async () => {})} />)

    expect(input('#cwt-branch').value).toBe('feat/20260729-main')
  })

  test('closes immediately after submitting create', () => {
    const deferred = createDeferred<void>()
    const onClose = vi.fn()
    const onCreate = vi.fn(() => deferred.promise)

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={onClose} onCreate={onCreate} />)

    setInputValue('#cwt-branch', 'feature/new')
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-feature-new',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/new',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    deferred.resolve()
  })

  test('uses the selected branch as the default new-worktree base', () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => {})

    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        defaultBranch="feature/base"
        onClose={onClose}
        onCreate={onCreate}
      />,
    )

    setInputValue('#cwt-branch', 'feature/new')
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-feature-new',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/new',
          creationBase: { kind: 'localBranch', branch: 'feature/base' },
        },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('renders the base branch selector compactly with mode-field spacing', () => {
    render(<CreateWorktreeDialog open repo={createRepo()} onClose={vi.fn()} onCreate={vi.fn(async () => {})} />)

    expect(document.querySelector('#cwt-base')?.getAttribute('data-size')).toBe('sm')
    expect(document.querySelector('#cwt-base')?.closest('[data-slot="field"]')?.className).toContain('mt-2')
  })

  test('closes immediately even when create resolves with a failure result later', async () => {
    const onClose = vi.fn()
    const deferred = createDeferred<void>()
    const onCreate = vi.fn(() => deferred.promise)

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={onClose} onCreate={onCreate} />)

    setInputValue('#cwt-branch', 'feature/new')
    click('button[type="submit"]')
    expect(onClose).toHaveBeenCalledTimes(1)

    deferred.resolve()
    await flush()
  })

  test('allows home-relative remote worktree paths', async () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => {})

    render(<CreateWorktreeDialog open repo={createRemoteRepo()} onClose={onClose} onCreate={onCreate} />)

    setInputValue('#cwt-branch', 'feature/new')
    setInputValue('#cwt-path', '~/trees/repo-feature-new')
    click('button[type="submit"]')
    await flush()

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '~/trees/repo-feature-new',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/new',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('creates a worktree from an existing local branch without new branch args', () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => {})

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={onClose} onCreate={onCreate} />)

    clickButtonByText('action.create-worktree-mode-existing')
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-main',
        mode: { kind: 'existingBranch', branch: 'main' },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('defaults existing-branch synchronization on when the branch has a usable upstream', () => {
    const repo = createRepo()
    repo.data.branches[0]!.tracking = 'origin/main'
    const onCreate = vi.fn(async () => {})

    render(<CreateWorktreeDialog open repo={repo} onClose={vi.fn()} onCreate={onCreate} />)

    clickButtonByText('action.create-worktree-mode-existing')
    expect(input('#cwt-sync-before-create').checked).toBe(true)
    expect(input('#cwt-sync-before-create').disabled).toBe(false)
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-main',
        mode: { kind: 'existingBranch', branch: 'main' },
        syncBeforeCreate: true,
      },
      selections: [],
    })
  })

  test('turns existing-branch synchronization off when the selected branch has no usable upstream', () => {
    const repo = createRepo()
    repo.data.branches[0]!.tracking = 'origin/main'
    repo.data.branches[1]!.tracking = 'origin/feature/base'
    repo.data.branches[1]!.trackingGone = true
    render(<CreateWorktreeDialog open repo={repo} onClose={vi.fn()} onCreate={vi.fn(async () => {})} />)

    clickButtonByText('action.create-worktree-mode-existing')
    openSelect('#cwt-existing-branch')
    clickOptionByText('feature/base')

    expect(input('#cwt-sync-before-create').checked).toBe(false)
    expect(input('#cwt-sync-before-create').disabled).toBe(true)
    expect(document.body.textContent).toContain('action.create-worktree-sync-no-upstream')
  })

  test('creates a tracking worktree from the first remote branch', async () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => {})
    testWindow.goblinNative = {
      ...(testWindow.goblinNative as object),
      initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    }
    const jsonMock = vi.fn(async () => ['origin/feature/remote'])
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: jsonMock,
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={onClose} onCreate={onCreate} />)

    clickButtonByText('action.create-worktree-mode-remote')
    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    await waitForAssertion(() => {
      expect(jsonMock).toHaveBeenCalled()
    })
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe('feature/remote')
    })
    expect(button('button[type="submit"]').disabled).toBe(false)
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-feature-remote',
        mode: { kind: 'trackRemoteBranch', remoteRef: 'origin/feature/remote', localBranch: 'feature/remote' },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('filters remote branches locally before creating a tracking worktree', async () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => {})
    testWindow.goblinNative = {
      ...(testWindow.goblinNative as object),
      initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    }
    const jsonMock = vi.fn(async () => ['origin/feature/api-client', 'origin/bugfix/login-flow'])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: jsonMock,
      })),
    )

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={onClose} onCreate={onCreate} />)

    clickButtonByText('action.create-worktree-mode-remote')
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe('feature/api-client')
    })

    openSelect('#cwt-remote-ref')
    expect(input('#cwt-remote-ref-filter').closest('[data-slot="select-content"]')).not.toBeNull()

    setInputValue('#cwt-remote-ref-filter', 'fix login')
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe('bugfix/login-flow')
    })
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-bugfix-login-flow',
        mode: { kind: 'trackRemoteBranch', remoteRef: 'origin/bugfix/login-flow', localBranch: 'bugfix/login-flow' },
        syncBeforeCreate: false,
      },
      selections: [],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('keeps the remote branch search focused across consecutive filtering', async () => {
    const onCreate = vi.fn(async () => {})
    testWindow.goblinNative = {
      ...(testWindow.goblinNative as object),
      initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ['origin/feature/api-client', 'origin/bugfix/login-flow', 'origin/release/searchable-branch'],
      })),
    )

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={vi.fn()} onCreate={onCreate} />)

    clickButtonByText('action.create-worktree-mode-remote')
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe('feature/api-client')
    })
    openSelect('#cwt-remote-ref')

    const filter = input('#cwt-remote-ref-filter')
    filter.focus()
    setInputValue('#cwt-remote-ref-filter', 'sea')
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe('release/searchable-branch')
    })
    expect(document.activeElement).toBe(filter)

    setInputValue('#cwt-remote-ref-filter', 'search')
    await waitForAssertion(() => {
      expect(input('#cwt-remote-ref-filter').value).toBe('search')
    })
    expect(document.activeElement).toBe(filter)
  })

  test('constrains the remote branch dropdown to the trigger width', async () => {
    testWindow.goblinNative = {
      ...(testWindow.goblinNative as object),
      initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ['origin/feature/really-long-remote-branch-name-that-should-not-push-the-popover-sideways'],
      })),
    )

    render(<CreateWorktreeDialog open repo={createRepo()} onClose={vi.fn()} onCreate={vi.fn(async () => {})} />)

    clickButtonByText('action.create-worktree-mode-remote')
    await waitForAssertion(() => {
      expect(input('#cwt-local-branch').placeholder).toBe(
        'feature/really-long-remote-branch-name-that-should-not-push-the-popover-sideways',
      )
    })
    openSelect('#cwt-remote-ref')

    expect(input('#cwt-remote-ref-filter').closest('[data-slot="select-content"]')?.className).toContain(
      'w-[var(--radix-select-trigger-width)]',
    )
  })

  test('keeps worktree dependencies hidden until explicitly enabled', () => {
    const onBootstrapEnabledChange = vi.fn()
    const source = branchSource('feature/base', '/tmp/repo-base')
    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled={false}
        worktreeBootstrap={{
          source,
          sourceOptions: [source],
        }}
        onBootstrapEnabledChange={onBootstrapEnabledChange}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />,
    )

    expect(button('[aria-label="action.create-worktree-bootstrap-toggle"]').getAttribute('data-state')).toBe(
      'unchecked',
    )
    expect(document.querySelector('[data-worktree-dependency-path=".env"]')).toBeNull()

    click('[aria-label="action.create-worktree-bootstrap-toggle"]')

    expect(onBootstrapEnabledChange).toHaveBeenCalledWith(true)
  })

  test('does not submit stale dependency choices after dependencies are disabled', async () => {
    const onCreate = vi.fn(async () => {})
    const source = branchSource('feature/base', '/tmp/repo-base')
    const worktreeBootstrap = {
      source,
      sourceOptions: [source],
    }
    const dialog = (bootstrapEnabled: boolean) => (
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled={bootstrapEnabled}
        worktreeBootstrap={worktreeBootstrap}
        onBootstrapEnabledChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={onCreate}
      />
    )
    render(dialog(true))
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull()
    })

    click('[data-worktree-dependency-path=".env"]')
    act(() => root!.render(dialog(false)))
    expect(document.querySelector('[data-worktree-dependency-path=".env"]')).toBeNull()
    setInputValue('#cwt-branch', 'feature/new')
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-feature-new',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/new',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      selections: [],
    })
  })

  test('keeps submit enabled while the dependency tree is loading', () => {
    repoClientMocks.getRepositoryFileTree.mockReturnValue(new Promise<never>(() => {}))
    const source = branchSource('feature/base', '/tmp/repo-base')
    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled
        worktreeBootstrap={{
          source,
          sourceOptions: [source],
        }}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />,
    )

    setInputValue('#cwt-branch', 'feature/new')
    expect(button('button[type="submit"]').disabled).toBe(false)
  })

  test('submits a selected nested dependency with its exact source and default copy mode', async () => {
    const onCreate = vi.fn(async () => {})
    const source = branchSource('feature/base', '/tmp/repo-base')
    repoClientMocks.getRepositoryFileTree.mockImplementation(
      async (_repoId: string, _worktreePath: string, dirPath: string) =>
        dirPath === '/tmp/repo-base'
          ? {
              ok: true,
              worktreePath: '/tmp/repo-base',
              dirPath,
              entries: [
                {
                  name: 'backend',
                  absolutePath: '/tmp/repo-base/backend',
                  relativePath: 'backend',
                  kind: 'directory',
                },
              ],
            }
          : {
              ok: true,
              worktreePath: '/tmp/repo-base',
              dirPath,
              entries: [
                {
                  name: '.venv',
                  absolutePath: '/tmp/repo-base/backend/.venv',
                  relativePath: 'backend/.venv',
                  kind: 'directory',
                },
              ],
            },
    )
    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled
        worktreeBootstrap={{
          source,
          sourceOptions: [source],
        }}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    )
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-expand="backend"]')).not.toBeNull()
    })

    click('[data-worktree-dependency-expand="backend"]')
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path="backend/.venv"]')).not.toBeNull()
    })
    click('[data-worktree-dependency-path="backend/.venv"]')
    setInputValue('#cwt-branch', 'feature/new')
    click('button[type="submit"]')

    expect(onCreate).toHaveBeenCalledWith({
      input: {
        worktreePath: '/tmp/goblin-repo-feature-new',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/new',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      selections: [{ path: 'backend/.venv', mode: 'copy' }],
      sourceWorktreePath: '/tmp/repo-base',
    })
  })

  test('resets dependency selections when the dialog is reopened', async () => {
    const source = branchSource('feature/base', '/tmp/repo-base')
    const worktreeBootstrap = {
      source,
      sourceOptions: [source],
    }
    const dialog = (open: boolean) => (
      <CreateWorktreeDialog
        open={open}
        repo={createRepo()}
        bootstrapEnabled
        worktreeBootstrap={worktreeBootstrap}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />
    )
    render(dialog(true))
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull()
    })

    click('[data-worktree-dependency-path=".env"]')
    expect(input('[data-worktree-dependency-path=".env"]').checked).toBe(true)

    act(() => root!.render(dialog(false)))
    act(() => root!.render(dialog(true)))
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull()
    })

    expect(input('[data-worktree-dependency-path=".env"]').checked).toBe(false)
  })

  test('reports the active local branch context for dependency source resolution', () => {
    const onBootstrapContextBranchChange = vi.fn()
    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        onBootstrapContextBranchChange={onBootstrapContextBranchChange}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />,
    )

    expect(onBootstrapContextBranchChange).toHaveBeenLastCalledWith('main')
    openSelect('#cwt-base')
    clickOptionByText('feature/base')
    expect(onBootstrapContextBranchChange).toHaveBeenLastCalledWith('feature/base')

    clickButtonByText('action.create-worktree-mode-existing')
    expect(onBootstrapContextBranchChange).toHaveBeenLastCalledWith('main')

    clickButtonByText('action.create-worktree-mode-detached')
    expect(onBootstrapContextBranchChange).toHaveBeenLastCalledWith('main')
  })

  test('resets dependency selections when the dependency source changes', async () => {
    const base = branchSource('feature/base', '/tmp/repo-base')
    const alternative = branchSource('feature/other', '/tmp/repo-other')
    const dialog = (source: RepositoryDependencySource) => (
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled
        worktreeBootstrap={{
          source,
          sourceOptions: [base, alternative],
        }}
        onBootstrapSourceChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />
    )
    render(dialog(base))
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull()
    })

    click('[data-worktree-dependency-path=".env"]')
    expect(input('[data-worktree-dependency-path=".env"]').checked).toBe(true)

    act(() => root!.render(dialog(alternative)))
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull()
    })

    expect(input('[data-worktree-dependency-path=".env"]').checked).toBe(false)
  })

  test('keeps dependency tree errors nonblocking', async () => {
    repoClientMocks.getRepositoryFileTree.mockResolvedValueOnce({ ok: false, message: 'offline' })
    const source = branchSource('feature/base', '/tmp/repo-base')
    render(
      <CreateWorktreeDialog
        open
        repo={createRepo()}
        bootstrapEnabled
        worktreeBootstrap={{
          source,
          sourceOptions: [source],
        }}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
      />,
    )
    await waitForAssertion(() => {
      expect(document.querySelector('[data-worktree-dependency-error="/tmp/repo-base"]')).not.toBeNull()
    })

    setInputValue('#cwt-branch', 'feature/new')
    expect(button('button[type="submit"]').disabled).toBe(false)
  })
})

function createRepo(): RepoState {
  const repo = emptyRepo('/tmp/goblin-repo', 'goblin-repo')
  repo.data.currentBranch = 'main'
  repo.data.branches = [
    {
      name: 'main',
      isCurrent: true,
      ahead: 0,
      behind: 0,
      lastCommitHash: '1111111',
      lastCommitMessage: 'Main commit',
      lastCommitDate: '2024-01-01T00:00:00.000Z',
      lastCommitAuthor: 'Test',
    },
    {
      name: 'feature/base',
      isCurrent: false,
      ahead: 0,
      behind: 0,
      lastCommitHash: '2222222',
      lastCommitMessage: 'Feature base',
      lastCommitDate: '2024-01-02T00:00:00.000Z',
      lastCommitAuthor: 'Test',
    },
  ]
  return repo
}

function createRemoteRepo(): RepoState {
  const target = normalizeRemoteTarget({
    alias: 'prod',
    host: 'example.com',
    user: 'alice',
    port: 22,
    remotePath: '/srv/repo',
  })
  if (!target) throw new Error('Failed to create remote target for test')
  const repo = createRepo()
  repo.id = target.id
  repo.remote.target = target
  return repo
}

function branchSource(branch: string, worktreePath: string): RepositoryDependencySource {
  return { id: `worktree:${worktreePath}`, kind: 'branch', branch, worktreePath }
}

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
}

function input(selector: string): HTMLInputElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input: ${selector}`)
  return element
}

function button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${selector}`)
  return element
}

function buttonByText(text: string): HTMLButtonElement {
  const element = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button text: ${text}`)
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

function click(selector: string) {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`)
  act(() => {
    element.click()
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

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function clickOptionByText(text: string) {
  const element = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!element) throw new Error(`Missing option text: ${text}`)
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown
  for (let i = 0; i < 10; i += 1) {
    try {
      assertion()
      return
    } catch (err) {
      lastError = err
      await flush()
    }
  }
  throw lastError
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
