// @vitest-environment jsdom

import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchRow } from '#/web/components/branch-list/BranchRow.tsx'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useI18nStore: (selector: (state: { lang: string }) => string) => selector({ lang: 'zh' }),
  useT: () => (key: string, params?: Record<string, string | number>) => {
    switch (key) {
      case 'branches.dirty':
        return '有改动'
      case 'branches.worktree':
        return '工作树'
      case 'branches.reorder-worktree':
        return '重新排序工作树'
      case 'branches.default':
        return '默认'
      case 'branches.gone':
        return '已失联'
      case 'branch-status.current':
        return '当前'
      case 'branch-status.worktree-dirty':
        return `${params?.n ?? 0} 个改动`
      case 'branch-status.sync.ahead':
        return `领先 ${params?.n ?? 0}`
      case 'branch-status.sync.behind':
        return `落后 ${params?.n ?? 0}`
      case 'terminal.bell-unread':
        return '终端有未读提醒'
      default:
        return key
    }
  },
}))

vi.mock('#/web/components/BranchActionsMenu.tsx', () => ({
  BranchActionsMenu: () => null,
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
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchRow', () => {
  test('shows the generic dirty label for dirty worktrees', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    repo.data.worktreesByPath['/tmp/worktree-a'] = {
      path: '/tmp/worktree-a',
      branch: 'feature/a',
      isMain: false,
      isDirty: true,
      changeCount: 7,
    }
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.textContent).toContain('有改动')
  })

  test('keeps the generic dirty label even when exact counts are unavailable', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    repo.data.worktreesByPath['/tmp/worktree-a'] = {
      path: '/tmp/worktree-a',
      branch: 'feature/a',
      isMain: false,
      isDirty: true,
    }
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.textContent).toContain('有改动')
  })

  test('shows the branch name first and the project directory name as secondary worktree text', () => {
    const repo = emptyRepo('/Users/test/Desktop/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-optimize', 'repo')
    const branch = createRepoBranch('feature/a', {
      worktree: { path: '/Users/test/Desktop/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-optimize' },
    })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.querySelector('.text-sm.font-medium')?.textContent).toBe('feature/a')
    expect(document.body.querySelector('[aria-label="hobgoblin-feat-optimize"]')).not.toBeNull()
    expect(document.body.textContent).toContain('hobgoblin-feat-optimize')
    expect(document.body.textContent).not.toContain(
      '/Users/test/Desktop/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-optimize',
    )
  })

  test('does not render the recent commit summary line for worktree rows', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', {
      lastCommitMessage: 'Add workspace branch summary',
      worktree: { path: '/tmp/worktree-a' },
    })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    const text = document.body.textContent ?? ''
    expect(document.body.querySelector('.text-sm.font-medium')?.textContent).toBe('feature/a')
    expect(text).toContain('worktree-a')
    expect(text).not.toContain('Add workspace branch summary')
    expect(text).not.toContain('../worktree-a')
    expect(document.body.querySelector('[aria-label="worktree-a"]')).not.toBeNull()
  })

  test('shows an unread terminal bell marker for linked worktrees', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
      ['/tmp/repo\0/tmp/worktree-a'],
    )

    expect(document.body.querySelector('[aria-label="终端有未读提醒"]')).not.toBeNull()
  })

  test('shows only the directory name for remote worktree paths', () => {
    const repo = emptyRepo('ssh-config://prod/srv/repo', 'repo')
    repo.remote.target = {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: '192.0.2.10',
      user: 'tester',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    }
    const branch = createRepoBranch('feature/a', { worktree: { path: '/srv/repo-feature' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.querySelector('.text-sm.font-medium')?.textContent).toBe('feature/a')
    expect(document.body.querySelector('[aria-label="repo-feature"]')).not.toBeNull()
    expect(document.body.textContent).toContain('repo-feature')
    expect(document.body.textContent).not.toContain('/srv/repo-feature')
    expect(document.body.textContent).not.toContain('tester@192.0.2.10')
  })

  test('does not add a directory line for branches without worktrees', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/plain')

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    expect(document.body.textContent).not.toContain('没有工作树')
    expect(document.body.textContent).not.toContain('no worktree')
  })

  test('renders an isolated drag handle when drag props are provided', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
          dragHandle={{
            label: '重新排序工作树',
            ref: vi.fn(),
            props: {},
          }}
        />
      </ul>,
    )

    const handle = document.querySelector('[aria-label="重新排序工作树"]')
    expect(handle?.getAttribute('aria-label')).toBe('重新排序工作树')
  })
})

function render(element: React.ReactNode, bellWorktreeKeys: string[] = []) {
  const readContext = terminalReadContextWithBellKeys(new Set(bellWorktreeKeys))
  act(() => {
    root!.render(
      <TerminalSessionReadContext.Provider value={readContext}>{element}</TerminalSessionReadContext.Provider>,
    )
  })
}

function terminalReadContextWithBellKeys(bellKeys: ReadonlySet<string>): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const hasBell = bellKeys.has(worktreeTerminalKey)
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions: hasBell
          ? [
              {
                key: `${worktreeTerminalKey}\0terminal-1`,
                worktreeTerminalKey,
                terminalId: 'terminal-1',
                index: 1,
                title: 'terminal',
                phase: 'open',
                selected: true,
                hasBell: true,
              },
            ]
          : [],
        count: hasBell ? 1 : 0,
      }
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}
