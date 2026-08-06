// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorktreeBootstrapSourcePicker } from '#/web/components/WorktreeBootstrapSourcePicker.tsx'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorktreeBootstrapSourcePicker', () => {
  test('lists primary, branch, and detached worktrees and changes the active source', () => {
    const onSourceChange = vi.fn()
    const primary: RepositoryDependencySource = {
      id: 'worktree:/repo',
      kind: 'primary',
      branch: 'main',
      worktreePath: '/repo',
    }
    const feature: RepositoryDependencySource = {
      id: 'worktree:/repo-feature',
      kind: 'branch',
      branch: 'feature/source',
      worktreePath: '/repo-feature',
    }
    const detached: RepositoryDependencySource = {
      id: 'worktree:/repo-detached',
      kind: 'detached',
      head: 'abcdef123456',
      worktreePath: '/repo-detached',
    }

    render(
      <WorktreeBootstrapSourcePicker
        source={primary}
        options={[primary, feature, detached]}
        onSourceChange={onSourceChange}
      />,
    )

    const select = sourceSelect()
    expect(select.value).toBe(primary.id)
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'worktree-bootstrap.source-primary-option',
      'feature/source',
      'worktree-bootstrap.source-detached-option',
    ])

    changeSelect(select, detached.id)

    expect(onSourceChange).toHaveBeenCalledWith(detached)
  })

  test('keeps a single current source visible and respects pending state', () => {
    const source: RepositoryDependencySource = {
      id: 'worktree:/repo-base',
      kind: 'branch',
      branch: 'feature/base',
      worktreePath: '/repo-base',
    }

    render(<WorktreeBootstrapSourcePicker source={source} options={[source]} onSourceChange={vi.fn()} pending />)

    expect(sourceSelect().value).toBe(source.id)
    expect([...sourceSelect().options].map((option) => option.textContent)).toEqual(['feature/base'])
    expect(sourceSelect().disabled).toBe(true)
  })
})

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
}

function sourceSelect(): HTMLSelectElement {
  const element = document.querySelector('[data-worktree-bootstrap-source-select]')
  if (!(element instanceof HTMLSelectElement)) throw new Error('Missing worktree bootstrap source select')
  return element
}

function changeSelect(element: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => element.dispatchEvent(new Event('change', { bubbles: true })))
}
