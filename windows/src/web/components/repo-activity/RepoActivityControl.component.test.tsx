// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { RepoActivityControl } from '#/web/components/repo-activity/RepoActivityControl.tsx'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { markRepoOperationTargets, nextRepoOperationId } from '#/web/stores/repos/runtime.ts'

const REPO_ID = '/tmp/repo-activity-control-component'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
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

describe('RepoActivityControl component', () => {
  test('keeps the primary refresh button enabled during background-blocked refresh states', () => {
    seedRepoState({ id: REPO_ID, remote: { hasRemotes: true } })
    markRepoOperationTargets(REPO_ID, nextRepoOperationId(REPO_ID), [{ key: 'status', reason: 'status' }], 'running')

    render(<RepoActivityControl repoId={REPO_ID} />)

    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-busy')).toBeNull()
  })

  test('disables the primary refresh button during manual refreshes', () => {
    seedRepoState({ id: REPO_ID, remote: { hasRemotes: true } })
    markRepoOperationTargets(
      REPO_ID,
      nextRepoOperationId(REPO_ID),
      [{ key: 'manualRefresh', reason: 'manual-refresh' }],
      'running',
    )

    render(<RepoActivityControl repoId={REPO_ID} />)

    expect(button().disabled).toBe(true)
    expect(button().getAttribute('aria-busy')).toBe('true')
  })

  test('renders the primary refresh button for local-only repositories without the local-only label', () => {
    seedRepoState({ id: REPO_ID, remote: { hasRemotes: false } })

    render(<RepoActivityControl repoId={REPO_ID} />)

    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-label')).toBe('action.refresh')
    expect(button().querySelector('.lucide-refresh-cw')).not.toBeNull()
    expect(document.body.textContent).not.toContain('tab.local-only')
  })

  test('uses the Git repository detection icon for plain workspaces without changing the refresh label', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    render(<RepoActivityControl repoId={REPO_ID} />)

    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-label')).toBe('action.refresh')
    expect(button().querySelector('.lucide-folder-git-2')).not.toBeNull()
    expect(button().querySelector('.lucide-refresh-cw')).toBeNull()
  })

  test('switches from the Git detection icon to refresh when a plain workspace becomes a repository', () => {
    const repo = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    render(<RepoActivityControl repoId={REPO_ID} />)
    expect(button().getAttribute('aria-label')).toBe('action.refresh')
    expect(button().querySelector('.lucide-folder-git-2')).not.toBeNull()

    act(() => {
      useReposStore.setState({
        repos: {
          [REPO_ID]: { ...repo, isGitRepo: true },
        },
      })
    })

    expect(button().getAttribute('aria-label')).toBe('action.refresh')
    expect(button().querySelector('.lucide-folder-git-2')).toBeNull()
    expect(button().querySelector('.lucide-refresh-cw')).not.toBeNull()
  })

  test('allows topbar hosts to override cached projection muted color', () => {
    const repo = seedRepoState({ id: REPO_ID, remote: { hasRemotes: false } })
    useReposStore.setState({
      repos: {
        [REPO_ID]: {
          ...repo,
          projection: { source: 'cache', savedAt: 1 },
        },
      },
    })

    render(
      <RepoActivityControl repoId={REPO_ID} mutedForegroundClassName="text-topbar-muted-foreground" />,
    )

    const indicator = document.body.querySelector<HTMLElement>('[aria-label^="tab.projectiond"]')
    expect(indicator?.className).toContain('text-topbar-muted-foreground')
    expect(indicator?.querySelector('span')?.className).toContain('bg-current')
    expect(indicator?.querySelector('span')?.className).toContain('opacity-70')
  })
})

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
}

function button(): HTMLButtonElement {
  const element = document.body.querySelector('button')
  if (!(element instanceof HTMLButtonElement)) throw new Error('Missing refresh button')
  return element
}
