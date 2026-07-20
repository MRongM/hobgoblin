import { describe, expect, test, vi } from 'vitest'
import {
  syncWorkspaceAgents,
  upsertWorkspaceAgentsBlock,
  type WorkspaceAgentsSnapshot,
} from '#/server/modules/workspace-agents-source.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import type { BranchSnapshotInfo } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const START_MARKER = '<!-- hobgoblin:workspace-inventory:start -->'
const END_MARKER = '<!-- hobgoblin:workspace-inventory:end -->'

const snapshot: WorkspaceAgentsSnapshot = {
  repositories: [
    { name: 'api', checkedOutBranches: ['main', 'feature/change'] },
    { name: 'web', checkedOutBranches: ['trunk'] },
  ],
}

function branch(name: string, worktreePath?: string): BranchSnapshotInfo {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: '',
    lastCommitMessage: '',
    lastCommitDate: '',
    lastCommitAuthor: '',
    ...(worktreePath ? { worktree: { path: worktreePath } } : {}),
  }
}

function repoSnapshot(current: string, branches: BranchSnapshotInfo[]): RepoSnapshot {
  return { current, branches }
}

function inventoryFromDocument(contents: string): WorkspaceAgentsSnapshot {
  const normalized = contents.replaceAll('\r\n', '\n')
  const jsonStart = normalized.indexOf('    {')
  const jsonEnd = normalized.indexOf(`\n${END_MARKER}`)
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('inventory JSON not found')
  const json = normalized
    .slice(jsonStart, jsonEnd)
    .split('\n')
    .map((line) => line.slice(4))
    .join('\n')
  return JSON.parse(json) as WorkspaceAgentsSnapshot
}

function successfulRead(content: string) {
  return { ok: true as const, content, byteLength: Buffer.byteLength(content) }
}

function successfulReplace(previousContent = '') {
  return {
    ok: true as const,
    previousContent,
    previousByteLength: Buffer.byteLength(previousContent),
  }
}

interface SynchronizationFailureValues {
  read: ReturnType<typeof successfulRead> | { ok: false; message: string }
  config?: { kind: 'missing' }
  snapshot?: RepoSnapshot | null
  replace?: ReturnType<typeof successfulReplace> | { ok: false; message: string }
}

const synchronizationFailureCases: Array<[string, SynchronizationFailureValues]> = [
  ['read failure', { read: { ok: false, message: 'error.path-permission-denied' } }],
  ['missing config', { read: successfulRead('# Rules\n'), config: { kind: 'missing' } }],
  ['snapshot failure', { read: successfulRead('# Rules\n'), snapshot: null }],
  [
    'write failure',
    {
      read: successfulRead('# Rules\n'),
      replace: { ok: false, message: 'error.path-permission-denied' },
    },
  ],
]

describe('workspace AGENTS.md managed block', () => {
  test('appends an inventory while preserving user-authored content', () => {
    const original = '# Team rules\n\nKeep this section.\n'

    const updated = upsertWorkspaceAgentsBlock(original, snapshot)

    expect(updated.startsWith(original)).toBe(true)
    expect(updated).toContain(START_MARKER)
    expect(updated).toContain('## Hobgoblin workspace inventory')
    expect(updated).toContain(END_MARKER)
    expect(inventoryFromDocument(updated)).toEqual(snapshot)
  })

  test('replaces only an existing managed block', () => {
    const original = [
      '# Before',
      '',
      START_MARKER,
      'old generated content',
      END_MARKER,
      '',
      '# After',
      '',
    ].join('\n')

    const updated = upsertWorkspaceAgentsBlock(original, snapshot)

    expect(updated.startsWith('# Before\n\n')).toBe(true)
    expect(updated.endsWith('\n\n# After\n')).toBe(true)
    expect(updated).not.toContain('old generated content')
    expect(updated.match(new RegExp(START_MARKER, 'g'))).toHaveLength(1)
    expect(updated.match(new RegExp(END_MARKER, 'g'))).toHaveLength(1)
  })

  test('preserves CRLF and is byte-identical when projected twice', () => {
    const original = '# Rules\r\n\r\nKeep this.\r\n'

    const once = upsertWorkspaceAgentsBlock(original, snapshot)
    const twice = upsertWorkspaceAgentsBlock(once, snapshot)

    expect(twice).toBe(once)
    expect(once.replaceAll('\r\n', '')).not.toContain('\n')
  })

  test.each([
    ['start without end', `${START_MARKER}\ncontent\n`],
    ['end without start', `content\n${END_MARKER}\n`],
    ['reversed markers', `${END_MARKER}\ncontent\n${START_MARKER}\n`],
    ['duplicate start markers', `${START_MARKER}\n${START_MARKER}\n${END_MARKER}\n`],
    ['duplicate end markers', `${START_MARKER}\n${END_MARKER}\n${END_MARKER}\n`],
  ])('rejects %s', (_label, original) => {
    expect(() => upsertWorkspaceAgentsBlock(original, snapshot)).toThrow('workspace.agents.write-failed')
  })
})

describe('workspace AGENTS.md synchronization', () => {
  test('does nothing when the workspace root has no AGENTS.md', async () => {
    const readTextFile = vi.fn(async () => ({ ok: false as const, message: 'error.path-not-found' }))
    const readConfig = vi.fn()
    const getSnapshot = vi.fn()
    const replaceTextFile = vi.fn()

    await expect(
      syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile }),
    ).resolves.toBeUndefined()

    expect(readTextFile).toHaveBeenCalledWith('/workspace', '/workspace', '/workspace/AGENTS.md')
    expect(readConfig).not.toHaveBeenCalled()
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(replaceTextFile).not.toHaveBeenCalled()
  })

  test('projects configured repository order and checked-out branches into a local AGENTS.md', async () => {
    const readTextFile = vi.fn(async () => successfulRead('# Rules\n'))
    const readConfig = vi.fn(async () => ({
      kind: 'ready' as const,
      config: { repo: ['web', 'api'] },
    }))
    const getSnapshot = vi.fn(async (repoId: string) => {
      if (repoId === '/workspace/web') {
        return repoSnapshot('main', [
          branch('feature/z', '/workspace/web-feature-z'),
          branch('unused'),
          branch('main', '/workspace/web'),
          branch('feature/a', '/workspace/web-feature-a'),
        ])
      }
      return repoSnapshot('trunk', [branch('trunk', '/workspace/api'), branch('release', '/workspace/api-release')])
    })
    const replaceTextFile = vi.fn(
      async (_repoId: string, _worktreePath: string, _filePath: string, _contents: string) =>
        successfulReplace('# Rules\n'),
    )

    await syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile })

    expect(getSnapshot.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/web', '/workspace/api'])
    expect(replaceTextFile).toHaveBeenCalledTimes(1)
    const [, worktreePath, filePath, contents] = replaceTextFile.mock.calls[0]!
    expect(worktreePath).toBe('/workspace')
    expect(filePath).toBe('/workspace/AGENTS.md')
    expect(inventoryFromDocument(contents)).toEqual({
      repositories: [
        { name: 'web', checkedOutBranches: ['main', 'feature/a', 'feature/z'] },
        { name: 'api', checkedOutBranches: ['trunk', 'release'] },
      ],
    })
  })

  test('uses the remote workspace path while keeping the SSH root id as the file owner', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    const readTextFile = vi.fn(async () => successfulRead('# Remote rules\n'))
    const readConfig = vi.fn(async () => ({ kind: 'ready' as const, config: { repo: ['api'] } }))
    const getSnapshot = vi.fn(async () => repoSnapshot('main', [branch('main', '/srv/workspace/api')]))
    const replaceTextFile = vi.fn(async () => successfulReplace())

    await syncWorkspaceAgents(rootId, { readTextFile, readConfig, getSnapshot, replaceTextFile })

    expect(readTextFile).toHaveBeenCalledWith(rootId, '/srv/workspace', '/srv/workspace/AGENTS.md')
    expect(getSnapshot).toHaveBeenCalledWith(`${rootId}/api`)
    expect(replaceTextFile).toHaveBeenCalledWith(
      rootId,
      '/srv/workspace',
      '/srv/workspace/AGENTS.md',
      expect.stringContaining(START_MARKER),
    )
  })

  test('skips the write when the managed inventory is unchanged', async () => {
    const original = upsertWorkspaceAgentsBlock('# Rules\n', {
      repositories: [{ name: 'api', checkedOutBranches: ['main'] }],
    })
    const readTextFile = vi.fn(async () => successfulRead(original))
    const readConfig = vi.fn(async () => ({ kind: 'ready' as const, config: { repo: ['api'] } }))
    const getSnapshot = vi.fn(async () => repoSnapshot('main', [branch('main', '/workspace/api')]))
    const replaceTextFile = vi.fn()

    await syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile })

    expect(replaceTextFile).not.toHaveBeenCalled()
  })

  test.each(synchronizationFailureCases)('maps %s to the privacy-safe write failure', async (_label, values) => {
    const readTextFile = vi.fn(async () => values.read)
    const readConfig = vi.fn(async () => values.config ?? ({ kind: 'ready' as const, config: { repo: ['api'] } }))
    const getSnapshot = vi.fn(async () => (values.snapshot === null ? null : repoSnapshot('main', [])))
    const replaceTextFile = vi.fn(async () => values.replace ?? successfulReplace())

    await expect(
      syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile }),
    ).rejects.toThrow('workspace.agents.write-failed')
  })

  test('serializes complete synchronizations for the same workspace root', async () => {
    const readTextFile = vi.fn(async () => successfulRead('# Rules\n'))
    const readConfig = vi.fn(async () => ({ kind: 'ready' as const, config: { repo: ['api'] } }))
    const getSnapshot = vi.fn(async () => repoSnapshot('main', []))
    let releaseFirstWrite: (() => void) | undefined
    const replaceTextFile = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          await new Promise<ReturnType<typeof successfulReplace>>((resolve) => {
            releaseFirstWrite = () => resolve(successfulReplace())
          }),
      )
      .mockResolvedValue(successfulReplace())

    const first = syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile })
    await vi.waitFor(() => expect(replaceTextFile).toHaveBeenCalledTimes(1))
    const second = syncWorkspaceAgents('/workspace', { readTextFile, readConfig, getSnapshot, replaceTextFile })
    await Promise.resolve()

    expect(readTextFile).toHaveBeenCalledTimes(1)
    releaseFirstWrite?.()
    await Promise.all([first, second])
    expect(readTextFile).toHaveBeenCalledTimes(2)
    expect(replaceTextFile).toHaveBeenCalledTimes(2)
  })
})
