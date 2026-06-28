// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { GOBLIN_FILE_PATHS_MIME, serializeGoblinFilePathDragPayload } from '#/shared/file-tree.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { fillTerminalExternalInput } from '#/web/components/terminal/terminal-external-input-fill.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

const appShellMocks = vi.hoisted(() => ({
  readSystemClipboardFilePaths: vi.fn(async () => [] as string[]),
  saveClipboardBinaryFilesFromPaste: vi.fn(),
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  pathForDroppedFile: () => '',
  readSystemClipboardFilePaths: appShellMocks.readSystemClipboardFilePaths,
  saveClipboardBinaryFilesFromPaste: appShellMocks.saveClipboardBinaryFilesFromPaste,
}))

const repoClientMocks = vi.hoisted(() => ({
  transferRepositoryFiles: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  transferRepositoryFiles: repoClientMocks.transferRepositoryFiles,
}))

const runtimeSettingsMocks = vi.hoisted(() => ({
  terminalExternalInputEnabled: false,
  temporaryFilesDirectory: '',
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium' as 'small' | 'medium' | 'large',
  terminalCustomButtons: [] as { label: string; value: string; action?: 'execute' | 'input' }[],
}))

vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
  useRuntimeTerminalCustomButtons: () => runtimeSettingsMocks.terminalCustomButtons,
  useRuntimeTerminalSettings: () => ({
    terminalExternalInputEnabled: runtimeSettingsMocks.terminalExternalInputEnabled,
    temporaryFilesDirectory: runtimeSettingsMocks.temporaryFilesDirectory,
    terminalCustomButtonsVisible: runtimeSettingsMocks.terminalCustomButtonsVisible,
    terminalCustomButtonSize: runtimeSettingsMocks.terminalCustomButtonSize,
    terminalCustomButtons: runtimeSettingsMocks.terminalCustomButtons,
  }),
}))

afterEach(() => {
  runtimeSettingsMocks.terminalExternalInputEnabled = false
  runtimeSettingsMocks.temporaryFilesDirectory = ''
  runtimeSettingsMocks.terminalCustomButtonsVisible = true
  runtimeSettingsMocks.terminalCustomButtonSize = 'medium'
  runtimeSettingsMocks.terminalCustomButtons = []
  appShellMocks.readSystemClipboardFilePaths.mockReset()
  appShellMocks.readSystemClipboardFilePaths.mockResolvedValue([])
  appShellMocks.saveClipboardBinaryFilesFromPaste.mockReset()
  repoClientMocks.transferRepositoryFiles.mockReset()
  document.body.innerHTML = ''
})

const REMOTE_REPO_ID = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/repo' })

describe('TerminalSlot', () => {
  test('passes reveal path handler through terminal attach', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const attach = vi.fn()
    const onRevealPath = vi.fn()
    const descriptor = {
      key: 'terminal-1',
      worktreeTerminalKey: '/repo\0/worktree',
      terminalId: 'terminal-1',
      index: 1,
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/worktree',
    }
    const worktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
      count: 1,
    }
    const snapshot = { phase: 'open' as const, message: null, processName: 'zsh' }
    const context: TerminalSessionContextValue = {
      createTerminal: vi.fn(async () => 'terminal-1'),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
      registerWorktreeHost: vi.fn(),
      attach,
      detach: vi.fn(),
      restart: vi.fn(),
      isTerminalFocusTarget: vi.fn(() => false),
      findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      clearSearch: vi.fn(),
      writeInput: vi.fn(),
      takeover: vi.fn(),
      reorderSessions: vi.fn(async () => true),
      serialize: vi.fn(() => ''),
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" onRevealPath={onRevealPath} />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(attach).toHaveBeenCalledWith(descriptor, expect.any(HTMLElement), { onRevealPath })
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('renders mirror attach banner and triggers takeover', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const takeover = vi.fn()
    const summaries = [
      {
        key: 'terminal-1',
        worktreeTerminalKey: '/repo\0/worktree',
        terminalId: 'terminal-1',
        index: 1,
        title: 'zsh',
        phase: 'open' as const,
        selected: true,
        hasBell: false,
      },
    ]
    const descriptor = {
      key: 'terminal-1',
      worktreeTerminalKey: '/repo\0/worktree',
      terminalId: 'terminal-1',
      index: 1,
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/worktree',
    }
    const worktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: summaries,
      count: 1,
    }
    const snapshot = {
      phase: 'open' as const,
      message: null,
      processName: 'zsh',
      attachment: {
        role: 'viewer' as const,
        controllerStatus: 'connected' as const,
        active: false,
        canTakeover: true,
        canonicalCols: 120,
        canonicalRows: 40,
      },
    }
    const context: TerminalSessionContextValue = {
      createTerminal: async () => 'terminal-1',
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
      registerWorktreeHost: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      restart: vi.fn(),
      isTerminalFocusTarget: vi.fn(() => false),
      findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      clearSearch: vi.fn(),
      writeInput: vi.fn(),
      takeover,
      reorderSessions: vi.fn(async () => true),
      serialize: vi.fn(() => ''),
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.textContent).toContain('terminal.mirror-controlled')
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host?.getAttribute('aria-readonly')).toBe('true')
      expect(container.querySelector('.goblin-terminal-slot__viewer-overlay')).toBeTruthy()
      const button = Array.from(container.querySelectorAll('button')).find(
        (node) => node.textContent === 'terminal.takeover',
      )
      expect(button).toBeDefined()

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(takeover).toHaveBeenCalledWith('terminal-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not automatically create a default terminal from render lifecycle', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let repoReady = false
    const emptyWorktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: null,
      sessions: [],
      count: 0,
    }
    const emptySnapshot = { phase: 'opening' as const, message: null, processName: 'terminal' }
    const context: TerminalSessionContextValue = {
      createTerminal: vi.fn(async () => 'terminal-2'),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
      registerWorktreeHost: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      restart: vi.fn(),
      isTerminalFocusTarget: vi.fn(() => false),
      findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      clearSearch: vi.fn(),
      writeInput: vi.fn(),
      takeover: vi.fn(),
      reorderSessions: vi.fn(async () => true),
      serialize: vi.fn(() => ''),
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => emptyWorktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => repoReady,
      subscribeRepoSync: () => () => {},
      snapshot: () => emptySnapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.querySelector('.goblin-terminal-slot__empty')).toBeNull()
      repoReady = true
      await act(async () => {
        root.render(
          <TerminalSessionContext.Provider value={context}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>,
        )
      })
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not render the removed redraw button for the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const redraw = vi.fn()
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture()
    const context = { ...terminalContext(), redraw }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot={descriptor.repoRoot} branch={descriptor.branch} worktreePath={descriptor.worktreePath} />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="terminal.redraw"]')
      expect(button).toBeNull()
      expect(redraw).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('writes internal file tree path drops into the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const descriptor = {
      key: 'terminal-1',
      worktreeTerminalKey: '/repo\0/worktree',
      terminalId: 'terminal-1',
      index: 1,
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/worktree',
    }
    const context: TerminalSessionContextValue = {
      createTerminal: vi.fn(async () => 'terminal-1'),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
      registerWorktreeHost: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      restart: vi.fn(),
      isTerminalFocusTarget: vi.fn(() => false),
      findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
      clearSearch: vi.fn(),
      writeInput,
      takeover: vi.fn(),
      reorderSessions: vi.fn(async () => true),
      serialize: vi.fn(() => ''),
    }
    const worktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
      count: 1,
    }
    const snapshot = {
      phase: 'open' as const,
      message: null,
      processName: 'zsh',
      attachment: {
        role: 'controller' as const,
        controllerStatus: 'connected' as const,
        active: true,
        canTakeover: false,
        canonicalCols: 120,
        canonicalRows: 40,
      },
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: [GOBLIN_FILE_PATHS_MIME],
          files: [],
          getData: (type: string) =>
            type === GOBLIN_FILE_PATHS_MIME
              ? serializeGoblinFilePathDragPayload(['/worktree/a file.ts', '/worktree/b.ts'])
              : '',
        },
      })
      await act(async () => {
        container.querySelector('.goblin-terminal-slot')?.dispatchEvent(event)
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', "'a file.ts' b.ts")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('renders custom terminal buttons and submits values to the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
      expect(button).toBeDefined()

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('applies the configured size to custom terminal buttons', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtonSize = 'large'
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(button?.classList.contains('goblin-terminal-custom-buttons__button--large')).toBe(true)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('renders external input when enabled for writable controller sessions', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const prefix = container.querySelector('.goblin-terminal-external-input__prefix')
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(prefix?.textContent).toBe('>')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, 'git status --short')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
      expect((input as HTMLTextAreaElement).value).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('fills terminal external input without writing to the PTY', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const filled = fillTerminalExternalInput('/repo\u0000/worktree', 'codex exec "resolve conflicts"')
      await act(async () => {
        await Promise.resolve()
      })

      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(filled).toBe(true)
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      expect((input as HTMLTextAreaElement).value).toBe('codex exec "resolve conflicts"')
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not register external input fill when external input is disabled', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.querySelector('.goblin-terminal-external-input__control')).toBeNull()
      expect(fillTerminalExternalInput('/repo\u0000/worktree', 'codex exec')).toBe(false)
      await act(async () => {
        await Promise.resolve()
      })

      expect(container.querySelector('.goblin-terminal-external-input__control')).toBeNull()
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('submits external input from the send button', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const sendButton = container.querySelector('button[aria-label="terminal.external-input-send"]')
      expect(sendButton).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, 'git status --short')
        sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
      expect((input as HTMLTextAreaElement).value).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('inserts dragged file tree paths into external input without submitting', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: [GOBLIN_FILE_PATHS_MIME],
          files: [],
          getData: (type: string) =>
            type === GOBLIN_FILE_PATHS_MIME
              ? serializeGoblinFilePathDragPayload(['/worktree/a file.ts', '/worktree/b.ts'])
              : '',
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
      })

      expect((input as HTMLTextAreaElement).value).toBe("'a file.ts' b.ts")
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not intercept text paste in external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: (type: string) => (type === 'text/plain' ? 'plain text' : ''),
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
      })

      expect(event.defaultPrevented).toBe(false)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('saves binary paste files and inserts returned paths into external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    runtimeSettingsMocks.temporaryFilesDirectory = '/Users/test/project/tmp'
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({
      ok: true,
      paths: ['/Users/test/project/tmp/pasted image.png'],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).toHaveBeenCalledWith({
        worktreePath: '/worktree',
        temporaryFilesDirectory: '/Users/test/project/tmp',
        files: [{ name: 'image.png', type: 'image/png', bytes: expect.any(ArrayBuffer) }],
      })
      expect(input?.value).toBe("'/Users/test/project/tmp/pasted image.png'")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('keeps external input unchanged when binary paste save fails', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({ ok: false, message: 'error.failed-write-file' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      if (!input) throw new Error('expected external input')
      setInputValue(input, 'echo ')
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(input?.value).toBe('echo ')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('saves binary paste files and writes returned paths into the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.temporaryFilesDirectory = '/Users/test/project/tmp'
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({
      ok: true,
      paths: ['/Users/test/project/tmp/pasted image.png'],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLDivElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        host?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).toHaveBeenCalledWith({
        worktreePath: '/worktree',
        temporaryFilesDirectory: '/Users/test/project/tmp',
        files: [{ name: 'image.png', type: 'image/png', bytes: expect.any(ArrayBuffer) }],
      })
      expect(writeInput).toHaveBeenCalledWith('terminal-1', "'/Users/test/project/tmp/pasted image.png'")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('copies system clipboard file paths to temp and writes returned paths into the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    appShellMocks.readSystemClipboardFilePaths.mockResolvedValue(['/Users/test/Desktop/report.pdf'])
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({
      ok: true,
      paths: ['/worktree/tmp/pasted report.pdf'],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLDivElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [],
          items: [],
        },
      })

      await act(async () => {
        host?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).toHaveBeenCalledWith({
        worktreePath: '/worktree',
        temporaryFilesDirectory: '',
        files: [],
        sourcePaths: ['/Users/test/Desktop/report.pdf'],
      })
      expect(writeInput).toHaveBeenCalledWith('terminal-1', "'/worktree/tmp/pasted report.pdf'")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('uploads system clipboard file paths to remote tmp and writes remote paths into the active terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    appShellMocks.readSystemClipboardFilePaths.mockResolvedValue(['/Users/test/Desktop/report.pdf'])
    repoClientMocks.transferRepositoryFiles.mockResolvedValue({
      ok: true,
      copied: [{ destinationPath: '/srv/repo-feature/tmp/report.pdf', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture('controller', {
      repoRoot: REMOTE_REPO_ID,
      worktreePath: '/srv/repo-feature',
    })
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot={REMOTE_REPO_ID} branch="feature" worktreePath="/srv/repo-feature" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLDivElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [],
          items: [],
        },
      })

      await act(async () => {
        host?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
      expect(repoClientMocks.transferRepositoryFiles).toHaveBeenCalledWith({
        repoId: REMOTE_REPO_ID,
        worktreePath: '/srv/repo-feature',
        targetDirPath: '/srv/repo-feature/tmp',
        source: {
          kind: 'localPaths',
          items: [
            {
              path: '/Users/test/Desktop/report.pdf',
              destinationName: expect.stringMatching(/^report-20\d{6}-\d{6}\.pdf$/),
            },
          ],
        },
      })
      expect(writeInput).toHaveBeenCalledWith('terminal-1', '/srv/repo-feature/tmp/report.pdf')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('uploads binary paste files to remote tmp and inserts remote paths into external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    repoClientMocks.transferRepositoryFiles.mockResolvedValue({
      ok: true,
      copied: [{ destinationPath: '/srv/repo-feature/tmp/image.png', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture('controller', {
      repoRoot: REMOTE_REPO_ID,
      worktreePath: '/srv/repo-feature',
    })
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot={REMOTE_REPO_ID} branch="feature" worktreePath="/srv/repo-feature" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
      expect(repoClientMocks.transferRepositoryFiles).toHaveBeenCalledWith({
        repoId: REMOTE_REPO_ID,
        worktreePath: '/srv/repo-feature',
        targetDirPath: '/srv/repo-feature/tmp',
        source: {
          kind: 'uploadedItems',
          items: [
            {
              name: expect.stringMatching(/^image-20\d{6}-\d{6}\.png$/),
              mimeType: 'image/png',
              bytesBase64: 'AQID',
              byteLength: 3,
            },
          ],
        },
      })
      expect(input?.value).toBe('/srv/repo-feature/tmp/image.png')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('clears external input on ctrl c without submitting', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)

      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, 'git status --short')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))
      })

      expect((input as HTMLTextAreaElement).value).toBe('')
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not submit empty external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, '   ')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      expect(writeInput).not.toHaveBeenCalled()
      expect((input as HTMLTextAreaElement).value).toBe('   ')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('fills external input from input-mode custom button', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'commit', value: 'git commit -m ""', action: 'input' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'commit')
      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })

      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input?.value).toBe('git commit -m ""')
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('sends input-mode custom button text without enter when external input is unavailable', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'commit', value: 'git commit -m ""', action: 'input' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'commit')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(container.querySelector('.goblin-terminal-external-input__control')).toBeNull()

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git commit -m ""')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('submits multiline external input from the send button', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const sendButton = container.querySelector('button[aria-label="terminal.external-input-send"]')
      expect(sendButton).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, 'cat <<EOF\nhello\nEOF')
        sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'cat <<EOF\nhello\nEOF\r')
      expect((input as HTMLTextAreaElement).value).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('keeps multiline external input editable on shift enter', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLTextAreaElement)

      await act(async () => {
        setInputValue(input as HTMLTextAreaElement, 'cat <<EOF')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
      })

      expect(writeInput).not.toHaveBeenCalled()
      expect((input as HTMLTextAreaElement).value).toBe('cat <<EOF')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('resizes external input from the top-right handle', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      const handle = container.querySelector('.goblin-terminal-external-input__resize') as HTMLButtonElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      expect(handle).toBeInstanceOf(HTMLButtonElement)
      Object.defineProperty(input, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ height: 44, width: 300, top: 0, right: 300, bottom: 44, left: 0, x: 0, y: 0, toJSON: () => ({}) }),
      })

      await act(async () => {
        handle?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientY: 100, bubbles: true }))
        handle?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 70, bubbles: true }))
        handle?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientY: 70, bubbles: true }))
      })

      expect(input?.style.height).toBe('74px')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('hides custom terminal buttons when visibility is disabled', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtonsVisible = false
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.querySelector('.goblin-terminal-custom-buttons')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not render external input for readonly sessions', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture('viewer')
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.querySelector('.goblin-terminal-external-input__control')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not render custom terminal buttons for readonly sessions', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture('viewer')
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.querySelector('.goblin-terminal-custom-buttons')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

})

function controllerFixture(
  role: 'controller' | 'viewer' = 'controller',
  options: { repoRoot?: string; worktreePath?: string; branch?: string } = {},
) {
  const repoRoot = options.repoRoot ?? '/repo'
  const worktreePath = options.worktreePath ?? '/worktree'
  const branch = options.branch ?? 'feature'
  const descriptor = {
    key: 'terminal-1',
    worktreeTerminalKey: `${repoRoot}\0${worktreePath}`,
    terminalId: 'terminal-1',
    index: 1,
    repoRoot,
    branch,
    worktreePath,
  }
  const worktreeSnapshot = {
    worktreeTerminalKey: `${repoRoot}\0${worktreePath}`,
    selectedDescriptor: descriptor,
    sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
    count: 1,
  }
  const snapshot = {
    phase: 'open' as const,
    message: null,
    processName: 'zsh',
    attachment: {
      role,
      controllerStatus: 'connected' as const,
      active: role === 'controller',
      canTakeover: role !== 'controller',
      canonicalCols: 120,
      canonicalRows: 40,
    },
  }
  return { descriptor, worktreeSnapshot, snapshot }
}

function terminalContext(overrides: Partial<TerminalSessionContextValue> = {}): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => 'terminal-1'),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
    ...overrides,
  }
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
