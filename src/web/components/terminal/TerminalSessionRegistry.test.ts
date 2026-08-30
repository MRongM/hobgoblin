// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TerminalSessionRegistry } from '#/web/components/terminal/TerminalSessionRegistry.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import type { TerminalRepoIndex } from '#/web/components/terminal/types.ts'
import type { TerminalCloseResult } from '#/shared/terminal.ts'

const bridgeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  openTmuxSessions: vi.fn(),
  close: vi.fn(async (): Promise<TerminalCloseResult> => ({ ok: true })),
  reorder: vi.fn(async () => true),
  setBadge: vi.fn(),
  pageTmux: vi.fn(async () => true),
  takeover: vi.fn(async () => ({ ok: false as const, message: 'error.unavailable' })),
}))

vi.mock('#/web/terminal.ts', () => ({
  terminalBridge: {
    create: bridgeMocks.create,
    openTmuxSessions: bridgeMocks.openTmuxSessions,
    close: bridgeMocks.close,
    reorder: bridgeMocks.reorder,
    setBadge: bridgeMocks.setBadge,
    pageTmux: bridgeMocks.pageTmux,
    takeover: bridgeMocks.takeover,
  },
}))

const REPO_ROOT = '/repo'
const WORKTREE_PATH = '/repo'
const BRANCH = 'main'
const WORKTREE_KEY = worktreeTerminalKey(REPO_ROOT, WORKTREE_PATH)
const BRANCH_WORKSPACE_PATH = '/repo/goblin-feature'

function makeRepoIndex(): TerminalRepoIndex {
  return {
    [REPO_ROOT]: {
      instanceToken: 1,
      branchByWorktreePath: { [WORKTREE_PATH]: BRANCH },
    },
  }
}

function makeServerSession(
  sessionId: string,
  terminalId: string,
  overrides: Partial<{
    controller: { attachmentId: string; status: 'connected' }
    processName: string
    canonicalTitle: string | null
    cols: number
    rows: number
    displayOrder: number
    phase: 'opening' | 'restarting' | 'open' | 'error' | 'closed'
    message: string | null
    tmuxBacked: boolean
    hasUserInput: boolean
  }> = {},
) {
  return {
    sessionId,
    key: `${REPO_ROOT}\0${WORKTREE_PATH}\0${terminalId}`,
    cwd: WORKTREE_PATH,
    controller: overrides.controller ?? null,
    processName: overrides.processName ?? 'bash',
    canonicalTitle: overrides.canonicalTitle ?? null,
    cols: overrides.cols ?? 80,
    rows: overrides.rows ?? 24,
    displayOrder: overrides.displayOrder ?? 1,
    phase: overrides.phase ?? 'open',
    message: overrides.message ?? null,
    tmuxBacked: overrides.tmuxBacked ?? false,
    ...(overrides.hasUserInput === undefined ? {} : { hasUserInput: overrides.hasUserInput }),
  }
}

describe('TerminalSessionRegistry', () => {
  let registry: TerminalSessionRegistry
  let selectedChanges: Array<{ worktreeTerminalKey: string; key: string | null }>
  let outputCompletions: unknown[]

  beforeEach(() => {
    selectedChanges = []
    outputCompletions = []
    bridgeMocks.create.mockReset()
    bridgeMocks.openTmuxSessions.mockReset()
    bridgeMocks.close.mockReset()
    bridgeMocks.close.mockResolvedValue({ ok: true })
    bridgeMocks.reorder.mockClear()
    bridgeMocks.setBadge.mockClear()
    bridgeMocks.pageTmux.mockClear()
    bridgeMocks.takeover.mockClear()
    window.sessionStorage.setItem('goblin:web-terminal-attachment-id', 'attachment_local')
    registry = new TerminalSessionRegistry(
      (worktreeTerminalKey, key) => selectedChanges.push({ worktreeTerminalKey, key }),
      () => {},
      (intent) => outputCompletions.push(intent),
    )
  })

  test('reconciles a branch workspace folder indexed under its parent root', () => {
    registry.setRepoIndex({
      [REPO_ROOT]: {
        instanceToken: 1,
        branchByWorktreePath: {
          [WORKTREE_PATH]: BRANCH,
          [BRANCH_WORKSPACE_PATH]: 'feature/auth',
        },
        branchWorkspaceIdByWorktreePath: {
          [BRANCH_WORKSPACE_PATH]: 'branch-workspace-1',
        },
      },
    })

    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        {
          ...makeServerSession('branch-session', 'terminal-1'),
          key: `${REPO_ROOT}\0${BRANCH_WORKSPACE_PATH}\0terminal-1`,
          cwd: BRANCH_WORKSPACE_PATH,
        },
      ],
      'attachment_local',
      new Map(),
    )

    const snapshot = registry.worktreeSnapshot(worktreeTerminalKey(REPO_ROOT, BRANCH_WORKSPACE_PATH))
    expect(snapshot.count).toBe(1)
    expect(snapshot.selectedDescriptor).toMatchObject({
      repoRoot: REPO_ROOT,
      branch: 'feature/auth',
      worktreePath: BRANCH_WORKSPACE_PATH,
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'branch-workspace-1',
    })
  })

  test('projects explicit no-input state and updates immediately after local user input', () => {
    registry.setRepoIndex(makeRepoIndex())
    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-a', 'terminal-1', {
          controller: { attachmentId: 'attachment_local', status: 'connected' },
          hasUserInput: false,
        }),
      ],
      'attachment_local',
      new Map(),
    )
    const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key

    expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(false)
    registry.writeInput(key, 'a')
    expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(true)
  })

  test('keeps protocol replies untouched and treats missing input history as unknown', () => {
    registry.setRepoIndex(makeRepoIndex())
    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-a', 'terminal-1', {
          controller: { attachmentId: 'attachment_local', status: 'connected' },
          hasUserInput: false,
        }),
        makeServerSession('session-b', 'terminal-2'),
      ],
      'attachment_local',
      new Map(),
    )
    const sessions = registry.worktreeSnapshot(WORKTREE_KEY).sessions
    const untouchedKey = sessions.find((session) => session.terminalId === 'terminal-1')!.key
    const managedSession = (registry as any).sessions.get(untouchedKey)

    managedSession.writeInput({ origin: 'terminal-emulator', source: 'data', data: '\x1b[1;1R' })

    const next = registry.worktreeSnapshot(WORKTREE_KEY).sessions
    expect(next.find((session) => session.terminalId === 'terminal-1')?.hasUserInput).toBe(false)
    expect(next.find((session) => session.terminalId === 'terminal-2')?.hasUserInput).toBe(true)
  })

  test('resets input projection when the server replaces a session under the same key', () => {
    registry.setRepoIndex(makeRepoIndex())
    registry.reconcileServerSessions(
      REPO_ROOT,
      [makeServerSession('session-a', 'terminal-1', { hasUserInput: true })],
      'attachment_local',
      new Map(),
    )
    expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(true)

    registry.reconcileServerSessions(
      REPO_ROOT,
      [makeServerSession('session-b', 'terminal-1', { hasUserInput: false })],
      'attachment_local',
      new Map(),
    )

    expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(false)
  })

  test('delegates tmux page navigation to the selected managed session', async () => {
    registry.setRepoIndex(makeRepoIndex())
    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-a', 'terminal-1', {
          controller: { attachmentId: 'attachment_remote', status: 'connected' },
          tmuxBacked: true,
        }),
      ],
      'attachment_local',
      new Map(),
    )
    const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key

    registry.pageTmux(key, 'up')
    await Promise.resolve()

    expect(bridgeMocks.pageTmux).toHaveBeenCalledWith({ sessionId: 'session-a', direction: 'up' })
  })

  test('publishes a stable terminal catalog across synchronized projects', () => {
    const secondRepoRoot = '/repo-b'
    const secondWorktreePath = '/repo-b'
    registry.setRepoIndex({
      ...makeRepoIndex(),
      [secondRepoRoot]: {
        instanceToken: 1,
        branchByWorktreePath: { [secondWorktreePath]: 'feature-b' },
      },
    })
    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-1', 'terminal-1', { displayOrder: 1 }),
        makeServerSession('session-2', 'terminal-2', { displayOrder: 0 }),
      ],
      'attachment_local',
      new Map(),
    )
    registry.reconcileServerSessions(
      secondRepoRoot,
      [
        {
          ...makeServerSession('session-b', 'terminal-1'),
          key: `${secondRepoRoot}\0${secondWorktreePath}\0terminal-1`,
          cwd: secondWorktreePath,
        },
      ],
      'attachment_local',
      new Map(),
    )
    const catalogRegistry = registry as TerminalSessionRegistry & {
      terminalCatalogSnapshot?: () => readonly { key: string }[]
    }

    const first = catalogRegistry.terminalCatalogSnapshot?.() ?? []
    const second = catalogRegistry.terminalCatalogSnapshot?.() ?? []

    expect(first.map((descriptor) => descriptor.key)).toEqual([
      `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-2`,
      `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
      `${secondRepoRoot}\0${secondWorktreePath}\0terminal-1`,
    ])
    expect(second).toBe(first)
  })

  test('notifies terminal catalog subscribers only when catalog data changes', () => {
    registry.setRepoIndex(makeRepoIndex())
    const listener = vi.fn()
    const unsubscribe = registry.subscribeTerminalCatalog(listener)

    registry.reconcileServerSessions(
      REPO_ROOT,
      [makeServerSession('session-1', 'terminal-1')],
      'attachment_local',
      new Map(),
    )
    expect(listener).toHaveBeenCalled()
    const snapshot = registry.terminalCatalogSnapshot()
    listener.mockClear()

    registry.reconcileServerSessions(
      REPO_ROOT,
      [makeServerSession('session-1', 'terminal-1')],
      'attachment_local',
      new Map(),
    )
    expect(listener).not.toHaveBeenCalled()
    expect(registry.terminalCatalogSnapshot()).toBe(snapshot)

    registry.reconcileServerSessions(REPO_ROOT, [], 'attachment_local', new Map())
    expect(listener).toHaveBeenCalled()
    expect(registry.terminalCatalogSnapshot()).toEqual([])
    unsubscribe()
  })

  test('routes renderer-local Mobile Web selection to one terminal session', () => {
    registry.setRepoIndex(makeRepoIndex())
    registry.reconcileServerSessions(
      REPO_ROOT,
      [makeServerSession('session-1', 'terminal-1')],
      'attachment_local',
      new Map(),
    )
    const key = `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`
    const session = (registry as unknown as { sessions: Map<string, Record<string, unknown>> }).sessions.get(key)!
    const point = { clientX: 40, clientY: 60 }
    const beginMobileSelection = vi.fn(() => true)
    const extendMobileSelection = vi.fn()
    const finishMobileSelection = vi.fn()
    const cancelMobileSelection = vi.fn()
    const selectionText = vi.fn(() => 'selected')
    const mobileSelectionText = vi.fn(() => 'selected')
    const clearMobileSelection = vi.fn()
    Object.assign(session, {
      beginMobileSelection,
      extendMobileSelection,
      finishMobileSelection,
      cancelMobileSelection,
      selectionText,
      mobileSelectionText,
      clearMobileSelection,
    })

    expect(registry.beginMobileSelection(key, point)).toBe(true)
    registry.extendMobileSelection(key, point)
    registry.finishMobileSelection(key, point)
    registry.cancelMobileSelection(key, point)
    expect(registry.selectionText(key)).toBe('selected')
    expect(registry.mobileSelectionText(key)).toBe('selected')
    registry.clearMobileSelection(key)

    expect(beginMobileSelection).toHaveBeenCalledWith(point)
    expect(extendMobileSelection).toHaveBeenCalledWith(point)
    expect(finishMobileSelection).toHaveBeenCalledWith(point)
    expect(cancelMobileSelection).toHaveBeenCalledWith(point)
    expect(selectionText).toHaveBeenCalledTimes(1)
    expect(mobileSelectionText).toHaveBeenCalledTimes(1)
    expect(clearMobileSelection).toHaveBeenCalledTimes(1)
  })

  afterEach(() => {
    registry.destroy()
  })

  describe('createTerminal', () => {
    test('supports registerWorktreeHost after context method extraction', () => {
      const registerWorktreeHost = registry.registerWorktreeHost
      const host = document.createElement('div')

      expect(() => registerWorktreeHost(WORKTREE_KEY, host)).not.toThrow()
      expect(() => registerWorktreeHost(WORKTREE_KEY, null)).not.toThrow()
    })

    test('publishes creation pending state until the create request succeeds', async () => {
      registry.setRepoIndex(makeRepoIndex())
      let resolveCreate: (value: unknown) => void = () => {}
      bridgeMocks.create.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
      )

      const creation = registry.createTerminal({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
      })

      expect(registry.worktreeSnapshot(WORKTREE_KEY).creating).toBe(true)

      resolveCreate({
        ok: true,
        action: 'created',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessionId: 'session-created',
        processName: 'zsh',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 1,
        controller: { attachmentId: 'attachment_local', status: 'connected' },
        canonicalCols: 80,
        canonicalRows: 24,
        phase: 'open',
        message: null,
        sessions: [makeServerSession('session-created', 'terminal-1')],
      })

      await creation
      expect(registry.worktreeSnapshot(WORKTREE_KEY).creating).toBe(false)
    })

    test('clears creation pending state when the create request fails', async () => {
      registry.setRepoIndex(makeRepoIndex())
      let rejectCreate: (reason: Error) => void = () => {}
      bridgeMocks.create.mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectCreate = reject
        }),
      )

      const creation = registry.createTerminal({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
      })

      expect(registry.worktreeSnapshot(WORKTREE_KEY).creating).toBe(true)
      rejectCreate(new Error('create failed'))
      await expect(creation).rejects.toThrow('create failed')
      expect(registry.worktreeSnapshot(WORKTREE_KEY).creating).toBe(false)
    })

    test.each([
      ['Git primary worktree', 'main', 'C:\\Users\\Test\\Repo'],
      ['Git linked worktree', 'feature/auth', 'C:\\Users\\Test\\Repo-Feature'],
      ['plain workspace', 'workspace', 'C:\\Users\\Test\\Plain'],
    ])('reconciles a Windows %s created with canonical server paths', async (_label, branch, rendererPath) => {
      const rendererRepoRoot = rendererPath.includes('Repo-Feature') ? 'C:\\Users\\Test\\Repo' : rendererPath
      const serverRepoRoot = rendererRepoRoot.toLowerCase().replaceAll('\\', '/')
      const serverWorktreePath = rendererPath.toLowerCase().replaceAll('\\', '/')
      const terminalWorktreeKey = worktreeTerminalKey(rendererRepoRoot, rendererPath)
      registry.setRepoIndex({
        [rendererRepoRoot]: {
          instanceToken: 1,
          branchByWorktreePath: { [rendererPath]: branch },
        },
      })
      const serverSession = {
        ...makeServerSession('windows-session', 'terminal-1'),
        key: `${serverRepoRoot}\0${serverWorktreePath}\0terminal-1`,
        cwd: serverWorktreePath,
        controller: { attachmentId: 'attachment_local', status: 'connected' as const },
      }
      bridgeMocks.create.mockResolvedValueOnce({
        ok: true,
        action: 'created',
        key: serverSession.key,
        sessionId: serverSession.sessionId,
        processName: 'pwsh.exe',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 1,
        controller: serverSession.controller,
        canonicalCols: 80,
        canonicalRows: 24,
        phase: 'open',
        message: null,
        sessions: [serverSession],
      })

      const key = await registry.createTerminal({
        repoRoot: rendererRepoRoot,
        branch,
        worktreePath: rendererPath,
      })

      expect(key).toBe(`${terminalWorktreeKey}\0terminal-1`)
      expect(registry.worktreeSnapshot(terminalWorktreeKey)).toMatchObject({
        count: 1,
        selectedDescriptor: {
          repoRoot: rendererRepoRoot,
          branch,
          worktreePath: rendererPath,
          key: `${terminalWorktreeKey}\0terminal-1`,
        },
      })
    })

    test('sends measured geometry and hydrates the created session first frame', async () => {
      registry.setRepoIndex(makeRepoIndex())
      const host = document.createElement('div')
      document.body.appendChild(host)
      vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 800,
        height: 400,
        top: 0,
        right: 800,
        bottom: 400,
        left: 0,
        toJSON: () => ({}),
      })
      registry.registerWorktreeHost(WORKTREE_KEY, host)
      bridgeMocks.create.mockResolvedValueOnce({
        ok: true,
        action: 'created',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessionId: 'session-created',
        processName: 'zsh',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 7,
        controller: { attachmentId: 'attachment_local', status: 'connected' },
        canonicalCols: 95,
        canonicalRows: 28,
        phase: 'open',
        message: null,
        sessions: [makeServerSession('session-created', 'terminal-1', { cols: 95, rows: 28, processName: 'zsh' })],
      })

      const key = await registry.createTerminal({ repoRoot: REPO_ROOT, branch: BRANCH, worktreePath: WORKTREE_PATH })

      expect(bridgeMocks.create).toHaveBeenCalledWith({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
        kind: 'primary',
        attachmentId: 'attachment_local',
        cols: 95,
        rows: 28,
        launchMode: 'native',
      })
      expect(key).toBe(`${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`)
      expect(registry.snapshot(key)).toMatchObject({
        phase: 'open',
        processName: 'zsh',
      })
      const session = (registry as any).sessions.get(key)
      expect((session as any).hydratedSnapshot).toEqual({ snapshot: 'first-frame', snapshotSeq: 7 })
    })

    test('waits for a controller terminal to finish renderer startup before accepting input', async () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-created', 'terminal-1', {
            controller: { attachmentId: 'attachment_local', status: 'connected' },
          }),
        ],
        'attachment_local',
        new Map(),
      )
      const key = `${REPO_ROOT}\u0000${WORKTREE_PATH}\u0000terminal-1`
      const session = (registry as any).sessions.get(key)
      const initialSnapshot = session.snapshot()
      let renderPending = true
      vi.spyOn(session, 'snapshot').mockImplementation(() =>
        renderPending ? { ...initialSnapshot, renderPending: true } : { ...initialSnapshot, renderPending: undefined },
      )
      ;(registry as any).snapshotCache.delete(key)
      const waitForInputReady = (
        registry as TerminalSessionRegistry & {
          waitForInputReady?: (sessionKey: string) => Promise<boolean>
        }
      ).waitForInputReady

      expect(waitForInputReady).toBeTypeOf('function')
      let settled = false
      const readiness = waitForInputReady!(key).then((ready) => {
        settled = true
        return ready
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      renderPending = false
      ;(registry as any).notifySession(key)

      await expect(readiness).resolves.toBe(true)
    })

    test('rejects malformed successful create responses', async () => {
      registry.setRepoIndex(makeRepoIndex())
      const host = document.createElement('div')
      document.body.appendChild(host)
      vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 800,
        height: 400,
        top: 0,
        right: 800,
        bottom: 400,
        left: 0,
        toJSON: () => ({}),
      })
      registry.registerWorktreeHost(WORKTREE_KEY, host)
      bridgeMocks.create.mockResolvedValueOnce({
        ok: true,
        action: 'created',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessions: [makeServerSession('session-created', 'terminal-1')],
      })

      await expect(
        registry.createTerminal({ repoRoot: REPO_ROOT, branch: BRANCH, worktreePath: WORKTREE_PATH }),
      ).rejects.toThrow('error.terminal-create-failed')
    })

    test('creates one tmux terminal through the ordinary create request', async () => {
      registry.setRepoIndex(makeRepoIndex())
      bridgeMocks.create.mockResolvedValueOnce({
        ok: true,
        action: 'created',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessionId: 'tmux-session-1',
        processName: 'tmux',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 4,
        controller: { attachmentId: 'attachment_local', status: 'connected' },
        canonicalCols: 80,
        canonicalRows: 24,
        phase: 'open',
        message: null,
        sessions: [makeServerSession('tmux-session-1', 'terminal-1', { tmuxBacked: true })],
      })

      const key = await registry.createTerminal(
        { repoRoot: REPO_ROOT, branch: BRANCH, worktreePath: WORKTREE_PATH },
        'tmux-if-available',
      )

      expect(bridgeMocks.create).toHaveBeenCalledWith({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
        kind: 'primary',
        launchMode: 'tmux-if-available',
        attachmentId: 'attachment_local',
        cols: 80,
        rows: 24,
      })
      expect(bridgeMocks.openTmuxSessions).not.toHaveBeenCalled()
      expect(key).toBe(`${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`)
    })

    test('forwards an explicit Windows internal terminal shell only for an opted-in create request', async () => {
      registry.setRepoIndex(makeRepoIndex())
      bridgeMocks.create.mockResolvedValueOnce({
        ok: true,
        action: 'created',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessionId: 'powershell-session-1',
        processName: 'pwsh.exe',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 1,
        controller: { attachmentId: 'attachment_local', status: 'connected' },
        canonicalCols: 80,
        canonicalRows: 24,
        phase: 'open',
        message: null,
        sessions: [makeServerSession('powershell-session-1', 'terminal-1', { processName: 'pwsh.exe' })],
      })

      await registry.createTerminal(
        { repoRoot: REPO_ROOT, branch: BRANCH, worktreePath: WORKTREE_PATH },
        'native',
        'powershell',
      )

      expect(bridgeMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          launchMode: 'native',
          windowsInternalTerminalShell: 'powershell',
        }),
      )
    })

    test('restores and reconciles detached tmux sessions through the batch request', async () => {
      registry.setRepoIndex(makeRepoIndex())
      bridgeMocks.openTmuxSessions.mockResolvedValueOnce({
        ok: true,
        restored: 2,
        action: 'restored',
        key: `${REPO_ROOT}\0${WORKTREE_PATH}\0terminal-1`,
        sessionId: 'tmux-session-1',
        processName: 'tmux',
        canonicalTitle: null,
        snapshot: 'first-frame',
        snapshotSeq: 4,
        controller: { attachmentId: 'attachment_local', status: 'connected' },
        canonicalCols: 80,
        canonicalRows: 24,
        phase: 'open',
        message: null,
        sessions: [
          makeServerSession('tmux-session-1', 'terminal-1', { tmuxBacked: true }),
          makeServerSession('tmux-session-2', 'terminal-2', { tmuxBacked: true }),
        ],
      })

      const restoreTmuxSessions = (
        registry as TerminalSessionRegistry & {
          restoreTmuxSessions?: (base: { repoRoot: string; branch: string; worktreePath: string }) => Promise<number>
        }
      ).restoreTmuxSessions
      expect(restoreTmuxSessions).toBeTypeOf('function')

      const restored = await restoreTmuxSessions!({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
      })

      expect(bridgeMocks.openTmuxSessions).toHaveBeenCalledWith({
        repoRoot: REPO_ROOT,
        branch: BRANCH,
        worktreePath: WORKTREE_PATH,
        attachmentId: 'attachment_local',
        cols: 80,
        rows: 24,
      })
      expect(bridgeMocks.create).not.toHaveBeenCalled()
      expect(restored).toBe(2)
      expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions).toHaveLength(2)
    })

    test('treats an empty detached tmux scan as a successful no-op', async () => {
      registry.setRepoIndex(makeRepoIndex())
      bridgeMocks.openTmuxSessions.mockResolvedValueOnce({ ok: true, restored: 0, sessions: [] })
      const restoreTmuxSessions = (
        registry as TerminalSessionRegistry & {
          restoreTmuxSessions?: (base: { repoRoot: string; branch: string; worktreePath: string }) => Promise<number>
        }
      ).restoreTmuxSessions
      expect(restoreTmuxSessions).toBeTypeOf('function')

      await expect(
        restoreTmuxSessions!({ repoRoot: REPO_ROOT, branch: BRANCH, worktreePath: WORKTREE_PATH }),
      ).resolves.toBe(0)
      expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions).toHaveLength(0)
    })
  })

  describe('event dispatch', () => {
    test('dispatches output to the correct session by sessionId index', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-a', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const worktreeSnapshot = registry.worktreeSnapshot(WORKTREE_KEY)
      const key = worktreeSnapshot.sessions[0]!.key
      const session = (registry as any).sessions.get(key)
      const handleOutputSpy = vi.spyOn(session, 'handleOutput')

      registry.handleOutput({ sessionId: 'session-a', data: 'hello', seq: 1, processName: 'bash' })
      expect(handleOutputSpy).toHaveBeenCalledTimes(1)

      registry.handleOutput({ sessionId: 'session-b', data: 'hello', seq: 1, processName: 'bash' })
      expect(handleOutputSpy).toHaveBeenCalledTimes(1)
    })

    test('marks a terminal session output-active only after output sustains', () => {
      vi.useFakeTimers()
      try {
        registry.setRepoIndex(makeRepoIndex())
        registry.reconcileServerSessions(
          REPO_ROOT,
          [makeServerSession('session-a', 'terminal-1')],
          'attachment_local',
          new Map(),
        )

        for (let elapsed = 0; elapsed < 1_000; elapsed += 100) {
          registry.handleOutput({ sessionId: 'session-a', data: 'tick', seq: elapsed, processName: 'bash' })
          expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)
          vi.advanceTimersByTime(100)
        }
        registry.handleOutput({ sessionId: 'session-a', data: 'tick', seq: 1_000, processName: 'bash' })
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(true)

        vi.advanceTimersByTime(1_199)
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(true)

        vi.advanceTimersByTime(1)
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)
        expect(outputCompletions).toEqual([
          expect.objectContaining({
            sessionId: 'session-a',
            finalOutputSeq: 1_000,
            activityDurationMs: 1_000,
          }),
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    test('measures consecutive output activity periods independently', () => {
      vi.useFakeTimers()
      try {
        registry.setRepoIndex(makeRepoIndex())
        registry.reconcileServerSessions(
          REPO_ROOT,
          [makeServerSession('session-a', 'terminal-1')],
          'attachment_local',
          new Map(),
        )

        const emitBurst = (sequenceBase: number, durationMs: number) => {
          for (let elapsed = 0; elapsed <= durationMs; elapsed += 1_000) {
            registry.handleOutput({
              sessionId: 'session-a',
              data: 'tick',
              seq: sequenceBase + elapsed,
              processName: 'bash',
            })
            if (elapsed < durationMs) vi.advanceTimersByTime(1_000)
          }
          vi.advanceTimersByTime(1_200)
        }

        emitBurst(0, 10_000)
        emitBurst(100_000, 30_000)

        expect(outputCompletions).toEqual([
          expect.objectContaining({ activityDurationMs: 10_000 }),
          expect.objectContaining({ activityDurationMs: 30_000 }),
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    test('does not mark output-active for a brief output burst', () => {
      vi.useFakeTimers()
      try {
        registry.setRepoIndex(makeRepoIndex())
        registry.reconcileServerSessions(
          REPO_ROOT,
          [makeServerSession('session-a', 'terminal-1')],
          'attachment_local',
          new Map(),
        )

        registry.handleOutput({ sessionId: 'session-a', data: 'redraw', seq: 1, processName: 'bash' })
        vi.advanceTimersByTime(300)
        registry.handleOutput({ sessionId: 'session-a', data: 'redraw', seq: 2, processName: 'bash' })
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)

        vi.advanceTimersByTime(30_000)
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    test('does not mark output-active for keystroke echo', () => {
      vi.useFakeTimers()
      try {
        registry.setRepoIndex(makeRepoIndex())
        registry.reconcileServerSessions(
          REPO_ROOT,
          [
            makeServerSession('session-a', 'terminal-1', {
              controller: { attachmentId: 'attachment_local', status: 'connected' },
            }),
          ],
          'attachment_local',
          new Map(),
        )
        const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key

        for (let i = 0; i < 15; i += 1) {
          registry.writeInput(key, 'a')
          vi.advanceTimersByTime(50)
          registry.handleOutput({ sessionId: 'session-a', data: 'a', seq: i, processName: 'bash' })
          expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)
          vi.advanceTimersByTime(150)
        }

        vi.advanceTimersByTime(30_000)
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    test('marks output-active for a sustained run that starts after the echo window', () => {
      vi.useFakeTimers()
      try {
        registry.setRepoIndex(makeRepoIndex())
        registry.reconcileServerSessions(
          REPO_ROOT,
          [makeServerSession('session-a', 'terminal-1')],
          'attachment_local',
          new Map(),
        )
        const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key

        registry.writeInput(key, '\r')
        vi.advanceTimersByTime(600)
        for (let elapsed = 0; elapsed <= 1_000; elapsed += 100) {
          registry.handleOutput({ sessionId: 'session-a', data: 'tick', seq: elapsed, processName: 'bash' })
          vi.advanceTimersByTime(100)
        }
        expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.isOutputActive).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    test('dispatches title changes by sessionId index', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-a', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      const session = (registry as any).sessions.get(key)
      const handleServerTitleSpy = vi.spyOn(session, 'handleServerTitle')

      registry.handleServerTitle({ sessionId: 'session-a', canonicalTitle: 'new title' })
      expect(handleServerTitleSpy).toHaveBeenCalledWith('new title')

      handleServerTitleSpy.mockClear()
      registry.handleServerTitle({ sessionId: 'session-b', canonicalTitle: 'ignored' })
      expect(handleServerTitleSpy).not.toHaveBeenCalled()
    })

    test('dispatches exit by sessionId index', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-a', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      const session = (registry as any).sessions.get(key)
      const handleExitSpy = vi.spyOn(session, 'handleExit').mockReturnValue(true)

      registry.handleExit({ sessionId: 'session-a' })
      expect(handleExitSpy).toHaveBeenCalledTimes(1)

      handleExitSpy.mockClear()
      registry.handleExit({ sessionId: 'session-b' })
      expect(handleExitSpy).not.toHaveBeenCalled()
    })
  })

  describe('notify granularity', () => {
    test('metadata notify invalidates worktree cache', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-a', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const listener = vi.fn()
      const unsubscribe = registry.subscribeWorktree(WORKTREE_KEY, listener)

      // Prime the cache
      registry.worktreeSnapshot(WORKTREE_KEY)
      listener.mockClear()

      // Simulate metadata change via internal notifySession
      const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      ;(registry as any).notifySession(key)

      expect(listener).toHaveBeenCalledTimes(1)
      unsubscribe()
    })
  })

  describe('reconcileServerSessions', () => {
    test('creates missing local sessions and syncs selection', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const snapshot = registry.worktreeSnapshot(WORKTREE_KEY)
      expect(snapshot.count).toBe(1)
      expect(snapshot.sessions[0]!.terminalId).toBe('terminal-1')
      expect(selectedChanges).toContainEqual({ worktreeTerminalKey: WORKTREE_KEY, key: snapshot.sessions[0]!.key })
    })

    test('removes orphaned local sessions', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const keyBefore = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      expect(registry.isKnownSession(keyBefore)).toBe(true)

      registry.reconcileServerSessions(REPO_ROOT, [], 'attachment_local', new Map())

      expect(registry.isKnownSession(keyBefore)).toBe(false)
      expect(registry.worktreeSnapshot(WORKTREE_KEY).count).toBe(0)
    })

    test('preserves current selection and falls back to controller when current is lost', () => {
      registry.setRepoIndex(makeRepoIndex())

      // First reconcile: terminal-1 becomes current
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )
      expect(registry.worktreeSnapshot(WORKTREE_KEY).selectedDescriptor?.terminalId).toBe('terminal-1')

      // Second reconcile: terminal-1 removed, terminal-2 is controller
      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-2', 'terminal-2', {
            controller: { attachmentId: 'attachment_local', status: 'connected' },
          }),
        ],
        'attachment_local',
        new Map(),
      )
      expect(registry.worktreeSnapshot(WORKTREE_KEY).selectedDescriptor?.terminalId).toBe('terminal-2')
    })

    test('auto-takes over live sessions without a controller', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      expect(bridgeMocks.takeover).toHaveBeenCalledTimes(1)
      expect(bridgeMocks.takeover).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }))
    })

    test('does not auto-take over sessions controlled elsewhere or not open', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-1', 'terminal-1', {
            controller: { attachmentId: 'attachment_remote', status: 'connected' },
          }),
          makeServerSession('session-2', 'terminal-2', { phase: 'error', message: 'error.unknown' }),
        ],
        'attachment_local',
        new Map(),
      )

      expect(bridgeMocks.takeover).not.toHaveBeenCalled()
    })

    test('does not re-issue a takeover while one is pending', () => {
      registry.setRepoIndex(makeRepoIndex())
      const sessions = [makeServerSession('session-1', 'terminal-1')]

      registry.reconcileServerSessions(REPO_ROOT, sessions, 'attachment_local', new Map())
      registry.reconcileServerSessions(REPO_ROOT, sessions, 'attachment_local', new Map())

      expect(bridgeMocks.takeover).toHaveBeenCalledTimes(1)
    })

    test('closing the active terminal selects the adjacent tab in display order', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-1', 'terminal-1', { displayOrder: 1 }),
          makeServerSession('session-2', 'terminal-2', { displayOrder: 0 }),
          makeServerSession('session-3', 'terminal-3', { displayOrder: 2 }),
        ],
        'attachment_local',
        new Map(),
      )

      const snapshot = registry.worktreeSnapshot(WORKTREE_KEY)
      const activeKey = snapshot.sessions.find((session) => session.terminalId === 'terminal-2')?.key
      if (!activeKey) throw new Error('missing terminal-2')

      registry.selectTerminal(WORKTREE_KEY, activeKey)
      ;(registry as any).removeSession(activeKey, { dispose: false, closeSession: false })

      expect(registry.worktreeSnapshot(WORKTREE_KEY).selectedDescriptor?.terminalId).toBe('terminal-1')
    })

    test('projects tmux eligibility and closes a checked terminal without a duplicate request', async () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1', { tmuxBacked: true })],
        'attachment_local',
        new Map(),
      )
      const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
      expect(summary?.tmuxBacked).toBe(true)
      if (!summary) return

      await expect(
        registry.closeTerminalAndDismissDetailIfLast(
          summary.key,
          {
            repoRoot: REPO_ROOT,
            worktreePath: WORKTREE_PATH,
          },
          { closeTmuxSession: true },
        ),
      ).resolves.toEqual({ ok: true })
      expect(bridgeMocks.close).toHaveBeenCalledTimes(1)
      expect(bridgeMocks.close).toHaveBeenCalledWith({ sessionId: 'session-1', closeTmuxSession: true })
      expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions).toEqual([])
    })

    test('retains a checked terminal when the tmux close request fails', async () => {
      bridgeMocks.close.mockResolvedValueOnce({ ok: false, message: 'error.tmux-command-failed' })
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1', { tmuxBacked: true })],
        'attachment_local',
        new Map(),
      )
      const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
      if (!summary) return

      await expect(
        registry.closeTerminalAndDismissDetailIfLast(
          summary.key,
          {
            repoRoot: REPO_ROOT,
            worktreePath: WORKTREE_PATH,
          },
          { closeTmuxSession: true },
        ),
      ).resolves.toEqual({ ok: false, message: 'error.tmux-command-failed' })
      expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions).toHaveLength(1)
    })
  })

  describe('terminal display titles', () => {
    test('prefixes compact and full canonical titles with the terminal sequence number', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-2', 'terminal-2', {
            canonicalTitle: '~/repo/app \u2014 npm run dev',
            processName: 'node',
          }),
        ],
        'attachment_local',
        new Map(),
      )

      const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
      expect(summary).toMatchObject({
        terminalId: 'terminal-2',
        index: 2,
        title: '#2 app \u00b7 npm run dev',
        fullTitle: '#2 ~/repo/app \u2014 npm run dev',
        originalTitle: '~/repo/app \u2014 npm run dev',
      })
    })

    test('prefixes process fallback titles with the terminal sequence number', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-1', 'terminal-1', {
            canonicalTitle: null,
            processName: '/bin/zsh',
          }),
        ],
        'attachment_local',
        new Map(),
      )

      const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
      expect(summary).toMatchObject({
        terminalId: 'terminal-1',
        index: 1,
        title: '#1 zsh',
        fullTitle: '#1 /bin/zsh',
        originalTitle: null,
      })
    })

    test('prefixes empty title fallback with the terminal sequence number', () => {
      registry.setRepoIndex(makeRepoIndex())

      registry.reconcileServerSessions(
        REPO_ROOT,
        [
          makeServerSession('session-3', 'terminal-3', {
            canonicalTitle: null,
            processName: '',
          }),
        ],
        'attachment_local',
        new Map(),
      )

      const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
      expect(summary).toMatchObject({
        terminalId: 'terminal-3',
        index: 3,
        title: '#3 terminal 3',
        fullTitle: '#3 terminal 3',
        originalTitle: null,
      })
    })
  })

  describe('snapshot cache', () => {
    test('returns cached snapshot without calling session.snapshot() repeatedly', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      const session = (registry as any).sessions.get(key)

      // reconcile pre-populates the cache; clear it to test the caching path
      ;(registry as any).snapshotCache.delete(key)

      const snapshotSpy = vi.spyOn(session, 'snapshot')
      const s1 = registry.snapshot(key)
      const s2 = registry.snapshot(key)
      expect(s1).toBe(s2) // same reference
      expect(snapshotSpy).toHaveBeenCalledTimes(1)
    })

    test('invalidates snapshot cache on metadata notify', () => {
      registry.setRepoIndex(makeRepoIndex())
      registry.reconcileServerSessions(
        REPO_ROOT,
        [makeServerSession('session-1', 'terminal-1')],
        'attachment_local',
        new Map(),
      )

      const key = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]!.key
      const s1 = registry.snapshot(key)

      // metadata notify forces cache refresh
      ;(registry as any).notifySession(key)
      const s2 = registry.snapshot(key)
      expect(s1).not.toBe(s2)
    })
  })
})
