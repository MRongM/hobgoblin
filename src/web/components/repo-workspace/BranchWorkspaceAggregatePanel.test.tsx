// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { BranchWorkspaceAggregatePanel } from '#/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/components/repo-workspace/ProjectStatusPanel.tsx', () => ({
  ProjectStatusPanel: ({ repoId }: { repoId: string }) => <div data-testid="status-member">{repoId}</div>,
}))

vi.mock('#/web/components/repo-workspace/ProjectChangesPanel.tsx', () => ({
  ProjectChangesPanel: ({ repoId }: { repoId: string }) => <div data-testid="changes-member">{repoId}</div>,
}))

vi.mock('#/web/components/repo-workspace/ProjectHistoryPanel.tsx', () => ({
  ProjectHistoryPanel: ({ repoId }: { repoId: string }) => <div data-testid="history-member">{repoId}</div>,
}))

vi.mock('#/web/components/repo-workspace/ProjectLocalPanel.tsx', () => ({
  ProjectLocalPanel: ({ repoId }: { repoId: string }) => <div data-testid="local-member">{repoId}</div>,
}))

vi.mock('#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx', () => ({
  ProjectRemoteBranchesPanel: ({ repoId }: { repoId: string }) => <div data-testid="remote-member">{repoId}</div>,
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.tsx', () => ({
  BranchWorkspaceMemberSwitcher: ({
    members,
    selectedRepositoryName,
    onSelect,
  }: {
    members: { repositoryName: string; available: boolean }[]
    selectedRepositoryName: string
    onSelect: (repositoryName: string) => void
  }) => (
    <div data-testid="member-switcher" data-selected-repository={selectedRepositoryName}>
      {members.map((member) => (
        <button key={member.repositoryName} type="button" onClick={() => onSelect(member.repositoryName)}>
          {member.repositoryName}:{String(member.available)}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('#/web/components/Layout.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/web/components/Layout.tsx')>()
  return {
    ...actual,
    ScrollPane: ({ children }: { children: ReactNode }) => <div data-testid="scroll-pane">{children}</div>,
  }
})

const ROOT = '/workspace'
const API = `${ROOT}/api`
const WEB = `${ROOT}/web`
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  useReposStore.setState({
    repos: {
      [API]: repository(API, 'api'),
      [WEB]: repository(WEB, 'web'),
    },
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [
          { id: API, name: 'api', selected: true, available: true },
          { id: WEB, name: 'web', selected: true, available: true },
        ],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceAggregatePanel', () => {
  test('constrains selected content to its own panel area', () => {
    renderPanel('status')

    const panel = container.querySelector('[data-testid="branch-workspace-status-panel"]')
    expect(panel?.classList.contains('flex')).toBe(true)
    expect(panel?.classList.contains('flex-col')).toBe(true)
    expect(panel?.classList.contains('overflow-hidden')).toBe(true)
    expect(container.querySelector('[data-testid="scroll-pane"]')).toBeNull()
  })

  test.each([
    ['status', 'status-member'],
    ['changes', 'changes-member'],
    ['history', 'history-member'],
    ['local', 'local-member'],
    ['remoteBranches', 'remote-member'],
  ] as const)('mounts only the selected member for %s', (kind, testId) => {
    renderPanel(kind, 'web')

    const panels = container.querySelectorAll(`[data-testid="${testId}"]`)
    expect(panels).toHaveLength(1)
    expect(panels[0]?.textContent).toBe(WEB)
    expect(container.querySelector('[data-testid="member-switcher"]')?.getAttribute('data-selected-repository')).toBe(
      'web',
    )
    expect(container.querySelector('[data-testid="scroll-pane"]')).toBeNull()
  })

  test('shows an unresolved selected member without mounting a Git panel', () => {
    renderPanel('history', 'docs', {
      ...workspace,
      repositories: [...workspace.repositories, repositoryMember('docs')],
    })

    expect(container.querySelector('[data-testid="history-member"]')).toBeNull()
    expect(container.textContent).toContain('workspace.branch-workspace.member-unconfigured')
    expect(container.querySelector('[data-testid="member-switcher"]')?.textContent).toContain('docs:false')
  })

  function renderPanel(
    kind: 'status' | 'changes' | 'history' | 'local' | 'remoteBranches',
    selectedRepositoryName?: string,
    targetWorkspace = workspace,
  ) {
    act(() =>
      root.render(
        <BranchWorkspaceAggregatePanel
          workspace={targetWorkspace}
          kind={kind}
          selectedRepositoryName={selectedRepositoryName}
          onSelectedRepositoryNameChange={vi.fn()}
        />,
      ),
    )
  }
})

function repository(id: string, name: string) {
  return replaceRepo(emptyRepo(id, name), (repo) => {
    repo.data.branches = [
      createRepoBranch('feature/auth', {
        worktree: { path: `${ROOT}/goblin-feature-auth/${name}` },
      }),
    ]
  })
}

function repositoryMember(repositoryName: string): BranchWorkspaceSnapshot['repositories'][number] {
  return {
    repositoryName,
    targetBranch: 'feature/auth',
    creationBase: { kind: 'localBranch', branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created',
    worktreePath: `${ROOT}/goblin-feature-auth/${repositoryName}`,
    progress: 'complete',
    ready: true,
  }
}

const workspace: BranchWorkspaceSnapshot = {
  id: 'branch-1',
  rootId: ROOT,
  branch: 'feature/auth',
  directoryName: 'goblin-feature-auth',
  path: `${ROOT}/goblin-feature-auth`,
  state: { kind: 'ready' },
  available: true,
  issues: [],
  repositories: [repositoryMember('api'), repositoryMember('web')],
  auxiliaryEntries: [],
}
