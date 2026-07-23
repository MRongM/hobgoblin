import { Hono, type Context } from 'hono'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import { cleanupBranchWorkspaceRegistryRecords } from '#/server/modules/branch-workspace-registry-write-paths.ts'
import { createBranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import { createBranchWorkspaceGitActionWriteService } from '#/server/modules/branch-workspace-git-action-write-paths.ts'
import { discoverWorkspaceRepositories, restoreWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import { saveWorkspaceConfig } from '#/server/modules/workspace-write-paths.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { isBranchWorkspaceApproval, normalizeBranchWorkspacePlanRequest } from '#/shared/branch-workspaces.ts'
import {
  abortWorkspacePull,
  executeWorkspacePull,
  planWorkspacePull,
} from '#/server/modules/workspace-pull-write-paths.ts'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  normalizeBranchWorkspaceGitActionPlanRequest,
} from '#/shared/branch-workspace-git-actions.ts'

export interface WorkspaceRouteOptions {
  terminalHost?: ServerTerminalHost
  terminalClientId?: string
}

export function createWorkspaceRoutes(options: WorkspaceRouteOptions = {}) {
  const app = new Hono()
  const terminalClientId = options.terminalClientId ?? 'server'
  const branchWorkspaceWriteService = createBranchWorkspaceWriteService({
    planDependencies: {
      async listTerminalSessions(repoId) {
        if (!options.terminalHost) throw new Error('workspace.branch-workspace.terminal-read-failed')
        return await options.terminalHost.listSessions(terminalClientId, repoId)
      },
    },
    ...(options.terminalHost
      ? { closeSessions: async (sessionIds: string[]) => await options.terminalHost!.closeSessions(sessionIds) }
      : {}),
  })
  const branchWorkspaceGitActionWriteService = createBranchWorkspaceGitActionWriteService()

  app.post('/discover', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    try {
      return c.json(await discoverWorkspaceRepositories(rootPath))
    } catch (error) {
      console.warn('[server][workspace] discovery failed', error)
      return c.json({ ok: false as const, message: 'error.failed-read-repo' })
    }
  })

  app.post('/restore', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    try {
      return c.json(await restoreWorkspaceRepositories(rootPath))
    } catch (error) {
      console.warn('[server][workspace] restoration failed', error)
      return c.json({ ok: false as const, message: 'error.failed-read-repo' })
    }
  })

  app.post('/configure', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    try {
      return c.json(await saveWorkspaceConfig(rootPath, body?.config))
    } catch (error) {
      console.warn('[server][workspace] configuration failed', error)
      return c.json({ ok: false as const, message: 'workspace.config.write-failed' })
    }
  })

  app.get('/branch-workspaces/read', async (c) => {
    return await readBranchWorkspacesResponse(
      c.req.query('rootId') ?? '',
      c.req.raw.signal,
      c,
      branchWorkspaceGitActionWriteService.activeOperation,
    )
  })

  app.post('/branch-workspaces/read', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    return await readBranchWorkspacesResponse(
      rootId,
      c.req.raw.signal,
      c,
      branchWorkspaceGitActionWriteService.activeOperation,
    )
  })

  app.post('/branch-workspaces/cleanup', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    if (!isNonEmptyString(rootId)) return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    return c.json(await cleanupBranchWorkspaceRegistryRecords(rootId))
  })

  app.post('/branch-workspaces/plan', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    const normalized = normalizeBranchWorkspacePlanRequest(body?.request)
    if (!normalized.ok) return c.json(normalized)
    return c.json(await branchWorkspaceWriteService.plan(rootId, normalized.request))
  })

  app.post('/branch-workspaces/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    const planToken = typeof body?.planToken === 'string' ? body.planToken.trim() : ''
    const sourceToken =
      typeof body?.sourceToken === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.sourceToken)
        ? body.sourceToken
        : undefined
    if (
      !planToken ||
      !Array.isArray(body?.approvals) ||
      !body.approvals.every((approval: unknown) => isBranchWorkspaceApproval(approval))
    ) {
      return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    }
    return c.json(
      await branchWorkspaceWriteService.execute(rootId, {
        planToken,
        approvals: Array.from(new Set(body.approvals)),
        ...(sourceToken ? { sourceToken } : {}),
      }),
    )
  })

  app.post('/branch-workspaces/abort', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    return c.json({ ok: branchWorkspaceWriteService.abort(rootId) })
  })

  app.post('/branch-workspaces/reorder', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    if (!Array.isArray(body?.orderedIds) || !body.orderedIds.every(isNonEmptyString)) {
      return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    }
    return c.json(await branchWorkspaceWriteService.reorder(rootId, body.orderedIds))
  })

  app.post('/branch-workspaces/git-actions/plan', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    const normalized = normalizeBranchWorkspaceGitActionPlanRequest(body?.request)
    if (!normalized.ok) return c.json(normalized)
    return c.json(await branchWorkspaceGitActionWriteService.plan(rootId, normalized.request, c.req.raw.signal))
  })

  app.post('/branch-workspaces/git-actions/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    const normalized = normalizeBranchWorkspaceGitActionExecuteInput(body?.input)
    if (!normalized.ok) return c.json(normalized)
    return c.json(await branchWorkspaceGitActionWriteService.execute(rootId, normalized.input))
  })

  app.post('/branch-workspaces/git-actions/abort', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    return c.json({ ok: branchWorkspaceGitActionWriteService.abort(rootId) })
  })

  app.post('/pull/plan', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    return c.json(await planWorkspacePull(rootId))
  })

  app.post('/pull/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    const planToken = typeof body?.planToken === 'string' ? body.planToken.trim() : ''
    if (!planToken) return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    return c.json(await executeWorkspacePull(rootId, { planToken }))
  })

  app.post('/pull/abort', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootId = typeof body?.rootId === 'string' ? body.rootId : ''
    return c.json({ ok: abortWorkspacePull(rootId) })
  })

  return app
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !value.includes('\0')
}

async function readBranchWorkspacesResponse(
  rootId: string,
  signal: AbortSignal,
  context: Context,
  readActiveOperation: ReturnType<typeof createBranchWorkspaceGitActionWriteService>['activeOperation'],
) {
  try {
    return context.json(await readBranchWorkspaceSnapshot(rootId, signal, { readActiveOperation }))
  } catch (error) {
    console.warn('[server][workspace] branch workspace read failed', error)
    return context.json({ ok: false as const, message: 'workspace.branch-workspace.read-failed' })
  }
}
