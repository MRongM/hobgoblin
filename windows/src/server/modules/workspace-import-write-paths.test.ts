import { describe, expect, test, vi } from 'vitest'
import { importWorkspaceRepositories } from '#/server/modules/workspace-import-write-paths.ts'
import type { WorkspaceDiscoveryResult } from '#/shared/workspace.ts'

const rootId = '/workspace'
const api = { id: '/workspace/api', name: 'api' }
const docs = { id: '/workspace/docs', name: 'docs' }
const missing = { id: '/workspace/missing', name: 'missing' }
const web = { id: '/workspace/web', name: 'web' }

describe('workspace import write paths', () => {
  test('persists every discovered repository when configuration is missing', async () => {
    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [api, docs],
      candidates: [
        { ...api, selected: false, available: true },
        { ...docs, selected: false, available: true },
      ],
      configuration: { kind: 'missing' },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)
    const publishInvalidation = vi.fn()

    await expect(
      importWorkspaceRepositories(
        rootId,
        { sourceToken: 'workspace_import_1' },
        { discover: async () => discovery, writeConfig, publishInvalidation },
      ),
    ).resolves.toEqual({
      ...discovery,
      repositories: [api, docs],
      candidates: [
        { ...api, selected: true, available: true },
        { ...docs, selected: true, available: true },
      ],
      configuration: { kind: 'ready', config: { repo: ['api', 'docs'] } },
    })
    expect(writeConfig).toHaveBeenCalledWith(rootId, { repo: ['api', 'docs'] })
    expect(publishInvalidation).toHaveBeenCalledWith(rootId, 'workspace_import_1')
  })

  test('preserves configured order and unavailable members while appending new repositories', async () => {
    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [web, api],
      candidates: [
        { ...api, selected: true, available: true },
        { ...docs, selected: false, available: true },
        { ...missing, selected: true, available: false },
        { ...web, selected: true, available: true },
      ],
      configuration: { kind: 'ready', config: { repo: ['web', 'missing', 'api'] } },
      skipped: [{ path: '/workspace/broken', message: 'error.failed-read-repo' }],
    }
    const writeConfig = vi.fn(async () => undefined)

    const result = await importWorkspaceRepositories(rootId, {}, { discover: async () => discovery, writeConfig })

    expect(writeConfig).toHaveBeenCalledWith(rootId, { repo: ['web', 'missing', 'api', 'docs'] })
    expect(result).toEqual({
      ...discovery,
      repositories: [web, api, docs],
      candidates: discovery.candidates.map((candidate) => ({ ...candidate, selected: true })),
      configuration: { kind: 'ready', config: { repo: ['web', 'missing', 'api', 'docs'] } },
    })
  })

  test('does not write or publish when configured membership is unchanged', async () => {
    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [web, api],
      candidates: [
        { ...api, selected: true, available: true },
        { ...web, selected: true, available: true },
      ],
      configuration: { kind: 'ready', config: { repo: ['web', 'api'] } },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)
    const publishInvalidation = vi.fn()

    await expect(
      importWorkspaceRepositories(rootId, {}, { discover: async () => discovery, writeConfig, publishInvalidation }),
    ).resolves.toBe(discovery)
    expect(writeConfig).not.toHaveBeenCalled()
    expect(publishInvalidation).not.toHaveBeenCalled()
  })

  test('does not overwrite invalid configuration', async () => {
    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [],
      candidates: [{ ...api, selected: false, available: true }],
      configuration: { kind: 'invalid', message: 'workspace.config.read-failed' },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)

    await expect(
      importWorkspaceRepositories(rootId, {}, { discover: async () => discovery, writeConfig }),
    ).resolves.toBe(discovery)
    expect(writeConfig).not.toHaveBeenCalled()
  })

  test('does not persist an empty configuration', async () => {
    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [],
      candidates: [],
      configuration: { kind: 'missing' },
      skipped: [],
    }
    const writeConfig = vi.fn(async () => undefined)

    await expect(
      importWorkspaceRepositories(rootId, {}, { discover: async () => discovery, writeConfig }),
    ).resolves.toBe(discovery)
    expect(writeConfig).not.toHaveBeenCalled()
  })

  test('preserves stable configuration and SSH errors from discovery or persistence', async () => {
    await expect(
      importWorkspaceRepositories(
        rootId,
        {},
        { discover: async () => ({ ok: false, message: 'error.ssh-config-changed' }) },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })

    const discovery: Extract<WorkspaceDiscoveryResult, { ok: true }> = {
      ok: true,
      rootId,
      repositories: [api],
      candidates: [{ ...api, selected: false, available: true }],
      configuration: { kind: 'missing' },
      skipped: [],
    }
    await expect(
      importWorkspaceRepositories(
        rootId,
        {},
        {
          discover: async () => discovery,
          writeConfig: async () => {
            throw new Error('error.ssh-config-changed')
          },
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
    await expect(
      importWorkspaceRepositories(
        rootId,
        {},
        {
          discover: async () => discovery,
          writeConfig: async () => {
            throw new Error('permission denied')
          },
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.config.write-failed' })
  })
})
