import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'

const mocks = vi.hoisted(() => ({
  discoverWorkspaceRepositories: vi.fn(),
  restoreWorkspaceRepositories: vi.fn(),
  importWorkspaceRepositories: vi.fn(),
  saveWorkspaceConfig: vi.fn(),
  readBranchWorkspaceSnapshot: vi.fn(),
  cleanupBranchWorkspaceRegistryRecords: vi.fn(),
  createBranchWorkspaceWriteService: vi.fn(),
  createWorkspaceRecoveryWriteService: vi.fn(),
  createBranchWorkspaceDependencyWriteService: vi.fn(),
  createBranchWorkspaceGitActionWriteService: vi.fn(),
  planBranchWorkspace: vi.fn(),
  executeBranchWorkspace: vi.fn(),
  abortBranchWorkspace: vi.fn(),
  planWorkspaceRecovery: vi.fn(),
  executeWorkspaceRecovery: vi.fn(),
  abortWorkspaceRecovery: vi.fn(),
  reorderBranchWorkspaces: vi.fn(),
  readBranchWorkspaceDependencies: vi.fn(),
  planBranchWorkspaceDependencies: vi.fn(),
  executeBranchWorkspaceDependencies: vi.fn(),
  abortBranchWorkspaceDependencies: vi.fn(),
  planBranchWorkspaceGitAction: vi.fn(),
  executeBranchWorkspaceGitAction: vi.fn(),
  abortBranchWorkspaceGitAction: vi.fn(),
  activeBranchWorkspaceGitAction: vi.fn(),
  planWorkspacePull: vi.fn(),
  executeWorkspacePull: vi.fn(),
  abortWorkspacePull: vi.fn(),
}))

vi.mock('#/server/modules/workspace-read.ts', () => ({
  discoverWorkspaceRepositories: mocks.discoverWorkspaceRepositories,
  restoreWorkspaceRepositories: mocks.restoreWorkspaceRepositories,
}))

vi.mock('#/server/modules/workspace-write-paths.ts', () => ({
  saveWorkspaceConfig: mocks.saveWorkspaceConfig,
}))

vi.mock('#/server/modules/workspace-import-write-paths.ts', () => ({
  importWorkspaceRepositories: mocks.importWorkspaceRepositories,
}))

vi.mock('#/server/modules/branch-workspace-read.ts', () => ({
  readBranchWorkspaceSnapshot: mocks.readBranchWorkspaceSnapshot,
}))

vi.mock('#/server/modules/branch-workspace-registry-write-paths.ts', () => ({
  cleanupBranchWorkspaceRegistryRecords: mocks.cleanupBranchWorkspaceRegistryRecords,
}))

vi.mock('#/server/modules/branch-workspace-write-paths.ts', () => ({
  createBranchWorkspaceWriteService: mocks.createBranchWorkspaceWriteService,
}))

vi.mock('#/server/modules/workspace-recovery-write-paths.ts', () => ({
  createWorkspaceRecoveryWriteService: mocks.createWorkspaceRecoveryWriteService,
}))

vi.mock('#/server/modules/branch-workspace-dependency-write-paths.ts', () => ({
  createBranchWorkspaceDependencyWriteService: mocks.createBranchWorkspaceDependencyWriteService,
}))

vi.mock('#/server/modules/branch-workspace-git-action-write-paths.ts', () => ({
  createBranchWorkspaceGitActionWriteService: mocks.createBranchWorkspaceGitActionWriteService,
}))

vi.mock('#/server/modules/workspace-pull-write-paths.ts', () => ({
  planWorkspacePull: mocks.planWorkspacePull,
  executeWorkspacePull: mocks.executeWorkspacePull,
  abortWorkspacePull: mocks.abortWorkspacePull,
}))

import { createWorkspaceRoutes } from '#/server/routes/workspace.ts'

describe('workspace routes', () => {
  beforeEach(() => {
    mocks.createBranchWorkspaceWriteService.mockReset()
    mocks.createBranchWorkspaceWriteService.mockReturnValue({
      plan: mocks.planBranchWorkspace,
      execute: mocks.executeBranchWorkspace,
      abort: mocks.abortBranchWorkspace,
      reorder: mocks.reorderBranchWorkspaces,
    })
    mocks.createBranchWorkspaceGitActionWriteService.mockReset()
    mocks.createBranchWorkspaceGitActionWriteService.mockReturnValue({
      plan: mocks.planBranchWorkspaceGitAction,
      execute: mocks.executeBranchWorkspaceGitAction,
      abort: mocks.abortBranchWorkspaceGitAction,
      activeOperation: mocks.activeBranchWorkspaceGitAction,
    })
    mocks.createBranchWorkspaceDependencyWriteService.mockReset()
    mocks.createBranchWorkspaceDependencyWriteService.mockReturnValue({
      read: mocks.readBranchWorkspaceDependencies,
      plan: mocks.planBranchWorkspaceDependencies,
      execute: mocks.executeBranchWorkspaceDependencies,
      abort: mocks.abortBranchWorkspaceDependencies,
      isActive: vi.fn(() => false),
    })
    mocks.createWorkspaceRecoveryWriteService.mockReset()
    mocks.createWorkspaceRecoveryWriteService.mockReturnValue({
      plan: mocks.planWorkspaceRecovery,
      execute: mocks.executeWorkspaceRecovery,
      abort: mocks.abortWorkspaceRecovery,
    })
    mocks.discoverWorkspaceRepositories.mockReset()
    mocks.restoreWorkspaceRepositories.mockReset()
    mocks.importWorkspaceRepositories.mockReset()
    mocks.saveWorkspaceConfig.mockReset()
    mocks.readBranchWorkspaceSnapshot.mockReset()
    mocks.cleanupBranchWorkspaceRegistryRecords.mockReset()
    mocks.planBranchWorkspace.mockReset()
    mocks.executeBranchWorkspace.mockReset()
    mocks.abortBranchWorkspace.mockReset()
    mocks.planWorkspaceRecovery.mockReset()
    mocks.executeWorkspaceRecovery.mockReset()
    mocks.abortWorkspaceRecovery.mockReset()
    mocks.reorderBranchWorkspaces.mockReset()
    mocks.readBranchWorkspaceDependencies.mockReset()
    mocks.planBranchWorkspaceDependencies.mockReset()
    mocks.executeBranchWorkspaceDependencies.mockReset()
    mocks.abortBranchWorkspaceDependencies.mockReset()
    mocks.planBranchWorkspaceGitAction.mockReset()
    mocks.executeBranchWorkspaceGitAction.mockReset()
    mocks.abortBranchWorkspaceGitAction.mockReset()
    mocks.activeBranchWorkspaceGitAction.mockReset()
    mocks.planWorkspacePull.mockReset()
    mocks.executeWorkspacePull.mockReset()
    mocks.abortWorkspacePull.mockReset()
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

  test('delegates configured workspace restoration and returns its result', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      candidates: [{ id: '/workspace/api', name: 'api', selected: true, available: true }],
      configuration: { kind: 'ready', config: { repo: ['api'] } },
      skipped: [],
    }
    mocks.restoreWorkspaceRepositories.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const response = await app.request('/api/workspace/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(mocks.restoreWorkspaceRepositories).toHaveBeenCalledWith('/workspace')
  })

  test('delegates atomic workspace import with a validated source token', async () => {
    const result = {
      ok: true,
      rootId: '/workspace',
      repositories: [{ id: '/workspace/api', name: 'api' }],
      candidates: [{ id: '/workspace/api', name: 'api', selected: true, available: true }],
      configuration: { kind: 'ready', config: { repo: ['api'] } },
      skipped: [],
    }
    mocks.importWorkspaceRepositories.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const response = await app.request('/api/workspace/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootPath: '/workspace', sourceToken: 'workspace_import_1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(mocks.importWorkspaceRepositories).toHaveBeenCalledWith('/workspace', {
      sourceToken: 'workspace_import_1',
    })
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

  test('reads branch workspaces through POST and GET boundaries', async () => {
    const result = { ok: true, rootId: '/workspace', items: [], auxiliaryCandidates: [] }
    mocks.readBranchWorkspaceSnapshot.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const postResponse = await app.request('/api/workspace/branch-workspaces/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })
    const getResponse = await app.request('/api/workspace/branch-workspaces/read?rootId=%2Fworkspace')

    expect(postResponse.status).toBe(200)
    expect(getResponse.status).toBe(200)
    await expect(postResponse.json()).resolves.toEqual(result)
    await expect(getResponse.json()).resolves.toEqual(result)
    expect(mocks.readBranchWorkspaceSnapshot).toHaveBeenNthCalledWith(1, '/workspace', expect.any(AbortSignal), {
      readActiveOperation: mocks.activeBranchWorkspaceGitAction,
    })
    expect(mocks.readBranchWorkspaceSnapshot).toHaveBeenNthCalledWith(2, '/workspace', expect.any(AbortSignal), {
      readActiveOperation: mocks.activeBranchWorkspaceGitAction,
    })
  })

  test('delegates branch workspace registry cleanup for the requesting root', async () => {
    const result = { ok: true as const, outcome: 'repaired' as const, removedRecords: 2 }
    mocks.cleanupBranchWorkspaceRegistryRecords.mockResolvedValue(result)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    const response = await app.request('/api/workspace/branch-workspaces/cleanup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(mocks.cleanupBranchWorkspaceRegistryRecords).toHaveBeenCalledWith('/workspace')
  })

  test('injects terminal enumeration and administrative closure into the branch workspace service', async () => {
    const terminalHost = {
      listSessions: vi.fn(async () => [{ sessionId: 'terminal-root-1234' }]),
      closeSessions: vi.fn(async () => ({ closed: ['terminal-root-1234'], missing: [] })),
    } as unknown as ServerTerminalHost

    createWorkspaceRoutes({ terminalHost, terminalClientId: 'client_server' })
    const dependencies = mocks.createBranchWorkspaceWriteService.mock.calls[0]?.[0]

    await expect(dependencies.planDependencies.listTerminalSessions('/workspace/api')).resolves.toEqual([
      { sessionId: 'terminal-root-1234' },
    ])
    expect(terminalHost.listSessions).toHaveBeenCalledWith('client_server', '/workspace/api')
    await expect(dependencies.closeSessions(['terminal-root-1234'])).resolves.toEqual({
      closed: ['terminal-root-1234'],
      missing: [],
    })
    expect(terminalHost.closeSessions).toHaveBeenCalledWith(['terminal-root-1234'])
  })

  test('normalizes branch workspace plan, execute, abort, and reorder boundaries', async () => {
    mocks.planBranchWorkspace.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeBranchWorkspace.mockResolvedValue({ ok: false, message: 'executed' })
    mocks.abortBranchWorkspace.mockReturnValue(true)
    mocks.reorderBranchWorkspaces.mockResolvedValue({ ok: true })
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/branch-workspaces/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        request: {
          operation: 'create',
          branch: ' feature/auth ',
          repositories: [{ repositoryName: 'api', baseBranch: ' main ' }],
          auxiliaryEntries: [{ name: 'README.md', mode: 'copy' }],
        },
      }),
    })
    await app.request('/api/workspace/branch-workspaces/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        planToken: 'sha256:plan',
        approvals: ['outside-root-source', 'worktree-bootstrap'],
        sourceToken: 'workspace_create_1',
        force: true,
      }),
    })
    const abortResponse = await app.request('/api/workspace/branch-workspaces/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })
    await app.request('/api/workspace/branch-workspaces/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', orderedIds: ['third', 'first'] }),
    })

    expect(mocks.planBranchWorkspace).toHaveBeenCalledWith('/workspace', {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [{ name: 'README.md', mode: 'copy' }],
    })
    expect(mocks.executeBranchWorkspace).toHaveBeenCalledWith('/workspace', {
      planToken: 'sha256:plan',
      approvals: ['outside-root-source', 'worktree-bootstrap'],
      sourceToken: 'workspace_create_1',
      force: true,
    })
    expect(mocks.abortBranchWorkspace).toHaveBeenCalledWith('/workspace')
    expect(mocks.reorderBranchWorkspaces).toHaveBeenCalledWith('/workspace', ['third', 'first'])
    await expect(abortResponse.json()).resolves.toEqual({ ok: true })
  })

  test('delegates workspace recovery plan, execute, and abort requests', async () => {
    mocks.planWorkspaceRecovery.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeWorkspaceRecovery.mockResolvedValue({ ok: false, message: 'executed' })
    mocks.abortWorkspaceRecovery.mockReturnValue(true)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())
    const token = `sha256:${'1'.repeat(64)}`

    await app.request('/api/workspace/recovery/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })
    await app.request('/api/workspace/recovery/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        input: { planToken: ` ${token} `, sourceToken: ' workspace_recovery_1 ' },
      }),
    })
    const aborted = await app.request('/api/workspace/recovery/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })

    expect(mocks.createWorkspaceRecoveryWriteService).toHaveBeenCalledWith({
      branchService: expect.objectContaining({ plan: mocks.planBranchWorkspace }),
    })
    expect(mocks.planWorkspaceRecovery).toHaveBeenCalledWith('/workspace')
    expect(mocks.executeWorkspaceRecovery).toHaveBeenCalledWith('/workspace', {
      planToken: token,
      sourceToken: 'workspace_recovery_1',
    })
    expect(mocks.abortWorkspaceRecovery).toHaveBeenCalledWith('/workspace')
    await expect(aborted.json()).resolves.toEqual({ ok: true })
  })

  test('rejects malformed workspace recovery execution input', async () => {
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())
    const response = await app.request('/api/workspace/recovery/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', input: { planToken: 'stale' } }),
    })

    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(mocks.executeWorkspaceRecovery).not.toHaveBeenCalled()
  })

  test('rejects malformed branch workspace approvals before execution', async () => {
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())
    const response = await app.request('/api/workspace/branch-workspaces/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', planToken: 'sha256:plan', approvals: ['unknown'] }),
    })

    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(mocks.executeBranchWorkspace).not.toHaveBeenCalled()
  })

  test('rejects a malformed branch workspace force flag before execution', async () => {
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())
    const response = await app.request('/api/workspace/branch-workspaces/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', planToken: 'sha256:plan', approvals: [], force: 'yes' }),
    })

    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(mocks.executeBranchWorkspace).not.toHaveBeenCalled()
  })

  test('normalizes branch workspace dependency read, plan, execute, and abort boundaries', async () => {
    mocks.readBranchWorkspaceDependencies.mockResolvedValue({ ok: true, candidates: [] })
    mocks.planBranchWorkspaceDependencies.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeBranchWorkspaceDependencies.mockResolvedValue({ ok: false, message: 'executed' })
    mocks.abortBranchWorkspaceDependencies.mockReturnValue(true)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/branch-workspaces/dependencies/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', branchWorkspaceId: ' branch-1 ' }),
    })
    await app.request('/api/workspace/branch-workspaces/dependencies/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        request: {
          operation: 'add',
          branchWorkspaceId: ' branch-1 ',
          entries: [{ name: ' .env ', mode: 'copy' }],
        },
      }),
    })
    await app.request('/api/workspace/branch-workspaces/dependencies/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        input: {
          planToken: ' sha256:plan ',
          approvals: ['outside-root-source'],
          sourceToken: ' renderer-1 ',
        },
      }),
    })
    const abortResponse = await app.request('/api/workspace/branch-workspaces/dependencies/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })

    expect(mocks.readBranchWorkspaceDependencies).toHaveBeenCalledWith(
      '/workspace',
      'branch-1',
      expect.any(AbortSignal),
    )
    expect(mocks.planBranchWorkspaceDependencies).toHaveBeenCalledWith(
      '/workspace',
      {
        operation: 'add',
        branchWorkspaceId: 'branch-1',
        entries: [{ name: '.env', mode: 'copy' }],
      },
      expect.any(AbortSignal),
    )
    expect(mocks.executeBranchWorkspaceDependencies).toHaveBeenCalledWith('/workspace', {
      planToken: 'sha256:plan',
      approvals: ['outside-root-source'],
      sourceToken: 'renderer-1',
    })
    expect(mocks.abortBranchWorkspaceDependencies).toHaveBeenCalledWith('/workspace')
    await expect(abortResponse.json()).resolves.toEqual({ ok: true })
  })

  test('normalizes branch workspace Git-action plan, execute, and abort boundaries', async () => {
    mocks.planBranchWorkspaceGitAction.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeBranchWorkspaceGitAction.mockResolvedValue({ ok: false, message: 'executed' })
    mocks.abortBranchWorkspaceGitAction.mockReturnValue(true)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/branch-workspaces/git-actions/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        request: { kind: 'batch-commit', branchWorkspaceId: ' ws-1 ' },
      }),
    })
    await app.request('/api/workspace/branch-workspaces/git-actions/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootId: '/workspace',
        input: {
          kind: 'batch-commit',
          planToken: ' sha256:plan ',
          messages: [{ repositoryName: 'api', message: ' feat: api ' }],
        },
      }),
    })
    const response = await app.request('/api/workspace/branch-workspaces/git-actions/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })

    expect(mocks.planBranchWorkspaceGitAction).toHaveBeenCalledWith(
      '/workspace',
      { kind: 'batch-commit', branchWorkspaceId: 'ws-1' },
      expect.any(AbortSignal),
    )
    expect(mocks.executeBranchWorkspaceGitAction).toHaveBeenCalledWith('/workspace', {
      kind: 'batch-commit',
      planToken: 'sha256:plan',
      messages: [{ repositoryName: 'api', message: 'feat: api' }],
    })
    expect(mocks.abortBranchWorkspaceGitAction).toHaveBeenCalledWith('/workspace')
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test('delegates pull-only plan, execute, and abort requests', async () => {
    mocks.planWorkspacePull.mockResolvedValue({ ok: false, message: 'planned' })
    mocks.executeWorkspacePull.mockResolvedValue({ ok: true, planToken: 'sha256:pull', members: [] })
    mocks.abortWorkspacePull.mockReturnValue(true)
    const app = new Hono().route('/api/workspace', createWorkspaceRoutes())

    await app.request('/api/workspace/pull/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })
    await app.request('/api/workspace/pull/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace', planToken: 'sha256:pull' }),
    })
    const aborted = await app.request('/api/workspace/pull/abort', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: '/workspace' }),
    })

    expect(mocks.planWorkspacePull).toHaveBeenCalledWith('/workspace')
    expect(mocks.executeWorkspacePull).toHaveBeenCalledWith('/workspace', { planToken: 'sha256:pull' })
    expect(mocks.abortWorkspacePull).toHaveBeenCalledWith('/workspace')
    await expect(aborted.json()).resolves.toEqual({ ok: true })
  })
})
