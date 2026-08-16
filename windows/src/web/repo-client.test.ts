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

  test('serializes merge-out plan and execute requests with their abort signals', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, plan: { token: 'sha256:plan', destinations: [] } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const { getRepositoryBranchMergeOutPlan, mergeRepositoryBranchOut } = await import('#/web/repo-client.ts')
    const request = {
      repoId: '/repo',
      sourceBranch: 'feature/source',
      sourceWorktreePath: '/repo-feature',
    }
    const executeInput = {
      ...request,
      planToken: 'sha256:plan',
      destination: { kind: 'local' as const, branch: 'main' },
      mode: 'merge' as const,
    }

    await getRepositoryBranchMergeOutPlan(request, signal)
    await mergeRepositoryBranchOut(executeInput, signal, 'client_123')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/merge-out-plan',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request), signal }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/merge-out',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...executeInput, sourceToken: 'client_123' }),
        signal,
      }),
    )
  })

  test('serializes discriminated merge-in source without collapsing remote identity', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'merged' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const source = { kind: 'remote' as const, remoteRef: 'origin/feature/source' }
    const { mergeRepositoryBranch } = await import('#/web/repo-client.ts')

    await mergeRepositoryBranch('/repo', '/repo-target', source)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/merge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo-target', source }),
      }),
    )
  })

  test('requests invalid worktree cleanup with the selected path and source token', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'pruned' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const repoClient = await import('#/web/repo-client.ts')
    const cleanupRepositoryWorktree = (repoClient as Record<string, unknown>).cleanupRepositoryWorktree
    expect(cleanupRepositoryWorktree).toBeTypeOf('function')

    await expect(
      (
        cleanupRepositoryWorktree as (
          cwd: string,
          worktreePath: string,
          signal?: AbortSignal,
          sourceToken?: string,
        ) => Promise<unknown>
      )('/repo', '/repo-stale', undefined, 'client_123'),
    ).resolves.toEqual({ ok: true, message: 'pruned' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/cleanup-worktree',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cwd: '/repo', worktreePath: '/repo-stale', sourceToken: 'client_123' }),
      }),
    )
  })

  test('opens repository remote through the native shell bridge when available', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    window.open = vi.fn(() => null)
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openExternalUrl = vi.fn(async () => ({ ok: true, message: 'https://github.com/acme/repo' }))
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
      json: async () => ({ ok: true, message: 'https://github.com/acme/repo' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { openRepositoryRemote } = await import('#/web/repo-client.ts')
    await expect(openRepositoryRemote('/tmp/repo')).resolves.toEqual({ ok: true, message: '' })
    expect(openExternalUrl).toHaveBeenCalledWith({
      url: 'https://github.com/acme/repo',
      allowHttp: true,
    })
    expect(window.open).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/open-remote',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo' }),
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
    await expect(
      openRepositoryTerminal({ projectRoot: '/tmp/repo', workingDirectory: '/tmp/repo/worktree' }),
    ).resolves.toEqual({ ok: true, message: 'server-terminal' })
    await expect(openRepositoryEditor('/tmp/repo')).resolves.toEqual({ ok: true, message: 'server-editor' })
    await expect(openRepositoryEditor({ path: '/tmp/repo/src/app.ts', line: 12 })).resolves.toEqual({
      ok: true,
      message: 'server-editor',
    })
    expect(openTerminal).not.toHaveBeenCalled()
    expect(openEditor).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/open-terminal',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ projectRoot: '/tmp/repo', workingDirectory: '/tmp/repo/worktree' }),
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:32100/api/repo/open-editor',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ target: { path: '/tmp/repo/src/app.ts', line: 12 } }),
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

  test('requests setting and removing a branch upstream through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'ok' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const repoClient = await import('#/web/repo-client.ts')
    const setRepositoryBranchUpstream = (repoClient as Record<string, unknown>).setRepositoryBranchUpstream
    expect(setRepositoryBranchUpstream).toBeTypeOf('function')
    const setUpstream = setRepositoryBranchUpstream as (
      cwd: string,
      branch: string,
      remoteRef: string | null,
      signal?: AbortSignal,
      sourceToken?: string,
    ) => Promise<unknown>

    await expect(setUpstream('/repo', 'feature/local', 'origin/release', undefined, 'source_1')).resolves.toEqual({
      ok: true,
      message: 'ok',
    })
    await expect(setUpstream('/repo', 'feature/local', null, undefined, 'source_2')).resolves.toEqual({
      ok: true,
      message: 'ok',
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/set-branch-upstream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          cwd: '/repo',
          branch: 'feature/local',
          remoteRef: 'origin/release',
          sourceToken: 'source_1',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/set-branch-upstream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cwd: '/repo',
          branch: 'feature/local',
          remoteRef: null,
          sourceToken: 'source_2',
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

  test('requests file tree binary read and replace through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, previousBytesBase64: 'CQg=', previousByteLength: 2 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { readRepositoryFileTreeBinaryFile, replaceRepositoryFileTreeBinaryFile } =
      await import('#/web/repo-client.ts')
    await expect(readRepositoryFileTreeBinaryFile('/repo', '/repo', '/repo/image.bin', 30)).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: 'AQID',
    })
    await expect(replaceRepositoryFileTreeBinaryFile('/repo', '/repo', '/repo/image.bin', 'AQI=', 30)).resolves.toEqual(
      {
        ok: true,
        previousBytesBase64: 'CQg=',
        previousByteLength: 2,
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/file-tree/read-binary-file',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          filePath: '/repo/image.bin',
          maxBytes: 30,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/file-tree/replace-binary-file',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({
          repoId: '/repo',
          worktreePath: '/repo',
          filePath: '/repo/image.bin',
          bytesBase64: 'AQI=',
          maxBytes: 30,
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

  test('deletes remote server branch through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'deleted' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deleteRepositoryRemoteBranch } = await import('#/web/repo-client.ts')
    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/delete-remote-branch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', remote: 'origin', branch: 'feature/remove-me' }),
      }),
    )
  })

  test('loads remote tags through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ['origin/v1.0.0'],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { getRepositoryRemoteTags } = await import('#/web/repo-client.ts')
    await expect(getRepositoryRemoteTags('/tmp/repo')).resolves.toEqual(['origin/v1.0.0'])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/remote-tags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo' }),
      }),
    )
  })

  test('loads local tags through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ['v1.0.0'],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { getRepositoryLocalTags } = await import('#/web/repo-client.ts')
    await expect(getRepositoryLocalTags('/tmp/repo')).resolves.toEqual(['v1.0.0'])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/local-tags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo' }),
      }),
    )
  })

  test('creates local tags through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'created' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { createRepositoryLocalTag } = await import('#/web/repo-client.ts')
    await expect(createRepositoryLocalTag('/tmp/repo', 'v1.0.0', 'HEAD')).resolves.toEqual({
      ok: true,
      message: 'created',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/create-local-tag',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', name: 'v1.0.0', ref: 'HEAD' }),
      }),
    )
  })

  test('deletes local tags through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'deleted' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deleteRepositoryLocalTag } = await import('#/web/repo-client.ts')
    await expect(deleteRepositoryLocalTag('/tmp/repo', 'v1.0.0')).resolves.toEqual({
      ok: true,
      message: 'deleted',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/delete-local-tag',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', name: 'v1.0.0' }),
      }),
    )
  })

  test('deletes remote server tag through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'deleted' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deleteRepositoryRemoteTag } = await import('#/web/repo-client.ts')
    await expect(deleteRepositoryRemoteTag('/tmp/repo', 'origin', 'release/v1.0.0')).resolves.toEqual({
      ok: true,
      message: 'deleted',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/delete-remote-tag',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', remote: 'origin', tag: 'release/v1.0.0' }),
      }),
    )
  })
})
