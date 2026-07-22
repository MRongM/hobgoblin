// @vitest-environment jsdom

import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchRow } from '#/web/components/branch-list/BranchRow.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'

type CloseTerminalMock = ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>

const branchActionState = vi.hoisted(() => ({
  editorOnSelect: vi.fn(),
  externalTerminalOnSelect: vi.fn(),
  internalTerminalOnSelect: vi.fn(),
  pullDisabled: false,
}))

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
      case 'terminal.open-count':
        return `${params?.count ?? 0} 个终端`
      case 'terminal.output-active':
        return '终端正在输出'
      default:
        return key
    }
  },
}))

vi.mock('#/web/hooks/useBranchActionItems.tsx', () => ({
  useBranchActionItems: () => ({
    patchItems: [
      {
        id: 'createTag',
        label: 'action.create-tag',
        icon: <span />,
        disabled: false,
        visible: true,
        onSelect: vi.fn(),
      },
    ],
    mainItems: [
      {
        id: 'checkout',
        label: 'action.checkout',
        icon: <span />,
        disabled: false,
        visible: false,
        onSelect: vi.fn(),
      },
      {
        id: 'pull',
        label: 'action.pull',
        icon: <span />,
        disabled: branchActionState.pullDisabled,
        visible: true,
        onSelect: vi.fn(),
      },
      {
        id: 'push',
        label: 'action.push',
        icon: <span />,
        disabled: false,
        visible: true,
        onSelect: vi.fn(),
      },
      {
        id: 'createWorktree',
        label: 'action.create-worktree',
        icon: <span />,
        disabled: false,
        visible: true,
        onSelect: vi.fn(),
      },
      {
        id: 'sync',
        label: 'action.refresh',
        icon: <span />,
        disabled: false,
        visible: true,
        onSelect: vi.fn(),
      },
    ],
    externalItems: [
      {
        id: 'editor',
        label: 'open-in-editor',
        title: 'open-in-editor',
        ariaLabel: 'open-in-editor',
        icon: <span data-testid="editor-icon" />,
        disabled: false,
        busy: false,
        visible: true,
        onSelect: branchActionState.editorOnSelect,
      },
      {
        id: 'terminal',
        label: 'open-in-terminal',
        title: 'open-in-terminal',
        ariaLabel: 'open-in-terminal',
        icon: <span data-testid="terminal-icon" />,
        disabled: false,
        busy: false,
        visible: true,
        onSelect: branchActionState.internalTerminalOnSelect,
      },
      {
        id: 'externalTerminal',
        label: 'open-external-terminal',
        title: 'open-external-terminal',
        ariaLabel: 'open-external-terminal',
        icon: <span data-testid="external-terminal-icon" />,
        disabled: false,
        busy: false,
        visible: true,
        onSelect: branchActionState.externalTerminalOnSelect,
      },
    ],
    destructiveItems: [
      {
        id: 'removeWorktree',
        label: 'action.remove-worktree',
        icon: <span />,
        disabled: false,
        visible: true,
        destructive: true,
        onSelect: vi.fn(),
      },
      {
        id: 'deleteBranch',
        label: 'action.delete-branch',
        icon: <span />,
        disabled: false,
        visible: true,
        destructive: true,
        onSelect: vi.fn(),
      },
    ],
    dialogs: null,
    inlinePanel: <div data-testid="inline-commit-form">inline commit</div>,
  }),
}))

vi.mock('#/web/components/BranchActionsMenu.tsx', () => ({
  // Mirrors the real dropdown wrapper, which stops click propagation
  // (BranchActionsMenu.tsx) so row-level onClick never fires from it.
  BranchActionsDropdown: () => (
    <button type="button" aria-label="action.menu" onClick={(e) => e.stopPropagation()}>
      ...
    </button>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  branchActionState.editorOnSelect.mockReset()
  branchActionState.externalTerminalOnSelect.mockReset()
  branchActionState.internalTerminalOnSelect.mockReset()
  branchActionState.pullDisabled = false
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

function terminalReadContextWithState(
  bellKeys: ReadonlySet<string>,
  countsByWorktreeKey: ReadonlyMap<string, number>,
  outputActiveKeys: ReadonlySet<string> = new Set(),
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const hasBell = bellKeys.has(worktreeTerminalKey)
      const isOutputActive = outputActiveKeys.has(worktreeTerminalKey)
      const count = countsByWorktreeKey.get(worktreeTerminalKey) ?? (hasBell || isOutputActive ? 1 : 0)
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions:
          count > 0
            ? [
                {
                  key: `${worktreeTerminalKey}\0terminal-1`,
                  worktreeTerminalKey,
                  terminalId: 'terminal-1',
                  index: 1,
                  title: 'terminal',
                  phase: 'open',
                  selected: true,
                  hasBell,
                  isOutputActive,
                },
              ]
            : [],
        count,
      }
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

describe('BranchRow', () => {
  test('keeps the changed-file count in the dirty worktree row title', () => {
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

    expect(document.body.textContent).not.toContain('有改动')
    expect(document.body.querySelector('[title*="7 个改动"]')).not.toBeNull()
  })

  test('shows the changed-file count beside the dirty worktree icon', () => {
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

    const dirtyBadge = document.body.querySelector<HTMLElement>('[data-testid="dirty-worktree-badge"]')
    const badgeIcon = dirtyBadge?.querySelector('svg')

    expect(dirtyBadge?.textContent).toBe('7')
    expect(dirtyBadge?.getAttribute('aria-label')).toBe('7 个改动')
    expect(dirtyBadge?.getAttribute('title')).toBe('7 个改动')
    expect(badgeIcon?.classList.contains('lucide-git-compare-arrows')).toBe(true)
    expect(badgeIcon?.classList.contains('lucide-folder-tree')).toBe(false)
  })

  test('keeps dirty worktree label out of visible text when exact counts are unavailable', () => {
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

    expect(document.body.textContent).not.toContain('有改动')
    expect(document.body.querySelector('[title*="有改动"]')).not.toBeNull()
    const dirtyBadge = document.body.querySelector<HTMLElement>('[data-testid="dirty-worktree-badge"]')
    expect(dirtyBadge?.textContent).toBe('')
    expect(dirtyBadge?.getAttribute('aria-label')).toBe('有改动')
  })

  test('does not render the default branch badge in branch rows', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('main', { isDefault: true })

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

    expect(document.body.textContent).toContain('main')
    expect(document.body.textContent).not.toContain('默认')
    expect(document.body.querySelector('[title*="默认"]')).not.toBeNull()
  })

  test('shows the branch name only; worktree path lives in the row title', () => {
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

    expect(document.body.querySelector('.text-\\[13px\\].font-medium')?.textContent).toBe('feature/a')
    // worktree 路径不再作为独立 aria-label 元素显示
    expect(document.body.querySelector('[aria-label="hobgoblin-feat-optimize"]')).toBeNull()
    // 但仍出现在整行的 title 悬停中
    const rowSummary = document.body.querySelector<HTMLElement>('[title*="hobgoblin-feat-optimize"]')
    expect(rowSummary).not.toBeNull()
  })

  test('shows the abbreviated commit hash tag after the branch name', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { lastCommitHash: 'abc123456789' })

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

    const branchName = document.body.querySelector('.text-\\[13px\\].font-medium')
    const hashTag = document.body.querySelector<HTMLElement>('[data-testid="branch-hash-tag"]')

    expect(branchName?.textContent).toBe('feature/a')
    expect(hashTag?.tagName).toBe('SPAN')
    expect(hashTag?.textContent).toBe('#abc1234')
    expect(hashTag?.hasAttribute('title')).toBe(false)
    expect(hashTag?.className).toContain('font-mono')
    expect(hashTag?.className).toContain('text-muted-foreground')
    expect(hashTag?.className).not.toMatch(/border-/)
  })

  test('centers the worktree icon beside the single-line branch summary', () => {
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
    )

    const summary = document.querySelector<HTMLElement>('[data-workspace-list-item-main] [title*="feature/a"]')
    const [iconColumn, textColumn] = Array.from(summary?.children ?? []) as HTMLElement[]

    expect(summary?.className).toContain('grid-cols-[1rem_minmax(0,1fr)]')
    expect(summary?.className).toContain('items-center')
    expect(iconColumn?.className).toContain('workspace-list-item-leading-icon')
    expect(iconColumn?.querySelector('svg')?.classList.contains('lucide-folder-tree')).toBe(true)
    expect(textColumn?.textContent).toContain('feature/a')
    // 单行显示：worktree 路径不再作为文本内容出现在 textColumn
    expect(textColumn?.textContent).not.toContain('worktree-a')
  })

  test('does not render the neutral worktree badge for clean linked worktree rows', () => {
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
    )

    expect(document.body.querySelector('.text-\\[13px\\].font-medium')?.textContent).toBe('feature/a')
    // worktree 路径不再作为独立 aria-label / 文本内容显示（已移入整行的 title 悬停）
    expect(document.body.querySelector('[aria-label="worktree-a"]')).toBeNull()
    expect(document.body.textContent).not.toContain('工作树')
  })

  test('uses the worktree icon for the current branch when it has a worktree', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    repo.data.currentBranch = 'main'
    const branch = createRepoBranch('main', { worktree: { path: '/tmp/repo' } })

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

    const icon = document.body.querySelector('svg')
    expect(icon?.classList.contains('text-brand-text')).toBe(true)
    expect(icon?.classList.contains('text-success')).toBe(false)
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
    expect(document.body.querySelector('.text-\\[13px\\].font-medium')?.textContent).toBe('feature/a')
    expect(text).not.toContain('Add workspace branch summary')
    expect(text).not.toContain('../worktree-a')
    // worktree 路径不再作为独立 aria-label 显示，但仍存在于行 title 悬停中
    expect(document.body.querySelector('[aria-label="worktree-a"]')).toBeNull()
    expect(document.body.querySelector('[title*="worktree-a"]')).not.toBeNull()
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
      {
        bellWorktreeKeys: ['/tmp/repo\0/tmp/worktree-a'],
        countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 1]]),
      },
    )

    expect(document.body.querySelector('[aria-label="终端有未读提醒"]')).not.toBeNull()
  })

  test('shows a labeled terminal count badge for linked worktrees with open sessions', () => {
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
      {
        countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 2]]),
      },
    )

    const badge = document.body.querySelector('[data-testid="terminal-count-badge"]')
    expect(badge?.textContent).toBe('2')
    expect(badge?.getAttribute('aria-label')).toBe('2 个终端')
    expect(badge?.querySelector('svg')).not.toBeNull()
  })

  test('animates the terminal count icon when a linked worktree has active output', () => {
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
      {
        countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 1]]),
        outputActiveWorktreeKeys: ['/tmp/repo\0/tmp/worktree-a'],
      },
    )

    const badge = document.body.querySelector('[data-testid="terminal-count-badge"]')
    expect(badge?.textContent).toBe('1')
    expect(badge?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
  })

  test('keeps the terminal count icon idle when linked worktree sessions have no active output', () => {
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
      {
        countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 1]]),
      },
    )

    const badge = document.body.querySelector('[data-testid="terminal-count-badge"]')
    expect(badge?.querySelector('[data-terminal-output-activity-indicator="active"]')).toBeNull()
  })

  test('does not show a terminal count badge when a linked worktree has no open sessions', () => {
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
      {
        countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 0]]),
      },
    )

    expect(document.body.querySelector('[data-testid="terminal-count-badge"]')).toBeNull()
  })

  test('closes only the linked worktree terminals from the row context menu when inline actions are hidden', async () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })
    const terminalWorktreeKey = '/tmp/repo\0/tmp/worktree-a'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()

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
      {
        countsByWorktreeKey: new Map([[terminalWorktreeKey, 1]]),
        closeTerminal,
      },
    )
    const row = document.body.querySelector('li')
    if (!(row instanceof HTMLElement)) throw new Error('missing worktree row')

    await requestCloseAllFromContextMenu(row)

    expect(closeTerminal).not.toHaveBeenCalled()
    await confirmCloseAll()
    expect(closeTerminal).toHaveBeenCalledWith(`${terminalWorktreeKey}\0terminal-1`, {
      repoRoot: '/tmp/repo',
      worktreePath: '/tmp/worktree-a',
    })
  })

  test('offers the four scoped worktree actions from the row context menu', async () => {
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
    )
    const row = document.body.querySelector('li')
    if (!(row instanceof HTMLElement)) throw new Error('missing worktree row')

    expect((await openContextMenu(row)).map((item) => item.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.close-all',
    ])

    await clickContextMenuItem(row, 'worktrees.open-in-editor-label')
    await clickContextMenuItem(row, 'terminal.external')
    await clickContextMenuItem(row, 'terminal.internal')

    expect(branchActionState.editorOnSelect).toHaveBeenCalledTimes(1)
    expect(branchActionState.externalTerminalOnSelect).toHaveBeenCalledTimes(1)
    expect(branchActionState.internalTerminalOnSelect).toHaveBeenCalledTimes(1)
  })

  test('does not attach the item context menu to a branch without a worktree', async () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a')
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
    const row = document.body.querySelector('li')
    if (!(row instanceof HTMLElement)) throw new Error('missing branch row')

    expect(await openContextMenu(row)).toEqual([])
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

    expect(document.body.querySelector('.text-\\[13px\\].font-medium')?.textContent).toBe('feature/a')
    // 目录名不再作为独立 aria-label 元素显示，但仍出现在整行 title 悬停中
    expect(document.body.querySelector('[aria-label="repo-feature"]')).toBeNull()
    expect(document.body.querySelector('[title*="repo-feature"]')).not.toBeNull()
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

  test('does not use a check icon for current branch rows without worktrees', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    repo.data.currentBranch = 'main'
    const branch = createRepoBranch('main')

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

    const icon = document.body.querySelector('svg')
    expect(icon?.classList.contains('text-muted-foreground')).toBe(true)
    expect(icon?.classList.contains('text-success')).toBe(false)
  })

  test('uses compact row height and content padding', () => {
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
    )

    const row = document.querySelector('[data-workspace-list-item]')
    const content = row?.querySelector('[data-workspace-list-item-main]')

    expect(row?.getAttribute('data-size')).toBe('primary')
    expect(content?.className).toContain('h-8')
    expect(content?.className).not.toContain('h-9')
  })

  test('does not render commit author or commit time in visible branch row text', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', {
      lastCommitAuthor: 'MRongM',
      lastCommitDate: new Date('2026-07-04T10:00:00.000Z').toISOString(),
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
    expect(text).toContain('feature/a')
    // worktree 路径不再作为可见文本
    expect(text).not.toContain('worktree-a')
    expect(text).not.toContain('MRongM')
  })

  test('applies sortable props only to a dedicated drag handle', () => {
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
          sortable={{
            setNodeRef: vi.fn(),
            dragHandle: {
              setActivatorNodeRef: vi.fn(),
              props: { 'data-sortable-id': '/tmp/worktree-a' },
            },
          }}
        />
      </ul>,
    )

    const handle = document.querySelector('[aria-label="重新排序工作树"]')
    const row = document.querySelector('[data-workspace-list-item]')
    const main = document.querySelector('[data-workspace-list-item-main]')
    expect(handle?.getAttribute('data-sortable-id')).toBe('/tmp/worktree-a')
    expect(handle?.querySelector('.lucide-grip-vertical')).not.toBeNull()
    expect(row?.hasAttribute('data-sortable-id')).toBe(false)
    expect(main?.hasAttribute('data-sortable-id')).toBe(false)
  })

  test('keeps standard content padding when sortable props are provided', () => {
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
          sortable={{
            setNodeRef: vi.fn(),
            dragHandle: {
              setActivatorNodeRef: vi.fn(),
              props: { 'data-sortable-id': '/tmp/worktree-a' },
            },
          }}
        />
      </ul>,
    )

    const content = document.querySelector<HTMLElement>('[data-workspace-list-item-main]')

    expect(content?.className).toContain('pl-2')
    expect(content?.className).toContain('pr-2')
    expect(content?.className).toContain('h-8')
  })

  test('renders inline action panel below the branch row content', () => {
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
        />
      </ul>,
    )

    const panel = document.body.querySelector('[data-testid="inline-commit-form"]')
    expect(panel).not.toBeNull()
    expect(panel?.closest('[data-workspace-list-item]')).not.toBeNull()
  })

  test('renders inline editor and terminal buttons before the actions dropdown when worktree exists', () => {
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
          showActions
        />
      </ul>,
    )

    const editorBtn = document.body.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')
    const terminalBtn = document.body.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')
    const dropdown = document.body.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')

    expect(editorBtn).not.toBeNull()
    expect(terminalBtn).not.toBeNull()
    expect(dropdown).not.toBeNull()
    // 编辑/终端按钮位于 dropdown 之前
    expect(editorBtn!.compareDocumentPosition(dropdown!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(terminalBtn!.compareDocumentPosition(dropdown!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('keeps the worktree menu stable while excluding create, refresh, and delete branch', async () => {
    branchActionState.pullDisabled = true
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
          showActions
        />
      </ul>,
    )

    const items = await openRowMenu()
    const labels = items.map((item) => item.textContent?.trim())
    expect(labels).toEqual([
      'open-external-terminal',
      'action.pull',
      'action.push',
      'action.create-tag',
      'action.remove-worktree',
    ])
    expect(labels).not.toContain('action.create-worktree')
    expect(labels).not.toContain('action.refresh')
    expect(labels).not.toContain('action.delete-branch')
    expect(items.find((item) => item.textContent?.includes('action.pull'))?.hasAttribute('data-disabled')).toBe(true)
    expect(
      items.find((item) => item.textContent?.includes('action.remove-worktree'))?.getAttribute('data-variant'),
    ).toBe('destructive')
  })

  test('clicking the branch row selects its branch', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })
    const onSelectBranch = vi.fn()

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={onSelectBranch}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
        />
      </ul>,
    )

    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-workspace-list-item-main]')!.click()
    })

    expect(onSelectBranch).toHaveBeenCalledWith('feature/a')
  })

  test('clicking the inline editor button does not select its branch', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })
    const onSelectBranch = vi.fn()

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={onSelectBranch}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    const editorBtn = document.body.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')
    act(() => {
      editorBtn!.click()
    })

    expect(onSelectBranch).not.toHaveBeenCalled()
  })

  test('leaves branch selection to the inline terminal action callback', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })
    const onSelectBranch = vi.fn()

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={onSelectBranch}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    const terminalBtn = document.body.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')
    act(() => {
      terminalBtn!.click()
    })

    expect(onSelectBranch).not.toHaveBeenCalled()
  })

  test('clicking the actions dropdown does not select its branch', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })
    const onSelectBranch = vi.fn()

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={onSelectBranch}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    const dropdown = document.body.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
    act(() => {
      dropdown!.click()
    })

    expect(onSelectBranch).not.toHaveBeenCalled()
  })

  test('does not render inline editor/terminal buttons for branches without a worktree', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a')

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions
        />
      </ul>,
    )

    expect(document.body.querySelector('[data-workspace-list-item-action="editor"]')).toBeNull()
    expect(document.body.querySelector('[data-workspace-list-item-action="terminal"]')).toBeNull()
    // dropdown 仍然存在
    expect(document.body.querySelector('[aria-label="action.menu"]')).not.toBeNull()
  })
})

function render(
  element: React.ReactNode,
  fixture: {
    bellWorktreeKeys?: string[]
    countsByWorktreeKey?: Map<string, number>
    outputActiveWorktreeKeys?: string[]
    closeTerminal?: CloseTerminalMock
  } = {},
) {
  const readContext = terminalReadContextWithState(
    new Set(fixture.bellWorktreeKeys ?? []),
    fixture.countsByWorktreeKey ?? new Map(),
    new Set(fixture.outputActiveWorktreeKeys ?? []),
  )
  const closeTerminal =
    fixture.closeTerminal ?? vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={terminalCommandContext(closeTerminal)}>
        <TerminalSessionReadContext.Provider value={readContext}>{element}</TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

function terminalCommandContext(closeTerminal: CloseTerminalMock): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: closeTerminal,
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}

async function requestCloseAllFromContextMenu(row: HTMLElement): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes('terminal.close-all'))
  if (!item) throw new Error('missing close all terminals context menu item')
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function openContextMenu(row: HTMLElement): Promise<HTMLElement[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function openRowMenu(): Promise<HTMLElement[]> {
  await act(async () => {
    document.body
      .querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickContextMenuItem(row: HTMLElement, label: string): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes(label))
  if (!item) throw new Error(`missing context menu item: ${label}`)
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function confirmCloseAll(): Promise<void> {
  const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all-confirm-confirm'),
  )
  if (!confirm) throw new Error('missing close all terminals confirmation')
  await act(async () => {
    confirm.click()
    await Promise.resolve()
  })
}
