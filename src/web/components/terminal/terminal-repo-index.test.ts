import { describe, expect, test } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import {
  branchForTerminalWorktree,
  repoIndexFromRepos,
  repoIndexWithBranchWorkspaces,
} from '#/web/components/terminal/terminal-repo-index.ts'

describe('repoIndexFromRepos', () => {
  test('indexes non-git local workspaces by repo root', () => {
    const repo = emptyRepo('/plain-project', 'plain-project')
    repo.isGitRepo = false

    expect(repoIndexFromRepos({ [repo.id]: repo })).toEqual({
      '/plain-project': {
        instanceToken: repo.instanceToken,
        branchByWorktreePath: {
          '/plain-project': NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        },
      },
    })
  })

  test('indexes non-git remote workspaces by remote path', () => {
    const repo = emptyRepo('ssh-config://prod/srv/plain', 'prod:plain')
    repo.isGitRepo = false
    repo.remote.target = {
      id: repo.id,
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/plain',
      displayName: 'prod:plain',
    }

    const index = repoIndexFromRepos({ [repo.id]: repo })

    expect(index[repo.id]?.branchByWorktreePath).toEqual({
      '/srv/plain': NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    })
    expect(branchForTerminalWorktree(index, repo.id, '/srv/plain')).toBe(NON_GIT_WORKSPACE_TERMINAL_BRANCH)
  })

  test('indexes selectable detached worktrees by their exact path and detached HEAD label', () => {
    const repo = emptyRepo('/workspace', 'workspace')
    repo.data.worktreesByPath = {
      '/workspace-detached': {
        path: '/workspace-detached',
        head: '1234567890abcdef',
        isDetached: true,
        isMain: false,
      },
      '/workspace-prunable': {
        path: '/workspace-prunable',
        head: 'fedcba0987654321',
        isDetached: true,
        isMain: false,
        isPrunable: true,
      },
    }

    const index = repoIndexFromRepos({ [repo.id]: repo })

    expect(index[repo.id]?.branchByWorktreePath).toEqual({
      '/workspace-detached': 'HEAD@1234567890ab',
    })
    expect(branchForTerminalWorktree(index, repo.id, '/workspace-detached')).toBe('HEAD@1234567890ab')
    expect(branchForTerminalWorktree(index, repo.id, '/workspace-prunable')).toBeNull()
  })

  test('adds query-owned branch workspace paths without synthetic RepoState records', () => {
    const root = emptyRepo('/workspace', 'workspace')
    root.isGitRepo = false
    const index = repoIndexWithBranchWorkspaces(repoIndexFromRepos({ [root.id]: root }), [
      branchWorkspace('/workspace', '/workspace/goblin-feature', 'ready'),
      branchWorkspace('/workspace', '/workspace/goblin-removing', 'delete-incomplete'),
    ])

    expect(index['/workspace']?.branchByWorktreePath).toEqual({
      '/workspace': NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      '/workspace/goblin-feature': 'feature/auth',
    })
    expect(index['/workspace']?.branchWorkspaceIdByWorktreePath).toEqual({
      '/workspace/goblin-feature': '/workspace/goblin-feature',
    })
    expect(branchForTerminalWorktree(index, '/workspace', '/workspace/goblin-feature')).toBe('feature/auth')
  })

  test('resolves canonical Windows server paths against renderer-owned path spelling', () => {
    const repoRoot = 'C:\\Users\\Test\\Repo'
    const worktreePath = 'C:\\Users\\Test\\Repo-Feature'
    const index = {
      [repoRoot]: {
        instanceToken: 1,
        branchByWorktreePath: { [worktreePath]: 'feature/auth' },
      },
    }

    expect(branchForTerminalWorktree(index, 'c:/users/test/repo', 'c:/users/test/repo-feature')).toBe('feature/auth')
  })
})

function branchWorkspace(rootId: string, path: string, stateName: 'ready' | 'delete-incomplete') {
  return {
    id: path,
    rootId,
    branch: 'feature/auth',
    directoryName: path.split('/').at(-1) ?? 'goblin-feature',
    path,
    state:
      stateName === 'ready'
        ? { kind: 'ready' as const }
        : { kind: 'needs-action' as const, action: 'continue-delete' as const },
    available: stateName === 'ready',
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
  }
}
