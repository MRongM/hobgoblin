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
  test('identifies the primary worktree and selects another branch source', () => {
    const onSourceChange = vi.fn()
    const primary = { id: 'primary', kind: 'primary' } as const
    const feature = branchSource('feature/source', '/tmp/repo-feature')

    render(
      <WorktreeBootstrapSourcePicker source={primary} options={[primary, feature]} onSourceChange={onSourceChange} />,
    )

    expect(document.body.textContent).toContain('worktree-bootstrap.source-primary')
    const select = sourceSelect()
    expect([...select.options].map((option) => option.textContent)).not.toContain(
      'worktree-bootstrap.source-primary-option',
    )
    expect([...select.options].map((option) => option.textContent)).toContain('feature/source')

    changeSelect(select, feature.id)

    expect(onSourceChange).toHaveBeenCalledWith(feature)
  })

  test('identifies a branch source and offers the primary worktree', () => {
    const source = branchSource('feature/base', '/tmp/repo-base')
    const primary = { id: 'primary', kind: 'primary' } as const

    render(<WorktreeBootstrapSourcePicker source={source} options={[primary]} onSourceChange={vi.fn()} pending />)

    expect(document.body.textContent).toContain('worktree-bootstrap.source-branch')
    expect([...sourceSelect().options].map((option) => option.textContent)).toContain(
      'worktree-bootstrap.source-primary-option',
    )
    expect(sourceSelect().disabled).toBe(true)
  })
})

function branchSource(branch: string, worktreePath: string): RepositoryDependencySource {
  return { id: `branch:${branch}`, kind: 'branch', branch, worktreePath }
}

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
