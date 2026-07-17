// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/shell-overlay-actions.tsx', () => ({
  useShellOverlayActions: () => null,
}))

vi.mock('#/web/components/Tip.tsx', () => ({
  Tip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('#/web/components/repo-toolbar/ProjectThemeMenu.tsx', () => ({
  ProjectThemeMenuConnected: () => <div data-testid="project-theme" />,
}))

vi.mock('#/web/components/repo-activity/RepoActivityControl.tsx', () => ({
  RepoActivityControl: () => null,
}))

const REPO_ID = '/repo'
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  seedRepoState({ id: REPO_ID, currentBranch: 'main', selectedBranch: 'main' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('StatusBar file area control', () => {
  test('switches between collapse and expand actions', () => {
    const onToggleFileArea = vi.fn()
    renderStatusBar(false, onToggleFileArea)

    const collapse = container?.querySelector<HTMLButtonElement>('button[aria-label="file-area.collapse"]')
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    act(() => collapse?.click())
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)

    renderStatusBar(true, onToggleFileArea)

    const expand = container?.querySelector<HTMLButtonElement>('button[aria-label="file-area.expand"]')
    expect(expand?.getAttribute('aria-expanded')).toBe('false')
  })

  test('omits the control without a toggle callback', () => {
    act(() => root!.render(<StatusBar repoId={REPO_ID} />))

    expect(container?.querySelector('button[aria-label^="file-area."]')).toBeNull()
  })
})

function renderStatusBar(fileAreaCollapsed: boolean, onToggleFileArea: () => void) {
  act(() => {
    root!.render(
      <StatusBar repoId={REPO_ID} fileAreaCollapsed={fileAreaCollapsed} onToggleFileArea={onToggleFileArea} />,
    )
  })
}
