import { describe, expect, test } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import {
  branchForTerminalWorktree,
  repoIndexFromRepos,
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
})
