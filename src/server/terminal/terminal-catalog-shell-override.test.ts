import { beforeEach, expect, test, vi } from 'vitest'
import { createTerminalCatalog } from '#/server/terminal/terminal-catalog.ts'
import type { TerminalAttachResult, TerminalSessionSummary } from '#/shared/terminal.ts'

const { getWorktreesMock } = vi.hoisted(() => ({ getWorktreesMock: vi.fn() }))

vi.mock('#/system/git/worktrees.ts', () => ({ getWorktrees: getWorktreesMock }))

const repoRoot = 'C:\\workspace\\repo'
const attachmentId = 'attachment_a'
const sessionId = 'session_abcdefghijklmnop'
const sessionKey = `${repoRoot}\0${repoRoot}\0terminal-1`

beforeEach(() => {
  getWorktreesMock.mockReset()
  getWorktreesMock.mockResolvedValue([{ path: repoRoot, branch: 'main', isBare: false, isPrimary: true }])
})

test('forwards an explicit Windows shell override only into a local terminal session', async () => {
  const ensureSession = vi.fn((): TerminalAttachResult => attachResult())
  const summary = sessionSummary()
  const listSessions = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([summary])
  const catalog = createTerminalCatalog({
    isValidClientId: (value): value is string => value === 'client_a',
    isValidTerminalId: (value): value is string => value === 'terminal-1',
    manager: { ensureSession, listSessions, closeSession: vi.fn() },
    attachmentIsConnected: () => true,
    broadcastSessionsChanged: vi.fn(),
    withSessionSnapshot: async (result) => result,
    previewAssociatedTmuxSessions: vi.fn(async () => ({ ok: true as const, targetPath: repoRoot, sessions: [] })),
  })

  const result = await catalog.create('client_a', {
    repoRoot,
    branch: 'main',
    worktreePath: repoRoot,
    kind: 'primary',
    attachmentId,
    windowsInternalTerminalShell: 'powershell',
  })

  expect(result.ok).toBe(true)
  expect(ensureSession).toHaveBeenCalledWith(
    expect.objectContaining({
      cwd: repoRoot,
      command: undefined,
      windowsInternalTerminalShell: 'powershell',
    }),
  )
})

function attachResult(): Extract<TerminalAttachResult, { ok: true }> {
  return {
    ok: true,
    sessionId,
    processName: 'pwsh.exe',
    canonicalTitle: null,
    snapshot: '',
    snapshotSeq: 0,
    controller: { attachmentId, status: 'connected' },
    canonicalCols: 80,
    canonicalRows: 24,
    phase: 'open',
    message: null,
    replay: '',
    replaySeq: 0,
    replayTruncated: false,
  }
}

function sessionSummary(): TerminalSessionSummary {
  return {
    sessionId,
    key: sessionKey,
    cwd: repoRoot,
    controller: { attachmentId, status: 'connected' },
    processName: 'pwsh.exe',
    canonicalTitle: null,
    cols: 80,
    rows: 24,
    displayOrder: 1,
    phase: 'open',
    message: null,
  }
}
