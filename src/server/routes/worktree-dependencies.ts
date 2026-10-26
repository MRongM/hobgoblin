import { Hono } from 'hono'
import { createWorktreeDependencyWriteService } from '#/server/modules/worktree-dependency-write-paths.ts'
import { isValidRepositoryWorktreePath } from '#/server/modules/repo-backend.ts'
import { isValidRepoLocator } from '#/shared/input-validation.ts'
import type { WorktreeDependencyTarget } from '#/shared/worktree-dependencies.ts'

export function createWorktreeDependencyRoutes() {
  const app = new Hono()
  const service = createWorktreeDependencyWriteService()

  app.post('/read', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!validTarget(body) || !('operation' in body) || (body.operation !== 'add' && body.operation !== 'remove')) {
      return c.json({ ok: false, message: 'error.invalid-arguments' })
    }
    const source = 'sourceWorktreePath' in body ? body.sourceWorktreePath : undefined
    if (source !== undefined && !isValidRepositoryWorktreePath(body.repoId, source)) {
      return c.json({ ok: false, message: 'error.invalid-arguments' })
    }
    return c.json(
      await service.read(
        {
          repoId: body.repoId,
          worktreePath: body.worktreePath,
          operation: body.operation,
          ...(typeof source === 'string' ? { sourceWorktreePath: source } : {}),
        },
        c.req.raw.signal,
      ),
    )
  })

  app.post('/plan', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!validTarget(body) || !('operation' in body)) return c.json({ ok: false, message: 'error.invalid-arguments' })
    if (
      body.operation === 'add' &&
      'sourceWorktreePath' in body &&
      'entries' in body &&
      isValidRepositoryWorktreePath(body.repoId, body.sourceWorktreePath) &&
      Array.isArray(body.entries) &&
      body.entries.every(
        (entry) => entry && typeof entry.path === 'string' && (entry.mode === 'copy' || entry.mode === 'symlink'),
      )
    ) {
      return c.json(
        await service.plan(
          {
            repoId: body.repoId,
            worktreePath: body.worktreePath,
            operation: 'add',
            sourceWorktreePath: body.sourceWorktreePath,
            entries: body.entries,
          },
          c.req.raw.signal,
        ),
      )
    }
    if (
      body.operation === 'remove' &&
      'paths' in body &&
      Array.isArray(body.paths) &&
      body.paths.every((entry) => typeof entry === 'string')
    ) {
      return c.json(
        await service.plan(
          { repoId: body.repoId, worktreePath: body.worktreePath, operation: 'remove', paths: body.paths },
          c.req.raw.signal,
        ),
      )
    }
    return c.json({ ok: false, message: 'error.invalid-arguments' })
  })

  app.post('/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (typeof body?.planToken !== 'string' || !body.planToken)
      return c.json({ ok: false, message: 'error.invalid-arguments', completedPaths: [] })
    return c.json(await service.execute(body.planToken))
  })

  app.post('/abort', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!validTarget(body)) return c.json({ ok: false })
    return c.json({ ok: service.abort(body) })
  })

  return app
}

function validTarget(value: unknown): value is WorktreeDependencyTarget {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  return isValidRepoLocator(input.repoId) && isValidRepositoryWorktreePath(input.repoId, input.worktreePath)
}
