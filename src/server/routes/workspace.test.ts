import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  discoverWorkspaceRepositories: vi.fn(),
  saveWorkspaceConfig: vi.fn(),
  planWorkspaceWorktree: vi.fn(),
  executeWorkspaceWorktree: vi.fn(),
  abortWorkspaceWorktree: vi.fn(),
}))

vi.mock('#/server/modules/workspace-read.ts', () => ({
  discoverWorkspaceRepositories: mocks.discoverWorkspaceRepositories,
}))

vi.mock('#/server/modules/workspace-write-paths.ts', () => ({
  saveWorkspaceConfig: mocks.saveWorkspaceConfig,
}))

vi.mock('#/server/modules/workspace-worktree-write-paths.ts', () => ({
  planWorkspaceWorktree: mocks.planWorkspaceWorktree,
  executeWorkspaceWorktree: mocks.executeWorkspaceWorktree,
  abortWorkspaceWorktree: mocks.abortWorkspaceWorktree,
}))

import { createWorkspaceRoutes } from '#/server/routes/workspace.ts'

describe('workspace routes', () => {
  beforeEach(() => {
    mocks.discoverWorkspaceRepositories.mockReset()
    mocks.saveWorkspaceConfig.mockReset()
    mocks.planWorkspaceWorktree.mockReset()
    mocks.executeWorkspaceWorktree.mockReset()
    mocks.abortWorkspaceWorktree.mockReset()
  })

  test('delegates workspace discovery and returns its result', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      skipped: [],
    }
    mocks.discoverWorkspaceRepositories.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const response = await app.request('/api/workspace/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(mocks.discoverWorkspaceRepositories).toHaveBeenCalledWith('/workspace')
  })

  test('normalizes invalid input to an empty path', async () => {
    mocks.discoverWorkspaceRepositories.mockResolvedValue({ ok: false, message: 'error.path-not-found' })
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: 42 }),
    })

    expect(mocks.discoverWorkspaceRepositories).toHaveBeenCalledWith('')
  })

  test('delegates workspace configuration and returns fresh discovery', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      candidates: [{ id: '/workspace/api', name: 'api', selected: true, available: true }],
      configuration: { kind: 'ready', config: { repo: ['api'] } },
      skipped: [],
    }
    mocks.saveWorkspaceConfig.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const response = await app.request('/api/workspace/configure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace', config: { repo: ['api'] } }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(mocks.saveWorkspaceConfig).toHaveBeenCalledWith('/workspace', { repo: ['api'] })
  })

  test('passes invalid configuration input to the validation boundary', async () => {
    mocks.saveWorkspaceConfig.mockResolvedValue({ ok: false, message: 'workspace.config.invalid-main' })
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/configure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: 42, config: null }),
    })

    expect(mocks.saveWorkspaceConfig).toHaveBeenCalledWith('', null)
  })

  test('delegates worktree plan, execute, and abort requests', async () => {
    mocks.planWorkspaceWorktree.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeWorkspaceWorktree.mockResolvedValue({ ok: false, message: 'executed', members: [] })
    mocks.abortWorkspaceWorktree.mockReturnValue(true)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/worktrees/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootPath: '/workspace',
        request: { operation: 'create', branch: 'feature/a', baseBranch: 'develop' },
      }),
    })
    await app.request('/api/workspace/worktrees/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace', planToken: 'sha256:plan', approveBootstrap: true }),
    })
    const abortResponse = await app.request('/api/workspace/worktrees/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace' }),
    })

    expect(mocks.planWorkspaceWorktree).toHaveBeenCalledWith('/workspace', {
      operation: 'create',
      branch: 'feature/a',
      baseBranch: 'develop',
    })
    expect(mocks.executeWorkspaceWorktree).toHaveBeenCalledWith('/workspace', {
      planToken: 'sha256:plan',
      approveBootstrap: true,
    })
    expect(mocks.abortWorkspaceWorktree).toHaveBeenCalledWith('/workspace')
    await expect(abortResponse.json()).resolves.toEqual({ ok: true })
  })

  test('accepts a branchless batch pull plan request', async () => {
    mocks.planWorkspaceWorktree.mockResolvedValue({ ok: false, message: 'planned' })
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/worktrees/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace', request: { operation: 'pull' } }),
    })

    expect(mocks.planWorkspaceWorktree).toHaveBeenCalledWith('/workspace', { operation: 'pull' })
  })

  test('normalizes dependent branch cleanup options for batch removal', async () => {
    mocks.planWorkspaceWorktree.mockResolvedValue({ ok: false, message: 'planned' })
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/worktrees/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootPath: '/workspace',
        request: {
          operation: 'remove',
          branch: 'feature/a',
          alsoDeleteBranch: false,
          alsoDeleteUpstream: true,
        },
      }),
    })

    expect(mocks.planWorkspaceWorktree).toHaveBeenCalledWith('/workspace', {
      operation: 'remove',
      branch: 'feature/a',
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
    })
  })
})
