// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { BranchWorkspaceRepositoryDependencySelection } from '#/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

const mocks = vi.hoisted(() => ({ getRepositoryFileTree: vi.fn() }))

vi.mock('#/web/repo-client.ts', () => ({ getRepositoryFileTree: mocks.getRepositoryFileTree }))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.getRepositoryFileTree.mockReset()
  mocks.getRepositoryFileTree.mockImplementation(async (_repoId: string, worktreePath: string, dirPath: string) => ({
    ok: true,
    worktreePath,
    dirPath,
    entries:
      dirPath === worktreePath
        ? [
            entry('node_modules', `${worktreePath}/node_modules`, 'node_modules', 'directory'),
            entry('.env.local', `${worktreePath}/.env.local`, '.env.local', 'file'),
            entry('coverage', `${worktreePath}/coverage`, 'coverage', 'directory'),
          ]
        : [],
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceRepositoryDependencySelection', () => {
  test('collapses to a selected-only summary without remounting the dependency tree', async () => {
    renderHarness()
    await flush()
    expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).toBeNull()

    click('[data-worktree-dependency-path="node_modules"]')
    click('[data-worktree-dependency-path=".env.local"]')
    changeSelect('[data-worktree-dependency-mode=".env.local"]', 'symlink')
    expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).not.toBeNull()

    click('[data-action="collapse-repository-dependencies"]')
    expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(true)
    expect(summaryText('node_modules')).toContain('worktree-dependency-tree.copy')
    expect(summaryText('.env.local')).toContain('worktree-dependency-tree.symlink')
    expect(document.querySelector('[data-repository-dependency-summary="coverage"]')).toBeNull()
    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)

    click('[data-action="expand-repository-dependencies"]')
    expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(
      false,
    )
    expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.checked).toBe(
      true,
    )
    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)
  })

  test('expands and clears the summary when the source changes', async () => {
    renderHarness()
    await flush()
    click('[data-worktree-dependency-path="node_modules"]')
    click('[data-action="collapse-repository-dependencies"]')

    changeSelect('[data-worktree-bootstrap-source-select]', 'worktree:/repo-b')

    expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(
      false,
    )
    expect(document.querySelector('[data-branch-workspace-repository-dependency-summary]')).toBeNull()
    expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).toBeNull()
  })

  test('keeps collapse state independent between repository instances', async () => {
    act(() =>
      root.render(
        <>
          <StaticSelection repoId="repo-1" path="node_modules" />
          <StaticSelection repoId="repo-2" path=".env.local" />
        </>,
      ),
    )
    await flush()

    const first = dependencySelection('repo-1')
    const second = dependencySelection('repo-2')
    act(() => first.querySelector<HTMLButtonElement>('[data-action="collapse-repository-dependencies"]')?.click())

    expect(first.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(true)
    expect(second.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(false)
  })

  test('keeps the display toggle available while dependency inputs are disabled', async () => {
    act(() => root.render(<StaticSelection repoId="repo-1" path="node_modules" disabled />))
    await flush()

    expect(document.querySelector<HTMLSelectElement>('[data-worktree-bootstrap-source-select]')?.disabled).toBe(true)
    expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.disabled).toBe(
      true,
    )
    const collapse = document.querySelector<HTMLButtonElement>('[data-action="collapse-repository-dependencies"]')
    expect(collapse?.disabled).toBe(false)
    act(() => collapse?.click())
    expect(document.querySelector('[data-repository-dependency-summary="node_modules"]')).not.toBeNull()
  })
})

const sources: RepositoryDependencySource[] = [
  { id: 'worktree:/repo-a', kind: 'primary', worktreePath: '/repo-a', branch: 'main' },
  { id: 'worktree:/repo-b', kind: 'branch', worktreePath: '/repo-b', branch: 'develop' },
]

function Harness() {
  const [source, setSource] = useState(sources[0]!)
  const [selections, setSelections] = useState<WorktreeBootstrapSelection[]>([])
  return (
    <BranchWorkspaceRepositoryDependencySelection
      repoId="repo-1"
      source={source}
      sourceOptions={sources}
      selections={selections}
      disabled={false}
      onSourceChange={(nextSource) => {
        setSelections([])
        setSource(nextSource)
      }}
      onSelectionsChange={setSelections}
    />
  )
}

function StaticSelection({ repoId, path, disabled = false }: { repoId: string; path: string; disabled?: boolean }) {
  return (
    <BranchWorkspaceRepositoryDependencySelection
      repoId={repoId}
      source={sources[0]!}
      sourceOptions={sources}
      selections={[{ path, mode: 'copy' }]}
      disabled={disabled}
      onSourceChange={() => {}}
      onSelectionsChange={() => {}}
    />
  )
}

function renderHarness() {
  act(() => root.render(<Harness />))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  act(() => element.click())
}

function changeSelect(selector: string, value: string) {
  const element = document.querySelector<HTMLSelectElement>(selector)
  if (!element) throw new Error(`Missing select: ${selector}`)
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function summaryText(path: string): string {
  return document.querySelector(`[data-repository-dependency-summary="${path}"]`)?.textContent ?? ''
}

function dependencySelection(repoId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-branch-workspace-repository-dependency-selection="${repoId}"]`,
  )
  if (!element) throw new Error(`Missing dependency selection: ${repoId}`)
  return element
}

function entry(name: string, absolutePath: string, relativePath: string, kind: 'file' | 'directory' | 'symlink') {
  return { name, absolutePath, relativePath, kind }
}
