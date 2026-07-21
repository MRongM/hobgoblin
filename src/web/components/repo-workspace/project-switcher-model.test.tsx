// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ProjectTerminalStatus,
  projectTerminalWorktreeKeys,
  useProjectSummaries,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { normalizeRemoteRepoId, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
import type {
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

const branchWorkspaceMocks = vi.hoisted(() => ({ read: vi.fn() }))

vi.mock('#/web/workspace-client.ts', () => ({
  readBranchWorkspaces: branchWorkspaceMocks.read,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  branchWorkspaceMocks.read.mockReset()
  branchWorkspaceMocks.read.mockResolvedValue({ ok: true, rootId: '', items: [], auxiliaryCandidates: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  resetReposStore()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('project terminal switcher model', () => {
  test('includes workspace root and member repositories without duplicating worktree keys', () => {
    const workspaceRoot = terminalRepo('/workspace-root', false)
    const repoA = terminalRepo('/workspace-root/repo-a', true, ['/worktrees/feature-a'], ['/worktrees/feature-a'])
    const repoB = terminalRepo('/workspace-root/repo-b', true, [], ['/worktrees/feature-b'])

    expect(projectTerminalWorktreeKeys(workspaceRoot, [repoA, repoB])).toEqual([
      '/workspace-root\0/workspace-root',
      '/workspace-root/repo-a\0/worktrees/feature-a',
      '/workspace-root/repo-b\0/worktrees/feature-b',
    ])
  })

  test('keeps ordinary Git repository and plain workspace terminal scopes unchanged', () => {
    const gitRepo = terminalRepo('/repo-a', true, ['/repo-a', '/worktrees/feature'], ['/worktrees/feature'])
    const plainWorkspace = terminalRepo('/plain-workspace', false, ['/ignored'], ['/also-ignored'])

    expect(projectTerminalWorktreeKeys(gitRepo, [])).toEqual(['/repo-a\0/repo-a', '/repo-a\0/worktrees/feature'])
    expect(projectTerminalWorktreeKeys(plainWorkspace, [])).toEqual(['/plain-workspace\0/plain-workspace'])
  })

  test('uses the actual terminal path for a remote plain workspace', () => {
    const id = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/plain' })
    const plainWorkspace = terminalRepo(id, false, [], [], remoteTarget(id, '/srv/plain'))

    expect(projectTerminalWorktreeKeys(plainWorkspace, [])).toEqual([`${id}\0/srv/plain`])
  })

  test('projects configured workspace member worktrees through the project summary hook', () => {
    const rootRepo = replaceRepo(emptyRepo('/workspace-root', 'workspace'), (repo) => {
      repo.isGitRepo = false
    })
    const memberRepo = replaceRepo(emptyRepo('/workspace-root/repo-a', 'repo-a'), (repo) => {
      repo.workspaceRootId = rootRepo.id
      repo.data.worktreesByPath = {
        '/worktrees/feature-a': {
          path: '/worktrees/feature-a',
          isMain: false,
        },
      }
    })
    useReposStore.setState({
      repos: { [rootRepo.id]: rootRepo, [memberRepo.id]: memberRepo },
      order: [rootRepo.id],
      activeId: memberRepo.id,
      workspaceProjects: {
        [rootRepo.id]: {
          rootId: rootRepo.id,
          repositoryIds: [memberRepo.id],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })

    act(() => root!.render(<ProjectSummariesProbe />))

    expect(JSON.parse(container!.querySelector('output')?.textContent ?? '{}')).toEqual({
      branchWorkspaceRootId: '/workspace-root',
      terminalWorktreeKeys: ['/workspace-root\0/workspace-root', '/workspace-root/repo-a\0/worktrees/feature-a'],
    })
  })

  test('includes branch workspace root sessions in configured workspace project status', async () => {
    const rootId = '/workspace-root'
    const projectKey = `${rootId}\0${rootId}`
    const branchWorkspacePath = '/workspace-root/feature-auth'
    const branchWorkspaceKey = `${rootId}\0${branchWorkspacePath}`
    branchWorkspaceMocks.read.mockResolvedValue({
      ok: true,
      rootId,
      items: [
        {
          id: 'branch-1',
          rootId,
          branch: 'feature/auth',
          directoryName: 'feature-auth',
          path: branchWorkspacePath,
          lifecycle: 'ready',
          available: true,
          issues: [],
          repositories: [],
          auxiliaryEntries: [],
        },
      ],
      auxiliaryCandidates: [],
    })
    const snapshots = new Map<string, WorktreeTerminalSnapshot>([
      [projectKey, worktreeSnapshot(projectKey, terminalSession(projectKey, { isOutputActive: true }))],
      [
        branchWorkspaceKey,
        worktreeSnapshot(branchWorkspaceKey, terminalSession(branchWorkspaceKey, { hasBell: true })),
      ],
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TerminalSessionReadContext.Provider value={terminalReadContext(snapshots)}>
            <ProjectTerminalStatus terminalWorktreeKeys={[projectKey]} branchWorkspaceRootId={rootId} />
          </TerminalSessionReadContext.Provider>
        </QueryClientProvider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container!.querySelector('[data-testid="project-terminal-status"]')?.textContent).toContain('2')
    })
    const status = container!.querySelector('[data-testid="project-terminal-status"]')
    expect(status?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(status?.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
    queryClient.clear()
  })

  test('includes plain-workspace count and output activity in the aggregate project status', () => {
    const terminalWorktreeKeys = [
      '/workspace-root\0/workspace-root',
      '/workspace-root/repo-a\0/worktrees/feature-a',
      '/workspace-root/repo-b\0/worktrees/feature-b',
    ]
    const snapshots = new Map<string, WorktreeTerminalSnapshot>([
      [
        terminalWorktreeKeys[0]!,
        worktreeSnapshot(terminalWorktreeKeys[0]!, terminalSession(terminalWorktreeKeys[0]!, { isOutputActive: true })),
      ],
      [terminalWorktreeKeys[1]!, worktreeSnapshot(terminalWorktreeKeys[1]!, terminalSession(terminalWorktreeKeys[1]!))],
      [
        terminalWorktreeKeys[2]!,
        worktreeSnapshot(terminalWorktreeKeys[2]!, terminalSession(terminalWorktreeKeys[2]!, { hasBell: true })),
      ],
    ])

    act(() => {
      root!.render(
        <TerminalSessionReadContext.Provider value={terminalReadContext(snapshots)}>
          <ProjectTerminalStatus terminalWorktreeKeys={terminalWorktreeKeys} />
        </TerminalSessionReadContext.Provider>,
      )
    })

    const status = container!.querySelector('[data-testid="project-terminal-status"]')
    expect(status?.textContent).toContain('3')
    expect(status?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(status?.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
  })
})

function ProjectSummariesProbe() {
  const summaries = useProjectSummaries()
  const project = summaries[0] as (typeof summaries)[number] & { branchWorkspaceRootId?: string | null }
  return (
    <output>
      {JSON.stringify({
        branchWorkspaceRootId: project?.branchWorkspaceRootId,
        terminalWorktreeKeys: project?.terminalWorktreeKeys ?? [],
      })}
    </output>
  )
}

function terminalRepo(
  id: string,
  isGitRepo: boolean,
  worktreePaths: string[] = [],
  branchPaths: string[] = [],
  target?: RemoteRepoTarget,
) {
  return {
    id,
    isGitRepo,
    remote: target ? { target } : undefined,
    data: {
      branches: branchPaths.map((path) => ({ worktree: { path } })),
      worktreesByPath: Object.fromEntries(worktreePaths.map((path) => [path, {}])),
    },
  }
}

function remoteTarget(id: string, remotePath: string): RemoteRepoTarget {
  return {
    id,
    alias: 'prod',
    host: 'example.com',
    user: 'alice',
    port: 22,
    remotePath,
    displayName: 'prod:plain',
  }
}

function terminalReadContext(
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) =>
      snapshots.get(key) ?? { worktreeTerminalKey: key, selectedDescriptor: null, sessions: [], count: 0 },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function worktreeSnapshot(key: string, session: TerminalSessionSummary): WorktreeTerminalSnapshot {
  return {
    worktreeTerminalKey: key,
    selectedDescriptor: null,
    sessions: [session],
    count: 1,
  }
}

function terminalSession(
  worktreeTerminalKey: string,
  overrides: Partial<Pick<TerminalSessionSummary, 'hasBell' | 'isOutputActive'>> = {},
): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-1`,
    worktreeTerminalKey,
    terminalId: 'terminal-1',
    index: 1,
    title: 'terminal',
    phase: 'open',
    selected: true,
    hasBell: false,
    ...overrides,
  }
}
