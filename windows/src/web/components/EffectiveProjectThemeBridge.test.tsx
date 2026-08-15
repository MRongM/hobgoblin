// @vitest-environment jsdom

import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsSnapshot } from '#/shared/settings-defaults.ts'
import { EffectiveProjectThemeBridge } from '#/web/components/EffectiveProjectThemeBridge.tsx'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useThemeStore } from '#/web/stores/theme.ts'

const projectNativeWindowChromeTheme = vi.hoisted(() => vi.fn(async () => true))

vi.mock('#/web/app-shell-client.ts', () => ({
  projectNativeWindowChromeTheme,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  mainWindowQueryClient.clear()
  resetReposStore()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-color-theme')
  useThemeStore.setState({
    pref: 'auto',
    resolved: 'light',
    colorTheme: 'macos',
    hydrate: async () => {},
    setPref: async () => {},
    setColorTheme: async () => {},
  })
  projectNativeWindowChromeTheme.mockClear()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  mainWindowQueryClient.clear()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('EffectiveProjectThemeBridge', () => {
  test('applies active project theme overrides and falls back to global theme', async () => {
    mainWindowQueryClient.setQueryData(
      settingsSnapshotQueryKey(),
      defaultSettingsSnapshot({
        colorTheme: 'macos',
        repoSettings: [
          { repoId: '/repo-a', colorTheme: 'cursor' },
          { repoId: '/repo-b', colorTheme: 'github' },
        ],
      }),
    )
    seedRepoState({ id: '/repo-a', branches: [], currentBranch: '', selectedBranch: null })
    seedRepoState({ id: '/repo-b', branches: [], currentBranch: '', selectedBranch: null })
    useReposStore.setState({ activeId: '/repo-a', activeProjectId: '/repo-a' })

    await renderBridge()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('cursor')
    expect(projectNativeWindowChromeTheme).toHaveBeenLastCalledWith({
      theme: 'light',
      colorTheme: 'cursor',
      topbarHeightPx: 34,
    })

    await act(async () => {
      useReposStore.setState({ activeId: '/repo-b', activeProjectId: '/repo-b' })
      await Promise.resolve()
    })
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('github')
    expect(projectNativeWindowChromeTheme).toHaveBeenLastCalledWith({
      theme: 'light',
      colorTheme: 'github',
      topbarHeightPx: 34,
    })

    await act(async () => {
      useReposStore.setState({ activeId: null, activeProjectId: null })
      await Promise.resolve()
    })
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('macos')
    expect(projectNativeWindowChromeTheme).toHaveBeenLastCalledWith({
      theme: 'light',
      colorTheme: 'macos',
      topbarHeightPx: 34,
    })
  })

  test('reapplies active project override after global theme store changes', async () => {
    mainWindowQueryClient.setQueryData(
      settingsSnapshotQueryKey(),
      defaultSettingsSnapshot({
        colorTheme: 'macos',
        repoSettings: [{ repoId: '/repo-a', colorTheme: 'cursor' }],
      }),
    )
    seedRepoState({ id: '/repo-a', branches: [], currentBranch: '', selectedBranch: null })
    useReposStore.setState({ activeId: '/repo-a' })

    await renderBridge()
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('cursor')

    await act(async () => {
      useThemeStore.setState({ colorTheme: 'bmw', resolved: 'dark' })
      await Promise.resolve()
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('cursor')
  })

  test('uses the workspace project theme while a shared member repository is visible', async () => {
    mainWindowQueryClient.setQueryData(
      settingsSnapshotQueryKey(),
      defaultSettingsSnapshot({
        colorTheme: 'macos',
        repoSettings: [
          { repoId: '/workspace', colorTheme: 'cursor' },
          { repoId: '/workspace/api', colorTheme: 'github' },
        ],
      }),
    )
    seedRepoState({ id: '/workspace/api', branches: [], currentBranch: '', selectedBranch: null })
    useReposStore.setState({ activeId: '/workspace/api', activeProjectId: '/workspace' })

    await renderBridge()

    expect(document.documentElement.getAttribute('data-color-theme')).toBe('cursor')
  })
})

async function renderBridge() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={mainWindowQueryClient}>
        <EffectiveProjectThemeBridge />
      </QueryClientProvider>,
    )
    await Promise.resolve()
  })
}
