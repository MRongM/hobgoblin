// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  bridge: {
    worktreeSnapshot: vi.fn(),
    createTerminal: vi.fn(),
    selectTerminal: vi.fn(),
    writeInput: vi.fn(),
  },
  showRepoBranchDetailTab: vi.fn(),
  setDetailCollapsed: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
}))

vi.mock('#/web/components/terminal/terminal-session-command-bridge.ts', () => ({
  readTerminalSessionCommandBridge: () => mocks.bridge,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: true, claude: true })
  mocks.bridge.worktreeSnapshot.mockReturnValue({
    count: 0,
    selectedDescriptor: null,
    sessions: [],
    worktreeTerminalKey: '/repo\u0000/worktree',
  })
  mocks.bridge.createTerminal.mockResolvedValue('/repo\u0000/worktree\u0000terminal-1')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

describe('useMergeConflictAiActions', () => {
  test('creates a worktree terminal and writes merge conflict command without executing', async () => {
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'codex')!.onSelect()
    })

    expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
      repoRoot: '/repo',
      branch: 'feature/conflict',
      worktreePath: '/worktree',
    })
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/worktree\u0000terminal-1',
      expect.stringContaining('codex exec'),
    )
    expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toContain('\r')
  })

  test('uses the selected terminal when one already exists', async () => {
    mocks.bridge.worktreeSnapshot.mockReturnValue({
      count: 1,
      selectedDescriptor: { key: '/repo\u0000/worktree\u0000terminal-1' },
      sessions: [{ key: '/repo\u0000/worktree\u0000terminal-1' }],
      worktreeTerminalKey: '/repo\u0000/worktree',
    })
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'claude')!.onSelect()
    })

    expect(mocks.bridge.createTerminal).not.toHaveBeenCalled()
    expect(mocks.bridge.selectTerminal).toHaveBeenCalledWith(
      '/repo\u0000/worktree',
      '/repo\u0000/worktree\u0000terminal-1',
    )
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/worktree\u0000terminal-1',
      expect.stringContaining('claude --print'),
    )
    expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toContain('\r')
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useMergeConflictAiActions>) => void }) {
  const value = useMergeConflictAiActions({
    repoId: '/repo',
    branch: 'feature/conflict',
    worktreePath: '/worktree',
    navigation: { showRepoBranchDetailTab: mocks.showRepoBranchDetailTab },
    setDetailCollapsed: mocks.setDetailCollapsed,
  })
  onReady(value)
  return null
}
