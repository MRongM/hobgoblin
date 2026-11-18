// @vitest-environment jsdom

import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { WorktreeDependencyTree } from '#/web/components/WorktreeDependencyTree.tsx'

const mocks = vi.hoisted(() => ({
  getRepositoryFileTree: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryFileTree: mocks.getRepositoryFileTree,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  mocks.getRepositoryFileTree.mockReset()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorktreeDependencyTree', () => {
  test('loads directories lazily and supports nested file and directory selections', async () => {
    mocks.getRepositoryFileTree.mockImplementation(
      async (_repoId: string, _worktreePath: string, dirPath: string) =>
        dirPath === '/repo'
          ? {
              ok: true,
              worktreePath: '/repo',
              dirPath,
              entries: [
                entry('backend', '/repo/backend', 'backend', 'directory'),
                entry('.env.local', '/repo/.env.local', '.env.local', 'file'),
                entry('current-link', '/repo/current-link', 'current-link', 'symlink'),
              ],
            }
          : {
              ok: true,
              worktreePath: '/repo',
              dirPath,
              entries: [entry('.venv', '/repo/backend/.venv', 'backend/.venv', 'directory')],
            },
    )

    render(
      <SelectionHarness repoId="repo-1" sourceWorktreePath="/repo" />,
    )
    await flush()

    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)
    expect(mocks.getRepositoryFileTree).toHaveBeenNthCalledWith(
      1,
      'repo-1',
      '/repo',
      '/repo',
      expect.any(AbortSignal),
    )
    expect(dependencyCheckbox('.env.local')).toBeTruthy()
    expect(dependencyCheckbox('current-link')).toBeNull()
    expect(document.querySelector('[data-worktree-dependency-symlink="current-link"]')).toBeTruthy()

    click(expandButton('backend'))
    await flush()

    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(2)
    expect(mocks.getRepositoryFileTree).toHaveBeenNthCalledWith(
      2,
      'repo-1',
      '/repo',
      '/repo/backend',
      expect.any(AbortSignal),
    )

    click(dependencyCheckbox('backend/.venv')!)
    expect(selectedPaths()).toEqual([{ path: 'backend/.venv', mode: 'symlink' }])
    changeSelect(modeSelect('backend/.venv'), 'copy')
    expect(selectedPaths()).toEqual([{ path: 'backend/.venv', mode: 'copy' }])

    click(dependencyCheckbox('backend')!)
    expect(selectedPaths()).toEqual([{ path: 'backend', mode: 'symlink' }])
    expect(dependencyCheckbox('backend/.venv')?.disabled).toBe(true)
  })

  test('shows a node-local retry without disabling selection or creation state', async () => {
    mocks.getRepositoryFileTree
      .mockResolvedValueOnce({ ok: false, message: 'offline' })
      .mockResolvedValueOnce({
        ok: true,
        worktreePath: '/repo',
        dirPath: '/repo',
        entries: [entry('.cache', '/repo/.cache', '.cache', 'directory')],
      })

    render(<SelectionHarness repoId="repo-1" sourceWorktreePath="/repo" />)
    await flush()

    expect(document.querySelector('[data-worktree-dependency-error="/repo"]')).toBeTruthy()
    click(retryButton('/repo'))
    await flush()

    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(2)
    expect(dependencyCheckbox('.cache')).toBeTruthy()
  })

  test('aborts stale reads and reloads the root when the source worktree changes', async () => {
    let firstSignal: AbortSignal | undefined
    mocks.getRepositoryFileTree.mockImplementation(
      async (_repoId: string, worktreePath: string, dirPath: string, signal: AbortSignal) => {
        if (worktreePath === '/repo-a') firstSignal = signal
        return { ok: true, worktreePath, dirPath, entries: [] }
      },
    )

    render(<SelectionHarness repoId="repo-1" sourceWorktreePath="/repo-a" />)
    await flush()
    rerender(<SelectionHarness repoId="repo-1" sourceWorktreePath="/repo-b" />)
    await flush()

    expect(firstSignal?.aborted).toBe(true)
    expect(mocks.getRepositoryFileTree).toHaveBeenLastCalledWith(
      'repo-1',
      '/repo-b',
      '/repo-b',
      expect.any(AbortSignal),
    )
  })
})

function SelectionHarness(props: { repoId: string; sourceWorktreePath: string }) {
  const [selections, setSelections] = useState<WorktreeBootstrapSelection[]>([])
  return (
    <>
      <WorktreeDependencyTree {...props} selections={selections} onSelectionsChange={setSelections} />
      <output data-worktree-dependency-selections>{JSON.stringify(selections)}</output>
    </>
  )
}

function entry(
  name: string,
  absolutePath: string,
  relativePath: string,
  kind: 'file' | 'directory' | 'symlink',
) {
  return { name, absolutePath, relativePath, kind }
}

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
}

function rerender(element: ReactNode) {
  act(() => root!.render(element))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function dependencyCheckbox(path: string): HTMLInputElement | null {
  return document.querySelector(`input[data-worktree-dependency-path="${path}"]`)
}

function expandButton(path: string): HTMLButtonElement {
  const element = document.querySelector(`button[data-worktree-dependency-expand="${path}"]`)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing expand button for ${path}`)
  return element
}

function retryButton(path: string): HTMLButtonElement {
  const element = document.querySelector(`button[data-worktree-dependency-retry="${path}"]`)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing retry button for ${path}`)
  return element
}

function modeSelect(path: string): HTMLSelectElement {
  const element = document.querySelector(`select[data-worktree-dependency-mode="${path}"]`)
  if (!(element instanceof HTMLSelectElement)) throw new Error(`Missing mode select for ${path}`)
  return element
}

function click(element: HTMLElement) {
  act(() => element.click())
}

function changeSelect(element: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => element.dispatchEvent(new Event('change', { bubbles: true })))
}

function selectedPaths(): WorktreeBootstrapSelection[] {
  const output = document.querySelector('[data-worktree-dependency-selections]')
  return JSON.parse(output?.textContent || '[]') as WorktreeBootstrapSelection[]
}
