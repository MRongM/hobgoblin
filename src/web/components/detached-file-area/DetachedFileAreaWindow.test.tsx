// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const hydrationMocks = vi.hoisted(() => ({
  theme: vi.fn(async () => {}),
  i18n: vi.fn(async () => {}),
  repo: vi.fn(async () => {}),
}))

vi.mock('#/web/stores/theme.ts', () => ({
  useThemeStore: { getState: () => ({ hydrate: hydrationMocks.theme }) },
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useI18nStore: { getState: () => ({ hydrate: hydrationMocks.i18n }) },
  useT: () => (key: string, params?: Record<string, string | number>) => (params?.tab ? `${key}:${params.tab}` : key),
}))

vi.mock('#/web/hooks/useRepoStoreInvalidationRefresh.ts', () => ({
  useRepoStoreInvalidationRefresh: vi.fn(),
}))

vi.mock('#/web/settings-queries.ts', () => ({
  useSettingsQueryInvalidationSync: vi.fn(),
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39 }),
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceInvalidationSync: vi.fn(),
}))

vi.mock('#/web/components/EffectiveProjectThemeBridge.tsx', () => ({
  EffectiveProjectThemeBridge: () => null,
}))

vi.mock('#/web/components/ui/sonner.tsx', () => ({
  Toaster: () => null,
}))

vi.mock('#/web/components/repo-workspace/RepoExplorerPanel.tsx', () => ({
  RepoExplorerPanel: ({ activeTab, onRevealPath }: { activeTab: string; onRevealPath: (path: string) => void }) => (
    <div data-testid="detached-panel" data-active-tab={activeTab}>
      <button type="button" data-testid="reveal-file" onClick={() => onRevealPath('src/app.ts')}>
        reveal
      </button>
    </div>
  ),
}))

const request: DetachedFileAreaWindowRequest = {
  repo: { kind: 'local', id: '/repo' },
  branch: 'main',
  tab: 'changes',
}

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  hydrationMocks.theme.mockClear()
  hydrationMocks.i18n.mockClear()
  hydrationMocks.repo.mockClear()
  resetReposStore()
  seedRepoState({
    id: '/repo',
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  useReposStore.setState({ hydrateSession: hydrationMocks.repo })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('DetachedFileAreaWindow', () => {
  test('hydrates the captured repository context and keeps reveal navigation inside the detached window', async () => {
    const { DetachedFileAreaWindow } = await import('#/web/components/detached-file-area/DetachedFileAreaWindow.tsx')
    await act(async () => {
      root.render(<DetachedFileAreaWindow request={request} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hydrationMocks.theme).toHaveBeenCalledOnce()
    expect(hydrationMocks.i18n).toHaveBeenCalledOnce()
    expect(hydrationMocks.repo).toHaveBeenCalledWith([request.repo], '/repo')
    expect(container.querySelector('[data-testid="detached-context"]')?.textContent).toContain('repo')
    expect(container.querySelector('[data-testid="detached-context"]')?.textContent).toContain('main')
    expect(container.querySelector('[data-testid="detached-live"]')).toBeTruthy()
    expect(document.title).toBe('tab.changes — repo')
    expect(container.querySelector('[data-testid="detached-panel"]')?.getAttribute('data-active-tab')).toBe('changes')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="reveal-file"]')?.click()
    })
    expect(container.querySelector('[data-testid="detached-panel"]')?.getAttribute('data-active-tab')).toBe('files')

    const back = container.querySelector<HTMLButtonElement>('[data-testid="detached-back"]')
    expect(back?.textContent).toContain('tab.changes')
    await act(async () => back?.click())
    expect(container.querySelector('[data-testid="detached-panel"]')?.getAttribute('data-active-tab')).toBe('changes')
  })

  test('shows a stable unavailable state when the captured branch no longer exists', async () => {
    const { DetachedFileAreaWindow } = await import('#/web/components/detached-file-area/DetachedFileAreaWindow.tsx')
    await act(async () => {
      root.render(<DetachedFileAreaWindow request={{ ...request, branch: 'deleted' }} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('file-area.detached.unavailable-title')
    expect(container.querySelector('[data-testid="detached-panel"]')).toBeNull()
    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'file-tree.retry',
    )
    await act(async () => {
      retry?.click()
      await Promise.resolve()
    })
    expect(hydrationMocks.repo).toHaveBeenCalledTimes(2)
  })
})
