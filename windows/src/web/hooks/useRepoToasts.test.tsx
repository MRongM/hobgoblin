// @vitest-environment jsdom

vi.mock(import('#/web/stores/i18n.ts'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useT: (() => (key: string, params?: Record<string, string | number>) =>
      i18nMocks.interpolate(i18nMocks.dict[key] ?? key, params)) as typeof actual.useT,
  }
})

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useRepoToasts } from '#/web/hooks/useRepoToasts.tsx'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const i18nMocks = vi.hoisted(() => ({
  dict: {
    'action.create-worktree-created-title': 'Created worktree',
    'worktree-bootstrap.summary.copy-one': 'Copied {count} path: {paths}{moreSuffix}',
    'worktree-bootstrap.summary.skipped-missing-one': 'Skipped missing {count} path: {paths}{moreSuffix}',
    'worktree-bootstrap.summary.setup': 'Ran setup: {command}',
  } as Record<string, string>,
  interpolate(template: string, params?: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => String(params?.[key] ?? match))
  },
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))

const REPO_ID = '/tmp/repo-toasts-test'
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  toastMocks.success.mockClear()
  toastMocks.error.mockClear()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useRepoToasts', () => {
  test('renders worktree bootstrap summary details in success toast', () => {
    const repo = emptyRepo(REPO_ID, 'repo-toasts-test')
    useReposStore.setState({ repos: { [REPO_ID]: repo }, order: [REPO_ID], activeId: REPO_ID })
    useReposStore.getState().setLastResult(
      REPO_ID,
      {
        ok: true,
        message: '',
        worktreeBootstrap: {
          copy: { count: 1, paths: ['.env'] },
          symlink: { count: 0, paths: [] },
          hardlink: { count: 0, paths: [] },
          skippedMissing: { count: 1, paths: ['missing.env'] },
          setup: { command: 'bun install' },
        },
      },
      repo.instanceToken,
      { action: { kind: 'createWorktree', branch: 'feature/a', worktreePath: '/tmp/repo-feature' } },
    )

    render(<Harness repoId={REPO_ID} />)

    expect(toastMocks.success).toHaveBeenCalledTimes(1)
    const [, options] = toastMocks.success.mock.calls[0]!
    const description = String(options.description.props.children)
    expect(description).toContain('Copied 1 path: .env')
    expect(description).toContain('Skipped missing 1 path: missing.env')
    expect(description).toContain('Ran setup: bun install')
  })
})

function Harness({ repoId }: { repoId: string }) {
  useRepoToasts(repoId)
  return null
}

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
}
