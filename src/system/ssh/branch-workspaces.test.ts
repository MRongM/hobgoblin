import { describe, expect, test, vi } from 'vitest'
import {
  copyRemoteBranchWorkspaceEntry,
  createRemoteBranchWorkspaceDirectory,
  fingerprintRemoteBranchWorkspaceEntry,
  inspectRemoteBranchWorkspacePath,
  listRemoteBranchWorkspaceAuxiliaryCandidates,
  listRemoteBranchWorkspaceChildren,
  materializeRemoteBranchWorkspaceSymlink,
  removeRemoteBranchWorkspaceEntry,
} from '#/system/ssh/branch-workspaces.ts'
import type { RemoteCommandResult } from '#/system/ssh/commands.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'dev',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/workspace',
})!

function result(stdout: string): RemoteCommandResult {
  return { ok: true, stdout, stderr: '' }
}

describe('remote branch workspace wrappers', () => {
  test('parses candidate and inspection payloads into shared DTOs', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        result(
          JSON.stringify({
            ok: true,
            candidates: [
              {
                name: 'docs',
                path: '/srv/workspace/docs',
                kind: 'directory',
                resolvedPath: '/srv/workspace/docs',
                outsideRoot: false,
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        result(
          JSON.stringify({
            ok: true,
            inspection: {
              path: '/srv/workspace/shared',
              exists: true,
              kind: 'symlink',
              resolvedPath: '/opt/shared',
              directChild: true,
              outsideRoot: true,
            },
          }),
        ),
      )

    await expect(
      listRemoteBranchWorkspaceAuxiliaryCandidates(TARGET, '/srv/workspace', new Set(['api']), { run }),
    ).resolves.toEqual([
      {
        name: 'docs',
        path: '/srv/workspace/docs',
        kind: 'directory',
        resolvedPath: '/srv/workspace/docs',
        outsideRoot: false,
      },
    ])
    await expect(
      inspectRemoteBranchWorkspacePath(TARGET, '/srv/workspace', '/srv/workspace/shared', { run }),
    ).resolves.toMatchObject({ kind: 'symlink', resolvedPath: '/opt/shared', outsideRoot: true })
    expect(run.mock.calls[0]?.[0]).toEqual({
      type: 'listBranchWorkspaceCandidates',
      rootPath: '/srv/workspace',
      excludedNames: ['api'],
    })
  })

  test('sends only fixed mutation commands and parses fingerprints and children', async () => {
    const fingerprint = 'a'.repeat(64)
    const run = vi
      .fn()
      .mockResolvedValueOnce(result('{"ok":true}'))
      .mockResolvedValueOnce(result('{"ok":true}'))
      .mockResolvedValueOnce(result('{"ok":true}'))
      .mockResolvedValueOnce(result(fingerprint))
      .mockResolvedValueOnce(result(JSON.stringify({ ok: true, children: ['README.md', 'api'] })))
      .mockResolvedValueOnce(result('{"ok":true}'))

    await createRemoteBranchWorkspaceDirectory(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature', { run })
    await materializeRemoteBranchWorkspaceSymlink(
      TARGET,
      '/srv/workspace',
      '/srv/workspace/README.md',
      '/srv/workspace/goblin-feature/README.md',
      { run },
    )
    await copyRemoteBranchWorkspaceEntry(
      TARGET,
      '/srv/workspace',
      '/srv/workspace/docs',
      '/srv/workspace/goblin-feature/docs',
      { run },
    )
    await expect(
      fingerprintRemoteBranchWorkspaceEntry(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature/docs', { run }),
    ).resolves.toBe(fingerprint)
    await expect(
      listRemoteBranchWorkspaceChildren(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature', { run }),
    ).resolves.toEqual(['README.md', 'api'])
    await removeRemoteBranchWorkspaceEntry(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature/docs', { run })

    expect(run.mock.calls.map(([command]) => command.type)).toEqual([
      'createBranchWorkspaceDirectory',
      'materializeBranchWorkspaceSymlink',
      'copyBranchWorkspaceEntry',
      'fingerprintBranchWorkspaceEntry',
      'listBranchWorkspaceChildren',
      'removeBranchWorkspaceEntry',
    ])
  })

  test('maps malformed payloads, remote failures, and cancellation to stable errors', async () => {
    await expect(
      listRemoteBranchWorkspaceChildren(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature', {
        run: vi.fn(async () => result('not-json')),
      }),
    ).rejects.toThrow('workspace.branch-workspace.remote-invalid-response')
    await expect(
      removeRemoteBranchWorkspaceEntry(TARGET, '/srv/workspace', '/srv/workspace/goblin-feature', {
        run: vi.fn(async () => ({ ok: false, stdout: '', stderr: 'denied', message: 'denied' })),
      }),
    ).rejects.toThrow('workspace.branch-workspace.remote-operation-failed')

    const controller = new AbortController()
    controller.abort()
    await expect(
      inspectRemoteBranchWorkspacePath(TARGET, '/srv/workspace', '/srv/workspace/docs', {
        signal: controller.signal,
        run: vi.fn(async () => result('{}')),
      }),
    ).rejects.toThrow('cancelled')
  })
})
