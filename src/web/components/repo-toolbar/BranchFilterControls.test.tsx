// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchFilterControls } from '#/web/components/repo-toolbar/BranchFilterControls.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const REPO_ID = '/tmp/repo'
let container: HTMLDivElement
let root: Root
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  resetReposStore()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchFilterControls', () => {
  test('renders branch view controls without a branch search input', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })

    act(() => {
      root.render(<BranchFilterControls repoId={REPO_ID} />)
    })

    expect(container.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container.querySelector('[aria-label="branches.filter-label"]')).not.toBeNull()
  })
})
