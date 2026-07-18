// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'

const repoState = {
  ensureWorkspaceOpen: vi.fn(),
  reorderRepos: vi.fn(),
  toggleDetailFocusMode: vi.fn(),
  repos: { '/repo-a': { name: 'Repo A' } },
}

vi.mock('#/web/stores/repos/store.ts', () => ({
  useReposStore: (selector: (state: typeof repoState) => unknown) => selector(repoState),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => ({ activateRepo: vi.fn(), closeRepo: vi.fn() }),
}))

vi.mock('#/web/shell-overlay-actions.tsx', () => ({
  useShellOverlayActions: () => null,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 36 }),
}))

vi.mock('#/web/components/repo-workspace/project-switcher-model.tsx', () => ({
  ProjectTerminalStatus: () => null,
  useProjectSummaries: () => [{ id: '/repo-a', name: 'Repo A', unavailable: false, worktreePaths: [] }],
}))

vi.mock('#/web/components/repo-workspace/SidebarProjectList.tsx', () => ({
  SidebarProjectList: ({ id }: { id: string }) => <ul id={id} />,
}))

vi.mock('#/web/components/ConfirmDialog.tsx', () => ({
  ConfirmDialog: () => null,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SidebarProjectHeader', () => {
  test('points the project switcher at one list element', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })
    const trigger = container!.querySelector('button[aria-label="repo-tabs.repos"]')

    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const controlledId = trigger?.getAttribute('aria-controls')
    expect(controlledId).toBeTruthy()
    const targets = container!.querySelectorAll(`[id="${controlledId}"]`)
    expect(targets).toHaveLength(1)
    expect(targets[0]?.tagName).toBe('UL')
  })
})
