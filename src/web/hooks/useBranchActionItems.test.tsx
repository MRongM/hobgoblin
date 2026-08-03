// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'
import type { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'

const mocks = vi.hoisted(() => ({
  useRuntimeExternalAppSettings: vi.fn(),
  useBranchActions: vi.fn(),
}))

const repoClientMocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  getRepositoryWorktreeBootstrapPreflight: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  commitRepositoryChanges: vi.fn(),
}))

const settingsQueryMocks = vi.hoisted(() => ({
  useSettingsSnapshotQuery: vi.fn(),
}))

let container: HTMLDivElement
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalResizeObserver = globalThis.ResizeObserver
let terminalSnapshotsByWorktree: Map<string, WorktreeTerminalSnapshot>
let closeTerminalAndDismissDetailIfLast: ReturnType<
  typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>
>
let createTerminal: ReturnType<typeof vi.fn<TerminalSessionContextValue['createTerminal']>>
let restoreTmuxSessions: ReturnType<typeof vi.fn<TerminalSessionContextValue['restoreTmuxSessions']>>
let openExternalTerminal: ReturnType<typeof vi.fn>

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

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
    getRepositoryWorktreeBootstrapPreflight: repoClientMocks.getRepositoryWorktreeBootstrapPreflight,
    generateRepositoryCommitMessage: repoClientMocks.generateRepositoryCommitMessage,
    commitRepositoryChanges: repoClientMocks.commitRepositoryChanges,
  }
})
vi.mock('#/web/settings-queries.ts', () => ({
  useSettingsSnapshotQuery: settingsQueryMocks.useSettingsSnapshotQuery,
}))

describe('useBranchActionItems', () => {
  beforeEach(() => {
    resetReposStore()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
    })
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
    openExternalTerminal = vi.fn()
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: false,
        canCleanupWorktree: false,
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
        openExternalTerminal,
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
        requestCleanupWorktree: vi.fn(),
      },
      dialogs: null,
    })
    repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
    repoClientMocks.getRepositoryWorktreeBootstrapPreflight.mockResolvedValue({
      ok: true,
      preflight: { kind: 'candidates', candidates: [] },
    })
    settingsQueryMocks.useSettingsSnapshotQuery.mockReturnValue({
      data: { repoSettings: [] },
      isLoading: false,
    })
    repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
    repoClientMocks.commitRepositoryChanges.mockResolvedValue({
      ok: true,
      message: '[feature/commit abc1234] feat: inline commit',
    })
    terminalSnapshotsByWorktree = new Map()
    createTerminal = vi.fn<TerminalSessionContextValue['createTerminal']>(async () => 't1')
    restoreTmuxSessions = vi.fn<TerminalSessionContextValue['restoreTmuxSessions']>(async () => 0)
    closeTerminalAndDismissDetailIfLast = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    container.remove()
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: originalResizeObserver,
    })
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const itemIds = groups.externalItems.filter((item) => item.visible).map((item) => item.id)

    expect(itemIds).toContain('terminal')
    expect(itemIds).toContain('externalTerminal')
    expect(itemIds).toContain('editor')
    expect(groups.externalItems.find((item) => item.id === 'externalTerminal')?.disabled).toBe(false)
  })

  test('adds cleanup beside the retained remove action only for prunable worktrees', async () => {
    const requestCleanupWorktree = vi.fn()
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: false,
        canCleanupWorktree: true,
        isRegularBranch: false,
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
        openExternalTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
        requestCleanupWorktree,
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/stale', { worktree: { path: '/tmp/repo-stale' } })
    const repo = seedRepoState({ id: '/tmp/repo', branches: [branch] })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const visibleDestructive = groups.destructiveItems.filter((item) => item.visible)

    expect(visibleDestructive.map((item) => item.id)).toContain('removeWorktree')
    expect(visibleDestructive.map((item) => item.id)).toContain('cleanupWorktree')
    expect(visibleDestructive.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
    expect(visibleDestructive.find((item) => item.id === 'cleanupWorktree')?.disabled).toBe(false)
    visibleDestructive.find((item) => item.id === 'cleanupWorktree')?.onSelect()
    expect(requestCleanupWorktree).toHaveBeenCalledTimes(1)
  })

  test('selects the target branch before creating an internal terminal', async () => {
    const selectedBranch = createRepoBranch('feature/selected', {
      worktree: { path: '/tmp/repo-selected' },
    })
    const targetBranch = createRepoBranch('feature/internal', {
      worktree: { path: '/tmp/repo-feature' },
    })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [selectedBranch, targetBranch],
      selectedBranch: selectedBranch.name,
      detailTab: 'status',
    })
    useReposStore.setState({ detailCollapsed: true })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, targetBranch)
    const terminal = groups.externalItems.find((item) => item.id === 'terminal')
    const tmuxTerminal = groups.externalItems.find((item) => item.id === 'terminalTmux')
    const restoreTmuxTerminals = groups.externalItems.find((item) => item.id === 'restoreTmuxTerminals')
    if (!terminal) throw new Error('missing terminal action')
    if (!tmuxTerminal) throw new Error('missing tmux terminal action')
    if (!restoreTmuxTerminals) throw new Error('missing restore tmux terminals action')

    expect(terminal.disabled).toBe(false)
    expect(terminal.label).toBe('terminal.internal')
    expect(groups.externalItems.find((item) => item.id === 'externalTerminal')?.disabled).toBe(true)

    createTerminal.mockImplementationOnce(async () => {
      const current = useReposStore.getState()
      expect(current.repos['/tmp/repo']?.ui.selectedBranch).toBe('feature/internal')
      expect(current.repos['/tmp/repo']?.ui.detailTab).toBe('terminal')
      expect(current.detailCollapsed).toBe(false)
      return 't1'
    })

    await act(async () => {
      await terminal.onSelect()
    })

    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: '/tmp/repo',
        branch: 'feature/internal',
        worktreePath: '/tmp/repo-feature',
      },
      'native',
    )

    createTerminal.mockClear()
    await act(async () => {
      await tmuxTerminal.onSelect()
    })
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: '/tmp/repo',
        branch: 'feature/internal',
        worktreePath: '/tmp/repo-feature',
      },
      'tmux-if-available',
    )

    createTerminal.mockClear()
    await act(async () => {
      await restoreTmuxTerminals.onSelect()
    })
    expect(restoreTmuxSessions).toHaveBeenCalledWith({
      repoRoot: '/tmp/repo',
      branch: 'feature/internal',
      worktreePath: '/tmp/repo-feature',
    })
    expect(createTerminal).not.toHaveBeenCalled()
    expect(useReposStore.getState().repos['/tmp/repo']?.ui.selectedBranch).toBe('feature/internal')
    expect(openExternalTerminal).not.toHaveBeenCalled()
  })

  test('uses a member navigation override before creating an internal terminal', async () => {
    const selectedBranch = createRepoBranch('feature/selected', {
      worktree: { path: '/tmp/repo-selected' },
    })
    const targetBranch = createRepoBranch('feature/member', {
      worktree: { path: '/tmp/repo-member' },
    })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [selectedBranch, targetBranch],
      selectedBranch: selectedBranch.name,
      detailTab: 'status',
    })
    useReposStore.setState({ detailCollapsed: true })
    const events: string[] = []
    const onNavigateToInternalTerminal = vi.fn(() => {
      events.push('navigate-member')
    })
    createTerminal.mockImplementationOnce(async () => {
      events.push('create-terminal')
      expect(useReposStore.getState().detailCollapsed).toBe(false)
      return 't1'
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, targetBranch, { onNavigateToInternalTerminal })
    const terminal = groups.externalItems.find((item) => item.id === 'terminal')
    if (!terminal) throw new Error('missing terminal action')

    await act(async () => {
      await terminal.onSelect()
    })

    expect(onNavigateToInternalTerminal).toHaveBeenCalledWith({
      repoRoot: '/tmp/repo',
      branch: 'feature/member',
      worktreePath: '/tmp/repo-member',
    })
    expect(events).toEqual(['navigate-member', 'create-terminal'])
    expect(useReposStore.getState().repos['/tmp/repo']?.ui.selectedBranch).toBe('feature/selected')
  })

  test('opens the external terminal without creating an internal session', async () => {
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: 'iterm',
      terminalAvailable: true,
      editorApp: 'vscode',
      resolvedEditorApp: 'vscode',
      editorAvailable: true,
    })
    const branch = createRepoBranch('feature/external', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const externalTerminal = groups.externalItems.find((item) => item.id === 'externalTerminal')
    if (!externalTerminal) throw new Error('missing external terminal action')

    expect(externalTerminal.label).toBe('terminal.external')
    expect(externalTerminal.disabled).toBe(false)

    await act(async () => {
      await externalTerminal.onSelect()
    })

    expect(openExternalTerminal).toHaveBeenCalledTimes(1)
    expect(createTerminal).not.toHaveBeenCalled()
  })

  test('orders external actions first and keeps patch at the bottom of branch actions', async () => {
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
        openExternalTerminal,
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
      lastCommitHash: 'abc123456789',
    })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)

    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'editor',
      'terminal',
      'terminalTmux',
      'restoreTmuxTerminals',
      'externalTerminal',
      'remote',
    ])
    expect(groups.externalItems.find((item) => item.id === 'terminal')?.label).toBe('terminal.internal')
    expect(groups.externalItems.find((item) => item.id === 'externalTerminal')?.label).toBe('terminal.external')
    expect(groups.patchItems.filter((item) => item.visible).map((item) => item.id)).toEqual(['createTag'])
    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'checkoutTo',
      'merge',
      'mergeOut',
      'commit',
      'copyPatch',
    ])
    expect(groups.mainItems.find((item) => item.id === 'pull')?.label).toBe('action.pull')
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
        openExternalTerminal,
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const allItems = [...groups.patchItems, ...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems]
    const disabledById = new Map(allItems.map((item) => [item.id, item.disabled]))

    expect(groups.patchItems.filter((item) => item.visible).map((item) => item.id)).toEqual([])
    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'checkoutTo',
      'merge',
      'mergeOut',
      'commit',
      'copyPatch',
    ])
    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'editor',
      'terminal',
      'terminalTmux',
      'restoreTmuxTerminals',
      'externalTerminal',
      'remote',
    ])
    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])

    expect(disabledById.get('copyPatch')).toBe(true)
    expect(allItems.find((item) => item.id === 'checkout')?.visible).toBe(false)
    expect(disabledById.get('pull')).toBe(true)
    expect(disabledById.get('push')).toBe(true)
    expect(disabledById.get('createWorktree')).toBe(false)
    expect(disabledById.get('sync')).toBe(false)
    expect(disabledById.get('createBranch')).toBe(false)
    expect(disabledById.get('pullRemoteBranch')).toBe(true)
    expect(disabledById.get('checkoutTo')).toBe(true)
    expect(disabledById.get('merge')).toBe(true)
    expect(disabledById.get('mergeOut')).toBe(true)
    expect(disabledById.get('commit')).toBe(true)
    expect(disabledById.get('terminal')).toBe(true)
    expect(disabledById.get('terminalTmux')).toBe(true)
    expect(disabledById.get('restoreTmuxTerminals')).toBe(true)
    expect(disabledById.get('externalTerminal')).toBe(true)
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
        openExternalTerminal,
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
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
        openExternalTerminal,
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)

    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])
    expect(groups.destructiveItems.find((item) => item.id === 'removeWorktree')?.label).toBe('action.remove-worktree')
    expect(groups.destructiveItems.find((item) => item.id === 'deleteBranch')?.label).toBe('action.delete-branch')
    expect(groups.destructiveItems.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
    expect(groups.destructiveItems.find((item) => item.id === 'resetHard')?.label).toBe('action.reset-hard')
  })

  test('shows close all terminals before remove worktree and confirms before closing them', async () => {
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: true,
        canRemoveWorktree: true,
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
        openExternalTerminal,
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/terminals', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
    })
    const terminalWorktreeKey = worktreeTerminalKey(repo.id, '/tmp/repo-feature')
    setTerminalSessions(terminalWorktreeKey, [
      terminalSession({ key: 't1', worktreeTerminalKey: terminalWorktreeKey }),
      terminalSession({ key: 't2', worktreeTerminalKey: terminalWorktreeKey }),
    ])

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const destructiveItems = groups.destructiveItems.filter((item) => item.visible)
    const closeAllTerminals = destructiveItems.find((item) => item.id === 'closeAllTerminals')

    expect(destructiveItems.map((item) => item.id)).toEqual([
      'closeAllTerminals',
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])
    expect(closeAllTerminals?.label).toBe('terminal.close-all')
    expect(closeAllTerminals?.destructive).toBe(true)
    expect(closeAllTerminals?.disabled).toBe(false)

    await act(async () => {
      await closeAllTerminals?.onSelect()
    })

    expect(closeTerminalAndDismissDetailIfLast).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('terminal.close-all-confirm-title')
    expect(document.body.textContent).toContain('terminal.close-all-confirm-body')

    clickButtonByText('terminal.close-all-confirm-confirm')

    expect(closeTerminalAndDismissDetailIfLast.mock.calls).toEqual([
      ['t1', { repoRoot: '/tmp/repo', worktreePath: '/tmp/repo-feature' }],
      ['t2', { repoRoot: '/tmp/repo', worktreePath: '/tmp/repo-feature' }],
    ])
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
        openExternalTerminal,
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const visibleItems = [...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems].filter(
      (item) => item.visible,
    )

    expect(visibleItems.every((item) => item.disabled)).toBe(true)
    expect(visibleItems.some((item) => item.busy)).toBe(false)
    expect(groups.mainItems.find((item) => item.id === 'push')?.label).toBe('action.push')
  })

  test('disables create worktree while another local branch action is pending', async () => {
    const branchActions = mocks.useBranchActions()
    mocks.useBranchActions.mockReturnValue({
      ...branchActions,
      blocked: true,
      busyAction: 'copyPatch',
    })
    const branch = createRepoBranch('feature/other')
    const repo = seedRepoState({ id: '/tmp/repo', branches: [branch] })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)

    expect(groups.mainItems.find((item) => item.id === 'createWorktree')?.disabled).toBe(true)
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
        openExternalTerminal,
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

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
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
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [{ path: 'README.md', x: ' ', y: 'M' }] }],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const commit = groups.mainItems.find((item) => item.id === 'commit')
    if (!commit) throw new Error('missing commit action')

    await act(async () => {
      await commit.onSelect()
    })

    expect(document.body.querySelector('#inline-commit-message')).not.toBeNull()
  })

  test('commit and push commits the worktree then triggers the existing push action', async () => {
    const push = vi.fn()
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
        canPush: true,
        canOpenRemote: false,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push,
        openExternalTerminal,
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/commit', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: true },
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [{ path: 'README.md', x: ' ', y: 'M' }] }],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const commit = groups.mainItems.find((item) => item.id === 'commit')
    if (!commit) throw new Error('missing commit action')

    await act(async () => {
      await commit.onSelect()
    })
    setTextareaValue('#inline-commit-message', '  feat: inline commit  ')
    clickButtonByText('action.commit-and-push-confirm')
    await flush()

    expect(repoClientMocks.commitRepositoryChanges).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo-feature',
      'feat: inline commit',
    )
    expect(push).toHaveBeenCalledTimes(1)
  })

  test('auto commit and push generates, commits, then triggers the existing push action', async () => {
    const calls: string[] = []
    const push = vi.fn(() => {
      calls.push('push')
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
        canPush: true,
        canOpenRemote: false,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push,
        openExternalTerminal,
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: true, claude: false })
    repoClientMocks.generateRepositoryCommitMessage.mockImplementation(async () => {
      calls.push('generate')
      return { ok: true, message: 'feat: generated message' }
    })
    repoClientMocks.commitRepositoryChanges.mockImplementation(async () => {
      calls.push('commit')
      return { ok: true, message: '[feature/commit abc1234] feat: generated message' }
    })
    const branch = createRepoBranch('feature/commit', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: true },
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [{ path: 'README.md', x: ' ', y: 'M' }] }],
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const commit = groups.mainItems.find((item) => item.id === 'commit')
    if (!commit) throw new Error('missing commit action')

    await act(async () => {
      await commit.onSelect()
    })
    clickButton('[role="switch"][aria-label="action.commit-auto-commit-and-push"]')
    clickButton('[data-provider="codex"]')
    await waitForAssertion(() => expect(push).toHaveBeenCalledTimes(1))

    expect(repoClientMocks.generateRepositoryCommitMessage).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo-feature',
      'codex',
      expect.any(AbortSignal),
    )
    expect(repoClientMocks.commitRepositoryChanges).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo-feature',
      'feat: generated message',
    )
    expect(calls).toEqual(['generate', 'commit', 'push'])
  })

  test('opens create-worktree with the selected branch as the default base', async () => {
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true })
    const branch = createRepoBranch('feature/base', { worktree: { path: '/tmp/repo-base' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch],
      currentBranch: 'main',
      selectedBranch: branch.name,
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
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
          mode: {
            kind: 'newBranch',
            newBranch: 'feature/new',
            creationBase: { kind: 'localBranch', branch: 'feature/base' },
          },
          syncBeforeCreate: false,
        },
        worktreeBootstrap: { kind: 'skip' },
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  })

  test('forwards selected candidates as a one-time materialize decision', async () => {
    repoClientMocks.getRepositoryWorktreeBootstrapPreflight.mockResolvedValueOnce({
      ok: true,
      preflight: { kind: 'candidates', candidates: [{ path: '.env', kind: 'file' }] },
    })
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true })
    const branch = createRepoBranch('feature/base', { worktree: { path: '/tmp/repo-base' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch],
      currentBranch: 'main',
      selectedBranch: branch.name,
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')
    if (!createWorktree) throw new Error('missing create-worktree action')

    await act(async () => {
      await createWorktree.onSelect()
    })
    expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).not.toHaveBeenCalled()
    clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
    await waitForAssertion(() => {
      expect(document.querySelector('[data-materialization-item=".env"]')).not.toBeNull()
    })
    expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledWith(
      '/tmp/repo',
      expect.any(AbortSignal),
      undefined,
      '/tmp/repo-base',
    )
    clickButton('[data-materialization-item=".env"] [data-materialization-choice="copy"]')
    setInputValue('#cwt-branch', 'feature/new')
    clickButton('button[type="submit"]')

    expect(submitBranchAction).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        kind: 'createWorktree',
        input: {
          worktreePath: '/tmp/repo-feature-new',
          mode: {
            kind: 'newBranch',
            newBranch: 'feature/new',
            creationBase: { kind: 'localBranch', branch: 'feature/base' },
          },
          syncBeforeCreate: false,
        },
        worktreeBootstrap: {
          kind: 'materialize',
          selections: [{ path: '.env', mode: 'copy' }],
          sourceWorktreePath: '/tmp/repo-base',
        },
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  })

  test('aborts dependency loading and submits skip when dependencies are disabled', async () => {
    let preflightSignal: AbortSignal | undefined
    repoClientMocks.getRepositoryWorktreeBootstrapPreflight.mockImplementationOnce(
      (_repoId: string, signal: AbortSignal) => {
        preflightSignal = signal
        return new Promise<never>(() => {})
      },
    )
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true })
    const branch = createRepoBranch('feature/base', { worktree: { path: '/tmp/repo-base' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch],
      currentBranch: 'main',
      selectedBranch: branch.name,
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')
    if (!createWorktree) throw new Error('missing create-worktree action')

    await act(async () => createWorktree.onSelect())
    expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).not.toHaveBeenCalled()

    clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
    await waitForAssertion(() => {
      expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledTimes(1)
    })
    expect(preflightSignal?.aborted).toBe(false)

    clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
    await waitForAssertion(() => expect(preflightSignal?.aborted).toBe(true))
    setInputValue('#cwt-branch', 'feature/new')
    clickButton('button[type="submit"]')

    expect(submitBranchAction).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        kind: 'createWorktree',
        input: {
          worktreePath: '/tmp/repo-feature-new',
          mode: {
            kind: 'newBranch',
            newBranch: 'feature/new',
            creationBase: { kind: 'localBranch', branch: 'feature/base' },
          },
          syncBeforeCreate: false,
        },
        worktreeBootstrap: { kind: 'skip' },
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  })

  test('falls back from an empty branch source to the primary worktree', async () => {
    repoClientMocks.getRepositoryWorktreeBootstrapPreflight
      .mockResolvedValueOnce({ ok: true, preflight: { kind: 'candidates', candidates: [] } })
      .mockResolvedValueOnce({
        ok: true,
        preflight: { kind: 'candidates', candidates: [{ path: 'node_modules', kind: 'directory' }] },
      })
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true, worktree: { path: '/tmp/repo' } })
    const branch = createRepoBranch('feature/base', { worktree: { path: '/tmp/repo-base' } })
    const other = createRepoBranch('feature/other', { worktree: { path: '/tmp/repo-other' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch, other],
      currentBranch: 'main',
      selectedBranch: branch.name,
      worktreesByPath: createSourceWorktrees(),
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')
    if (!createWorktree) throw new Error('missing create-worktree action')

    await act(async () => createWorktree.onSelect())
    clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
    await waitForAssertion(() => {
      expect(document.querySelector('[data-materialization-item="node_modules"]')).not.toBeNull()
    })

    expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight.mock.calls).toEqual([
      ['/tmp/repo', expect.any(AbortSignal), undefined, '/tmp/repo-base'],
      ['/tmp/repo', expect.any(AbortSignal), undefined, undefined],
    ])
    expect(document.body.textContent).toContain('worktree-bootstrap.source-primary')
    const optionValues = [...sourceSelect().options].map((option) => option.value)
    expect(optionValues).not.toContain('branch:feature/base')
    expect(optionValues).toContain('branch:feature/other')
  })

  test('loads and submits dependencies from another non-context worktree', async () => {
    repoClientMocks.getRepositoryWorktreeBootstrapPreflight
      .mockResolvedValueOnce({
        ok: true,
        preflight: { kind: 'candidates', candidates: [{ path: '.env.base', kind: 'file' }] },
      })
      .mockResolvedValueOnce({
        ok: true,
        preflight: { kind: 'candidates', candidates: [{ path: '.env.other', kind: 'file' }] },
      })
    const submitBranchAction = vi.fn()
    useReposStore.setState({ submitBranchAction })
    const current = createRepoBranch('main', { isCurrent: true, worktree: { path: '/tmp/repo' } })
    const branch = createRepoBranch('feature/base', { worktree: { path: '/tmp/repo-base' } })
    const other = createRepoBranch('feature/other', { worktree: { path: '/tmp/repo-other' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [current, branch, other],
      currentBranch: 'main',
      selectedBranch: branch.name,
      worktreesByPath: createSourceWorktrees(),
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.tsx')
    const groups = await renderItemGroups(useItems, repo, branch)
    const createWorktree = groups.mainItems.find((item) => item.id === 'createWorktree')
    if (!createWorktree) throw new Error('missing create-worktree action')

    await act(async () => createWorktree.onSelect())
    clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
    await waitForAssertion(() => {
      expect(document.querySelector('[data-materialization-item=".env.base"]')).not.toBeNull()
    })
    changeSource('branch:feature/other')
    await waitForAssertion(() => {
      expect(document.querySelector('[data-materialization-item=".env.other"]')).not.toBeNull()
    })

    expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenLastCalledWith(
      '/tmp/repo',
      expect.any(AbortSignal),
      undefined,
      '/tmp/repo-other',
    )
    clickButton('[data-materialization-item=".env.other"] [data-materialization-choice="copy"]')
    setInputValue('#cwt-branch', 'feature/new')
    clickButton('button[type="submit"]')

    expect(submitBranchAction).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        kind: 'createWorktree',
        input: {
          worktreePath: '/tmp/repo-feature-new',
          mode: {
            kind: 'newBranch',
            newBranch: 'feature/new',
            creationBase: { kind: 'localBranch', branch: 'feature/base' },
          },
          syncBeforeCreate: false,
        },
        worktreeBootstrap: {
          kind: 'materialize',
          selections: [{ path: '.env.other', mode: 'copy' }],
          sourceWorktreePath: '/tmp/repo-other',
        },
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  })
})

function createSourceWorktrees() {
  return {
    '/tmp/repo': { path: '/tmp/repo', branch: 'main', isMain: true },
    '/tmp/repo-base': { path: '/tmp/repo-base', branch: 'feature/base', isMain: false },
    '/tmp/repo-other': { path: '/tmp/repo-other', branch: 'feature/other', isMain: false },
  }
}

async function renderItemGroups(
  useItems: typeof useBranchActionItems,
  repo: ReturnType<typeof seedRepoState>,
  branch: ReturnType<typeof createRepoBranch>,
  options?: Parameters<typeof useBranchActionItems>[2],
): Promise<ReturnType<typeof useBranchActionItems>> {
  let groups: ReturnType<typeof useBranchActionItems> | null = null
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <TerminalSessionReadContext.Provider value={terminalReadContextValue()}>
          <TerminalSessionContext.Provider value={terminalContextValue()}>
            <ItemsHarness
              useItems={useItems}
              repo={repo}
              branch={branch}
              options={options}
              onReady={(items) => (groups = items)}
            />
          </TerminalSessionContext.Provider>
        </TerminalSessionReadContext.Provider>
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
  options,
  onReady,
}: {
  useItems: typeof useBranchActionItems
  repo: ReturnType<typeof seedRepoState>
  branch: ReturnType<typeof createRepoBranch>
  options?: Parameters<typeof useBranchActionItems>[2]
  onReady: (items: ReturnType<typeof useBranchActionItems>) => void
}) {
  const items = useItems(repo, branch, options)
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

function textarea(selector: string): HTMLTextAreaElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea: ${selector}`)
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

function setTextareaValue(selector: string, value: string) {
  const element = textarea(selector)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
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

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function sourceSelect(): HTMLSelectElement {
  const element = document.body.querySelector('[data-worktree-bootstrap-source-select]')
  if (!(element instanceof HTMLSelectElement)) throw new Error('Missing worktree bootstrap source select')
  return element
}

function changeSource(value: string) {
  const element = sourceSelect()
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => element.dispatchEvent(new Event('change', { bubbles: true })))
}

function setTerminalSessions(worktreeKey: string, sessions: TerminalSessionSummary[]) {
  terminalSnapshotsByWorktree.set(worktreeKey, {
    worktreeTerminalKey: worktreeKey,
    selectedDescriptor: null,
    sessions,
    count: sessions.length,
  })
}

function terminalSession(overrides: Partial<TerminalSessionSummary> = {}): TerminalSessionSummary {
  return {
    key: 't1',
    worktreeTerminalKey: '/tmp/repo\0/tmp/repo',
    terminalId: 'terminal-1',
    index: 1,
    title: 'terminal',
    fullTitle: 'terminal',
    originalTitle: 'terminal',
    phase: 'open',
    selected: true,
    hasBell: false,
    ...overrides,
  }
}

function terminalReadContextValue(): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeKey) => {
      const existing = terminalSnapshotsByWorktree.get(worktreeKey)
      if (existing) return existing
      const emptySnapshot = {
        worktreeTerminalKey: worktreeKey,
        selectedDescriptor: null,
        sessions: [],
        count: 0,
      }
      terminalSnapshotsByWorktree.set(worktreeKey, emptySnapshot)
      return emptySnapshot
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'open', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalContextValue(): TerminalSessionContextValue {
  return {
    createTerminal,
    restoreTmuxSessions,
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast,
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: 0, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: 0, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
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
