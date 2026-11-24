import { Hono } from 'hono'
import {
  getServerRemotePathSuggestions,
  getServerSshHosts,
  openServerRemoteEditor,
  openServerRemoteTerminal,
  resolveServerRemoteTarget,
  testServerRemoteRepository,
} from '#/server/modules/remote.ts'
import { routeEditorTarget } from '#/server/routes/editor-target.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { listWindowsWslDistributions } from '#/system/wsl/distributions.ts'
import { listRepoRpcSettings, saveRepoRpcSettings } from '#/server/modules/remote-repo-rpc-settings-source.ts'
import { REPO_RPC_UNAVAILABLE, RepoRpcError } from '#/shared/remote-repo-rpc.ts'
import { publishSettingsInvalidation } from '#/server/modules/invalidation-broker.ts'

export function createRemoteRoutes() {
  const app = new Hono()
  app.get('/ssh-hosts', async (c) => c.json(await getServerSshHosts()))
  app.get('/repo-rpc-settings', async (c) => c.json(await listRepoRpcSettings()))
  app.post('/repo-rpc-settings', async (c) => {
    try {
      const settings = await saveRepoRpcSettings(await c.req.json(), c.req.raw.signal)
      publishSettingsInvalidation(['repo-rpc-settings'])
      return c.json({ ok: true, settings })
    } catch (error) {
      const message =
        error instanceof RepoRpcError
          ? REPO_RPC_UNAVAILABLE
          : error instanceof Error && error.message === 'error.remote-rpc-settings-changed'
            ? error.message
            : 'error.invalid-arguments'
      return c.json({ ok: false, message })
    }
  })
  app.get('/wsl-distributions', async (c) => c.json(await listWindowsWslDistributions(c.req.raw.signal)))
  app.post('/resolve-target', async (c) => {
    const body = await c.req.json().catch(() => null)
    const alias = typeof body?.alias === 'string' ? body.alias : ''
    const remotePath = typeof body?.remotePath === 'string' ? body.remotePath : ''
    const transport = body?.transport === 'wsl' ? ('wsl' as const) : undefined
    return c.json(
      transport
        ? await resolveRepositoryRemoteTarget({ alias, remotePath, transport }, c.req.raw.signal)
        : await resolveServerRemoteTarget({ alias, remotePath }, c.req.raw.signal),
    )
  })
  app.post('/path-suggestions', async (c) => {
    const body = await c.req.json().catch(() => null)
    const alias = typeof body?.alias === 'string' ? body.alias : ''
    const remotePath = typeof body?.remotePath === 'string' ? body.remotePath : ''
    const prefix = typeof body?.prefix === 'string' ? body.prefix : ''
    return c.json(await getServerRemotePathSuggestions({ alias, remotePath, prefix }, c.req.raw.signal))
  })
  app.post('/test-repository', async (c) => {
    const body = await c.req.json().catch(() => null)
    const target = normalizeRemoteTarget(body?.target)
    return c.json(await testServerRemoteRepository(target ?? (body?.target as never), c.req.raw.signal))
  })
  app.post('/open-editor', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const target = routeEditorTarget(body?.target)
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    return c.json(
      await openServerRemoteEditor(target ? { repoId, target } : { repoId, worktreePath }, c.req.raw.signal),
    )
  })
  app.post('/open-terminal', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    return c.json(await openServerRemoteTerminal({ repoId, worktreePath }, c.req.raw.signal))
  })
  return app
}
