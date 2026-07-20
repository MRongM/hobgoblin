import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  postServerJson: vi.fn(),
}))

vi.mock('#/web/lib/server-fetch.ts', () => ({
  postServerJson: mocks.postServerJson,
}))

import {
  abortWorkspaceWorktree,
  configureWorkspace,
  discoverWorkspace,
  executeWorkspaceWorktree,
  planWorkspaceWorktree,
  restoreWorkspace,
} from '#/web/workspace-client.ts'

describe('workspace client', () => {
  beforeEach(() => {
    mocks.postServerJson.mockReset()
  })

  test('posts the root path to the workspace discovery endpoint', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      skipped: [],
    }
    mocks.postServerJson.mockResolvedValue(result)

    await expect(discoverWorkspace('/workspace')).resolves.toEqual(result)
    expect(mocks.postServerJson).toHaveBeenCalledWith('/api/workspace/discover', {
      rootPath: '/workspace',
    })
  })

  test('posts the root path to the configured workspace restoration endpoint', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      skipped: [],
    }
    mocks.postServerJson.mockResolvedValue(result)

    await expect(restoreWorkspace('/workspace')).resolves.toEqual(result)
    expect(mocks.postServerJson).toHaveBeenCalledWith('/api/workspace/restore', {
      rootPath: '/workspace',
    })
  })

  test('posts the root path and config to the workspace configuration endpoint', async () => {
    const result = { ok: false, message: 'workspace.config.repository-unavailable' }
    mocks.postServerJson.mockResolvedValue(result)

    await expect(configureWorkspace('/workspace', { repo: ['api', 'web'] })).resolves.toEqual(result)
    expect(mocks.postServerJson).toHaveBeenCalledWith('/api/workspace/configure', {
      rootPath: '/workspace',
      config: { repo: ['api', 'web'] },
    })
  })

  test('posts typed worktree plan, execute, and abort requests', async () => {
    mocks.postServerJson.mockResolvedValue({ ok: true })

    await planWorkspaceWorktree('/workspace', {
      operation: 'remove',
      branch: 'feature/a',
      alsoDeleteBranch: true,
      alsoDeleteUpstream: true,
    })
    await executeWorkspaceWorktree('/workspace', { planToken: 'sha256:plan', approveBootstrap: false })
    await abortWorkspaceWorktree('/workspace')

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(1, '/api/workspace/worktrees/plan', {
      rootPath: '/workspace',
      request: {
        operation: 'remove',
        branch: 'feature/a',
        alsoDeleteBranch: true,
        alsoDeleteUpstream: true,
      },
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(2, '/api/workspace/worktrees/execute', {
      rootPath: '/workspace',
      planToken: 'sha256:plan',
      approveBootstrap: false,
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(3, '/api/workspace/worktrees/abort', {
      rootPath: '/workspace',
    })
  })

  test('posts a branchless pull plan request', async () => {
    mocks.postServerJson.mockResolvedValue({ ok: true })

    await planWorkspaceWorktree('/workspace', { operation: 'pull' })

    expect(mocks.postServerJson).toHaveBeenCalledWith('/api/workspace/worktrees/plan', {
      rootPath: '/workspace',
      request: { operation: 'pull' },
    })
  })
})
