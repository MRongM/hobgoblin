import { Hono } from 'hono'
import { discoverWorkspaceRepositories, restoreWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import { saveWorkspaceConfig } from '#/server/modules/workspace-write-paths.ts'
import {
  abortWorkspaceWorktree,
  executeWorkspaceWorktree,
  planWorkspaceWorktree,
} from '#/server/modules/workspace-worktree-write-paths.ts'
import type { WorkspaceWorktreePlanRequest } from '#/shared/workspace-worktrees.ts'

export function createWorkspaceRoutes() {
  const app = new Hono()

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

  app.post('/worktrees/plan', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    const request = normalizePlanRequest(body?.request)
    if (!request) return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    return c.json(await planWorkspaceWorktree(rootPath, request))
  })

  app.post('/worktrees/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    const planToken = typeof body?.planToken === 'string' ? body.planToken : ''
    const approveBootstrap = body?.approveBootstrap === true
    return c.json(await executeWorkspaceWorktree(rootPath, { planToken, approveBootstrap }))
  })

  app.post('/worktrees/abort', async (c) => {
    const body = await c.req.json().catch(() => null)
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : ''
    return c.json({ ok: abortWorkspaceWorktree(rootPath) })
  })

  return app
}

function normalizePlanRequest(value: unknown): WorkspaceWorktreePlanRequest | null {
  if (!value || typeof value !== 'object') return null
  const request = value as {
    operation?: unknown
    branch?: unknown
    baseBranch?: unknown
    alsoDeleteBranch?: unknown
    alsoDeleteUpstream?: unknown
  }
  if (request.operation === 'pull') return { operation: 'pull' }
  if (request.operation === 'remove' && typeof request.branch === 'string') {
    const alsoDeleteBranch = request.alsoDeleteBranch === true
    return {
      operation: 'remove',
      branch: request.branch,
      alsoDeleteBranch,
      alsoDeleteUpstream: alsoDeleteBranch && request.alsoDeleteUpstream === true,
    }
  }
  if (request.operation === 'create' && typeof request.branch === 'string' && typeof request.baseBranch === 'string') {
    return { operation: 'create', branch: request.branch, baseBranch: request.baseBranch }
  }
  return null
}
