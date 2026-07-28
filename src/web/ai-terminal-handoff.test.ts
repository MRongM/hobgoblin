import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildAiHandoffCommand,
  preferredAiHandoffProvider,
  prefillAiTerminalCommand,
} from '#/web/ai-terminal-handoff.ts'

const mocks = vi.hoisted(() => ({
  bridgeAvailable: true,
  bridge: {
    worktreeSnapshot: vi.fn(),
    createTerminal: vi.fn(),
    selectTerminal: vi.fn(),
    writeInput: vi.fn(),
  },
  showRepoBranchDetailTab: vi.fn(),
  setDetailCollapsed: vi.fn(),
}))

vi.mock('#/web/components/terminal/terminal-session-command-bridge.ts', () => ({
  readTerminalSessionCommandBridge: () => (mocks.bridgeAvailable ? mocks.bridge : null),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bridgeAvailable = true
  mocks.bridge.worktreeSnapshot.mockReturnValue({
    count: 0,
    selectedDescriptor: null,
    sessions: [],
    worktreeTerminalKey: '/repo\u0000/repo-worktree',
  })
  mocks.bridge.createTerminal.mockResolvedValue('/repo\u0000/repo-worktree\u0000terminal-1')
})

describe('AI terminal handoff', () => {
  test('prefers available providers in deterministic order', () => {
    expect(preferredAiHandoffProvider({ codex: true, claude: true })).toBe('codex')
    expect(preferredAiHandoffProvider({ codex: false, claude: true })).toBe('claude')
    expect(preferredAiHandoffProvider({ codex: false, claude: false })).toBe('codex')
  })

  test('builds reviewable provider commands without executing them', () => {
    expect(buildAiHandoffCommand('codex', 'Inspect "deps".')).toBe(
      'codex exec --skip-git-repo-check "Inspect \\"deps\\"."',
    )
    expect(buildAiHandoffCommand('claude', 'Inspect deps.')).toBe('claude --print "Inspect deps."')
    expect(buildAiHandoffCommand('codex', 'Inspect deps.')).not.toMatch(/[\r\n]/)
  })

  test('opens the target terminal and fills a newly created session', async () => {
    await expect(
      prefillAiTerminalCommand({
        repoId: '/repo',
        branch: 'main',
        worktreePath: '/repo-worktree',
        command: 'codex exec "prompt"',
        navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
        setDetailCollapsed: mocks.setDetailCollapsed,
      }),
    ).resolves.toBe(true)

    expect(mocks.showRepoBranchDetailTab).toHaveBeenCalledWith('/repo', 'main', 'terminal')
    expect(mocks.setDetailCollapsed).toHaveBeenCalledWith(false)
    expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
      repoRoot: '/repo',
      branch: 'main',
      worktreePath: '/repo-worktree',
    })
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree\u0000terminal-1',
      'codex exec "prompt"',
    )
  })

  test('reuses the selected terminal instead of creating another session', async () => {
    mocks.bridge.worktreeSnapshot.mockReturnValue({
      count: 1,
      selectedDescriptor: { key: '/repo\u0000/repo-worktree\u0000terminal-2' },
      sessions: [{ key: '/repo\u0000/repo-worktree\u0000terminal-2', phase: 'open', selected: true }],
      worktreeTerminalKey: '/repo\u0000/repo-worktree',
    })

    await prefillAiTerminalCommand({
      repoId: '/repo',
      branch: 'main',
      worktreePath: '/repo-worktree',
      command: 'claude --print "prompt"',
      navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
      setDetailCollapsed: mocks.setDetailCollapsed,
    })

    expect(mocks.bridge.createTerminal).not.toHaveBeenCalled()
    expect(mocks.bridge.selectTerminal).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree',
      '/repo\u0000/repo-worktree\u0000terminal-2',
    )
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree\u0000terminal-2',
      'claude --print "prompt"',
    )
    expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toMatch(/[\r\n]$/)
  })

  test.each(['opening', 'restarting', 'closed', 'error'] as const)(
    'creates a terminal instead of reusing a selected %s session',
    async (phase) => {
      const retainedKey = `/repo\u0000/repo-worktree\u0000${phase}`
      mocks.bridge.worktreeSnapshot.mockReturnValue({
        count: 1,
        selectedDescriptor: { key: retainedKey },
        sessions: [{ key: retainedKey, phase, selected: true }],
        worktreeTerminalKey: '/repo\u0000/repo-worktree',
      })

      await prefillAiTerminalCommand({
        repoId: '/repo',
        branch: 'main',
        worktreePath: '/repo-worktree',
        command: 'codex exec "prompt"',
        navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
        setDetailCollapsed: mocks.setDetailCollapsed,
      })

      expect(mocks.bridge.createTerminal).toHaveBeenCalled()
      expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
        '/repo\u0000/repo-worktree\u0000terminal-1',
        'codex exec "prompt"',
      )
      expect(mocks.bridge.writeInput).not.toHaveBeenCalledWith(retainedKey, expect.anything())
    },
  )

  test('skips a selected closed session in favor of another open session', async () => {
    const closedKey = '/repo\u0000/repo-worktree\u0000closed'
    const openKey = '/repo\u0000/repo-worktree\u0000open'
    mocks.bridge.worktreeSnapshot.mockReturnValue({
      count: 2,
      selectedDescriptor: { key: closedKey },
      sessions: [
        { key: closedKey, phase: 'closed', selected: true },
        { key: openKey, phase: 'open', selected: false },
      ],
      worktreeTerminalKey: '/repo\u0000/repo-worktree',
    })

    await prefillAiTerminalCommand({
      repoId: '/repo',
      branch: 'main',
      worktreePath: '/repo-worktree',
      command: 'claude --print "prompt"',
      navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
      setDetailCollapsed: mocks.setDetailCollapsed,
    })

    expect(mocks.bridge.createTerminal).not.toHaveBeenCalled()
    expect(mocks.bridge.selectTerminal).toHaveBeenCalledWith('/repo\u0000/repo-worktree', openKey)
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(openKey, 'claude --print "prompt"')
  })

  test('returns false when the terminal command bridge is unavailable', async () => {
    mocks.bridgeAvailable = false

    await expect(
      prefillAiTerminalCommand({
        repoId: '/repo',
        branch: 'main',
        worktreePath: '/repo-worktree',
        command: 'codex exec "prompt"',
        navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
        setDetailCollapsed: mocks.setDetailCollapsed,
      }),
    ).resolves.toBe(false)

    expect(mocks.showRepoBranchDetailTab).not.toHaveBeenCalled()
    expect(mocks.bridge.writeInput).not.toHaveBeenCalled()
  })
})
