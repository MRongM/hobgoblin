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
    const writeConfig = vi.fn(async () => {
      return undefined
    })
    const readBranchWorkspaces = vi.fn(async () => ({ kind: 'missing' as const }))

    await expect(
      saveWorkspaceConfig(rootId, { repo: ['web', 'api'] }, { discover, writeConfig, readBranchWorkspaces }),
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
    expect(readBranchWorkspaces).toHaveBeenCalledWith(rootId)
  })

  test('rejects removing repositories referenced by branch workspaces', async () => {
    const rootId = '/workspace'
    const api = { id: '/workspace/api', name: 'api' }
    const web = { id: '/workspace/web', name: 'web' }
    const discovery = {
      ok: true as const,
      rootId,
      repositories: [api, web],
      candidates: [
        { ...api, selected: true, available: true },
        { ...web, selected: true, available: true },
      ],
      configuration: { kind: 'ready' as const, config: { repo: ['api', 'web'] } },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)
    const readBranchWorkspaces = vi.fn(async () => ({
      kind: 'ready' as const,
      manifests: [
        {
          id: 'branch-1',
          rootId,
          branch: 'feature/auth',
          directoryName: 'goblin-feature-auth',
          path: '/workspace/goblin-feature-auth',
          repositories: [{ repositoryName: 'web' }],
          auxiliaryEntries: [],
        },
        {
          id: 'branch-2',
          rootId,
          branch: 'fix/session',
          directoryName: 'goblin-fix-session',
          path: '/workspace/goblin-fix-session',
          repositories: [{ repositoryName: 'web' }],
          auxiliaryEntries: [],
        },
      ],
    }))

    await expect(
      saveWorkspaceConfig(
        rootId,
        { repo: ['api'] },
        { discover: async () => discovery, writeConfig, readBranchWorkspaces },
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.config.repository-referenced',
      affectedBranchWorkspaces: ['feature/auth', 'fix/session'],
    })
    expect(writeConfig).not.toHaveBeenCalled()
  })

  test('allows reordering and adding repositories without treating unchanged references as removals', async () => {
    const rootId = '/workspace'
    const api = { id: '/workspace/api', name: 'api' }
    const web = { id: '/workspace/web', name: 'web' }
    const docs = { id: '/workspace/docs', name: 'docs' }
    const discovery = {
      ok: true as const,
      rootId,
      repositories: [api, web],
      candidates: [
        { ...api, selected: true, available: true },
        { ...web, selected: true, available: true },
        { ...docs, selected: false, available: true },
      ],
      configuration: { kind: 'ready' as const, config: { repo: ['api', 'web'] } },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)

    await expect(
      saveWorkspaceConfig(
        rootId,
        { repo: ['web', 'docs', 'api'] },
        {
          discover: async () => discovery,
          writeConfig,
          readBranchWorkspaces: async () => ({
            kind: 'ready',
            manifests: [{ branch: 'feature/auth', repositories: [{ repositoryName: 'web' }] }],
          }),
        },
      ),
    ).resolves.toMatchObject({ ok: true })
    expect(writeConfig).toHaveBeenCalledWith(rootId, { repo: ['web', 'docs', 'api'] })
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
          readBranchWorkspaces: async () => ({ kind: 'missing' }),
          writeConfig: async () => {
            throw new Error('error.ssh-config-changed')
          },
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
  })
})
