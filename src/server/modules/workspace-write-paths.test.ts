import { describe, expect, test, vi } from 'vitest'
import { saveWorkspaceConfig } from '#/server/modules/workspace-write-paths.ts'

describe('workspace write paths', () => {
  test('reuses the pre-write discovery when projecting saved configuration', async () => {
    const rootId = '/workspace'
    const api = { id: '/workspace/api', name: 'api' }
    const docs = { id: '/workspace/docs', name: 'docs' }
    const web = { id: '/workspace/web', name: 'web' }
    const discovery = {
      ok: true as const,
      rootId,
      repositories: [api],
      candidates: [
        { ...api, selected: true, available: true },
        { ...docs, selected: false, available: true },
        { ...web, selected: false, available: true },
      ],
      configuration: { kind: 'ready' as const, config: { repo: ['api'] } },
      skipped: [{ path: '/workspace/broken', message: 'error.failed-read-repo' }],
    }
    const discover = vi.fn(async () => discovery)
    const invocations: string[] = []
    const writeConfig = vi.fn(async () => {
      invocations.push('write')
    })
    const syncAgents = vi.fn(async () => {
      invocations.push('sync')
    })

    await expect(
      saveWorkspaceConfig(rootId, { repo: ['web', 'api'] }, { discover, writeConfig, syncAgents }),
    ).resolves.toEqual({
      ok: true,
      rootId,
      repositories: [web, api],
      candidates: [
        { ...api, selected: true, available: true },
        { ...docs, selected: false, available: true },
        { ...web, selected: true, available: true },
      ],
      configuration: { kind: 'ready', config: { repo: ['web', 'api'] } },
      skipped: discovery.skipped,
    })
    expect(discover).toHaveBeenCalledTimes(1)
    expect(writeConfig).toHaveBeenCalledTimes(1)
    expect(writeConfig).toHaveBeenCalledWith(rootId, { repo: ['web', 'api'] })
    expect(syncAgents).toHaveBeenCalledWith(rootId)
    expect(invocations).toEqual(['write', 'sync'])
  })

  test('reports an AGENTS.md synchronization failure after persisting workspace configuration', async () => {
    const rootId = '/workspace'
    const api = { id: '/workspace/api', name: 'api' }
    const discovery = {
      ok: true as const,
      rootId,
      repositories: [api],
      candidates: [{ ...api, selected: true, available: true }],
      configuration: { kind: 'ready' as const, config: { repo: ['api'] } },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)
    const syncAgents = vi.fn(async () => {
      throw new Error('workspace.agents.write-failed')
    })

    await expect(
      saveWorkspaceConfig(rootId, { repo: ['api'] }, { discover: async () => discovery, writeConfig, syncAgents }),
    ).resolves.toEqual({ ok: false, message: 'workspace.agents.write-failed' })
    expect(writeConfig).toHaveBeenCalledWith(rootId, { repo: ['api'] })
    expect(syncAgents).toHaveBeenCalledWith(rootId)
  })

  test('preserves SSH config changes reported while saving a remote workspace', async () => {
    const rootId = 'ssh-config://removed/srv/workspace'
    const discovery = {
      ok: true as const,
      rootId,
      repositories: [{ id: `${rootId}/api`, name: 'api' }],
      candidates: [{ id: `${rootId}/api`, name: 'api', selected: true, available: true }],
      configuration: { kind: 'ready' as const, config: { repo: ['api'] } },
      skipped: [],
    }

    await expect(
      saveWorkspaceConfig(
        rootId,
        { repo: ['api'] },
        {
          discover: async () => discovery,
          writeConfig: async () => {
            throw new Error('error.ssh-config-changed')
          },
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
  })
})
