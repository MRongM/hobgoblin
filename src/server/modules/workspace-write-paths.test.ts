import { describe, expect, test } from 'vitest'
import { saveWorkspaceConfig } from '#/server/modules/workspace-write-paths.ts'

describe('workspace write paths', () => {
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
