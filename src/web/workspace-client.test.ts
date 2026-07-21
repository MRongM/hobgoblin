import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  postServerJson: vi.fn(),
}))

vi.mock('#/web/lib/server-fetch.ts', () => ({
  postServerJson: mocks.postServerJson,
}))

import {
  abortBranchWorkspace,
  configureWorkspace,
  discoverWorkspace,
  executeBranchWorkspace,
  planBranchWorkspace,
  readBranchWorkspaces,
  reorderBranchWorkspaces,
  restoreWorkspace,
  planWorkspacePull,
  executeWorkspacePull,
  abortWorkspacePull,
  planBranchWorkspaceGitAction,
  executeBranchWorkspaceGitAction,
  abortBranchWorkspaceGitAction,
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

  test('posts the root id to the branch workspace read endpoint with cancellation', async () => {
    const result = { ok: true, rootId: '/workspace', items: [], auxiliaryCandidates: [] }
    const controller = new AbortController()
    mocks.postServerJson.mockResolvedValue(result)

    await expect(readBranchWorkspaces('/workspace', controller.signal)).resolves.toEqual(result)
    expect(mocks.postServerJson).toHaveBeenCalledWith(
      '/api/workspace/branch-workspaces/read',
      { rootId: '/workspace' },
      { signal: controller.signal },
    )
  })

  test('posts typed branch workspace plan, execute, abort, and reorder requests', async () => {
    mocks.postServerJson.mockResolvedValue({ ok: true })
    const request = {
      operation: 'create' as const,
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
      auxiliaryEntries: [{ name: 'README.md', mode: 'copy' as const }],
    }

    await planBranchWorkspace('/workspace', request)
    await executeBranchWorkspace('/workspace', {
      planToken: 'sha256:plan',
      approvals: ['outside-root-source'],
    })
    await abortBranchWorkspace('/workspace')
    await reorderBranchWorkspaces('/workspace', ['third', 'first'])

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(1, '/api/workspace/branch-workspaces/plan', {
      rootId: '/workspace',
      request,
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(2, '/api/workspace/branch-workspaces/execute', {
      rootId: '/workspace',
      planToken: 'sha256:plan',
      approvals: ['outside-root-source'],
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(3, '/api/workspace/branch-workspaces/abort', {
      rootId: '/workspace',
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(4, '/api/workspace/branch-workspaces/reorder', {
      rootId: '/workspace',
      orderedIds: ['third', 'first'],
    })
  })

  test('posts pull-only plan, execute, and abort requests', async () => {
    mocks.postServerJson.mockResolvedValue({ ok: true })

    await planWorkspacePull('/workspace')
    await executeWorkspacePull('/workspace', { planToken: 'sha256:pull' })
    await abortWorkspacePull('/workspace')

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(1, '/api/workspace/pull/plan', {
      rootId: '/workspace',
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(2, '/api/workspace/pull/execute', {
      rootId: '/workspace',
      planToken: 'sha256:pull',
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(3, '/api/workspace/pull/abort', {
      rootId: '/workspace',
    })
  })

  test('posts branch workspace Git-action plan, execute, and abort requests', async () => {
    mocks.postServerJson.mockResolvedValue({ ok: true })
    const input = {
      kind: 'batch-commit' as const,
      planToken: 'sha256:git-action',
      messages: [{ repositoryName: 'api', message: 'feat: api' }],
    }

    await planBranchWorkspaceGitAction('/workspace', { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })
    await executeBranchWorkspaceGitAction('/workspace', input)
    await abortBranchWorkspaceGitAction('/workspace')

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(1, '/api/workspace/branch-workspaces/git-actions/plan', {
      rootId: '/workspace',
      request: { kind: 'batch-commit', branchWorkspaceId: 'ws-1' },
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(2, '/api/workspace/branch-workspaces/git-actions/execute', {
      rootId: '/workspace',
      input,
    })
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(3, '/api/workspace/branch-workspaces/git-actions/abort', {
      rootId: '/workspace',
    })
  })
})
