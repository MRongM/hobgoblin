import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildAiHandoffCommand,
  buildBranchWorkspaceBatchErrorAiCommand,
  buildMergeConflictAiCommand,
  prefillAiTerminalCommand,
  prefillAiTerminalTargetCommand,
} from '#/web/ai-terminal-handoff.ts'

const mocks = vi.hoisted(() => ({
  bridgeAvailable: true,
  bridge: {
    worktreeSnapshot: vi.fn(),
    createTerminal: vi.fn(),
    selectTerminal: vi.fn(),
    waitForInputReady: vi.fn(),
    writeInput: vi.fn(),
  },
  showRepoBranchDetailTab: vi.fn(),
  setDetailCollapsed: vi.fn(),
  activate: vi.fn(),
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
  mocks.bridge.waitForInputReady.mockResolvedValue(true)
})

describe('AI terminal handoff', () => {
  test('builds reviewable provider commands without executing them', () => {
    expect(buildAiHandoffCommand('codex', 'Inspect "deps".')).toBe(
      'codex exec --skip-git-repo-check "Inspect \\"deps\\"."',
    )
    expect(buildAiHandoffCommand('claude', 'Inspect deps.')).toBe('claude --print "Inspect deps."')
    expect(buildAiHandoffCommand('codex', 'Inspect deps.')).not.toMatch(/[\r\n]/)
  })

  test('builds a worktree merge conflict command without executing it', () => {
    expect(buildMergeConflictAiCommand('claude')).toContain('current Git merge conflicts in this working tree')
  })

  test('builds one reviewable branch-workspace command for every failed batch member', () => {
    const command = buildBranchWorkspaceBatchErrorAiCommand('claude', 'batch-merge-in', [
      {
        repositoryName: 'api',
        step: 'merge',
        message: 'merge conflict in "config"',
        worktreePath: '/workspace/goblin-feature-a/api',
        reason: 'merge-conflict',
        conflictWorktree: { branch: 'feature/a', path: '/workspace/goblin-feature-a/api' },
      },
      {
        repositoryName: 'web',
        step: 'push',
        message: 'remote rejected',
        worktreePath: '/workspace/goblin-feature-a/web',
      },
    ])

    expect(command).toContain('claude --print')
    expect(command).toContain('batch-merge-in')
    expect(command).toContain('git merge --continue')
    expect(command).toContain('destructive Git commands')
    expect(command).not.toContain('api')
    expect(command).not.toContain('/workspace/goblin-feature-a')
    expect(command).not.toMatch(/[\r\n]/)
  })

  test('activates a branch workspace and preserves its full terminal identity', async () => {
    await expect(
      prefillAiTerminalTargetCommand({
        terminalBase: {
          repoRoot: '/workspace',
          branch: 'feature/a',
          worktreePath: '/workspace/goblin-feature-a',
          targetKind: 'branch-workspace',
          branchWorkspaceId: 'ws-1',
        },
        activate: mocks.activate,
        command: 'codex exec "prompt"',
      }),
    ).resolves.toBe(true)

    expect(mocks.activate).toHaveBeenCalledOnce()
    expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
      repoRoot: '/workspace',
      branch: 'feature/a',
      worktreePath: '/workspace/goblin-feature-a',
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'ws-1',
    })
    expect(mocks.bridge.waitForInputReady).toHaveBeenCalledWith('/repo\u0000/repo-worktree\u0000terminal-1')
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree\u0000terminal-1',
      'codex exec "prompt"',
    )
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
    expect(mocks.bridge.waitForInputReady).toHaveBeenCalledWith('/repo\u0000/repo-worktree\u0000terminal-1')
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree\u0000terminal-1',
      'codex exec "prompt"',
    )
  })

  test('keeps a new-terminal handoff command pending until the terminal is ready for input', async () => {
    let resolveReady: (ready: boolean) => void = () => {}
    mocks.bridge.waitForInputReady.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReady = resolve
      }),
    )

    const handoff = prefillAiTerminalCommand({
      repoId: '/repo',
      branch: 'main',
      worktreePath: '/repo-worktree',
      command: 'codex exec "prompt"',
      navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
      setDetailCollapsed: mocks.setDetailCollapsed,
    })

    await vi.waitFor(() => {
      expect(mocks.bridge.createTerminal).toHaveBeenCalled()
    })
    expect(mocks.bridge.writeInput).not.toHaveBeenCalled()

    resolveReady(true)

    await expect(handoff).resolves.toBe(true)
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/repo-worktree\u0000terminal-1',
      'codex exec "prompt"',
    )
  })

  test('does not report a handoff when the terminal cannot become input-ready', async () => {
    mocks.bridge.waitForInputReady.mockResolvedValueOnce(false)

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

    expect(mocks.bridge.writeInput).not.toHaveBeenCalled()
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
