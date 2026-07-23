import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TerminalSessionManager } from '#/server/terminal/terminal-session-manager.ts'

const ptys: Array<{ kill: ReturnType<typeof vi.fn>; emitData: (data: string) => void }> = []

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let onData: ((data: string) => void) | null = null
    const pty = { kill: vi.fn(), emitData: (data: string) => onData?.(data) }
    ptys.push(pty)
    return {
      process: 'zsh',
      write: vi.fn(),
      resize: vi.fn(),
      kill: pty.kill,
      onData: vi.fn((listener: (data: string) => void) => {
        onData = listener
        return { dispose: vi.fn() }
      }),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    }
  }),
}))

beforeEach(() => {
  ptys.length = 0
  vi.clearAllMocks()
})

describe('terminal session manager administrative close', () => {
  test('retains private tmux identity while projecting only tmux eligibility', async () => {
    const manager = new TerminalSessionManager<string>({ onOutput: vi.fn(), onExit: vi.fn() })
    const created = manager.ensureSession({
      ownerId: 'client_a',
      scope: '/workspace',
      key: '/workspace\0/workspace/feature\0terminal-1',
      cwd: '/workspace/feature',
      cols: 80,
      rows: 24,
      tmuxSessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      tmuxWorkingDirectory: '/workspace/feature',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await manager.listSessions('/workspace')).toEqual([expect.objectContaining({ tmuxBacked: true })])
    expect(manager.getSession('client_a', created.sessionId)).toMatchObject({
      tmuxSessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      tmuxWorkingDirectory: '/workspace/feature',
    })

    manager.ensureSession({
      ownerId: 'client_a',
      scope: '/workspace',
      key: '/workspace\0/workspace/feature\0terminal-1',
      cwd: '/workspace/feature',
      cols: 100,
      rows: 30,
    })
    expect(manager.getSession('client_a', created.sessionId)).toMatchObject({
      tmuxSessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      tmuxWorkingDirectory: '/workspace/feature',
    })
  })

  test('closes specified sessions across owners and reports affected scopes and missing ids', () => {
    const manager = new TerminalSessionManager<string>({ onOutput: vi.fn(), onExit: vi.fn() })
    const first = manager.ensureSession({
      ownerId: 'client_a',
      scope: '/workspace',
      key: '/workspace\0/workspace/goblin-feature\0terminal-1',
      cwd: '/workspace/goblin-feature',
      cols: 80,
      rows: 24,
    })
    const second = manager.ensureSession({
      ownerId: 'client_b',
      scope: '/workspace/api',
      key: '/workspace/api\0/workspace/goblin-feature/api\0terminal-1',
      cwd: '/workspace/goblin-feature/api',
      cols: 80,
      rows: 24,
    })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(manager.closeSessions([first.sessionId, 'term_missing_1234', second.sessionId, first.sessionId])).toEqual({
      closed: [first.sessionId, second.sessionId],
      missing: ['term_missing_1234'],
      scopes: ['/workspace', '/workspace/api'],
    })
    expect(ptys.map((pty) => pty.kill.mock.calls.length)).toEqual([1, 1])
    expect(manager.getSession('client_a', first.sessionId)).toBeUndefined()
    expect(manager.getSession('client_b', second.sessionId)).toBeUndefined()
  })
})

describe('terminal session manager output excerpts', () => {
  test('reads the canonical headless screen for an existing session', async () => {
    const manager = new TerminalSessionManager<string>({ onOutput: vi.fn(), onExit: vi.fn() })
    const result = manager.ensureSession({
      ownerId: 'client_a',
      scope: '/workspace',
      key: '/workspace\0/workspace/goblin-feature\0terminal-1',
      cwd: '/workspace/goblin-feature',
      cols: 80,
      rows: 24,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    ptys[0]?.emitData('build passed')

    await expect(manager.outputExcerpt(result.sessionId, 400)).resolves.toMatchObject({
      sessionId: result.sessionId,
      output: 'build passed',
      sequence: 1,
    })
    await expect(manager.outputExcerpt('term_missing_1234', 400)).resolves.toBeNull()
  })
})
