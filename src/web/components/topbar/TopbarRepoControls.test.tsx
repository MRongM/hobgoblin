// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TopbarRepoControls } from '#/web/components/topbar/TopbarRepoControls.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => ({ selectRepoBranch: vi.fn() }),
}))

vi.mock('#/web/hooks/useBranchActionItems.tsx', () => ({
  useBranchActionItems: () => ({ dialogs: null }),
}))

vi.mock('#/web/hooks/useBranchActionShortcutRegistry.ts', () => ({
  useBranchActionShortcutRegistry: () => {},
}))

vi.mock('#/web/components/BranchActionControls.tsx', () => ({
  BranchActionControls: () => null,
}))

vi.mock('#/web/components/repo-activity/RepoActivityControl.tsx', () => ({
  RepoActivityControl: ({ mutedForegroundClassName }: { mutedForegroundClassName: string }) => (
    <div data-testid="repo-activity-control" data-muted-class={mutedForegroundClassName} />
  ),
}))

const REPO_ID = '/tmp/gbl-topbar-repo-controls'
const WORKTREE_PATH = '/tmp/gbl-topbar-repo-controls-worktree'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: null,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
  resetReposStore()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TopbarRepoControls', () => {
  test('does not render branch selector when persisted focus mode is false', () => {
    renderControls()

    expect(container?.querySelector('button[aria-label="branches.switch"]')).toBeNull()
  })

  test('renders branch selector when focus presentation is overridden', () => {
    renderControls(true)

    const branchSelector = container?.querySelector<HTMLButtonElement>('button[aria-label="branches.switch"]')
    expect(branchSelector).not.toBeNull()
    expect(branchSelector?.classList.contains('text-topbar-muted-foreground')).toBe(true)
  })

  test('uses generic muted foreground for toolbar branch presentation', () => {
    renderControls(true, 'toolbar')

    const branchSelector = container?.querySelector<HTMLButtonElement>('button[aria-label="branches.switch"]')
    expect(branchSelector?.classList.contains('text-muted-foreground')).toBe(true)
    expect(branchSelector?.classList.contains('text-topbar-muted-foreground')).toBe(false)
  })

  test('uses generic muted foreground for toolbar non-git activity', () => {
    seedRepoState({ id: REPO_ID, isGitRepo: false })
    renderControls(undefined, 'toolbar')

    const activity = container?.querySelector<HTMLElement>('[data-testid="repo-activity-control"]')
    expect(activity?.dataset.mutedClass).toBe('text-muted-foreground')
  })
})

function renderControls(focusPresentation?: boolean, tone?: 'topbar' | 'toolbar'): void {
  act(() => {
    root?.render(<TopbarRepoControls repoId={REPO_ID} focusPresentation={focusPresentation} tone={tone} />)
  })
}
