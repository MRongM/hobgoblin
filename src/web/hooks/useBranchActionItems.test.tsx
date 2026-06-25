// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import type { useBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'

const mocks = vi.hoisted(() => ({
  useRuntimeExternalAppSettings: vi.fn(),
  useBranchActions: vi.fn(),
}))

const repoClientMocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

let container: HTMLDivElement
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock('#/web/runtime-settings-hooks.ts', () => ({
  useRuntimeExternalAppSettings: mocks.useRuntimeExternalAppSettings,
}))
vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: mocks.useRuntimeExternalAppSettings,
}))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))
vi.mock('#/web/hooks/useBranchActions.tsx', () => ({
  useBranchActions: mocks.useBranchActions,
}))
vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return {
    ...actual,
    getCommitMessageProviders: repoClientMocks.getCommitMessageProviders,
    generateRepositoryCommitMessage: repoClientMocks.generateRepositoryCommitMessage,
  }
})

describe('useBranchActionItems', () => {
  beforeEach(() => {
    resetReposStore()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: null,
      terminalAvailable: false,
      editorApp: 'vscode',
      resolvedEditorApp: 'vscode',
      editorAvailable: true,
    })
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: false,
        isRegularBranch: false,
        canCopyPatch: false,
        canPull: false,
        canPush: false,
        canOpenRemote: false,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
    repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    container.remove()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
    root = null
  })

  test('shows remote terminal even when local terminal apps are unavailable', async () => {
    const branch = createRepoBranch('feature/remote', { worktree: { path: '/srv/repo-feature' } })
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    const repo = seedRepoState({
      id: target!.id,
      branches: [branch],
      remote: { target: target!, hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const itemIds = await renderItems(useItems, repo, branch)

    expect(itemIds).toContain('terminal')
    expect(itemIds).toContain('editor')
  })

  test('keeps terminal editor and remote in a separate external group', async () => {
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: 'iterm',
      terminalAvailable: true,
      editorApp: 'vscode',
      resolvedEditorApp: 'vscode',
      editorAvailable: true,
    })
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: false,
        isRegularBranch: false,
        canCopyPatch: false,
        canPull: true,
        canPush: true,
        canOpenRemote: true,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/local', {
      tracking: 'origin/feature/local',
      worktree: { path: '/tmp/repo-feature' },
    })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)

    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'checkout',
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
    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual(['terminal', 'editor', 'remote'])
    expect(groups.mainItems.find((item) => item.id === 'pull')?.label).toBe('action.pull-remote')
  })

  test('shows unavailable repository and worktree actions disabled instead of hidden', async () => {
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: null,
      terminalAvailable: false,
      editorApp: 'vscode',
      resolvedEditorApp: null,
      editorAvailable: false,
    })
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: true,
        canCopyPatch: false,
        canPull: false,
        canPush: false,
        canOpenRemote: false,
        canOpenTerminal: false,
        canOpenEditor: false,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/menu')
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: false, hasBrowserRemote: false, hasGitHubRemote: false },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const allItems = [...groups.patchItems, ...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems]
    const disabledById = new Map(allItems.map((item) => [item.id, item.disabled]))

    expect(groups.patchItems.filter((item) => item.visible).map((item) => item.id)).toEqual(['copyPatch'])
    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'checkout',
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
    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'terminal',
      'editor',
      'remote',
    ])
    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])

    expect(disabledById.get('copyPatch')).toBe(true)
    expect(disabledById.get('checkout')).toBe(false)
    expect(disabledById.get('pull')).toBe(true)
    expect(disabledById.get('push')).toBe(true)
    expect(disabledById.get('createWorktree')).toBe(false)
    expect(disabledById.get('sync')).toBe(false)
    expect(disabledById.get('createBranch')).toBe(false)
    expect(disabledById.get('pullRemoteBranch')).toBe(true)
    expect(disabledById.get('checkoutTo')).toBe(true)
    expect(disabledById.get('merge')).toBe(true)
    expect(disabledById.get('commit')).toBe(true)
    expect(disabledById.get('terminal')).toBe(true)
    expect(disabledById.get('editor')).toBe(true)
    expect(disabledById.get('remote')).toBe(true)
    expect(disabledById.get('removeWorktree')).toBe(true)
    expect(disabledById.get('deleteBranch')).toBe(false)
    expect(disabledById.get('resetHard')).toBe(true)
  })

  test('keeps unavailable destructive actions visible but disabled', async () => {
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: true,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: false,
        canCopyPatch: false,
        canPull: false,
        canPush: true,
        canOpenRemote: false,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('main', { isCurrent: true, worktree: { path: '/tmp/repo' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      currentBranch: 'main',
      remote: { hasRemotes: true },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const destructiveItems = groups.destructiveItems.filter((item) => item.visible)

    expect(destructiveItems.map((item) => item.id)).toEqual(['removeWorktree', 'deleteBranch', 'resetHard'])
    expect(destructiveItems.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
    expect(destructiveItems.find((item) => item.id === 'deleteBranch')?.disabled).toBe(true)
    expect(destructiveItems.find((item) => item.id === 'resetHard')?.disabled).toBe(false)
  })

  test('keeps disabled remove worktree above delete branch and reset in the destructive group', async () => {
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: true,
        canCopyPatch: false,
        canPull: false,
        canPush: false,
        canOpenRemote: false,
        canOpenTerminal: false,
        canOpenEditor: false,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/deleteable', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)

    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])
    expect(groups.destructiveItems.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
    expect(groups.destructiveItems.find((item) => item.id === 'resetHard')?.label).toBe('action.reset-hard')
  })

  test('disables non-target branch actions without showing push loading', async () => {
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: 'iterm',
      terminalAvailable: true,
      editorApp: 'vscode',
      resolvedEditorApp: 'vscode',
      editorAvailable: true,
    })
    mocks.useBranchActions.mockReturnValue({
      blocked: true,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: false,
        isRegularBranch: false,
        canCopyPatch: false,
        canPull: true,
        canPush: true,
        canOpenRemote: true,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/other', {
      tracking: 'origin/feature/other',
      worktree: { path: '/tmp/repo-other' },
    })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch, createRepoBranch('feature/pushing', { tracking: 'origin/feature/pushing' })],
      remote: { hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })
    repo.operations.branchAction = {
      operationId: 1,
      phase: 'running',
      reason: 'branch:push',
      target: 'feature/pushing',
      startedAt: 123,
      settledAt: null,
      error: null,
    }

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const visibleItems = [...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems].filter(
      (item) => item.visible,
    )

    expect(visibleItems.every((item) => item.disabled)).toBe(true)
    expect(visibleItems.some((item) => item.busy)).toBe(false)
    expect(groups.mainItems.find((item) => item.id === 'push')?.label).toBe('action.push')
  })

  test('does not show create-worktree loading on non-target branches', async () => {
    mocks.useBranchActions.mockReturnValue({
      blocked: true,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: true,
        canCopyPatch: false,
        canPull: false,
        canPush: true,
        canOpenRemote: false,
        canOpenTerminal: false,
        canOpenEditor: false,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/other')
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch, createRepoBranch('feature/new-worktree')],
      remote: { hasRemotes: true },
    })
    repo.operations.branchAction = {
      operationId: 1,
      phase: 'running',
      reason: 'branch:createWorktree',
      target: 'feature/new-worktree',
      startedAt: 123,
      settledAt: null,
      error: null,
    }

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')

    expect(createWorktree?.disabled).toBe(true)
    expect(createWorktree?.busy).toBe(false)
    expect(createWorktree?.label).toBe('action.create-worktree')
  })

  test('commit action opens provider-backed inline commit panel for the worktree', async () => {
    const branch = createRepoBranch('feature/commit', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const commit = groups.mainItems.find((item) => item.id === 'commit')
    if (!commit) throw new Error('missing commit action')

    await act(async () => {
      await commit.onSelect()
    })

    expect(document.body.querySelector('#inline-commit-message')).not.toBeNull()
  })

  test('opens create-worktree with the selected branch as the default base', async () => {
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true })
    const branch = createRepoBranch('feature/base')
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch],
      currentBranch: 'main',
      selectedBranch: branch.name,
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')
    if (!createWorktree) throw new Error('missing create-worktree action')

    await act(async () => {
      await createWorktree.onSelect()
    })
    setInputValue('#cwt-branch', 'feature/new')
    clickButton('button[type="submit"]')

    expect(submitBranchAction).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        kind: 'createWorktree',
        input: {
          worktreePath: '/tmp/repo-feature-new',
          mode: { kind: 'newBranch', newBranch: 'feature/new', baseRef: 'feature/base' },
        },
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  })
})

async function renderItems(
  useItems: typeof useBranchActionItems,
  repo: ReturnType<typeof seedRepoState>,
  branch: ReturnType<typeof createRepoBranch>,
): Promise<string[]> {
  const groups = await renderItemGroups(useItems, repo, branch)
  return [...groups.patchItems, ...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems].map((item) => item.id)
}

async function renderItemGroups(
  useItems: typeof useBranchActionItems,
  repo: ReturnType<typeof seedRepoState>,
  branch: ReturnType<typeof createRepoBranch>,
): Promise<ReturnType<typeof useBranchActionItems>> {
  let groups: ReturnType<typeof useBranchActionItems> | null = null
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ItemsHarness useItems={useItems} repo={repo} branch={branch} onReady={(items) => (groups = items)} />
      </InlineCommitDraftProvider>,
    )
  })
  if (!groups) throw new Error('items were not rendered')
  return groups
}

function ItemsHarness({
  useItems,
  repo,
  branch,
  onReady,
}: {
  useItems: typeof useBranchActionItems
  repo: ReturnType<typeof seedRepoState>
  branch: ReturnType<typeof createRepoBranch>
  onReady: (items: ReturnType<typeof useBranchActionItems>) => void
}) {
  const items = useItems(repo, branch)
  React.useEffect(() => {
    onReady(items)
  }, [items, onReady])
  return (
    <>
      {items.inlinePanel}
      {items.dialogs}
    </>
  )
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

function setInputValue(selector: string, value: string) {
  const element = input(selector)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(selector: string) {
  const element = button(selector)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
