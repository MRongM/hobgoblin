// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { TerminalCustomButton } from '#/shared/settings.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { GOBLIN_FILE_PATHS_MIME, serializeGoblinFilePathDragPayload } from '#/shared/file-tree.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { MainWindowNavigationProvider } from '#/web/main-window-navigation.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSnapshot,
} from '#/web/components/terminal/types.ts'

const i18nMocks = vi.hoisted(() => ({
  translations: {} as Record<string, string>,
}))

const clipboardMocks = vi.hoisted(() => ({
  writeTerminalClipboardText: vi.fn(async () => true),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => i18nMocks.translations[key] ?? key,
}))

vi.mock('#/web/components/terminal/terminal-clipboard.ts', () => ({
  writeTerminalClipboardText: clipboardMocks.writeTerminalClipboardText,
}))

vi.mock('sonner', () => ({
  toast: { error: toastMocks.error },
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

const editorOpenMocks = vi.hoisted(() => ({
  openWorktreeEditorTarget: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('#/web/lib/editor-open-targets.ts', () => ({
  openWorktreeEditorTarget: editorOpenMocks.openWorktreeEditorTarget,
}))

const mobileDetectionMocks = vi.hoisted(() => ({
  isMobileDevice: false,
}))

vi.mock('#/web/components/terminal/mobile-detection.ts', () => ({
  isMobileDevice: () => mobileDetectionMocks.isMobileDevice,
}))

const runtimeSettingsMocks = vi.hoisted(() => ({
  temporaryFilesDirectory: '',
  terminalFontSize: 14,
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium' as 'small' | 'medium' | 'large',
  terminalCustomButtons: [] as TerminalCustomButton[],
}))

vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
  useRuntimeTerminalSettings: () => ({
    temporaryFilesDirectory: runtimeSettingsMocks.temporaryFilesDirectory,
    terminalFontSize: runtimeSettingsMocks.terminalFontSize,
    terminalCustomButtonsVisible: runtimeSettingsMocks.terminalCustomButtonsVisible,
    terminalCustomButtonSize: runtimeSettingsMocks.terminalCustomButtonSize,
    terminalCustomButtons: runtimeSettingsMocks.terminalCustomButtons,
  }),
}))

afterEach(() => {
  runtimeSettingsMocks.temporaryFilesDirectory = ''
  runtimeSettingsMocks.terminalFontSize = 14
  runtimeSettingsMocks.terminalCustomButtonsVisible = true
  runtimeSettingsMocks.terminalCustomButtonSize = 'medium'
  runtimeSettingsMocks.terminalCustomButtons = []
  i18nMocks.translations = {}
  appShellMocks.readSystemClipboardFilePaths.mockReset()
  appShellMocks.readSystemClipboardFilePaths.mockResolvedValue([])
  appShellMocks.saveClipboardBinaryFilesFromPaste.mockReset()
  repoClientMocks.transferRepositoryFiles.mockReset()
  editorOpenMocks.openWorktreeEditorTarget.mockReset()
  editorOpenMocks.openWorktreeEditorTarget.mockResolvedValue({ ok: true })
  clipboardMocks.writeTerminalClipboardText.mockReset()
  clipboardMocks.writeTerminalClipboardText.mockResolvedValue(true)
  toastMocks.error.mockReset()
  mobileDetectionMocks.isMobileDevice = false
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const REMOTE_REPO_ID = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/repo' })

describe('TerminalSlot', () => {
  test('does not show a loading status while terminal creation is pending without a registered session', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let worktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: null,
      sessions: [],
      count: 0,
      creating: true,
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
      subscribeSnapshot: () => () => {},
    }
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={terminalContext()}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()

    worktreeSnapshot = { ...worktreeSnapshot, creating: false }
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  test('does not show a loading status while the terminal opens', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    let currentWorktreeSnapshot = { ...worktreeSnapshot, creating: false }
    let currentSnapshot: TerminalSnapshot = { ...snapshot, phase: 'opening', attachment: null }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => currentWorktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => currentSnapshot,
      subscribeSnapshot: () => () => {},
    }
    const context = terminalContext()
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()

    currentSnapshot = snapshot
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()

    currentWorktreeSnapshot = { ...currentWorktreeSnapshot, creating: true }
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  test('defers desktop autofocus until ready without showing loading, and avoids mobile autofocus', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    let currentSnapshot: TerminalSnapshot = { ...snapshot, renderPending: true }
    const attach = vi.fn((_descriptor: Parameters<TerminalSessionContextValue['attach']>[0], host: HTMLElement) => {
      if (!host.querySelector('textarea')) host.appendChild(document.createElement('textarea'))
    })
    const context = terminalContext({ attach })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => currentSnapshot,
      subscribeSnapshot: () => () => {},
    }
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()
    expect(document.activeElement).not.toBe(textarea)

    currentSnapshot = snapshot
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__status-overlay')).toBeNull()
    expect(document.activeElement).toBe(textarea)

    mobileDetectionMocks.isMobileDevice = true
    ;(textarea as HTMLTextAreaElement).blur()
    currentSnapshot = { ...snapshot, renderPending: true }
    await act(async () => renderSlot())
    currentSnapshot = snapshot
    await act(async () => renderSlot())
    expect(document.activeElement).not.toBe(textarea)

    await act(async () => root.unmount())
    container.remove()
  })

  test('keeps the terminal host mounted when progress appears and clears', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    let currentSnapshot: typeof snapshot & { progress?: { state: 1; value: number } } = snapshot
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => currentSnapshot,
      subscribeSnapshot: () => () => {},
    }
    const context = terminalContext()
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    const initialHost = container.querySelector('.goblin-terminal-slot__host')
    expect(initialHost).not.toBeNull()

    currentSnapshot = { ...snapshot, progress: { state: 1, value: 50 } }
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__host')).toBe(initialHost)

    currentSnapshot = snapshot
    await act(async () => renderSlot())
    expect(container.querySelector('.goblin-terminal-slot__host')).toBe(initialHost)

    await act(async () => root.unmount())
    container.remove()
  })

  test('does not reattach the terminal when output state rerenders the slot', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture()
    let currentSnapshot: typeof snapshot & { progress?: { state: 1; value: number } } = snapshot
    const attach = vi.fn()
    const detach = vi.fn()
    const context = terminalContext({ attach, detach })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => currentSnapshot,
      subscribeSnapshot: () => () => {},
    }
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    expect(attach).toHaveBeenCalledTimes(1)

    currentSnapshot = { ...snapshot, progress: { state: 1, value: 50 } }
    await act(async () => renderSlot())

    expect(attach).toHaveBeenCalledTimes(1)
    expect(detach).not.toHaveBeenCalledWith(descriptor.key, expect.any(HTMLElement))

    await act(async () => root.unmount())
    container.remove()
  })

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
      restoreTmuxSessions: vi.fn(async () => 0),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      focusTerminal: vi.fn(),
      scrollLines: vi.fn(),
      scrollByTouch: vi.fn(),
      beginMobileSelection: vi.fn(() => false),
      extendMobileSelection: vi.fn(),
      finishMobileSelection: vi.fn(),
      cancelMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => ''),
      clearMobileSelection: vi.fn(),
      writeExtraKey: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(),
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" onRevealPath={onRevealPath} />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const [attachedDescriptor, attachedHost, handlers] = attach.mock.calls[0] ?? []
      expect(attachedDescriptor).toBe(descriptor)
      expect(attachedHost).toBeInstanceOf(HTMLElement)
      expect(handlers?.onRevealPath).toEqual(expect.any(Function))
      expect(handlers?.onOpenPathInEditor).toEqual(expect.any(Function))

      handlers?.onRevealPath?.('src/app.ts')
      expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('passes terminal path editor handler through terminal attach', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const attach = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ attach })
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const handlers = attach.mock.calls[0]?.[2]
      expect(handlers?.onOpenPathInEditor).toEqual(expect.any(Function))

      await act(async () => {
        await handlers?.onOpenPathInEditor?.({ path: 'src/app.ts', line: 12 })
      })

      expect(editorOpenMocks.openWorktreeEditorTarget).toHaveBeenCalledWith('/repo', '/worktree', {
        path: 'src/app.ts',
        line: 12,
      })
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
    const scrollToBottom = vi.fn()
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
      restoreTmuxSessions: vi.fn(async () => 0),
      selectTerminal: vi.fn(),
      scrollToBottom,
      focusTerminal: vi.fn(),
      scrollLines: vi.fn(),
      scrollByTouch: vi.fn(),
      beginMobileSelection: vi.fn(() => false),
      extendMobileSelection: vi.fn(),
      finishMobileSelection: vi.fn(),
      cancelMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => ''),
      clearMobileSelection: vi.fn(),
      writeExtraKey: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(),
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      expect(container.textContent).toContain('terminal.mirror-controlled')
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host?.getAttribute('aria-readonly')).toBe('true')
      expect(host?.classList.contains('goblin-terminal-slot__host--hidden')).toBe(false)
      expect(host?.classList.contains('goblin-terminal-slot__host--canonical-readonly')).toBe(true)
      const viewerStatus = container.querySelector('.goblin-terminal-slot__viewer-status')
      expect(viewerStatus).toBeTruthy()
      expect(viewerStatus?.getAttribute('role')).toBeNull()
      const viewerMessage = viewerStatus?.querySelector('.goblin-terminal-slot__viewer-message')
      expect(viewerMessage?.getAttribute('role')).toBe('status')
      expect(container.querySelector('.goblin-terminal-slot__viewer-overlay')).toBeNull()
      expect(container.querySelector('.goblin-terminal-slot__viewer-output')).toBeNull()
      const viewerActions = viewerStatus?.querySelector('.goblin-terminal-slot__viewer-actions')
      expect(viewerActions).toBeInstanceOf(HTMLDivElement)
      expect(viewerStatus?.firstElementChild).toBe(viewerActions)
      expect(viewerStatus?.lastElementChild).toBe(viewerMessage)
      const buttons = Array.from(viewerActions?.querySelectorAll('button') ?? [])
      expect(buttons.map((button) => button.textContent)).toEqual([
        'T↑',
        'T↓',
        'terminal.command-deck.scroll-to-bottom',
        'terminal.takeover',
      ])
      expect(buttons.map((button) => button.dataset.variant)).toEqual([
        'secondary',
        'secondary',
        'secondary',
        'secondary',
      ])

      await act(async () => {
        buttons[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        buttons[3]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(scrollToBottom).toHaveBeenCalledWith('terminal-1')
      expect(takeover).toHaveBeenCalledWith('terminal-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test.each(['controller', 'viewer', 'unowned'] as const)(
    'routes primary vertical touch drags through mobile terminal scrolling for a %s attachment',
    async (role) => {
      vi.useFakeTimers()
      mobileDetectionMocks.isMobileDevice = true
      const scrollByTouch = vi.fn()
      const beginMobileSelection = vi.fn(() => true)
      const writeInput = vi.fn()
      const takeover = vi.fn()
      const { container, root } = await renderTerminalSlotFixture(role, {
        scrollByTouch,
        beginMobileSelection,
        writeInput,
        takeover,
      })

      try {
        const host = container.querySelector('.goblin-terminal-slot__host')
        expect(host).toBeInstanceOf(HTMLElement)
        const setPointerCapture = vi.fn()
        Object.defineProperty(host, 'setPointerCapture', { configurable: true, value: setPointerCapture })

        await act(async () => {
          host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, pointerType: 'mouse' }))
          host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 170, pointerType: 'mouse' }))
        })
        expect(scrollByTouch).not.toHaveBeenCalled()

        await act(async () => {
          host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200 }))
        })
        expect(setPointerCapture).not.toHaveBeenCalled()

        await act(async () => {
          host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 190 }))
          vi.advanceTimersByTime(500)
        })
        expect(setPointerCapture).toHaveBeenCalledWith(1)
        expect(beginMobileSelection).not.toHaveBeenCalled()
        expect(scrollByTouch).not.toHaveBeenCalled()

        const verticalMove = terminalPointerEvent('pointermove', { clientY: 170 })
        await act(async () => {
          host?.dispatchEvent(verticalMove)
        })
        expect(verticalMove.defaultPrevented).toBe(true)
        expect(scrollByTouch).toHaveBeenLastCalledWith('terminal-1', {
          lines: 2,
          clientX: 0,
          clientY: 170,
        })

        const verticalEnd = terminalPointerEvent('pointerup', { clientY: 170 })
        await act(async () => {
          host?.dispatchEvent(verticalEnd)
          host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 100, pointerId: 2 }))
          host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 128, pointerId: 2 }))
        })
        expect(verticalEnd.defaultPrevented).toBe(true)
        expect(scrollByTouch).toHaveBeenLastCalledWith('terminal-1', {
          lines: -2,
          clientX: 0,
          clientY: 128,
        })
        expect(writeInput).not.toHaveBeenCalled()
        expect(takeover).not.toHaveBeenCalled()
      } finally {
        await act(async () => root.unmount())
        container.remove()
      }
    },
  )

  test('leaves taps, touch slop, and horizontal drags to ordinary terminal interaction', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const scrollByTouch = vi.fn()
    const beginMobileSelection = vi.fn(() => true)
    const { container, root } = await renderTerminalSlotFixture('controller', {
      scrollByTouch,
      beginMobileSelection,
    })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLElement)
      const setPointerCapture = vi.fn()
      Object.defineProperty(host, 'setPointerCapture', { configurable: true, value: setPointerCapture })

      const slopMove = terminalPointerEvent('pointermove', { clientX: 102, clientY: 196 })
      const tapEnd = terminalPointerEvent('pointerup', { clientX: 102, clientY: 196 })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 100, clientY: 200 }))
        host?.dispatchEvent(slopMove)
        host?.dispatchEvent(tapEnd)
        vi.advanceTimersByTime(500)
      })
      expect(slopMove.defaultPrevented).toBe(false)
      expect(tapEnd.defaultPrevented).toBe(false)
      expect(setPointerCapture).not.toHaveBeenCalled()

      const horizontalMove = terminalPointerEvent('pointermove', { clientX: 140, clientY: 205, pointerId: 2 })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 100, clientY: 200, pointerId: 2 }))
        host?.dispatchEvent(horizontalMove)
        vi.advanceTimersByTime(500)
      })
      expect(horizontalMove.defaultPrevented).toBe(false)
      expect(setPointerCapture).not.toHaveBeenCalled()
      expect(scrollByTouch).not.toHaveBeenCalled()
      expect(beginMobileSelection).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test.each(['controller', 'viewer', 'unowned'] as const)(
    'long-presses a word, extends selection, and offers Copy for a %s attachment',
    async (role) => {
      vi.useFakeTimers()
      mobileDetectionMocks.isMobileDevice = true
      const beginMobileSelection = vi.fn(() => true)
      const extendMobileSelection = vi.fn()
      const finishMobileSelection = vi.fn()
      const mobileSelectionText = vi.fn(() => 'selected word')
      const writeInput = vi.fn()
      const takeover = vi.fn()
      const { container, root } = await renderTerminalSlotFixture(role, {
        beginMobileSelection,
        extendMobileSelection,
        finishMobileSelection,
        mobileSelectionText,
        writeInput,
        takeover,
      })

      try {
        const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
        const setPointerCapture = vi.fn()
        const releasePointerCapture = vi.fn()
        Object.defineProperties(host, {
          setPointerCapture: { configurable: true, value: setPointerCapture },
          hasPointerCapture: { configurable: true, value: () => true },
          releasePointerCapture: { configurable: true, value: releasePointerCapture },
        })

        await act(async () => {
          host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
          host?.dispatchEvent(terminalPointerEvent('pointermove', { clientX: 84, clientY: 123 }))
          vi.advanceTimersByTime(499)
        })
        expect(beginMobileSelection).not.toHaveBeenCalled()

        await act(async () => vi.advanceTimersByTime(1))
        expect(beginMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 84, clientY: 123 })
        expect(setPointerCapture).toHaveBeenCalledWith(1)

        const selectionMove = terminalPointerEvent('pointermove', { clientX: 145, clientY: 150 })
        const selectionEnd = terminalPointerEvent('pointerup', { clientX: 150, clientY: 155 })
        await act(async () => {
          host?.dispatchEvent(selectionMove)
          host?.dispatchEvent(selectionEnd)
        })

        expect(selectionMove.defaultPrevented).toBe(true)
        expect(selectionEnd.defaultPrevented).toBe(true)
        expect(extendMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 145, clientY: 150 })
        expect(finishMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 150, clientY: 155 })
        expect(mobileSelectionText).toHaveBeenCalledWith('terminal-1')
        expect(releasePointerCapture).toHaveBeenCalledWith(1)
        expect(container.querySelector('.goblin-terminal-selection-copy')?.textContent).toBe('menu.edit.copy')
        expect(writeInput).not.toHaveBeenCalled()
        expect(takeover).not.toHaveBeenCalled()
      } finally {
        await act(async () => root.unmount())
        container.remove()
      }
    },
  )

  test('copies the current selection and clears it only after clipboard success', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const clearMobileSelection = vi.fn()
    const mobileSelectionText = vi.fn(() => 'copy on release')
    const { container, root } = await renderTerminalSlotFixture('controller', {
      beginMobileSelection: vi.fn(() => true),
      finishMobileSelection: vi.fn(),
      mobileSelectionText,
      clearMobileSelection,
    })

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      Object.defineProperties(host, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
      })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
        vi.advanceTimersByTime(500)
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientX: 90, clientY: 130 }))
      })

      const copy = container.querySelector<HTMLButtonElement>('.goblin-terminal-selection-copy')
      expect(copy).toBeInstanceOf(HTMLButtonElement)
      clearMobileSelection.mockClear()
      await act(async () => {
        copy?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })

      expect(clipboardMocks.writeTerminalClipboardText).toHaveBeenCalledWith('copy on release')
      expect(clearMobileSelection).toHaveBeenCalledWith('terminal-1')
      expect(container.querySelector('.goblin-terminal-selection-copy')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not offer Copy when xterm reports an empty selection on release', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const { container, root } = await renderTerminalSlotFixture('viewer', {
      beginMobileSelection: vi.fn(() => true),
      finishMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => ''),
    })

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      Object.defineProperties(host, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
      })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
        vi.advanceTimersByTime(500)
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientX: 90, clientY: 130 }))
      })

      expect(container.querySelector('.goblin-terminal-selection-copy')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('retains selection and Copy action when every clipboard path fails', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    i18nMocks.translations['terminal.selection-copy-failed'] = 'Copy failed'
    clipboardMocks.writeTerminalClipboardText.mockResolvedValue(false)
    const clearMobileSelection = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('viewer', {
      beginMobileSelection: vi.fn(() => true),
      finishMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => 'retry selection'),
      clearMobileSelection,
    })

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      Object.defineProperties(host, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
      })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
        vi.advanceTimersByTime(500)
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientX: 90, clientY: 130 }))
      })
      const copy = container.querySelector<HTMLButtonElement>('.goblin-terminal-selection-copy')

      clearMobileSelection.mockClear()
      await act(async () => {
        copy?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })

      expect(clearMobileSelection).not.toHaveBeenCalled()
      expect(toastMocks.error).toHaveBeenCalledWith('Copy failed')
      expect(container.querySelector('.goblin-terminal-selection-copy')).toBe(copy)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('cancels a committed long-press selection without showing Copy', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const cancelMobileSelection = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('unowned', {
      beginMobileSelection: vi.fn(() => true),
      cancelMobileSelection,
      mobileSelectionText: vi.fn(() => 'should not copy'),
    })

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      Object.defineProperties(host, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
      })
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
        vi.advanceTimersByTime(500)
        host?.dispatchEvent(terminalPointerEvent('pointercancel', { clientX: 90, clientY: 130 }))
      })

      expect(cancelMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 90, clientY: 130 })
      expect(container.querySelector('.goblin-terminal-selection-copy')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('cancels and releases a committed selection before a new primary touch starts', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const cancelMobileSelection = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('controller', {
      beginMobileSelection: vi.fn(() => true),
      cancelMobileSelection,
    })

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      const capturedPointers = new Set<number>()
      const releasePointerCapture = vi.fn((pointerId: number) => capturedPointers.delete(pointerId))
      Object.defineProperties(host, {
        setPointerCapture: {
          configurable: true,
          value: (pointerId: number) => capturedPointers.add(pointerId),
        },
        hasPointerCapture: {
          configurable: true,
          value: (pointerId: number) => capturedPointers.has(pointerId),
        },
        releasePointerCapture: { configurable: true, value: releasePointerCapture },
      })

      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120, pointerId: 1 }))
        vi.advanceTimersByTime(500)
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientX: 95, clientY: 135, pointerId: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 40, clientY: 60, pointerId: 2 }))
      })

      expect(cancelMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 95, clientY: 135 })
      expect(releasePointerCapture).toHaveBeenCalledWith(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('releases pointer capture when a committed selection unmounts', async () => {
    vi.useFakeTimers()
    mobileDetectionMocks.isMobileDevice = true
    const cancelMobileSelection = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('viewer', {
      beginMobileSelection: vi.fn(() => true),
      cancelMobileSelection,
    })
    const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
    const releasePointerCapture = vi.fn()
    Object.defineProperties(host, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    })

    await act(async () => {
      host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientX: 80, clientY: 120 }))
      vi.advanceTimersByTime(500)
      root.unmount()
    })

    expect(cancelMobileSelection).toHaveBeenCalledWith('terminal-1', { clientX: 80, clientY: 120 })
    expect(releasePointerCapture).toHaveBeenCalledWith(1)
    container.remove()
  })

  test('continues a recent fast manual drag with decelerating terminal inertia', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const animationFrames = installAnimationFrameHarness()
    const scrollByTouch = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('controller', { scrollByTouch })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLElement)
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, timeStamp: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 150, timeStamp: 17 }))
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientY: 150, timeStamp: 21 }))
      })

      scrollByTouch.mockClear()
      expect(animationFrames.pendingCount()).toBe(1)
      let frameTime = 37
      let frameCount = 0
      while (animationFrames.pendingCount() > 0 && frameCount < 120) {
        await act(async () => animationFrames.runNext(frameTime))
        frameTime += 16
        frameCount += 1
      }

      expect(scrollByTouch.mock.calls.length).toBeGreaterThan(1)
      expect(scrollByTouch.mock.calls.every(([, input]) => input.lines > 0)).toBe(true)
      expect(frameCount).toBeLessThan(120)
      expect(animationFrames.pendingCount()).toBe(0)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      animationFrames.restore()
    }
  })

  test('cancels pending inertia on a new primary touch and never starts it from pointer cancellation', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const animationFrames = installAnimationFrameHarness()
    const scrollByTouch = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('controller', { scrollByTouch })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, timeStamp: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 150, timeStamp: 17 }))
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientY: 150, timeStamp: 21 }))
      })
      expect(animationFrames.pendingCount()).toBe(1)

      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 120, pointerId: 2, timeStamp: 23 }))
      })
      expect(animationFrames.pendingCount()).toBe(0)

      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 70, pointerId: 2, timeStamp: 39 }))
        host?.dispatchEvent(terminalPointerEvent('pointercancel', { clientY: 70, pointerId: 2, timeStamp: 41 }))
      })
      expect(animationFrames.pendingCount()).toBe(0)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      animationFrames.restore()
    }
  })

  test('cancels pending inertia when terminal input authority changes', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const animationFrames = installAnimationFrameHarness()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture('controller')
    let currentSnapshot = snapshot
    const context = terminalContext()
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => currentSnapshot,
      subscribeSnapshot: () => () => {},
    }
    const renderSlot = () =>
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )

    await act(async () => renderSlot())
    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, timeStamp: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 150, timeStamp: 17 }))
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientY: 150, timeStamp: 21 }))
      })
      expect(animationFrames.pendingCount()).toBe(1)

      currentSnapshot = {
        ...snapshot,
        attachment: {
          ...snapshot.attachment,
          role: 'viewer',
          active: false,
          canTakeover: true,
        },
      }
      await act(async () => renderSlot())
      expect(animationFrames.pendingCount()).toBe(0)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      animationFrames.restore()
    }
  })

  test('places the controller command deck in the bottom dock and outside the top-right float group', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      const floatGroup = container.querySelector('.goblin-terminal-float-group')
      const bottomDock = container.querySelector('.goblin-terminal-bottom-dock')
      const commandDeck = container.querySelector('.goblin-terminal-command-deck')

      expect(commandDeck).toBeInstanceOf(HTMLElement)
      expect(bottomDock).toBeInstanceOf(HTMLElement)
      expect(commandDeck?.parentElement).toBe(bottomDock)
      expect(floatGroup?.contains(commandDeck)).toBe(false)
      expect(container.querySelector('.goblin-terminal-cycle-dock')).toBeNull()
      expect(container.querySelectorAll('button[title="terminal.command-deck.previous-terminal"]')).toHaveLength(1)
      expect(container.querySelectorAll('button[title="terminal.command-deck.next-terminal"]')).toHaveLength(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('tracks the obscured bottom edge of the Mobile Web visual viewport for the command deck', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const visualViewport = installVisualViewportHarness({
      layoutHeight: 844,
      height: 524,
      offsetTop: 0,
    })
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      const slot = container.querySelector<HTMLElement>('.goblin-terminal-slot')
      expect(slot?.style.getPropertyValue('--goblin-terminal-visual-viewport-bottom-inset')).toBe('320px')

      await act(async () => {
        visualViewport.update({ height: 500, offsetTop: 44 })
      })
      expect(slot?.style.getPropertyValue('--goblin-terminal-visual-viewport-bottom-inset')).toBe('300px')
    } finally {
      await act(async () => root.unmount())
      container.remove()
      visualViewport.restore()
    }
  })

  test('uses a local Mobile Web focus mode to hide and restore the complete auxiliary keyboard dock', async () => {
    mobileDetectionMocks.isMobileDevice = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      const focus = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'terminal.command-deck.focus',
      )
      expect(focus).toBeInstanceOf(HTMLButtonElement)
      expect(container.querySelector('.goblin-terminal-bottom-dock')).toBeInstanceOf(HTMLDivElement)
      expect(container.querySelector('.goblin-terminal-custom-buttons')).toBeInstanceOf(HTMLDivElement)

      await act(async () => focus?.click())
      expect(container.querySelector('.goblin-terminal-bottom-dock')).toBeNull()
      expect(container.querySelector('.goblin-terminal-command-deck')).toBeNull()
      expect(container.querySelector('.goblin-terminal-custom-buttons')).toBeNull()

      const exitFocus = container.querySelector<HTMLButtonElement>('.goblin-terminal-focus-exit')
      expect(exitFocus?.textContent).toBe('terminal.command-deck.exit-focus')
      expect(container.querySelector('.goblin-terminal-float-group')?.contains(exitFocus)).toBe(true)

      await act(async () => exitFocus?.click())
      expect(container.querySelector('.goblin-terminal-bottom-dock')).toBeInstanceOf(HTMLDivElement)
      expect(container.querySelector('.goblin-terminal-command-deck')).toBeInstanceOf(HTMLDivElement)
      expect(container.querySelector('.goblin-terminal-focus-exit')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('stops touch inertia when the command-deck action returns to bottom', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const animationFrames = installAnimationFrameHarness()
    const scrollToBottom = vi.fn()
    const { container, root } = await renderTerminalSlotFixture('controller', { scrollToBottom })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, timeStamp: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 150, timeStamp: 17 }))
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientY: 150, timeStamp: 21 }))
      })
      expect(animationFrames.pendingCount()).toBe(1)

      const actionRow = container.querySelector('.goblin-terminal-command-deck__row--actions')
      const scrollToBottomAction = [...(actionRow?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])].find(
        (button) => button.textContent === 'terminal.command-deck.scroll-to-bottom',
      )
      expect(scrollToBottomAction).toBeInstanceOf(HTMLButtonElement)
      await act(async () => scrollToBottomAction?.click())

      expect(scrollToBottom).toHaveBeenCalledWith('terminal-1')
      expect(animationFrames.pendingCount()).toBe(0)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      animationFrames.restore()
    }
  })

  test.each(['controller', 'viewer', 'unowned'] as const)(
    'binds a hidden-until-used Mobile Web edge scrubber for a %s attachment',
    async (role) => {
      mobileDetectionMocks.isMobileDevice = true
      const attach = vi.fn()
      const { container, root } = await renderTerminalSlotFixture(role, { attach })

      try {
        const scrubber = container.querySelector<HTMLElement>('.goblin-terminal-edge-scrubber')
        expect(scrubber).toBeInstanceOf(HTMLDivElement)
        expect(scrubber?.getAttribute('role')).toBe('scrollbar')
        expect(scrubber?.getAttribute('aria-label')).toBe('terminal.mobile-scroll-scrubber')
        expect(scrubber?.getAttribute('aria-orientation')).toBe('vertical')
        expect(scrubber?.hidden).toBe(true)
        expect(container.querySelector('input[type="range"]')).toBeNull()
        expect(container.querySelector('.goblin-terminal-mobile-scrollbar')).toBeNull()
        const handlers = attach.mock.calls.at(-1)?.[2]
        expect(handlers?.mobileScrollScrubber).toBe(scrubber)
      } finally {
        await act(async () => root.unmount())
        container.remove()
      }
    },
  )

  test('stops touch inertia when the Mobile Web edge scrubber is grabbed', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const animationFrames = installAnimationFrameHarness()
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      await act(async () => {
        host?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 200, timeStamp: 1 }))
        host?.dispatchEvent(terminalPointerEvent('pointermove', { clientY: 150, timeStamp: 17 }))
        host?.dispatchEvent(terminalPointerEvent('pointerup', { clientY: 150, timeStamp: 21 }))
      })
      expect(animationFrames.pendingCount()).toBe(1)

      const scrollControl = container.querySelector('.goblin-terminal-edge-scrubber')
      await act(async () => {
        scrollControl?.dispatchEvent(terminalPointerEvent('pointerdown', { clientY: 100, timeStamp: 23 }))
      })
      expect(animationFrames.pendingCount()).toBe(0)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      animationFrames.restore()
    }
  })

  test('does not expose the Mobile Web command deck without controller input authority', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const { container, root } = await renderTerminalSlotFixture('viewer')

    try {
      expect(container.querySelector('.goblin-terminal-command-deck')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('cycles command-deck terminal actions through the current worktree order', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const second = { ...descriptor, key: 'terminal-2', terminalId: 'terminal-2', index: 2 }
    const third = { ...descriptor, key: 'terminal-3', terminalId: 'terminal-3', index: 3 }
    const selectTerminal = vi.fn()
    const context = terminalContext({ selectTerminal })
    const threeTerminalWorktreeSnapshot = {
      ...worktreeSnapshot,
      sessions: [
        { ...worktreeSnapshot.sessions[0]!, selected: true },
        { ...second, title: 'shell 2', phase: 'open' as const, selected: false, hasBell: false },
        { ...third, title: 'shell 3', phase: 'open' as const, selected: false, hasBell: false },
      ],
      count: 3,
    }
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => threeTerminalWorktreeSnapshot,
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const previous = container.querySelector<HTMLButtonElement>(
        'button[title="terminal.command-deck.previous-terminal"]',
      )
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      await act(async () => {
        previous?.click()
        next?.click()
      })
      expect(selectTerminal.mock.calls).toEqual([
        ['/repo\0/worktree', 'terminal-3'],
        ['/repo\0/worktree', 'terminal-2'],
      ])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('cycles the command deck to a terminal in another project', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const target = {
      ...descriptor,
      key: '/repo-b\0/worktree-b\0terminal-1',
      worktreeTerminalKey: '/repo-b\0/worktree-b',
      repoRoot: '/repo-b',
      worktreePath: '/worktree-b',
      branch: 'feature-b',
    }
    const terminalCatalog = [descriptor, target]
    const selectTerminal = vi.fn()
    const showRepoBranchDetailTab = vi.fn()
    const context = terminalContext({ selectTerminal })
    const readContext = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      terminalCatalogSnapshot: () => terminalCatalog,
      subscribeTerminalCatalog: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    } as TerminalSessionReadContextValue

    await act(async () => {
      root.render(
        <MainWindowNavigationProvider
          value={{
            activateRepo: vi.fn(),
            closeRepo: vi.fn(),
            cycleRepo: vi.fn(),
            selectRepoBranch: vi.fn(),
            showRepoDetailTab: vi.fn(),
            showRepoBranchDetailTab,
            openSettings: vi.fn(),
          }}
        >
          <TerminalSessionContext.Provider value={context}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>,
      )
    })

    try {
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      expect(next?.disabled).toBe(false)
      await act(async () => next?.click())

      expect(selectTerminal).toHaveBeenCalledWith('/repo-b\0/worktree-b', target.key)
      expect(showRepoBranchDetailTab).toHaveBeenCalledWith('/repo-b', 'feature-b', 'terminal')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('embeds desktop cycle buttons before custom terminal buttons in the existing dock', async () => {
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
    const fixture = await renderCrossProjectCycleFixture('controller', false)

    try {
      const customDock = fixture.container.querySelector('.goblin-terminal-custom-buttons')
      expect(customDock).toBeInstanceOf(HTMLDivElement)
      expect(fixture.container.querySelector('.goblin-terminal-bottom-dock__desktop-row')).toBeNull()
      expect(fixture.container.querySelector('.goblin-terminal-cycle-dock')).toBeNull()
      expect([...(customDock?.querySelectorAll('button') ?? [])].map((button) => button.textContent)).toEqual([
        'T↑',
        'T↓',
        'status',
      ])

      const next = customDock?.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      await act(async () => next?.click())

      expect(fixture.selectTerminal).toHaveBeenCalledWith(fixture.target.worktreeTerminalKey, fixture.target.key)
      expect(fixture.showRepoBranchDetailTab).toHaveBeenCalledWith('/repo-b', 'feature-b', 'terminal')
    } finally {
      await fixture.cleanup()
    }
  })

  test('keeps the desktop button dock visible with cycle buttons when no custom buttons are configured', async () => {
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      expect(container.querySelector('.goblin-terminal-bottom-dock')).toBeInstanceOf(HTMLDivElement)
      const customDock = container.querySelector('.goblin-terminal-custom-buttons')
      expect(customDock).toBeInstanceOf(HTMLDivElement)
      expect(container.querySelector('.goblin-terminal-cycle-dock')).toBeNull()
      expect([...(customDock?.querySelectorAll('button') ?? [])].map((button) => button.textContent)).toEqual([
        'T↑',
        'T↓',
      ])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('places global terminal cycle buttons first and the read-only message last', async () => {
    const fixture = await renderCrossProjectCycleFixture('viewer', true)

    try {
      const viewerStatus = fixture.container.querySelector('.goblin-terminal-slot__viewer-status')
      const viewerActions = fixture.container.querySelector('.goblin-terminal-slot__viewer-actions')
      const viewerMessage = fixture.container.querySelector('.goblin-terminal-slot__viewer-message')
      expect(viewerStatus?.firstElementChild).toBe(viewerActions)
      expect(viewerStatus?.lastElementChild).toBe(viewerMessage)
      const buttons = [...(viewerActions?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      expect(buttons.map((button) => button.textContent)).toEqual([
        'T↑',
        'T↓',
        'terminal.command-deck.scroll-to-bottom',
        'terminal.takeover',
      ])

      await act(async () => buttons[1]?.click())

      expect(fixture.selectTerminal).toHaveBeenCalledWith(fixture.target.worktreeTerminalKey, fixture.target.key)
      expect(fixture.showRepoBranchDetailTab).toHaveBeenCalledWith('/repo-b', 'feature-b', 'terminal')
    } finally {
      await fixture.cleanup()
    }
  })

  test('restores a branch workspace context when cycling across projects', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const target = {
      ...descriptor,
      key: '/workspace-b\0/workspace-b/goblin-feature\0terminal-1',
      worktreeTerminalKey: '/workspace-b\0/workspace-b/goblin-feature',
      repoRoot: '/workspace-b',
      worktreePath: '/workspace-b/goblin-feature',
      branch: 'feature-b',
      targetKind: 'branch-workspace' as const,
      branchWorkspaceId: 'branch-workspace-b',
    }
    const terminalCatalog = [descriptor, target]
    const selectTerminal = vi.fn()
    const showRepoBranchDetailTab = vi.fn()
    const activateBranchWorkspace = vi.fn()
    const previousActivateBranchWorkspace = useReposStore.getState().activateBranchWorkspace
    useReposStore.setState({ activateBranchWorkspace })
    const context = terminalContext({ selectTerminal })
    const readContext = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      terminalCatalogSnapshot: () => terminalCatalog,
      subscribeTerminalCatalog: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    } as TerminalSessionReadContextValue

    await act(async () => {
      root.render(
        <MainWindowNavigationProvider
          value={{
            activateRepo: vi.fn(),
            closeRepo: vi.fn(),
            cycleRepo: vi.fn(),
            selectRepoBranch: vi.fn(),
            showRepoDetailTab: vi.fn(),
            showRepoBranchDetailTab,
            openSettings: vi.fn(),
          }}
        >
          <TerminalSessionContext.Provider value={context}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>,
      )
    })

    try {
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      await act(async () => next?.click())

      expect(selectTerminal).toHaveBeenCalledWith(target.worktreeTerminalKey, target.key)
      expect(activateBranchWorkspace).toHaveBeenCalledWith('/workspace-b', 'branch-workspace-b')
      expect(showRepoBranchDetailTab).not.toHaveBeenCalled()
    } finally {
      useReposStore.setState({ activateBranchWorkspace: previousActivateBranchWorkspace })
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('opens the project terminal when cycling to a non-git workspace', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const target = {
      ...descriptor,
      key: '/workspace-b\0/workspace-b\0terminal-1',
      worktreeTerminalKey: '/workspace-b\0/workspace-b',
      repoRoot: '/workspace-b',
      worktreePath: '/workspace-b',
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    }
    const terminalCatalog = [descriptor, target]
    const selectTerminal = vi.fn()
    const showRepoDetailTab = vi.fn()
    const showRepoBranchDetailTab = vi.fn()
    const context = terminalContext({ selectTerminal })
    const readContext = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      terminalCatalogSnapshot: () => terminalCatalog,
      subscribeTerminalCatalog: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    } as TerminalSessionReadContextValue

    await act(async () => {
      root.render(
        <MainWindowNavigationProvider
          value={{
            activateRepo: vi.fn(),
            closeRepo: vi.fn(),
            cycleRepo: vi.fn(),
            selectRepoBranch: vi.fn(),
            showRepoDetailTab,
            showRepoBranchDetailTab,
            openSettings: vi.fn(),
          }}
        >
          <TerminalSessionContext.Provider value={context}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>,
      )
    })

    try {
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      await act(async () => next?.click())

      expect(selectTerminal).toHaveBeenCalledWith(target.worktreeTerminalKey, target.key)
      expect(showRepoDetailTab).toHaveBeenCalledWith('/workspace-b', 'terminal')
      expect(showRepoBranchDetailTab).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('cycles terminals in project switcher order instead of catalog insertion order', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const targetA = {
      ...descriptor,
      key: '/repo-a\0/repo-a\0terminal-1',
      worktreeTerminalKey: '/repo-a\0/repo-a',
      repoRoot: '/repo-a',
      worktreePath: '/repo-a',
      branch: 'feature-a',
    }
    const targetB = {
      ...descriptor,
      key: '/repo-b\0/repo-b\0terminal-1',
      worktreeTerminalKey: '/repo-b\0/repo-b',
      repoRoot: '/repo-b',
      worktreePath: '/repo-b',
      branch: 'feature-b',
    }
    const terminalCatalog = [descriptor, targetB, targetA]
    const selectTerminal = vi.fn()
    const showRepoBranchDetailTab = vi.fn()
    const previousOrder = useReposStore.getState().order
    useReposStore.setState({ order: ['/repo', '/repo-a', '/repo-b'] })
    const context = terminalContext({ selectTerminal })
    const readContext = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      terminalCatalogSnapshot: () => terminalCatalog,
      subscribeTerminalCatalog: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    } as TerminalSessionReadContextValue

    await act(async () => {
      root.render(
        <MainWindowNavigationProvider
          value={{
            activateRepo: vi.fn(),
            closeRepo: vi.fn(),
            cycleRepo: vi.fn(),
            selectRepoBranch: vi.fn(),
            showRepoDetailTab: vi.fn(),
            showRepoBranchDetailTab,
            openSettings: vi.fn(),
          }}
        >
          <TerminalSessionContext.Provider value={context}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>,
      )
    })

    try {
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      await act(async () => next?.click())

      expect(selectTerminal).toHaveBeenCalledWith(targetA.worktreeTerminalKey, targetA.key)
      expect(showRepoBranchDetailTab).toHaveBeenCalledWith('/repo-a', 'feature-a', 'terminal')
    } finally {
      useReposStore.setState({ order: previousOrder })
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('does not cycle to terminals retained from closed projects', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mobileDetectionMocks.isMobileDevice = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const { descriptor, worktreeSnapshot, snapshot } = controllerFixture('controller')
    const staleTarget = {
      ...descriptor,
      key: '/closed-repo\0/closed-repo\0terminal-1',
      worktreeTerminalKey: '/closed-repo\0/closed-repo',
      repoRoot: '/closed-repo',
      worktreePath: '/closed-repo',
    }
    const terminalCatalog = [descriptor, staleTarget]
    const previousOrder = useReposStore.getState().order
    useReposStore.setState({ order: ['/repo'] })
    const readContext = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      terminalCatalogSnapshot: () => terminalCatalog,
      subscribeTerminalCatalog: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    } as TerminalSessionReadContextValue

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={terminalContext()}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const next = container.querySelector<HTMLButtonElement>('button[title="terminal.command-deck.next-terminal"]')
      expect(next?.disabled).toBe(true)
    } finally {
      useReposStore.setState({ order: previousOrder })
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('toggles the Mobile Web terminal between fitted and horizontally pannable width', async () => {
    mobileDetectionMocks.isMobileDevice = true
    const { container, root } = await renderTerminalSlotFixture('controller')

    try {
      const host = container.querySelector<HTMLElement>('.goblin-terminal-slot__host')
      const originalWidth = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'terminal.command-deck.original-width',
      )
      expect(host?.classList.contains('goblin-terminal-slot__host--original-width')).toBe(false)

      await act(async () => originalWidth?.click())
      expect(host?.classList.contains('goblin-terminal-slot__host--original-width')).toBe(true)

      if (host) host.scrollLeft = 48
      const fitWidth = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'terminal.command-deck.fit-width',
      )
      await act(async () => fitWidth?.click())
      expect(host?.classList.contains('goblin-terminal-slot__host--original-width')).toBe(false)
      expect(host?.scrollLeft).toBe(0)
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
      restoreTmuxSessions: vi.fn(async () => 0),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      focusTerminal: vi.fn(),
      scrollLines: vi.fn(),
      scrollByTouch: vi.fn(),
      beginMobileSelection: vi.fn(() => false),
      extendMobileSelection: vi.fn(),
      finishMobileSelection: vi.fn(),
      cancelMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => ''),
      clearMobileSelection: vi.fn(),
      writeExtraKey: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(),
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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
              <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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
            <TerminalSlot repoRoot={descriptor.repoRoot} worktreePath={descriptor.worktreePath} />
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
      restoreTmuxSessions: vi.fn(async () => 0),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      focusTerminal: vi.fn(),
      scrollLines: vi.fn(),
      scrollByTouch: vi.fn(),
      beginMobileSelection: vi.fn(() => false),
      extendMobileSelection: vi.fn(),
      finishMobileSelection: vi.fn(),
      cancelMobileSelection: vi.fn(),
      mobileSelectionText: vi.fn(() => ''),
      clearMobileSelection: vi.fn(),
      writeExtraKey: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(),
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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

  test('does not advertise or write path drops for a viewer terminal', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture('viewer')
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const slot = container.querySelector('.goblin-terminal-slot')
      const dragEnter = terminalPathDragEvent('dragenter')
      await act(async () => slot?.dispatchEvent(dragEnter))

      expect(container.querySelector('.goblin-terminal-slot__drop-overlay')).toBeNull()

      const drop = terminalPathDragEvent('drop')
      await act(async () => slot?.dispatchEvent(drop))

      expect(writeInput).not.toHaveBeenCalled()
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
      expect(button).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('resolves a built-in terminal button preset before submitting it', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    i18nMocks.translations = {
      'terminal.custom-button-presets.confirm-continue.label': '确认、继续',
      'terminal.custom-button-presets.confirm-continue.value': '确认、继续',
    }
    runtimeSettingsMocks.terminalCustomButtons = [
      {
        label: 'Confirm, continue',
        value: 'Confirm and continue',
        action: 'execute',
        presetId: 'confirm-continue',
      },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const focusTerminal = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput, focusTerminal })
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '确认、继续')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(button?.title).toBe('确认、继续')

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', '确认、继续\r')
      expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
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
            <TerminalSlot repoRoot={REMOTE_REPO_ID} worktreePath="/srv/repo-feature" />
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

  test('sends input-mode custom button text without enter', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'commit', value: 'git commit -m ""', action: 'input' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const focusTerminal = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput, focusTerminal })
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'commit')
      expect(button).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git commit -m ""')
      expect(writeInput.mock.calls[0]![1]).not.toContain('\r')
      expect(focusTerminal).toHaveBeenCalledTimes(1)
      expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('focuses terminal after execute-mode custom button sends enter', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status', action: 'execute' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const focusTerminal = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput, focusTerminal })
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
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
      expect(button).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status\r')
      expect(focusTerminal).toHaveBeenCalledTimes(1)
      expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})

function controllerFixture(
  role: 'controller' | 'viewer' | 'unowned' = 'controller',
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
      controllerStatus: role === 'unowned' ? ('none' as const) : ('connected' as const),
      active: role === 'controller',
      canTakeover: role !== 'controller',
      canonicalCols: 120,
      canonicalRows: 40,
    },
  }
  return { descriptor, worktreeSnapshot, snapshot }
}

async function renderTerminalSlotFixture(
  role: 'controller' | 'viewer' | 'unowned',
  contextOverrides: Partial<TerminalSessionContextValue> = {},
): Promise<{ container: HTMLDivElement; root: Root }> {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const { worktreeSnapshot, snapshot } = controllerFixture(role)
  const context = terminalContext(contextOverrides)
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
          <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })

  return { container, root }
}

async function renderCrossProjectCycleFixture(role: 'controller' | 'viewer', mobile: boolean) {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mobileDetectionMocks.isMobileDevice = mobile
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const { descriptor, worktreeSnapshot, snapshot } = controllerFixture(role)
  const target = {
    ...descriptor,
    key: '/repo-b\0/worktree-b\0terminal-1',
    worktreeTerminalKey: '/repo-b\0/worktree-b',
    repoRoot: '/repo-b',
    worktreePath: '/worktree-b',
    branch: 'feature-b',
  }
  const selectTerminal = vi.fn()
  const showRepoBranchDetailTab = vi.fn()
  const context = terminalContext({ selectTerminal })
  const terminalCatalog = [descriptor, target]
  const readContext = {
    worktreeSnapshot: () => worktreeSnapshot,
    subscribeWorktree: () => () => {},
    terminalCatalogSnapshot: () => terminalCatalog,
    subscribeTerminalCatalog: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => snapshot,
    subscribeSnapshot: () => () => {},
  } as TerminalSessionReadContextValue

  await act(async () => {
    root.render(
      <MainWindowNavigationProvider
        value={{
          activateRepo: vi.fn(),
          closeRepo: vi.fn(),
          cycleRepo: vi.fn(),
          selectRepoBranch: vi.fn(),
          showRepoDetailTab: vi.fn(),
          showRepoBranchDetailTab,
          openSettings: vi.fn(),
        }}
      >
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>
      </MainWindowNavigationProvider>,
    )
  })

  return {
    container,
    target,
    selectTerminal,
    showRepoBranchDetailTab,
    cleanup: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

function terminalPointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  options: {
    clientY: number
    clientX?: number
    pointerId?: number
    pointerType?: 'touch' | 'mouse'
    isPrimary?: boolean
    timeStamp?: number
  },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY,
  })
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? 'touch' },
    isPrimary: { value: options.isPrimary ?? true },
    ...(options.timeStamp === undefined ? {} : { timeStamp: { value: options.timeStamp } }),
  })
  return event
}

function installAnimationFrameHarness() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId
    nextId += 1
    callbacks.set(id, callback)
    return id
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id)
  })
  return {
    pendingCount: () => callbacks.size,
    runNext: (timeStamp: number) => {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!next) throw new Error('missing animation frame')
      callbacks.delete(next[0])
      next[1](timeStamp)
    },
    restore: () => {
      callbacks.clear()
      request.mockRestore()
      cancel.mockRestore()
    },
  }
}

function installVisualViewportHarness(options: { layoutHeight: number; height: number; offsetTop: number }) {
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
  const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  let height = options.height
  let offsetTop = options.offsetTop
  const visualViewport = new EventTarget() as VisualViewport
  Object.defineProperties(visualViewport, {
    height: { configurable: true, get: () => height },
    offsetLeft: { configurable: true, get: () => 0 },
    offsetTop: { configurable: true, get: () => offsetTop },
    pageLeft: { configurable: true, get: () => 0 },
    pageTop: { configurable: true, get: () => offsetTop },
    scale: { configurable: true, get: () => 1 },
    width: { configurable: true, get: () => 390 },
    onresize: { configurable: true, writable: true, value: null },
    onscroll: { configurable: true, writable: true, value: null },
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: options.layoutHeight,
  })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: visualViewport,
  })

  return {
    update: (next: { height: number; offsetTop: number }) => {
      height = next.height
      offsetTop = next.offsetTop
      visualViewport.dispatchEvent(new Event('resize'))
    },
    restore: () => {
      if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
      else Reflect.deleteProperty(window, 'innerHeight')
      if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport)
      else Reflect.deleteProperty(window, 'visualViewport')
    },
  }
}

function terminalContext(overrides: Partial<TerminalSessionContextValue> = {}): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => 'terminal-1'),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(),
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
    restoreTmuxSessions: overrides.restoreTmuxSessions ?? vi.fn(async () => 0),
    writeExtraKey: overrides.writeExtraKey ?? vi.fn(),
  }
}

function terminalPathDragEvent(type: 'dragenter' | 'drop'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: [GOBLIN_FILE_PATHS_MIME],
      files: [],
      getData: (dataType: string) =>
        dataType === GOBLIN_FILE_PATHS_MIME ? serializeGoblinFilePathDragPayload(['/worktree/a file.ts']) : '',
    },
  })
  return event
}
