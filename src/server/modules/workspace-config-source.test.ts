import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { readWorkspaceConfig, writeWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'

const temporaryRoots: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hobgoblin-workspace-config-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace config source', () => {
  test('reports a missing goblin.toml as unconfigured', async () => {
    const root = await createTemporaryRoot()

    await expect(readWorkspaceConfig(root)).resolves.toEqual({ kind: 'missing' })
  })

  test('reads a valid workspace table', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nrepo = ["api", "web"]\n')

    await expect(readWorkspaceConfig(root)).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['api', 'web'] },
    })
  })

  test('ignores a legacy main key', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nmain = "api"\nrepo = ["api", "web"]\n')

    await expect(readWorkspaceConfig(root)).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['api', 'web'] },
    })
  })

  test.each([
    ['duplicate repositories', '[workspace]\nrepo = ["api", "api"]\n'],
    ['empty repositories', '[workspace]\nrepo = []\n'],
    ['path separators', '[workspace]\nrepo = ["api", "nested/web"]\n'],
    ['parent directory', '[workspace]\nrepo = [".."]\n'],
    ['nul bytes', '[workspace]\nrepo = ["api", "web\\u0000"]\n'],
  ])('rejects %s', async (_label, contents) => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'goblin.toml'), contents)

    const result = await readWorkspaceConfig(root)

    expect(result.kind).toBe('invalid')
  })

  test('reports invalid TOML without exposing its filesystem path', async () => {
    const root = await createTemporaryRoot()
    await writeFile(path.join(root, 'goblin.toml'), '[workspace\nmain = "api"\n')

    const result = await readWorkspaceConfig(root)

    expect(result).toEqual({ kind: 'invalid', message: 'workspace.config.invalid-toml' })
    expect(JSON.stringify(result)).not.toContain(root)
  })

  test('writes workspace config while preserving unrelated tables', async () => {
    const root = await createTemporaryRoot()
    await writeFile(
      path.join(root, 'goblin.toml'),
      '# existing config\n[worktree]\ncopy = [".env.example"]\n\n[workspace]\nmain = "old"\nrepo = ["old"]\n\n[tooling]\nenabled = true\n',
    )

    await writeWorkspaceConfig(root, { repo: ['api', 'web'] })

    const persisted = await readFile(path.join(root, 'goblin.toml'), 'utf8')
    expect(persisted).toContain('# existing config\n[worktree]\ncopy = [".env.example"]')
    expect(persisted).toContain('[workspace]\nrepo = ["api", "web"]')
    expect(persisted).not.toContain('main =')
    expect(persisted).toContain('[tooling]\nenabled = true')
  })

  test('does not overwrite invalid existing TOML', async () => {
    const root = await createTemporaryRoot()
    const invalid = '[workspace\nmain = "api"\n'
    await writeFile(path.join(root, 'goblin.toml'), invalid)

    await expect(writeWorkspaceConfig(root, { repo: ['api'] })).rejects.toThrow('workspace.config.invalid-toml')
    await expect(readFile(path.join(root, 'goblin.toml'), 'utf8')).resolves.toBe(invalid)
  })
})
