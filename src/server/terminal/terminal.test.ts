import { beforeEach, describe, expect, test, vi } from 'vitest'
import { spawn } from 'node-pty'
import { getWorktrees } from '#/system/git/worktrees.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { buildTmuxServerName, buildTmuxSessionName } from '#/system/tmux-session.ts'
import {
  closeAllServerTerminalSessions,
  closeServerTerminalSessions,
  closeServerTerminal,
  createServerTerminal,
  getServerTerminalOutputExcerpt,
  getServerTerminalSessionSnapshot,
  handleRealtimeServerMessage,
  listServerTerminalSessions,
  openServerTmuxSessions,
  pruneServerTerminals,
  reorderServerTerminals,
  attachServerTerminal,
  registerTerminalSocket,
  restartServerTerminal,
  resizeServerTerminal,
  takeoverServerTerminal,
  unregisterTerminalSocket,
  writeServerTerminal,
} from '#/server/terminal/terminal.ts'

const branchWorkspaceSourceMocks = vi.hoisted(() => ({
  readBranchWorkspaceManifests: vi.fn(),
}))
const tmuxCleanupMocks = vi.hoisted(() => ({
  previewAssociatedTmuxSessions: vi.fn(),
}))

vi.mock('#/server/modules/branch-workspace-source.ts', () => ({
  readBranchWorkspaceManifests: branchWorkspaceSourceMocks.readBranchWorkspaceManifests,
}))

vi.mock('#/server/modules/tmux-cleanup.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/server/modules/tmux-cleanup.ts')>()),
  previewAssociatedTmuxSessions: tmuxCleanupMocks.previewAssociatedTmuxSessions,
}))

vi.mock('#/system/git/worktrees.ts', () => ({
  getWorktrees: vi.fn(async () => [{ path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false }]),
}))

vi.mock('#/system/ssh/config.ts', () => ({
  resolveRemoteTarget: vi.fn(async () => ({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })),
}))

interface MockPty {
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: () => void
  setProcess: (name: string) => void
}

const mockPtys: MockPty[] = []
let autoEmitOnDataSubscribe: string | null = null

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let onData: ((data: string) => void) | null = null
    let onExit: (() => void) | null = null
    let processName = 'zsh'
    const pty: MockPty = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      emitData: (data) => onData?.(data),
      emitExit: () => onExit?.(),
      setProcess: (name) => {
        processName = name
      },
    }
    mockPtys.push(pty)
    return {
      get process() {
        return processName
      },
      write: pty.write,
      resize: pty.resize,
      kill: pty.kill,
      onData: (cb: (data: string) => void) => {
        onData = cb
        if (autoEmitOnDataSubscribe !== null) cb(autoEmitOnDataSubscribe)
        return {
          dispose: vi.fn(() => {
            if (onData === cb) onData = null
          }),
        }
      },
      onExit: (cb: () => void) => {
        onExit = cb
        return {
          dispose: vi.fn(() => {
            if (onExit === cb) onExit = null
          }),
        }
      },
    }
  }),
}))

beforeEach(() => {
  vi.useRealTimers()
  closeAllServerTerminalSessions()
  mockPtys.length = 0
  autoEmitOnDataSubscribe = null
  vi.clearAllMocks()
  vi.mocked(spawn).mockClear()
  branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockReset()
  branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockResolvedValue({ kind: 'missing' })
  tmuxCleanupMocks.previewAssociatedTmuxSessions.mockReset()
  tmuxCleanupMocks.previewAssociatedTmuxSessions.mockResolvedValue({
    ok: true,
    targetPath: '/repo-linked',
    sessions: [],
  })
})

async function createTerminalSession(
  clientId: string,
  overrides: Partial<{
    repoRoot: string
    branch: string
    worktreePath: string
    cols: number
    rows: number
  }> = {},
): Promise<string> {
  const repoRoot = overrides.repoRoot ?? '/repo'
  const worktreePath = overrides.worktreePath ?? '/repo-linked'
  const result = await createServerTerminal(clientId, {
    repoRoot,
    branch: overrides.branch ?? 'feature',
    worktreePath,
    kind: 'additional',
    cols: overrides.cols,
    rows: overrides.rows,
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.message)
  const session = result.sessions.find((item) => item.key === result.key)
  if (!session) throw new Error('missing created terminal session')
  return session.sessionId
}

describe('server terminal sessions', () => {
  test('opens only detached associated tmux sessions in original terminal-number order with one discovery', async () => {
    const serverName = buildTmuxServerName('/repo')!
    const terminalOne = buildTmuxSessionName({
      projectRoot: '/repo',
      workingDirectory: '/repo-linked',
      terminalNumber: 1,
    })!
    const terminalTwo = buildTmuxSessionName({
      projectRoot: '/repo',
      workingDirectory: '/repo-linked',
      terminalNumber: 2,
    })!
    const terminalThree = buildTmuxSessionName({
      projectRoot: '/repo',
      workingDirectory: '/repo-linked',
      terminalNumber: 3,
    })!
    tmuxCleanupMocks.previewAssociatedTmuxSessions.mockResolvedValueOnce({
      ok: true,
      targetPath: '/repo-linked',
      sessions: [
        { sessionName: terminalTwo, initialPath: '/repo-linked', terminalNumber: 2, attachedClients: 0, serverName },
        { sessionName: terminalThree, initialPath: '/repo-linked', terminalNumber: 3, attachedClients: 1 },
        { sessionName: terminalOne, initialPath: '/repo-linked', terminalNumber: 1, attachedClients: 0, serverName },
      ],
    })
    const result = await openServerTmuxSessions('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      attachmentId: 'attachment_1',
      cols: 100,
      rows: 30,
    })

    expect(result).toMatchObject({ ok: true, restored: 2, key: '/repo\0/repo-linked\0terminal-1' })
    if (!result.ok || !('key' in result)) throw new Error('expected detached tmux sessions to be restored')
    expect(result.sessions).toEqual([
      expect.objectContaining({
        key: '/repo\0/repo-linked\0terminal-1',
        tmuxSessionName: terminalOne,
        tmuxCloseSupported: true,
      }),
      expect.objectContaining({
        key: '/repo\0/repo-linked\0terminal-2',
        tmuxSessionName: terminalTwo,
        tmuxCloseSupported: true,
      }),
    ])
    expect(tmuxCleanupMocks.previewAssociatedTmuxSessions).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(spawn).mock.calls.map((call) => (call[1] as string[]).at(-1))).toEqual([
      expect.stringContaining(`tmux -L '${serverName}' attach-session -t '=${terminalOne}'`),
      expect.stringContaining(`tmux -L '${serverName}' attach-session -t '=${terminalTwo}'`),
    ])
  })

  test('falls back to a free internal slot and blocks unsafe tmux closure when the hash no longer matches', async () => {
    const occupied = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
    })
    expect(occupied.ok).toBe(true)
    const terminalOne = buildTmuxSessionName({
      projectRoot: '/repo',
      workingDirectory: '/repo-linked',
      terminalNumber: 1,
    })!
    tmuxCleanupMocks.previewAssociatedTmuxSessions.mockResolvedValueOnce({
      ok: true,
      targetPath: '/repo-linked',
      sessions: [{ sessionName: terminalOne, initialPath: '/repo-linked', terminalNumber: 1, attachedClients: 0 }],
    })
    const result = await openServerTmuxSessions('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
    })

    expect(result).toMatchObject({ ok: true, restored: 1, key: '/repo\0/repo-linked\0terminal-2' })
    if (!result.ok || !('key' in result)) throw new Error('expected a detached tmux session to be restored')
    expect(result.sessions.find((session) => session.key === result.key)).toMatchObject({
      tmuxSessionName: terminalOne,
      tmuxCloseSupported: false,
    })
    const closeTmuxSession = vi.fn()
    await expect(
      closeServerTerminal('client_1', { sessionId: result.sessionId, closeTmuxSession: true }, { closeTmuxSession }),
    ).resolves.toEqual({ ok: false, message: 'terminal.close-tmux-session-exit-required' })
    expect(closeTmuxSession).not.toHaveBeenCalled()
  })

  test('returns a successful no-op when the current directory has no detached associated sessions', async () => {
    const result = await openServerTmuxSessions('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
    })

    expect(result).toEqual({ ok: true, restored: 0, sessions: [] })
    expect(spawn).not.toHaveBeenCalled()
  })

  test('creates one tmux terminal through the ordinary create request without scanning the directory', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      launchMode: 'tmux-if-available',
    })

    expect(result).toMatchObject({ ok: true, key: '/repo\0/repo-linked\0terminal-1' })
    if (!result.ok) return
    expect(result.sessions[0]).toMatchObject({ tmuxBacked: true, tmuxCloseSupported: true })
    expect(tmuxCleanupMocks.previewAssociatedTmuxSessions).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      ['-lc', expect.stringContaining('new-session -d')],
      expect.any(Object),
    )
  })
  test('creates an authorized local branch workspace terminal without resolving Git worktrees', async () => {
    branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockResolvedValue({
      kind: 'ready',
      manifests: [branchWorkspaceManifest('/workspace', '/workspace/goblin-feature')],
    })
    vi.mocked(getWorktrees).mockRejectedValueOnce(new Error('branch workspaces are folder targets'))

    const result = await createServerTerminal('client_1', {
      repoRoot: '/workspace',
      branch: 'feature/auth',
      worktreePath: '/workspace/goblin-feature',
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
      kind: 'primary',
      attachmentId: 'attachment_1',
    })

    expect(result).toMatchObject({
      ok: true,
      key: '/workspace\0/workspace/goblin-feature\0terminal-1',
    })
    expect(getWorktrees).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/workspace/goblin-feature' }),
    )
  })

  test('creates an authorized SSH branch workspace terminal with the persisted folder cwd', async () => {
    branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockResolvedValue({
      kind: 'ready',
      manifests: [branchWorkspaceManifest('ssh-config://prod/srv/repo', '/srv/repo/goblin-feature')],
    })

    const result = await createServerTerminal('client_1', {
      repoRoot: 'ssh-config://prod/srv/repo',
      branch: 'feature/auth',
      worktreePath: '/srv/repo/goblin-feature',
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
      kind: 'primary',
      attachmentId: 'attachment_1',
    })

    expect(result).toMatchObject({
      ok: true,
      key: 'ssh-config://prod/srv/repo\0/srv/repo/goblin-feature\0terminal-1',
    })
    const sshArgs = vi.mocked(spawn).mock.calls[0]?.[1] as string[]
    expect(sshArgs[7]).toContain('/srv/repo/goblin-feature')
  })

  test.each([
    {
      label: 'unknown manifest id',
      branchWorkspaceId: 'branch-missing',
      worktreePath: '/workspace/goblin-feature',
      operation: undefined,
    },
    {
      label: 'mismatched persisted path',
      branchWorkspaceId: 'branch-1',
      worktreePath: '/workspace/goblin-other',
      operation: undefined,
    },
    {
      label: 'delete-incomplete workspace',
      branchWorkspaceId: 'branch-1',
      worktreePath: '/workspace/goblin-feature',
      operation: { kind: 'remove' as const, phase: 'failed' as const, startedAt: '2026-07-21T00:00:00.000Z' },
    },
  ])('rejects an unauthorized branch workspace terminal: $label', async (fixture) => {
    branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockResolvedValue({
      kind: 'ready',
      manifests: [
        {
          ...branchWorkspaceManifest('/workspace', '/workspace/goblin-feature'),
          ...(fixture.operation ? { operation: fixture.operation } : {}),
        },
      ],
    })

    const result = await createServerTerminal('client_1', {
      repoRoot: '/workspace',
      branch: 'feature/auth',
      worktreePath: fixture.worktreePath,
      targetKind: 'branch-workspace',
      branchWorkspaceId: fixture.branchWorkspaceId,
      kind: 'primary',
      attachmentId: 'attachment_1',
    })

    expect(result).toEqual({ ok: false, message: 'workspace.branch-workspace.terminal-unavailable' })
    expect(spawn).not.toHaveBeenCalled()
  })

  test('administratively closes sessions across owners and broadcasts every affected scope', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('observer', 'attachment_a', socket)
    const first = await createTerminalSession('client_a', {
      repoRoot: '/workspace',
      worktreePath: '/repo-linked',
    })
    const second = await createTerminalSession('client_b', {
      repoRoot: '/workspace/api',
      worktreePath: '/repo-linked',
    })
    socket.send.mockClear()

    expect(closeServerTerminalSessions([first, second, 'term_missing_1234'])).toEqual({
      closed: [first, second],
      missing: ['term_missing_1234'],
    })
    const messages = socket.send.mock.calls.map(([payload]) => JSON.parse(payload))
    expect(messages).toEqual(
      expect.arrayContaining([
        { type: 'sessions-changed', repoRoot: '/workspace' },
        { type: 'sessions-changed', repoRoot: '/workspace/api' },
      ]),
    )
    await expect(listServerTerminalSessions('client_a', '/workspace')).resolves.toEqual([])
    await expect(listServerTerminalSessions('client_b', '/workspace/api')).resolves.toEqual([])
  })

  test('create claims controller ownership for the provided attachment', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)

    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toEqual([
      expect.objectContaining({
        key: result.key,
        controller: { attachmentId: 'attachment_a', status: 'connected' },
        cols: 80,
        rows: 24,
      }),
    ])

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('create returns an authoritative first frame with measured geometry', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)

    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      cols: 132,
      rows: 41,
      attachmentId: 'attachment_a',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 132, rows: 41 }),
    )
    expect(result).toMatchObject({
      sessionId: expect.any(String),
      processName: 'zsh',
      canonicalTitle: null,
      snapshot: expect.any(String),
      snapshotSeq: expect.any(Number),
      controller: { attachmentId: 'attachment_a', status: 'connected' },
      canonicalCols: 132,
      canonicalRows: 41,
      phase: 'open',
      message: null,
    })
    expect(result.sessions).toContainEqual(
      expect.objectContaining({
        sessionId: result.sessionId,
        phase: 'open',
        message: null,
      }),
    )

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('creates remote terminal sessions with a plain ssh command by default', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: 'ssh-config://prod/srv/repo',
      branch: 'feature',
      worktreePath: '/srv/repo-feature',
      kind: 'additional',
      cols: 100,
      rows: 30,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions.find((session) => session.sessionId === result.sessionId)?.tmuxBacked).toBe(false)
    expect(spawn).toHaveBeenCalledWith(
      'ssh',
      [
        '-tt',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'ConnectTimeout=10',
        '--',
        'prod',
        expect.stringContaining('exec "${SHELL:-/bin/sh}" -l'),
      ],
      expect.objectContaining({
        cwd: process.cwd(),
        cols: 100,
        rows: 30,
      }),
    )
    const args = vi.mocked(spawn).mock.calls[0]![1] as string[]
    expect(args[7]).toContain('/srv/repo-feature')
    expect(args[7]).not.toContain('tmux')
    expect(args[7]).not.toContain('alice@example.com')
    expect(args[7]).not.toContain('/srv/repo\u0000')
  })

  test('creates non-git local workspace terminal without resolving git worktrees', async () => {
    vi.mocked(getWorktrees).mockRejectedValueOnce(new Error('not a git repo'))

    const result = await createServerTerminal('client_1', {
      repoRoot: '/plain-project',
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/plain-project',
      kind: 'additional',
      cols: 120,
      rows: 40,
    })

    expect(result.ok).toBe(true)
    expect(getWorktrees).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: '/plain-project',
        cols: 120,
        rows: 40,
      }),
    )
    if (!result.ok) return
    expect(result.key).toBe('/plain-project\u0000/plain-project\u0000terminal-1')
  })

  test('creates git terminal when repo root input needs path normalization', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo/',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      cols: 120,
      rows: 40,
    })

    expect(result.ok).toBe(true)
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: '/repo-linked',
        cols: 120,
        rows: 40,
      }),
    )
  })

  test('creates remote terminal sessions with the native login shell by default', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: 'ssh-config://prod/srv/repo',
      branch: 'feature',
      worktreePath: '/srv/repo-feature',
      kind: 'additional',
      cols: 100,
      rows: 30,
    })

    expect(result.ok).toBe(true)
    const args = vi.mocked(spawn).mock.calls[0]![1] as string[]
    expect(args[7]).toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(args[7]).not.toContain('tmux new-session -A')
  })

  test('creates remote terminal sessions with a tmux-aware ssh command when explicitly requested', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: 'ssh-config://prod/srv/repo',
      branch: 'feature',
      worktreePath: '/srv/repo-feature',
      kind: 'additional',
      launchMode: 'tmux-if-available',
      cols: 100,
      rows: 30,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions.find((session) => session.sessionId === result.sessionId)?.tmuxBacked).toBe(true)
    expect(spawn).toHaveBeenCalledWith(
      'ssh',
      [
        '-tt',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'ConnectTimeout=10',
        '--',
        'prod',
        expect.stringContaining('new-session -d'),
      ],
      expect.objectContaining({
        cwd: process.cwd(),
        cols: 100,
        rows: 30,
      }),
    )
    const args = vi.mocked(spawn).mock.calls[0]![1] as string[]
    expect(args[7]).toContain('/srv/repo-feature')
    expect(args[7]).toContain('new-session -d')
    expect(args[7]).toContain('Use New terminal (Native).')
    expect(args[7]).toContain('hobgoblin-v1-')
    expect(args[7]).not.toContain("-s 'goblin-")
    expect(args[7]).not.toContain('alice@example.com')
    expect(args[7]).not.toContain('/srv/repo\u0000')
  })

  test('creates local terminal sessions with the native login shell by default', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
      cols: 100,
      rows: 30,
    })

    expect(result.ok).toBe(true)
    expect(spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-l'],
      expect.objectContaining({ cwd: '/repo-linked', cols: 100, rows: 30 }),
    )
  })

  test('creates local terminal sessions with the tmux identity protocol when explicitly requested', async () => {
    const result = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
      launchMode: 'tmux-if-available',
      cols: 100,
      rows: 30,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions.find((session) => session.sessionId === result.sessionId)?.tmuxBacked).toBe(true)
    const expectedName = buildTmuxSessionName({
      projectRoot: '/repo',
      workingDirectory: '/repo-linked',
      terminalNumber: 1,
    })
    expect(spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', expect.stringContaining(`new-session -d -s '${expectedName}' -c '/repo-linked'`)],
      expect.objectContaining({ cwd: '/repo-linked', cols: 100, rows: 30 }),
    )
  })

  test('closes a checked terminal through its private exact tmux identity', async () => {
    const created = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
      launchMode: 'tmux-if-available',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const closeTmuxSession = vi.fn(async () => ({ ok: true as const, status: 'closed' as const }))

    await expect(
      closeServerTerminal('client_1', { sessionId: created.sessionId, closeTmuxSession: true }, { closeTmuxSession }),
    ).resolves.toEqual({ ok: true })
    expect(closeTmuxSession).toHaveBeenCalledWith({
      projectRoot: '/repo',
      itemPath: '/repo-linked',
      sessionName: buildTmuxSessionName({
        projectRoot: '/repo',
        workingDirectory: '/repo-linked',
        terminalNumber: 1,
      }),
    })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([])
  })

  test('keeps the internal terminal when checked tmux close fails', async () => {
    const created = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
      launchMode: 'tmux-if-available',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await expect(
      closeServerTerminal(
        'client_1',
        { sessionId: created.sessionId, closeTmuxSession: true },
        { closeTmuxSession: vi.fn(async () => ({ ok: false as const, message: 'permission denied' })) },
      ),
    ).resolves.toEqual({ ok: false, message: 'permission denied' })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toContainEqual(
      expect.objectContaining({ sessionId: created.sessionId }),
    )
  })

  test('does not probe tmux for unchecked close and rejects checked close without tmux identity', async () => {
    const plain = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
    })
    expect(plain.ok).toBe(true)
    if (!plain.ok) return
    const closeTmuxSession = vi.fn()

    await expect(
      closeServerTerminal('client_1', { sessionId: plain.sessionId }, { closeTmuxSession }),
    ).resolves.toEqual({ ok: true })
    expect(closeTmuxSession).not.toHaveBeenCalled()

    const anotherPlain = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'primary',
    })
    expect(anotherPlain.ok).toBe(true)
    if (!anotherPlain.ok) return
    await expect(
      closeServerTerminal(
        'client_1',
        { sessionId: anotherPlain.sessionId, closeTmuxSession: true },
        { closeTmuxSession },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.terminal-tmux-unavailable' })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toContainEqual(
      expect.objectContaining({ sessionId: anotherPlain.sessionId }),
    )
  })

  test('uses the persisted remote branch workspace path for the session key and tmux identity', async () => {
    branchWorkspaceSourceMocks.readBranchWorkspaceManifests.mockResolvedValue({
      kind: 'ready',
      manifests: [branchWorkspaceManifest('ssh-config://prod/srv/repo', '/srv/repo/goblin-feature')],
    })

    const result = await createServerTerminal('client_1', {
      repoRoot: 'ssh-config://prod/srv/repo',
      branch: 'feature/auth',
      worktreePath: '/srv/repo/./goblin-feature',
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
      kind: 'primary',
      launchMode: 'tmux-if-available',
    })

    expect(result).toMatchObject({
      ok: true,
      key: 'ssh-config://prod/srv/repo\0/srv/repo/goblin-feature\0terminal-1',
    })
    const expectedName = buildTmuxSessionName({
      projectRoot: '/srv/repo',
      workingDirectory: '/srv/repo/goblin-feature',
      terminalNumber: 1,
    })
    const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[]
    expect(args[7]).toContain(expectedName)
    expect(args[7]).toContain('/srv/repo/goblin-feature')
    expect(args[7]).not.toContain('/srv/repo/./goblin-feature')
  })

  test('reuses the smallest missing terminal number for additional sessions', async () => {
    const first = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.key).toBe('/repo\u0000/repo-linked\u0000terminal-1')
    const firstSession = first.sessions.find((session) => session.key === first.key)
    expect(firstSession).toBeTruthy()
    if (!firstSession) return

    const second = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.key).toBe('/repo\u0000/repo-linked\u0000terminal-2')

    await expect(closeServerTerminal('client_1', { sessionId: firstSession.sessionId })).resolves.toEqual({ ok: true })

    const reopened = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
    })
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.key).toBe('/repo\u0000/repo-linked\u0000terminal-1')
  })

  test('prune keeps sessions when authoritative worktree read is empty', async () => {
    const sessionId = await createTerminalSession('client_1')
    vi.mocked(getWorktrees).mockResolvedValueOnce([])

    await expect(pruneServerTerminals('client_1', '/repo')).resolves.toEqual({
      pruned: 0,
      remaining: 1,
    })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
      expect.objectContaining({ sessionId, key: '/repo\u0000/repo-linked\u0000terminal-1' }),
    ])
    expect(getWorktrees).toHaveBeenLastCalledWith('/repo', { includeStatus: false })
  })

  test('prune closes only sessions missing from authoritative worktree paths', async () => {
    vi.mocked(getWorktrees).mockResolvedValue([
      { path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false },
      { path: '/repo-other', branch: 'other', isBare: false, isPrimary: false },
    ])
    const keptSessionId = await createTerminalSession('client_1', {
      branch: 'feature',
      worktreePath: '/repo-linked',
    })
    const prunedSessionId = await createTerminalSession('client_1', {
      branch: 'other',
      worktreePath: '/repo-other',
    })
    vi.mocked(getWorktrees).mockResolvedValueOnce([
      { path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false },
    ])

    await expect(pruneServerTerminals('client_1', '/repo')).resolves.toEqual({ pruned: 1, remaining: 1 })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
      expect.objectContaining({ sessionId: keptSessionId, key: '/repo\u0000/repo-linked\u0000terminal-1' }),
    ])
    expect(mockPtys[1]?.kill).toHaveBeenCalledTimes(1)
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.not.toContainEqual(
      expect.objectContaining({ sessionId: prunedSessionId }),
    )
  })

  test('clears stale canonical title when the foreground process returns to the shell without a new title', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(attached.ok).toBe(true)
    mockPtys[0]?.setProcess('devin')
    mockPtys[0]?.emitData('\u001b]0;Devin — reviewing repo\u0007')
    await vi.waitFor(async () => {
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: 'devin',
          canonicalTitle: 'Devin — reviewing repo',
        }),
      ])
    })

    mockPtys[0]?.setProcess('zsh')
    mockPtys[0]?.emitData('$ ')
    await vi.waitFor(async () => {
      const titleMessages = socket.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .filter((message) => message.type === 'title')
      expect(titleMessages.at(-1)).toMatchObject({
        type: 'title',
        event: {
          sessionId,
          canonicalTitle: null,
        },
      })
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: 'zsh',
          canonicalTitle: null,
        }),
      ])
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('does not clear canonical title when shell return output includes an explicit unchanged title update', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(attached.ok).toBe(true)
    mockPtys[0]?.setProcess('devin')
    mockPtys[0]?.emitData('\u001b]0;Devin — reviewing repo\u0007')
    await vi.waitFor(async () => {
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: 'devin',
          canonicalTitle: 'Devin — reviewing repo',
        }),
      ])
    })

    socket.send.mockClear()
    mockPtys[0]?.setProcess('zsh')
    mockPtys[0]?.emitData('\u001b]0;Devin — reviewing repo\u0007$ ')
    await vi.waitFor(async () => {
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: 'zsh',
          canonicalTitle: 'Devin — reviewing repo',
        }),
      ])
    })
    expect(
      socket.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .filter((message) => message.type === 'title'),
    ).toEqual([])

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('clears stale canonical title when the shell process name includes a path', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(attached.ok).toBe(true)
    mockPtys[0]?.setProcess('devin')
    mockPtys[0]?.emitData('\u001b]0;Devin — reviewing repo\u0007')
    await vi.waitFor(async () => {
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: 'devin',
          canonicalTitle: 'Devin — reviewing repo',
        }),
      ])
    })

    mockPtys[0]?.setProcess('/bin/bash')
    mockPtys[0]?.emitData('$ ')
    await vi.waitFor(async () => {
      const titleMessages = socket.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .filter((message) => message.type === 'title')
      expect(titleMessages.at(-1)).toMatchObject({
        type: 'title',
        event: {
          sessionId,
          canonicalTitle: null,
        },
      })
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          processName: '/bin/bash',
          canonicalTitle: null,
        }),
      ])
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('broadcasts output and exit events to registered web terminal sockets', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const result = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    mockPtys[0]?.emitData('hello')
    const outputMessage = socket.send.mock.calls
      .map(([payload]) => JSON.parse(String(payload)))
      .find((message) => message.type === 'output')
    expect(outputMessage).toMatchObject({
      type: 'output',
      event: { data: 'hello', seq: 1, processName: 'zsh' },
    })

    mockPtys[0]?.emitExit()
    const exitMessage = socket.send.mock.calls
      .map(([payload]) => JSON.parse(String(payload)))
      .find((message) => message.type === 'exit')
    expect(exitMessage).toMatchObject({
      type: 'exit',
      event: { sessionId: expect.any(String) },
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('rejects terminal reorder requests with duplicate keys', async () => {
    await createTerminalSession('client_1')
    await createTerminalSession('client_1')
    await createTerminalSession('client_1')

    const sessionsBefore = await listServerTerminalSessions('client_1', '/repo')
    expect(sessionsBefore).toHaveLength(3)

    const result = reorderServerTerminals('client_1', {
      repoRoot: '/repo',
      worktreePath: '/repo-linked',
      orderedKeys: [sessionsBefore[0]!.key, sessionsBefore[1]!.key, sessionsBefore[1]!.key],
    })

    expect(result).toBe(false)
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual(sessionsBefore)
  })

  test('sends attach response before flushing buffered output emitted during the attach request', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')
    socket.send.mockClear()

    handleRealtimeServerMessage(
      'client_1',
      'attachment_a',
      socket,
      JSON.stringify({
        type: 'request',
        requestId: 'req_attach',
        action: 'attach',
        input: { sessionId, cols: 80, rows: 24 },
      }),
    )
    mockPtys[0]?.emitData('during-attach')

    await vi.waitFor(() => {
      expect(socket.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'response')).toBe(true)
      expect(socket.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'output')).toBe(true)
    })

    const messages = socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)))
    const responseIndex = messages.findIndex((message) => message.type === 'response')
    const outputIndex = messages.findIndex((message) => message.type === 'output')
    expect(responseIndex).toBeGreaterThanOrEqual(0)
    expect(outputIndex).toBeGreaterThan(responseIndex)
    expect(messages[responseIndex]).toMatchObject({
      type: 'response',
      requestId: 'req_attach',
      ok: true,
      action: 'attach',
      payload: {
        ok: true,
        sessionId,
      },
    })
    expect(messages[outputIndex]).toMatchObject({
      type: 'output',
      event: {
        sessionId,
        data: 'during-attach',
        seq: 1,
        processName: 'zsh',
      },
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('sends create response before flushing buffered output emitted during the create request', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    autoEmitOnDataSubscribe = 'during-create'

    handleRealtimeServerMessage(
      'client_1',
      'attachment_a',
      socket,
      JSON.stringify({
        type: 'request',
        requestId: 'req_create',
        action: 'create',
        input: {
          repoRoot: '/repo',
          branch: 'feature',
          worktreePath: '/repo-linked',
          kind: 'additional',
          cols: 80,
          rows: 24,
        },
      }),
    )

    await vi.waitFor(() => {
      expect(socket.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'response')).toBe(true)
      expect(socket.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'output')).toBe(true)
    })

    const messages = socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)))
    const responseIndex = messages.findIndex((message) => message.type === 'response')
    const outputIndex = messages.findIndex((message) => message.type === 'output')
    expect(responseIndex).toBeGreaterThanOrEqual(0)
    expect(outputIndex).toBeGreaterThan(responseIndex)
    expect(messages[responseIndex]).toMatchObject({
      type: 'response',
      requestId: 'req_create',
      ok: true,
      action: 'create',
      payload: {
        ok: true,
        sessionId: expect.any(String),
      },
    })
    const sessionId = messages[responseIndex]?.payload?.sessionId
    expect(messages[outputIndex]).toMatchObject({
      type: 'output',
      event: {
        sessionId,
        data: 'during-create',
        seq: 1,
        processName: 'zsh',
      },
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('drops buffered attach output when the socket disconnects before the paused request resumes', async () => {
    const socket = {
      send: vi.fn(() => {
        throw new Error('socket closed')
      }),
      close: vi.fn(),
    }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')
    socket.send.mockClear()

    handleRealtimeServerMessage(
      'client_1',
      'attachment_a',
      socket,
      JSON.stringify({
        type: 'request',
        requestId: 'req_attach_closed',
        action: 'attach',
        input: { sessionId, cols: 80, rows: 24 },
      }),
    )
    mockPtys[0]?.emitData('during-attach')
    unregisterTerminalSocket('client_1', 'attachment_a', socket)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(socket.send).toHaveBeenCalledTimes(1)
  })

  test('deactivates the buffered socket when sending the attach response fails', async () => {
    const socket = {
      send: vi.fn(() => {
        throw new Error('socket closed')
      }),
      close: vi.fn(),
    }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')
    socket.send.mockClear()

    handleRealtimeServerMessage(
      'client_1',
      'attachment_a',
      socket,
      JSON.stringify({
        type: 'request',
        requestId: 'req_attach_send_fail',
        action: 'attach',
        input: { sessionId, cols: 80, rows: 24 },
      }),
    )
    mockPtys[0]?.emitData('during-attach')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(socket.send).toHaveBeenCalledTimes(1)
    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('persists terminal titles on the server and broadcasts title updates', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(attached.ok).toBe(true)
    mockPtys[0]?.emitData('\u001b]0;~/Developer/goblin — npm run dev\u0007')
    await vi.waitFor(async () => {
      const titleMessage = socket.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .find((message) => message.type === 'title')
      expect(titleMessage).toMatchObject({
        type: 'title',
        event: {
          sessionId,
          canonicalTitle: '~/Developer/goblin — npm run dev',
        },
      })
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          canonicalTitle: '~/Developer/goblin — npm run dev',
        }),
      ])
    })

    const reattached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })
    expect(reattached).toMatchObject({
      ok: true,
      sessionId,
      canonicalTitle: '~/Developer/goblin — npm run dev',
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('reassembles terminal title updates that arrive across multiple pty chunks', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(attached.ok).toBe(true)
    mockPtys[0]?.emitData('\u001b]0;~/Developer/gob')
    mockPtys[0]?.emitData('lin — npm run dev\u0007')
    await vi.waitFor(async () => {
      const titleMessage = socket.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .findLast((message) => message.type === 'title')
      expect(titleMessage).toMatchObject({
        type: 'title',
        event: {
          sessionId,
          canonicalTitle: '~/Developer/goblin — npm run dev',
        },
      })
      await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
        expect.objectContaining({
          sessionId,
          canonicalTitle: '~/Developer/goblin — npm run dev',
        }),
      ])
    })

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('keeps sessions alive during the reconnect grace period and reuses them after a second attach', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    const sessionId = await createTerminalSession('client_1')

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })
    expect(first.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    mockPtys[0]?.emitData('chat-1\r\nchat-2\r\n')
    mockPtys[0]?.emitData('\u001b[?1049hresume menu')
    await new Promise((resolve) => setTimeout(resolve, 0))

    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_b', socketB)
    const attachedAgain = await attachServerTerminal('client_1', {
      sessionId,
      cols: 100,
      rows: 30,
      attachmentId: 'attachment_b',
    })

    expect(attachedAgain.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    if (!first.ok || !attachedAgain.ok) return
    expect(attachedAgain.sessionId).toBe(first.sessionId)
    expect(attachedAgain.snapshot).toContain('\u001b[?1049h')
    expect(attachedAgain.snapshot).toContain('resume menu')
    expect(attachedAgain.snapshotSeq).toBe(2)
    expect(mockPtys[0]?.resize).toHaveBeenCalledWith(100, 30)

    mockPtys[0]?.emitData('resumed')
    const outputMessage = socketB.send.mock.calls
      .map(([payload]) => JSON.parse(String(payload)))
      .find((message) => message.type === 'output')
    expect(outputMessage).toMatchObject({
      type: 'output',
      event: { sessionId: first.sessionId, data: 'resumed', seq: 3, processName: 'zsh' },
    })

    unregisterTerminalSocket('client_1', 'attachment_b', socketB)
  })

  test('attaching a different view after controller disconnect auto-claims control', async () => {
    vi.useFakeTimers()
    const socketA = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    const sessionId = await createTerminalSession('client_1')

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    await vi.advanceTimersByTimeAsync(30_000 + 1)

    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_b', socketB)
    const attachedAgain = await attachServerTerminal('client_1', {
      sessionId,
      cols: 100,
      rows: 30,
      attachmentId: 'attachment_b',
    })

    expect(attachedAgain.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    if (!attachedAgain.ok) return
    expect(attachedAgain.sessionId).toBe(first.sessionId)
    expect(attachedAgain.controller).toEqual({ attachmentId: 'attachment_b', status: 'connected' })
    expect(attachedAgain.canonicalCols).toBe(100)
    expect(attachedAgain.canonicalRows).toBe(30)
    expect(mockPtys[0]?.resize).toHaveBeenCalledWith(100, 30)

    unregisterTerminalSocket('client_1', 'attachment_b', socketB)
  })

  test('claims control when the first attachment socket connects after attach completes', async () => {
    const sessionId = await createTerminalSession('client_1')

    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 100,
      rows: 30,
      attachmentId: 'attachment_a',
    })

    expect(attached.ok).toBe(true)
    if (!attached.ok) return
    expect(attached.controller).toBeNull()
    expect(attached.canonicalCols).toBe(80)
    expect(attached.canonicalRows).toBe(24)
    expect(mockPtys[0]?.resize).not.toHaveBeenCalledWith(100, 30)

    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)

    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
      expect.objectContaining({
        sessionId,
        controller: { attachmentId: 'attachment_a', status: 'connected' },
        cols: 100,
        rows: 30,
      }),
    ])
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(100, 30)
    expect(
      socket.send.mock.calls.some(([payload]) => {
        const parsed = JSON.parse(String(payload))
        return (
          parsed.type === 'ownership' &&
          parsed.event.sessionId === sessionId &&
          parsed.event.controller?.attachmentId === 'attachment_a' &&
          parsed.event.controller?.status === 'connected' &&
          parsed.event.cols === 100 &&
          parsed.event.rows === 30
        )
      }),
    ).toBe(true)

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('broadcasts terminal events to all sockets registered for the same web terminal client id', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    registerTerminalSocket('client_1', 'attachment_b', socketB)
    const sessionId = await createTerminalSession('client_1')

    const result = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    mockPtys[0]?.emitData('hello')
    expect(socketA.close).not.toHaveBeenCalled()
    expect(socketB.close).not.toHaveBeenCalled()
    expect(socketA.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'output')).toBe(true)
    expect(socketB.send.mock.calls.some(([payload]) => JSON.parse(String(payload)).type === 'output')).toBe(true)
    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    unregisterTerminalSocket('client_1', 'attachment_b', socketB)
  })

  test('restarts an existing session by session id without creating a second terminal record', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')
    const attached = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(attached.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)

    const restarted = await restartServerTerminal('client_1', {
      sessionId,
      cols: 100,
      rows: 30,
      attachmentId: 'attachment_a',
    })

    expect(restarted.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(2)
    if (!restarted.ok) return
    expect(restarted.sessionId).toBe(sessionId)
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toEqual([
      expect.objectContaining({ sessionId, cols: 100, rows: 30 }),
    ])

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('lists repo sessions across clients and broadcasts lifecycle invalidations globally', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    registerTerminalSocket('client_2', 'attachment_b', socketB)
    const sessionId = await createTerminalSession('client_1')

    const result = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    await expect(listServerTerminalSessions('client_2', '/repo')).resolves.toEqual([
      expect.objectContaining({
        sessionId: expect.any(String),
        key: '/repo\u0000/repo-linked\u0000terminal-1',
        cwd: '/repo-linked',
        processName: 'zsh',
        cols: 80,
        rows: 24,
      }),
    ])
    if (!result.ok) throw new Error('expected terminal attach to succeed')
    await expect(getServerTerminalSessionSnapshot('client_2', { sessionId: result.sessionId })).resolves.toEqual(
      expect.objectContaining({
        sessionId: result.sessionId,
        snapshot: expect.any(String),
        snapshotSeq: expect.any(Number),
      }),
    )
    expect(
      socketB.send.mock.calls.some(([payload]) => {
        const parsed = JSON.parse(String(payload))
        return parsed.type === 'sessions-changed' && parsed.repoRoot === '/repo'
      }),
    ).toBe(true)

    mockPtys[0]?.emitExit()
    expect(
      socketB.send.mock.calls.some(([payload]) => {
        const parsed = JSON.parse(String(payload))
        return parsed.type === 'sessions-changed' && parsed.repoRoot === '/repo'
      }),
    ).toBe(true)

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    unregisterTerminalSocket('client_2', 'attachment_b', socketB)
  })

  test('returns a bounded canonical output excerpt for a valid server session', async () => {
    const sessionId = await createTerminalSession('client_1')
    mockPtys[0]?.emitData('build passed')

    await expect(getServerTerminalOutputExcerpt({ sessionId, maxCharacters: 400 })).resolves.toMatchObject({
      sessionId,
      output: 'build passed',
      sequence: 1,
    })
    await expect(getServerTerminalOutputExcerpt({ sessionId: 'invalid', maxCharacters: 400 })).resolves.toBeNull()
    await expect(getServerTerminalOutputExcerpt({ sessionId, maxCharacters: 4_097 })).resolves.toBeNull()
  })

  test('cleans up disconnected sessions after the reconnect grace period elapses', async () => {
    vi.useFakeTimers()
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
    })
    expect(first.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1)
    await vi.runOnlyPendingTimersAsync()
    await Promise.resolve()

    const socket2 = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_b', socket2)
    const recreatedSessionId = await createTerminalSession('client_1')
    const replacementAttach = await attachServerTerminal('client_1', {
      sessionId: recreatedSessionId,
      cols: 80,
      rows: 24,
    })

    expect(replacementAttach.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(2)
    if (!first.ok || !replacementAttach.ok) return
    expect(replacementAttach.sessionId).not.toBe(first.sessionId)

    unregisterTerminalSocket('client_1', 'attachment_b', socket2)
  })

  test('keeps inactive attachments from stealing terminal size until they become active again', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1')

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(first.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(
      resizeServerTerminal('client_1', {
        sessionId: first.ok ? first.sessionId : '',
        cols: 90,
        rows: 28,
        attachmentId: 'attachment_a',
      }),
    ).toBe(true)
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(90, 28)

    const second = await attachServerTerminal('client_1', {
      sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })
    expect(second.ok).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(90, 28)

    if (!first.ok || !second.ok) return
    expect(
      resizeServerTerminal('client_1', {
        sessionId: first.sessionId,
        cols: 120,
        rows: 40,
        attachmentId: 'attachment_b',
      }),
    ).toBe(false)
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(90, 28)

    expect(
      writeServerTerminal('client_1', { sessionId: first.sessionId, data: 'ls', attachmentId: 'attachment_b' }),
    ).toBe(false)
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(90, 28)

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('denies connected viewer write and resize until takeover', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    registerTerminalSocket('client_1', 'attachment_b', socketB)

    const created = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      cols: 90,
      rows: 28,
      attachmentId: 'attachment_a',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const joined = await attachServerTerminal('client_1', {
      sessionId: created.sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })
    expect(joined.ok).toBe(true)

    expect(
      resizeServerTerminal('client_1', {
        sessionId: created.sessionId,
        cols: 120,
        rows: 40,
        attachmentId: 'attachment_b',
      }),
    ).toBe(false)
    expect(
      writeServerTerminal('client_1', { sessionId: created.sessionId, data: 'ls', attachmentId: 'attachment_b' }),
    ).toBe(false)
    expect(mockPtys[0]?.resize).not.toHaveBeenCalledWith(120, 40)

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    unregisterTerminalSocket('client_1', 'attachment_b', socketB)
  })

  test('reports canonical attachment state when another attachment joins without taking control', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1', { cols: 90, rows: 28 })

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 90,
      rows: 28,
      attachmentId: 'attachment_a',
    })
    const second = await attachServerTerminal('client_1', {
      sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.controller).toEqual({ attachmentId: 'attachment_a', status: 'connected' })
    expect(second.canonicalCols).toBe(90)
    expect(second.canonicalRows).toBe(28)
    expect(mockPtys[0]?.resize).not.toHaveBeenCalledWith(120, 40)

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('takeover returns authoritative ownership snapshot from the server', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    const socketB = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    const sessionId = await createTerminalSession('client_1')
    registerTerminalSocket('client_1', 'attachment_b', socketB)

    const result = takeoverServerTerminal('client_1', {
      sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })

    expect(result).toEqual({
      ok: true,
      sessionId,
      role: 'controller',
      controllerStatus: 'connected',
      controller: { attachmentId: 'attachment_b', status: 'connected' },
      canonicalCols: 120,
      canonicalRows: 40,
      phase: 'open',
    })
    expect(mockPtys[0]?.resize).toHaveBeenLastCalledWith(120, 40)
    expect(writeServerTerminal('client_1', { sessionId, data: 'pwd', attachmentId: 'attachment_b' })).toBe(true)
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(mockPtys[0]?.write).toHaveBeenCalledWith('pwd')

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
    unregisterTerminalSocket('client_1', 'attachment_b', socketB)
  })

  test('takeover from a disconnected attachment does not steal control or resize canonical size', async () => {
    const socketA = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socketA)
    const sessionId = await createTerminalSession('client_1')

    const first = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(first.ok).toBe(true)

    const joined = await attachServerTerminal('client_1', {
      sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })
    expect(joined.ok).toBe(true)
    expect(mockPtys[0]?.resize).not.toHaveBeenCalledWith(120, 40)

    const result = takeoverServerTerminal('client_1', {
      sessionId,
      cols: 120,
      rows: 40,
      attachmentId: 'attachment_b',
    })

    expect(result).toEqual({
      ok: false,
      message: 'error.unavailable',
    })
    expect(mockPtys[0]?.resize).not.toHaveBeenCalledWith(120, 40)

    unregisterTerminalSocket('client_1', 'attachment_a', socketA)
  })

  test('restart failure keeps the session listed in error phase', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const created = await createServerTerminal('client_1', {
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/repo-linked',
      kind: 'additional',
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    vi.mocked(spawn).mockImplementationOnce(() => {
      throw new Error('spawn failed')
    })

    const restarted = await restartServerTerminal('client_1', {
      sessionId: created.sessionId,
      cols: 100,
      rows: 30,
      attachmentId: 'attachment_a',
    })

    expect(restarted).toEqual({ ok: false, message: 'spawn failed' })
    await expect(listServerTerminalSessions('client_1', '/repo')).resolves.toContainEqual(
      expect.objectContaining({
        sessionId: created.sessionId,
        phase: 'error',
        message: 'spawn failed',
      }),
    )

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })

  test('batches rapid writes into a single ordered pty write via the input queue', async () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerTerminalSocket('client_1', 'attachment_a', socket)
    const sessionId = await createTerminalSession('client_1', { cols: 80, rows: 24 })

    const attach = await attachServerTerminal('client_1', {
      sessionId,
      cols: 80,
      rows: 24,
      attachmentId: 'attachment_a',
    })
    expect(attach.ok).toBe(true)

    writeServerTerminal('client_1', { sessionId, data: 'c', attachmentId: 'attachment_a' })
    writeServerTerminal('client_1', { sessionId, data: 'l', attachmentId: 'attachment_a' })
    writeServerTerminal('client_1', { sessionId, data: 'e', attachmentId: 'attachment_a' })
    writeServerTerminal('client_1', { sessionId, data: 'a', attachmentId: 'attachment_a' })
    writeServerTerminal('client_1', { sessionId, data: 'r', attachmentId: 'attachment_a' })

    // Flush is scheduled as a microtask, so pty.write has not been called yet.
    expect(mockPtys[0]?.write).toHaveBeenCalledTimes(0)

    await new Promise<void>((resolve) => queueMicrotask(resolve))

    // All rapid writes are batched into a single ordered pty.write call.
    expect(mockPtys[0]?.write).toHaveBeenCalledTimes(1)
    expect(mockPtys[0]?.write).toHaveBeenCalledWith('clear')

    unregisterTerminalSocket('client_1', 'attachment_a', socket)
  })
})

function branchWorkspaceManifest(rootId: string, workspacePath: string) {
  return {
    id: 'branch-1',
    rootId,
    branch: 'feature/auth',
    directoryName: 'goblin-feature',
    path: workspacePath,
    repositories: [],
    auxiliaryEntries: [],
  }
}
