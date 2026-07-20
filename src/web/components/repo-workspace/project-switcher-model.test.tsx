// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
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

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
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

    expect(JSON.parse(container!.querySelector('output')?.textContent ?? '[]')).toEqual([
      '/workspace-root\0/workspace-root',
      '/workspace-root/repo-a\0/worktrees/feature-a',
    ])
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
  return <output>{JSON.stringify(summaries[0]?.terminalWorktreeKeys ?? [])}</output>
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
