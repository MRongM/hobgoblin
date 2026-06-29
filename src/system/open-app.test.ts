import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  existsSync: vi.fn(),
  homedir: vi.fn(() => '/Users/test'),
  statSync: vi.fn(
    (): { isDirectory: () => boolean; isFile: () => boolean } => ({
      isDirectory: () => true,
      isFile: () => false,
    }),
  ),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  statSync: mocks.statSync,
}))
vi.mock('node:os', () => ({ default: { homedir: mocks.homedir } }))

describe('openByAppCli', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockImplementation((path: string) =>
      path === '/Applications/Visual Studio Code.app' ||
      path === '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    )
    mocks.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true })
    mocks.execa.mockResolvedValue({ failed: false })
  })

  test('opens an existing file path with a VS Code-family editor CLI', async () => {
    const { openByAppCli } = await import('#/system/open-app.ts')

    await expect(openByAppCli('Visual Studio Code', 'code', '/repo/README.md')).resolves.toEqual({
      ok: true,
      message: '/repo/README.md',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['/repo/README.md'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })

  test('opens an existing file path at a line and column with --goto', async () => {
    const { openByAppCli } = await import('#/system/open-app.ts')

    await expect(
      openByAppCli('Visual Studio Code', 'code', { path: '/repo/src/app.ts', line: 12, column: 3 }),
    ).resolves.toEqual({ ok: true, message: '/repo/src/app.ts' })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['--goto', '/repo/src/app.ts:12:3'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })
})

describe('openRemoteByAppCli', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockImplementation((path: string) =>
      path === '/Applications/Visual Studio Code.app' ||
      path === '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    )
    mocks.execa.mockResolvedValue({ failed: false })
  })

  test('opens a VS Code-family editor with Remote SSH arguments', async () => {
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(openRemoteByAppCli('Visual Studio Code', 'code', 'prod', '/srv/repo-feature')).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['--remote', 'ssh-remote+prod', '/srv/repo-feature'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })

  test('opens a remote file at a line target with --goto', async () => {
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(
      openRemoteByAppCli('Visual Studio Code', 'code', 'prod', { path: '/srv/repo/src/app.ts', line: 12 }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo/src/app.ts' })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['--remote', 'ssh-remote+prod', '--goto', '/srv/repo/src/app.ts:12'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })

  test('rejects invalid remote aliases and paths before invoking the editor', async () => {
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(openRemoteByAppCli('Visual Studio Code', 'code', 'bad alias', '/srv/repo')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(openRemoteByAppCli('Visual Studio Code', 'code', 'prod', 'relative/repo')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('returns editor-not-installed when the CLI cannot be found', async () => {
    mocks.existsSync.mockReturnValue(false)
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(openRemoteByAppCli('Visual Studio Code', 'code', 'prod', '/srv/repo')).resolves.toEqual({
      ok: false,
      message: 'error.editor-not-installed',
    })
  })

  test('returns CLI error output when the editor command fails', async () => {
    mocks.execa.mockResolvedValue({
      failed: true,
      stderr: 'Remote SSH extension is unavailable',
      shortMessage: 'failed',
      message: 'failed',
    })
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(openRemoteByAppCli('Visual Studio Code', 'code', 'prod', '/srv/repo')).resolves.toEqual({
      ok: false,
      message: 'Remote SSH extension is unavailable',
    })
  })
})
