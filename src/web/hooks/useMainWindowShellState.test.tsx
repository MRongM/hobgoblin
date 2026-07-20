// @vitest-environment jsdom

import { act } from 'react'
import { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useMainWindowShellState } from '#/web/hooks/useMainWindowShellState.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

function Harness() {
  const [routeSettingsPage, setRouteSettingsPage] = useState<SettingsPage | null>(null)
  const activeId = useReposStore((s) => s.activeId)
  const selectedBranch = useReposStore((s) => (activeId ? (s.repos[activeId]?.ui.selectedBranch ?? null) : null))
  const detailTab = useReposStore((s) => (activeId ? (s.repos[activeId]?.ui.detailTab ?? null) : null))
  const shell = useMainWindowShellState({
    routeSettingsPage,
    onRouteSettingsPageChange: setRouteSettingsPage,
  })

  useEffect(() => {
    ;(window as typeof window & { shellState?: typeof shell }).shellState = shell
  }, [shell])

  return (
    <>
      <button id="show-help" type="button" onClick={() => shell.showHelp()}>
        help
      </button>
      <button id="toggle-settings" type="button" onClick={() => shell.toggleSettings()}>
        settings
      </button>
      <button
        id="show-terminal"
        type="button"
        onClick={() => shell.navigation.showRepoBranchDetailTab('/tmp/repo', 'feature/test', 'terminal')}
      >
        terminal
      </button>
      <button id="request-close" type="button" onClick={() => shell.navigation.closeRepo('/tmp/repo')}>
        request close
      </button>
      <button id="cancel-close" type="button" onClick={() => shell.closeRepoConfirmation?.cancel()}>
        cancel close
      </button>
      <button id="confirm-close" type="button" onClick={() => shell.closeRepoConfirmation?.confirm()}>
        confirm close
      </button>
      <output id="settings-open">{shell.settingsOpen ? 'yes' : 'no'}</output>
      <output id="shortcut-gate">{shell.workspaceShortcutsSuppressed ? 'yes' : 'no'}</output>
      <output id="close-confirm-open">{shell.closeRepoConfirmation?.open ? 'yes' : 'no'}</output>
      <output id="route-settings">{routeSettingsPage ?? 'none'}</output>
      <output id="active-repo">{activeId ?? 'none'}</output>
      <output id="selected-branch">{selectedBranch ?? 'none'}</output>
      <output id="detail-tab">{detailTab ?? 'none'}</output>
      <output id="workspace-layout">{shell.workspaceLayout}</output>
      <output id="workspace-mode">{shell.workspaceBehavior.mode}</output>
    </>
  )
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  seedRepoState({
    id: '/tmp/repo',
    branches: [createRepoBranch('main'), createRepoBranch('feature/test', { worktree: { path: '/tmp/worktree' } })],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useMainWindowShellState', () => {
  test('marks settings as open and suppresses workspace shortcuts when a settings page route is active', async () => {
    await render(<Harness />)

    expect(text('#settings-open')).toBe('no')
    expect(text('#shortcut-gate')).toBe('no')

    await click('#show-help')

    expect(text('#route-settings')).toBe('shortcuts')
    expect(text('#settings-open')).toBe('yes')
    expect(text('#shortcut-gate')).toBe('yes')
  })

  test('toggles the settings route from the ambient settings action', async () => {
    await render(<Harness />)

    await click('#toggle-settings')

    expect(text('#route-settings')).toBe('general')
    expect(text('#settings-open')).toBe('yes')

    await click('#toggle-settings')

    expect(text('#route-settings')).toBe('none')
    expect(text('#settings-open')).toBe('no')
  })

  test('applies branch-detail navigation directly to the store', async () => {
    await render(<Harness />)

    await click('#show-terminal')

    expect(text('#active-repo')).toBe('/tmp/repo')
    expect(text('#selected-branch')).toBe('feature/test')
    expect(text('#detail-tab')).toBe('terminal')
  })

  test('requires confirmation before closing a repository', async () => {
    await render(<Harness />)

    await click('#request-close')

    expect(text('#active-repo')).toBe('/tmp/repo')
    expect(text('#close-confirm-open')).toBe('yes')
    expect(text('#shortcut-gate')).toBe('yes')

    await click('#cancel-close')

    expect(text('#active-repo')).toBe('/tmp/repo')
    expect(text('#close-confirm-open')).toBe('no')
    expect(text('#shortcut-gate')).toBe('no')

    await click('#request-close')
    await click('#confirm-close')

    expect(text('#active-repo')).toBe('none')
    expect(text('#close-confirm-open')).toBe('no')
  })

  test('derives focus workspace mode from the effective layout and focus preference', async () => {
    useReposStore.getState().setWorkspaceLayout('/tmp/repo', 'top-bottom')
    useReposStore.setState({
      detailCollapsed: false,
      detailFocusMode: true,
    })

    await render(<Harness />)

    expect(text('#workspace-layout')).toBe('top-bottom')
    expect(text('#workspace-mode')).toBe('focus')
  })
})

async function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(element)
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function click(selector: string) {
  const element = container?.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${selector}`)
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

function text(selector: string): string {
  const element = container?.querySelector(selector)
  if (!(element instanceof HTMLOutputElement)) throw new Error(`Missing output: ${selector}`)
  return element.textContent ?? ''
}
