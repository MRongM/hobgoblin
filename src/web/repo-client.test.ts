import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererBootstrapSnapshot } from '#/shared/bootstrap.ts'
import { ELECTRON_RENDERER_CAPABILITIES, RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'
import type { RendererBridge } from '#/web/renderer-bridge-types.ts'
import { setRendererBridgeForTests } from '#/web/renderer-bridge.ts'

function webBootstrap(overrides: Partial<RendererBootstrapSnapshot> = {}): RendererBootstrapSnapshot {
  return {
    runtime: { kind: 'web', bridgeVersion: RENDERER_BRIDGE_VERSION, capabilities: [] },
    homeDir: '',
    initialI18n: null,
    initialSettings: null,
    initialServer: null,
    ...overrides,
  }
}

function electronBootstrap(overrides: Partial<RendererBootstrapSnapshot> = {}): RendererBootstrapSnapshot {
  return {
    runtime: {
      kind: 'electron',
      bridgeVersion: RENDERER_BRIDGE_VERSION,
      capabilities: [...ELECTRON_RENDERER_CAPABILITIES],
    },
    homeDir: '/Users/test',
    initialI18n: null,
    initialSettings: null,
    initialServer: null,
    ...overrides,
  }
}

function installWebBootstrap(bootstrap: RendererBootstrapSnapshot): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __GOBLIN_BOOTSTRAP__: bootstrap,
      location: {
        href: bootstrap.initialServer?.url ?? 'http://127.0.0.1:32100/',
        origin: bootstrap.initialServer?.url?.replace(/\/$/, '') ?? 'http://127.0.0.1:32100',
        search: '',
      },
      matchMedia: vi.fn(() => ({ matches: true })),
    },
  })
}

function testBridge(overrides: Partial<RendererBridge> = {}): RendererBridge {
  return {
    kind: () => 'web',
    hasCapability: () => false,
    getBootstrap: () => electronBootstrap(),
    invokeRpc: vi.fn(),
    abortRpc: vi.fn(async () => false),
    onRpcEvent: () => () => {},
    onEffectIntent: () => () => {},
    pathForFile: () => '',
    shell: () => null,
    terminal: (() => {
      throw new Error('unused terminal bridge')
    }) as never,
    ...overrides,
  }
}

describe('repo-client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    setRendererBridgeForTests(null)
  })

  test('opens repository remote through the native shell bridge when available', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    window.open = vi.fn(() => null)
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openExternalUrl = vi.fn(async () => ({ ok: true, message: 'https://github.com/acme/repo/tree/feature/test' }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        getBootstrap: () => ({
          ...webBootstrap(),
          initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
        }),
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl,
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'https://github.com/acme/repo/tree/feature/test' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { openRepositoryRemote } = await import('#/web/repo-client.ts')
    await expect(openRepositoryRemote('/tmp/repo', 'feature/test')).resolves.toEqual({ ok: true, message: '' })
    expect(openExternalUrl).toHaveBeenCalledWith({
      url: 'https://github.com/acme/repo/tree/feature/test',
      allowHttp: true,
    })
    expect(window.open).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/open-remote',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', branch: 'feature/test' }),
      }),
    )
  })

  test('clones repositories through the embedded server when no Electron bridge exists', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'ok', path: '/tmp/repo' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { cloneRepository } = await import('#/web/repo-client.ts')
    const { hasNativeDirectoryPicker } = await import('#/web/app-shell-client.ts')
    expect(hasNativeDirectoryPicker()).toBe(false)
    await expect(
      cloneRepository({
        operationId: 'op_1',
        url: 'https://example.com/repo.git',
        parentPath: '/tmp',
        directoryName: 'repo',
      }),
    ).resolves.toEqual({ ok: true, message: 'ok', path: '/tmp/repo' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/clone',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
      }),
    )
  })

  test('opens terminal and editor through embedded server routes even when a native shell exists', async () => {
    const openTerminal = vi.fn(async () => ({ ok: true, message: 'native-terminal' }))
    const openEditor = vi.fn(async () => ({ ok: true, message: 'native-editor' }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, message: 'server-terminal' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, message: 'server-editor' }) })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __GOBLIN_BOOTSTRAP__: electronBootstrap({
          initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
        }),
        goblinNative: {
          runtime: {
            kind: 'electron',
            bridgeVersion: RENDERER_BRIDGE_VERSION,
            capabilities: [...ELECTRON_RENDERER_CAPABILITIES],
          },
          homeDir: '/Users/test',
          invokeRpc: vi.fn(),
          abortRpc: async () => true,
          onEvent: () => () => {},
          pathForFile: () => '',
          shell: {
            openSettingsWindow: vi.fn(),
            openExternalUrl: vi.fn(),
            openDirectoryDialog: vi.fn(),
            consumeExternalOpenPaths: vi.fn(),
            openInFinder: vi.fn(),
            openTerminal,
            openEditor,
          },
        },
        location: {
          href: 'http://127.0.0.1:32100/',
          origin: 'http://127.0.0.1:32100',
          search: '',
        },
        matchMedia: vi.fn(() => ({ matches: true })),
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { openRepositoryEditor, openRepositoryTerminal } = await import('#/web/repo-client.ts')
    await expect(openRepositoryTerminal('/tmp/repo')).resolves.toEqual({ ok: true, message: 'server-terminal' })
    await expect(openRepositoryEditor('/tmp/repo')).resolves.toEqual({ ok: true, message: 'server-editor' })
    expect(openTerminal).not.toHaveBeenCalled()
    expect(openEditor).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/open-terminal',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ path: '/tmp/repo' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/open-editor',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ path: '/tmp/repo' }),
      }),
    )
  })

  test('requests repository file tree', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        worktreePath: '/repo',
        dirPath: '/repo/src',
        entries: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { getRepositoryFileTree } = await import('#/web/repo-client.ts')
    const result = await getRepositoryFileTree('/repo', '/repo', '/repo/src')
    expect(result).toEqual({ ok: true, worktreePath: '/repo', dirPath: '/repo/src', entries: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-tree',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', dirPath: '/repo/src' }),
      }),
    )
  })

  test('requests commit message provider availability', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ codex: true, claude: false }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { getCommitMessageProviders } = await import('#/web/repo-client.ts')
    await expect(getCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/commit-message-providers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({}),
      }),
    )
  })

  test('requests generated commit messages through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'feat: generated message' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { generateRepositoryCommitMessage } = await import('#/web/repo-client.ts')
    await expect(generateRepositoryCommitMessage('/repo', '/repo', 'codex')).resolves.toEqual({
      ok: true,
      message: 'feat: generated message',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/generate-commit-message',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', provider: 'codex' }),
      }),
    )
  })

  test('requests branch creation through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'ok' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { createRepositoryBranch } = await import('#/web/repo-client.ts')
    await expect(createRepositoryBranch('/repo', 'feature/new', 'main', undefined, 'source_1')).resolves.toEqual({
      ok: true,
      message: 'ok',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/create-branch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/repo', branch: 'feature/new', baseBranch: 'main', sourceToken: 'source_1' }),
      }),
    )
  })

  test('requests tracking branch creation through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'ok' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { trackRepositoryRemoteBranch } = await import('#/web/repo-client.ts')
    await expect(
      trackRepositoryRemoteBranch('/repo', 'feature/new', 'origin/feature/new', undefined, 'source_1'),
    ).resolves.toEqual({
      ok: true,
      message: 'ok',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/track-remote-branch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          cwd: '/repo',
          localBranch: 'feature/new',
          remoteRef: 'origin/feature/new',
          sourceToken: 'source_1',
        }),
      }),
    )
  })

  test('requests repository file transfer', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/repo/docs/a.txt', kind: 'file' }],
        renamed: [],
        failed: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { transferRepositoryFiles } = await import('#/web/repo-client.ts')
    const result = await transferRepositoryFiles({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/docs',
      source: { kind: 'fileTreePaths', repoId: '/repo', worktreePath: '/repo', paths: ['/repo/a.txt'] },
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/repo/docs/a.txt', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-transfer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          targetDirPath: '/repo/docs',
          source: { kind: 'fileTreePaths', repoId: '/repo', worktreePath: '/repo', paths: ['/repo/a.txt'] },
        }),
      }),
    )
  })

  test('requests repository file export', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
        renamed: [],
        failed: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { exportRepositoryFilesToLocalDirectory } = await import('#/web/repo-client.ts')
    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/Downloads',
      paths: ['/repo/a.txt'],
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-export',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          targetDirPath: '/Downloads',
          paths: ['/repo/a.txt'],
        }),
      }),
    )
  })

  test('requests file tree rename through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: '' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { renameRepositoryFileTreeEntry } = await import('#/web/repo-client.ts')
    await expect(
      renameRepositoryFileTreeEntry('/repo', '/repo', '/repo/README.md', 'README-renamed.md'),
    ).resolves.toEqual({ ok: true, message: '' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-tree/rename',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          oldPath: '/repo/README.md',
          newName: 'README-renamed.md',
        }),
      }),
    )
  })

  test('requests file tree delete through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: '' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deleteRepositoryFileTreeEntries } = await import('#/web/repo-client.ts')
    await expect(deleteRepositoryFileTreeEntries('/repo', '/repo', ['/repo/README.md', '/repo/src'])).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-tree/delete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          paths: ['/repo/README.md', '/repo/src'],
        }),
      }),
    )
  })

  test('requests file tree move through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: '' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { moveRepositoryFileTreeEntries } = await import('#/web/repo-client.ts')
    await expect(
      moveRepositoryFileTreeEntries('/repo', '/repo', ['/repo/README.md', '/repo/src'], '/repo/docs'),
    ).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-tree/move',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          paths: ['/repo/README.md', '/repo/src'],
          targetDirPath: '/repo/docs',
        }),
      }),
    )
  })

  test('requests file tree directory creation through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: '' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { createRepositoryFileTreeDirectory } = await import('#/web/repo-client.ts')
    await expect(createRepositoryFileTreeDirectory('/repo', '/repo', '/repo/src', 'components')).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/file-tree/create-directory',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          parentDirPath: '/repo/src',
          name: 'components',
        }),
      }),
    )
  })

  test('requests repository history and commit detail', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            hash: 'abc123456789',
            shortHash: 'abc1234',
            subject: 'feat: history',
            author: 'Alice',
            date: '2026-06-15T09:00:00+08:00',
            parents: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: 'abc123456789',
          shortHash: 'abc1234',
          subject: 'feat: history',
          author: 'Alice',
          date: '2026-06-15T09:00:00+08:00',
          parents: [],
          files: [],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { getRepositoryCommitDetail, getRepositoryHistory } = await import('#/web/repo-client.ts')
    await expect(getRepositoryHistory('/repo', 'feature/history', { limit: 100, skip: 0 })).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: history',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: [],
      },
    ])
    await expect(getRepositoryCommitDetail('/repo', 'abc1234')).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: history',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/history',
      expect.objectContaining({
        body: JSON.stringify({ repoId: '/repo', branch: 'feature/history', limit: 100, skip: 0 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/commit-detail',
      expect.objectContaining({
        body: JSON.stringify({ repoId: '/repo', commit: 'abc1234' }),
      }),
    )
  })

  test('requests discard selected changes through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: '' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { discardRepositoryChanges } = await import('#/web/repo-client.ts')
    await expect(discardRepositoryChanges('/repo', '/repo', ['src/app.ts', 'docs'])).resolves.toEqual({
      ok: true,
      message: '',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/discard-changes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', paths: ['src/app.ts', 'docs'] }),
      }),
    )
  })
})
