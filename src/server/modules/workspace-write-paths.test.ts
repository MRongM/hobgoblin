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
    const writeConfig = vi.fn(async () => undefined)

    await expect(saveWorkspaceConfig(rootId, { repo: ['web', 'api'] }, { discover, writeConfig })).resolves.toEqual({
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
