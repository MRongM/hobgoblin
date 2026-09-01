import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { toast } from 'sonner'
import { Button } from '#/web/components/ui/button.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#/web/components/ui/context-menu.tsx'
import { GOBLIN_FILE_PATHS_MIME, parseGoblinFilePathDragPayload } from '#/shared/file-tree.ts'
import type { ClipboardBinaryFilePayload } from '#/shared/clipboard-binary-temp-files.ts'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { cn } from '#/web/lib/cn.ts'
import { setTerminalFocused } from '#/web/terminal-focus.ts'
import {
  pathForDroppedFile,
  readSystemClipboardImage,
  readSystemClipboardFilePaths,
  saveClipboardBinaryFilesFromPaste,
} from '#/web/app-shell-client.ts'
import { transferRepositoryFiles } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import {
  useTerminalCatalog,
  useWorktreeTerminalSnapshot,
  useTerminalSnapshot,
} from '#/web/components/terminal/terminal-session-store.ts'
import { MobileTerminalDock } from '#/web/components/terminal/mobile-terminal-toolbar.tsx'
import { isMobileDevice } from '#/web/components/terminal/mobile-detection.ts'
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
import { generatedTimestampedPasteFileName } from '#/web/components/file-tree/model.ts'
import { uploadedItemFromFile } from '#/web/components/file-tree/clipboard.ts'
import { openWorktreeEditorTarget } from '#/web/lib/editor-open-targets.ts'
import { resolveTerminalCustomButtonPreset } from '#/shared/terminal-custom-button-presets.ts'
import { readTerminalClipboardText, writeTerminalClipboardText } from '#/web/components/terminal/terminal-clipboard.ts'
import { TerminalCycleButtons } from '#/web/components/terminal/TerminalCycleButtons.tsx'
import { DesktopTerminalDock } from '#/web/components/terminal/DesktopTerminalDock.tsx'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { TerminalDescriptor } from '#/web/components/terminal/types.ts'
import { isMacNavigatorPlatform } from '#/web/components/terminal/terminal-keyboard.ts'
import { getRuntimeShortcutSettings } from '#/web/runtime-settings-shortcuts.ts'
import { matchTerminalCycleShortcut } from '#/shared/shortcut-definitions.ts'
const MOBILE_TERMINAL_TOUCH_DRAG_THRESHOLD_PX = 8
const MOBILE_TERMINAL_LONG_PRESS_MS = 500
const MOBILE_TERMINAL_INERTIA_FRAME_MS = 1000 / 60
const MOBILE_TERMINAL_INERTIA_DECAY_PER_FRAME = 0.92
const MOBILE_TERMINAL_INERTIA_MIN_VELOCITY_PX_PER_MS = 0.05
const MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS = 3
const MOBILE_TERMINAL_INERTIA_MAX_FRAME_MS = 32
const MOBILE_TERMINAL_INERTIA_RELEASE_WINDOW_MS = 80
const MOBILE_TERMINAL_TOUCH_VELOCITY_SAMPLE_WEIGHT = 0.35

function terminalCatalogInProjectOrder(catalog: readonly TerminalDescriptor[]): readonly TerminalDescriptor[] {
  const state = useReposStore.getState()
  if (state.order.length === 0) return catalog
  const projectRank = new Map(state.order.map((projectId, index) => [projectId, index]))
  const rankedCatalog = catalog.map((descriptor, index) => ({
    descriptor,
    index,
    rank: projectRank.get(state.repos[descriptor.repoRoot]?.workspaceRootId ?? descriptor.repoRoot),
  }))
  const openProjectCatalog = rankedCatalog.filter(({ rank }) => rank !== undefined)
  return (openProjectCatalog.length > 0 ? openProjectCatalog : rankedCatalog)
    .sort(
      (left, right) =>
        (left.rank ?? state.order.length) - (right.rank ?? state.order.length) || left.index - right.index,
    )
    .map(({ descriptor }) => descriptor)
}

function clampTouchVelocity(velocityPxPerMs: number): number {
  return Math.max(
    -MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS,
    Math.min(MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS, velocityPxPerMs),
  )
}

interface MobileTerminalTouchGesture {
  host: HTMLDivElement
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  candidateX: number
  candidateY: number
  lastTimestamp: number
  velocityPxPerMs: number
  remainder: number
  mode: 'pending' | 'scrolling' | 'selecting'
  longPressTimer: number | null
}

interface MobileTerminalTouchInertia {
  velocityPxPerMs: number
  remainder: number
  clientX: number
  clientY: number
  lastTimestamp: number
}

interface MobileTerminalSelectionCopyAction {
  key: string
  clientX: number
  clientY: number
}

interface DesktopTerminalContextMenuState {
  key: string
  selectionText: string
}

interface TerminalSlotProps {
  repoRoot: string
  worktreePath: string
  onRevealPath?: (relativePath: string) => void
}

export function TerminalSlot({ repoRoot, worktreePath, onRevealPath }: TerminalSlotProps) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const terminalHostId = useId()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollScrubberRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const bottomDockRef = useRef<HTMLDivElement | null>(null)
  const touchScrollRef = useRef<MobileTerminalTouchGesture | null>(null)
  const touchInertiaRef = useRef<MobileTerminalTouchInertia | null>(null)
  const touchInertiaFrameRef = useRef<number | null>(null)
  const onRevealPathRef = useRef(onRevealPath)
  onRevealPathRef.current = onRevealPath
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [fitToWidth, setFitToWidth] = useState(true)
  const [mobileFocusMode, setMobileFocusMode] = useState(false)
  const [bottomDockHeight, setBottomDockHeight] = useState<number | null>(null)
  const [visualViewportBottomInset, setVisualViewportBottomInset] = useState(0)
  const [mobileSelectionCopyAction, setMobileSelectionCopyAction] = useState<MobileTerminalSelectionCopyAction | null>(
    null,
  )
  const [desktopContextMenu, setDesktopContextMenu] = useState<DesktopTerminalContextMenuState | null>(null)
  const context = useTerminalSessionContext()
  const {
    clearBell,
    registerWorktreeHost,
    attach,
    detach,
    selectTerminal,
    focusTerminal,
    markTelegramInputTarget,
    isTerminalFocusTarget,
    findNext,
    findPrevious,
    clearSearch,
    writeExtraKey,
    writeInput,
    scrollToBottom,
    pageTmux,
    scrollByTouch,
    beginMobileSelection,
    extendMobileSelection,
    finishMobileSelection,
    cancelMobileSelection,
    selectionText,
    pasteText,
    mobileSelectionText,
    clearMobileSelection,
    takeover,
    restart,
  } = context
  const terminalWorktreeKey = worktreeTerminalKey(repoRoot, worktreePath)
  const worktreeSnapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalCatalog = useTerminalCatalog()
  const switchableTerminalCatalog = terminalCatalogInProjectOrder(terminalCatalog)
  const descriptor = worktreeSnapshot.selectedDescriptor
  const key = descriptor?.key ?? null
  const snapshot = useTerminalSnapshot(key)
  const terminalCount = worktreeSnapshot.count
  const switchableTerminalCount =
    switchableTerminalCatalog.length > 0 ? switchableTerminalCatalog.length : terminalCount
  const hasSessions = terminalCount > 0
  const renderPending = hasSessions && snapshot.renderPending === true
  const {
    temporaryFilesDirectory,
    terminalFontSize,
    terminalNavigationControlsVisible,
    terminalCustomButtonsVisible,
    terminalCustomButtonSize,
    terminalCustomButtons,
  } = useRuntimeTerminalSettings()
  const progress = snapshot.progress
  const attachment = snapshot.attachment
  const isController = hasSessions && snapshot.phase === 'open' && attachment?.role === 'controller'
  const isReadonly =
    hasSessions && snapshot.phase === 'open' && (attachment?.role === 'viewer' || attachment?.role === 'unowned')
  const isMobile = isMobileDevice()
  const navigatorPlatform = globalThis.navigator?.platform ?? ''
  const isMacPlatform = isMacNavigatorPlatform(navigatorPlatform)
  const isWindowsPlatform = /^Win/i.test(navigatorPlatform)
  const isMobileTerminal = isMobile && (isController || isReadonly) && !!key
  const isMobileFocusMode = isMobile && isController && !!key && mobileFocusMode

  useEffect(() => {
    setMobileFocusMode(false)
  }, [attachment?.role, isMobile, key])

  useEffect(() => {
    setDesktopContextMenu(null)
  }, [attachment?.role, isMobile, key])

  const cancelTouchInertia = useCallback(() => {
    if (touchInertiaFrameRef.current !== null) window.cancelAnimationFrame(touchInertiaFrameRef.current)
    touchInertiaFrameRef.current = null
    touchInertiaRef.current = null
  }, [])
  const cancelLongPressTimer = useCallback((gesture: MobileTerminalTouchGesture | null) => {
    if (!gesture || gesture.longPressTimer === null) return
    window.clearTimeout(gesture.longPressTimer)
    gesture.longPressTimer = null
  }, [])
  const releaseGesturePointerCapture = useCallback((gesture: MobileTerminalTouchGesture | null) => {
    if (!gesture?.host.hasPointerCapture?.(gesture.pointerId)) return
    gesture.host.releasePointerCapture(gesture.pointerId)
  }, [])
  const stopTouchMotion = useCallback(() => {
    const gesture = touchScrollRef.current
    cancelLongPressTimer(gesture)
    releaseGesturePointerCapture(gesture)
    if (key) {
      if (gesture?.mode === 'selecting') {
        cancelMobileSelection(key, { clientX: gesture.lastX, clientY: gesture.lastY })
      } else {
        clearMobileSelection(key)
      }
    }
    touchScrollRef.current = null
    cancelTouchInertia()
    setMobileSelectionCopyAction(null)
  }, [
    cancelLongPressTimer,
    cancelMobileSelection,
    cancelTouchInertia,
    clearMobileSelection,
    key,
    releaseGesturePointerCapture,
  ])
  const initializeMobileScrollScrubber = useCallback((scrubber: HTMLDivElement | null) => {
    mobileScrollScrubberRef.current = scrubber
    if (!scrubber) return
    scrubber.dataset.active = 'false'
    scrubber.dataset.position = '0%'
    scrubber.style.setProperty('--goblin-terminal-scrub-position', '0%')
    scrubber.setAttribute('aria-valuemin', '0')
    scrubber.setAttribute('aria-valuemax', '100')
    scrubber.setAttribute('aria-valuenow', '0')
    scrubber.setAttribute('aria-valuetext', '0%')
    scrubber.hidden = true
  }, [])

  useEffect(() => {
    stopTouchMotion()
    return stopTouchMotion
  }, [attachment?.role, isMobileTerminal, key, snapshot.phase, stopTouchMotion])

  useLayoutEffect(() => {
    if (fitToWidth && hostRef.current) hostRef.current.scrollLeft = 0
  }, [fitToWidth, key])

  const handleTouchScrollStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileTerminal || !key || event.pointerType !== 'touch' || event.isPrimary === false) return
      cancelTouchInertia()
      const existingGesture = touchScrollRef.current
      cancelLongPressTimer(existingGesture)
      releaseGesturePointerCapture(existingGesture)
      if (existingGesture?.mode === 'selecting') {
        cancelMobileSelection(key, { clientX: existingGesture.lastX, clientY: existingGesture.lastY })
      } else {
        clearMobileSelection(key)
      }
      setMobileSelectionCopyAction(null)

      const gesture: MobileTerminalTouchGesture = {
        host: event.currentTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        candidateX: event.clientX,
        candidateY: event.clientY,
        lastTimestamp: event.timeStamp,
        velocityPxPerMs: 0,
        remainder: 0,
        mode: 'pending',
        longPressTimer: null,
      }
      touchScrollRef.current = gesture
      gesture.longPressTimer = window.setTimeout(() => {
        if (touchScrollRef.current !== gesture || gesture.mode !== 'pending') return
        gesture.longPressTimer = null
        const point = { clientX: gesture.candidateX, clientY: gesture.candidateY }
        if (!beginMobileSelection(key, point)) {
          touchScrollRef.current = null
          return
        }
        cancelTouchInertia()
        gesture.mode = 'selecting'
        gesture.host.setPointerCapture?.(gesture.pointerId)
      }, MOBILE_TERMINAL_LONG_PRESS_MS)
    },
    [
      beginMobileSelection,
      cancelLongPressTimer,
      cancelMobileSelection,
      cancelTouchInertia,
      clearMobileSelection,
      isMobileTerminal,
      key,
      releaseGesturePointerCapture,
    ],
  )
  const handleTouchScrollMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = touchScrollRef.current
      if (!isMobileTerminal || !key || !gesture || event.pointerId !== gesture.pointerId) return

      if (gesture.mode === 'selecting') {
        event.preventDefault()
        event.stopPropagation()
        gesture.lastX = event.clientX
        gesture.lastY = event.clientY
        gesture.candidateX = event.clientX
        gesture.candidateY = event.clientY
        gesture.lastTimestamp = event.timeStamp
        extendMobileSelection(key, { clientX: event.clientX, clientY: event.clientY })
        return
      }

      if (gesture.mode === 'pending') {
        const horizontalDistance = Math.abs(event.clientX - gesture.startX)
        const verticalDistance = Math.abs(event.clientY - gesture.startY)
        gesture.candidateX = event.clientX
        gesture.candidateY = event.clientY
        if (Math.max(horizontalDistance, verticalDistance) < MOBILE_TERMINAL_TOUCH_DRAG_THRESHOLD_PX) return
        cancelLongPressTimer(gesture)
        if (horizontalDistance > verticalDistance) {
          releaseGesturePointerCapture(gesture)
          touchScrollRef.current = null
          return
        }
        gesture.mode = 'scrolling'
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      event.preventDefault()
      event.stopPropagation()

      const deltaPixels = gesture.lastY - event.clientY
      const elapsedSinceMove = event.timeStamp - gesture.lastTimestamp
      if (elapsedSinceMove > 0 && elapsedSinceMove <= MOBILE_TERMINAL_INERTIA_RELEASE_WINDOW_MS) {
        const sampleVelocity = clampTouchVelocity(deltaPixels / elapsedSinceMove)
        gesture.velocityPxPerMs =
          gesture.velocityPxPerMs === 0
            ? sampleVelocity
            : gesture.velocityPxPerMs * (1 - MOBILE_TERMINAL_TOUCH_VELOCITY_SAMPLE_WEIGHT) +
              sampleVelocity * MOBILE_TERMINAL_TOUCH_VELOCITY_SAMPLE_WEIGHT
      } else {
        gesture.velocityPxPerMs = 0
      }

      const pixelsPerLine = Math.max(1, terminalFontSize)
      const accumulatedPixels = gesture.remainder + deltaPixels
      const lineDelta = Math.trunc(accumulatedPixels / pixelsPerLine)
      gesture.lastX = event.clientX
      gesture.lastY = event.clientY
      gesture.lastTimestamp = event.timeStamp
      gesture.remainder = accumulatedPixels - lineDelta * pixelsPerLine
      if (lineDelta === 0) return

      scrollByTouch(key, {
        lines: lineDelta,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    [
      cancelLongPressTimer,
      extendMobileSelection,
      isMobileTerminal,
      key,
      releaseGesturePointerCapture,
      scrollByTouch,
      terminalFontSize,
    ],
  )
  const startTouchInertia = useCallback(
    (gesture: MobileTerminalTouchGesture, releaseTimestamp: number) => {
      if (!key || releaseTimestamp - gesture.lastTimestamp > MOBILE_TERMINAL_INERTIA_RELEASE_WINDOW_MS) return
      if (Math.abs(gesture.velocityPxPerMs) < MOBILE_TERMINAL_INERTIA_MIN_VELOCITY_PX_PER_MS) return

      const inertia: MobileTerminalTouchInertia = {
        velocityPxPerMs: clampTouchVelocity(gesture.velocityPxPerMs),
        remainder: gesture.remainder,
        clientX: gesture.lastX,
        clientY: gesture.lastY,
        lastTimestamp: releaseTimestamp,
      }
      touchInertiaRef.current = inertia

      const runFrame = (timestamp: number) => {
        touchInertiaFrameRef.current = null
        if (touchInertiaRef.current !== inertia) return

        const rawElapsed = timestamp - inertia.lastTimestamp
        const elapsed = Math.min(
          MOBILE_TERMINAL_INERTIA_MAX_FRAME_MS,
          rawElapsed > 0 ? rawElapsed : MOBILE_TERMINAL_INERTIA_FRAME_MS,
        )
        inertia.lastTimestamp = timestamp
        const pixelsPerLine = Math.max(1, terminalFontSize)
        const accumulatedPixels = inertia.remainder + inertia.velocityPxPerMs * elapsed
        const lineDelta = Math.trunc(accumulatedPixels / pixelsPerLine)
        inertia.remainder = accumulatedPixels - lineDelta * pixelsPerLine
        if (lineDelta !== 0) {
          scrollByTouch(key, {
            lines: lineDelta,
            clientX: inertia.clientX,
            clientY: inertia.clientY,
          })
        }

        inertia.velocityPxPerMs *= Math.pow(
          MOBILE_TERMINAL_INERTIA_DECAY_PER_FRAME,
          elapsed / MOBILE_TERMINAL_INERTIA_FRAME_MS,
        )
        if (Math.abs(inertia.velocityPxPerMs) < MOBILE_TERMINAL_INERTIA_MIN_VELOCITY_PX_PER_MS) {
          touchInertiaRef.current = null
          return
        }
        touchInertiaFrameRef.current = window.requestAnimationFrame(runFrame)
      }

      touchInertiaFrameRef.current = window.requestAnimationFrame(runFrame)
    },
    [key, scrollByTouch, terminalFontSize],
  )
  const finishTouchScroll = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, allowInertia: boolean) => {
      const gesture = touchScrollRef.current
      if (gesture?.pointerId !== event.pointerId) return
      cancelLongPressTimer(gesture)
      if (gesture.mode === 'scrolling' || gesture.mode === 'selecting') {
        event.preventDefault()
        event.stopPropagation()
      }
      releaseGesturePointerCapture(gesture)
      touchScrollRef.current = null
      if (gesture.mode === 'selecting') {
        const point = { clientX: event.clientX, clientY: event.clientY }
        if (allowInertia && key) {
          finishMobileSelection(key, point)
          const selectedText = mobileSelectionText(key)
          setMobileSelectionCopyAction(selectedText ? { key, ...point } : null)
        } else if (key) {
          cancelMobileSelection(key, point)
          setMobileSelectionCopyAction(null)
        }
        cancelTouchInertia()
        return
      }
      if (allowInertia && gesture.mode === 'scrolling') startTouchInertia(gesture, event.timeStamp)
      else cancelTouchInertia()
    },
    [
      cancelLongPressTimer,
      cancelMobileSelection,
      cancelTouchInertia,
      finishMobileSelection,
      key,
      mobileSelectionText,
      releaseGesturePointerCapture,
      startTouchInertia,
    ],
  )
  const handleTouchScrollEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishTouchScroll(event, true),
    [finishTouchScroll],
  )
  const handleTouchScrollCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishTouchScroll(event, false),
    [finishTouchScroll],
  )
  const handleTouchContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (touchScrollRef.current?.mode !== 'selecting') return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const copyMobileTerminalSelection = useCallback(async () => {
    const action = mobileSelectionCopyAction
    if (!action) return
    const text = mobileSelectionText(action.key)
    if (!text) {
      setMobileSelectionCopyAction(null)
      return
    }
    if (!(await writeTerminalClipboardText(text))) {
      toast.error(t('terminal.selection-copy-failed'))
      return
    }
    clearMobileSelection(action.key)
    setMobileSelectionCopyAction((current) => (current === action ? null : current))
  }, [clearMobileSelection, mobileSelectionCopyAction, mobileSelectionText, t])

  const handleDesktopContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setDesktopContextMenu(null)
        return
      }
      if (isMobile || !key) return
      const capturedSelectionText = selectionText(key)
      if (!capturedSelectionText && !isController) return
      setDesktopContextMenu({ key, selectionText: capturedSelectionText })
    },
    [isController, isMobile, key, selectionText],
  )

  const copyDesktopTerminalSelection = useCallback(async () => {
    const text = desktopContextMenu?.selectionText
    if (!text) return
    if (!(await writeTerminalClipboardText(text))) {
      toast.error(t('terminal.selection-copy-failed'))
      return
    }
    setDesktopContextMenu(null)
  }, [desktopContextMenu, t])

  const pasteDesktopTerminalText = useCallback(async () => {
    const action = desktopContextMenu
    if (!action || !isController || action.key !== key) return
    const text = await readTerminalClipboardText()
    if (text === null) {
      toast.error(t('terminal.clipboard-paste-failed'))
      return
    }
    if (!text) return
    pasteText(action.key, text)
    focusTerminal(action.key)
  }, [desktopContextMenu, focusTerminal, isController, key, pasteText, t])

  useLayoutEffect(() => {
    registerWorktreeHost(terminalWorktreeKey, hostRef.current)
    return () => registerWorktreeHost(terminalWorktreeKey, null)
  }, [registerWorktreeHost, terminalWorktreeKey])

  // Focus the terminal once when the session first becomes ready, but only if
  // no other interactive element currently holds focus. This mirrors the old
  // goblin behaviour where focus was triggered exactly once per session key.
  const focusedKeyRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (isMobile || !isController || !key || searchOpen || renderPending) {
      if (focusedKeyRef.current === key) focusedKeyRef.current = null
      return
    }
    if (focusedKeyRef.current === key) return
    focusedKeyRef.current = key
    const active = typeof document !== 'undefined' ? document.activeElement : null
    const isBody = !active || active === document.body
    if (!isBody) return
    const textarea = hostRef.current?.querySelector('textarea')
    textarea?.focus()
  }, [isController, isMobile, key, renderPending, searchOpen])

  const openPathInEditorRef = useRef<(target: FilePathTarget) => void>(() => {})
  openPathInEditorRef.current = (target: FilePathTarget) => {
    void openWorktreeEditorTarget(repoRoot, worktreePath, target).then((result) => {
      if (!result.ok) toast.error(t(result.message))
    })
  }
  const handleRevealPath = useCallback((relativePath: string) => {
    onRevealPathRef.current?.(relativePath)
  }, [])
  const handleOpenPathInEditor = useCallback((target: FilePathTarget) => {
    openPathInEditorRef.current(target)
  }, [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !descriptor) return
    attach(descriptor, host, {
      onRevealPath: handleRevealPath,
      onOpenPathInEditor: handleOpenPathInEditor,
      ...(isMobileTerminal && mobileScrollScrubberRef.current
        ? { mobileScrollScrubber: mobileScrollScrubberRef.current }
        : {}),
    })
    return () => detach(descriptor.key, host)
  }, [attach, descriptor, detach, handleOpenPathInEditor, handleRevealPath, isMobileTerminal])

  useEffect(() => {
    if (!key || typeof document === 'undefined' || !document.hasFocus()) return
    clearBell(key)
  }, [clearBell, key])

  useEffect(() => {
    if (!key) return
    const handleFocus = () => clearBell(key)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [clearBell, key])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus({ preventScroll: true })
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen && key) clearSearch(key)
  }, [clearSearch, key, searchOpen])

  useEffect(() => {
    return () => {
      if (key) clearSearch(key)
    }
  }, [clearSearch, key])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchTerm('')
  }, [])
  const searchNext = useCallback(
    (term = searchTerm, incremental = false) => {
      if (!key) return
      findNext(key, term, incremental)
    },
    [findNext, key, searchTerm],
  )
  const searchPrevious = useCallback(() => {
    if (!key) return
    findPrevious(key, searchTerm)
  }, [findPrevious, key, searchTerm])
  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const terminalFocused = !!key && isTerminalFocusTarget(key, event.target)
      setTerminalFocused(terminalFocused)
      if (terminalFocused && key && isController && !isMobile) markTelegramInputTarget?.(key)
    },
    [isController, isMobile, isTerminalFocusTarget, key, markTelegramInputTarget],
  )
  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTerminalFocused(false)
  }, [])
  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isTerminalSearchShortcut(event)) {
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(true)
        return
      }
      if (searchOpen && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeSearch()
        return
      }
    },
    [closeSearch, searchOpen],
  )
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!key || !isController) return
      if (event.clipboardData.getData('text/plain').length > 0) return

      const files = binaryPasteFiles(event.clipboardData)
      event.preventDefault()
      event.stopPropagation()
      void resolvePastedFilePaths(files, {
        repoRoot,
        worktreePath,
        temporaryFilesDirectory,
        allowNativeClipboardImage: isWindowsPlatform,
      }).then((paths) => {
        if (paths.length === 0) return
        writeInput(key, paths.map(shellEscapePath).join(' '))
      })
    },
    [isController, isWindowsPlatform, key, repoRoot, temporaryFilesDirectory, worktreePath, writeInput],
  )
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value)
      searchNext(value, true)
    },
    [searchNext],
  )
  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) searchPrevious()
        else searchNext()
      }
    },
    [searchNext, searchPrevious],
  )
  const resultLabel =
    snapshot.search && searchTerm
      ? snapshot.search.resultCount > 0
        ? snapshot.search.resultIndex >= 0
          ? `${snapshot.search.resultIndex + 1}/${snapshot.search.resultCount}`
          : String(snapshot.search.resultCount)
        : t('terminal.search-no-results')
      : ''

  const [dragOver, setDragOver] = useState(false)
  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasPathDrop(event)) return
      event.preventDefault()
      setDragOver(isController)
    },
    [isController],
  )
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasPathDrop(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = isController ? 'copy' : 'none'
    },
    [isController],
  )
  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasPathDrop(event)) return
      const relatedTarget = event.relatedTarget
      if (!isController || !(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
        setDragOver(false)
      }
    },
    [isController],
  )
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasPathDrop(event)) return
      event.preventDefault()
      setDragOver(false)
      if (!isController || !key) return
      const paths = pathsForDrop(event, worktreePath)
      if (paths.length === 0) return
      const escaped = paths.map(shellEscapePath).join(' ')
      writeInput(key, escaped)
    },
    [isController, key, worktreePath, writeInput],
  )
  useEffect(() => {
    if (!isController) setDragOver(false)
  }, [isController])
  const visibleCustomButtons =
    isController && terminalCustomButtonsVisible
      ? terminalCustomButtons
          .map((button) => resolveTerminalCustomButtonPreset(button, t))
          .filter((button) => button.label.trim() && button.value.trim())
      : []
  const hasMobileDock = isMobile && !!key
  const hasDesktopDock =
    !isMobile && isController && !!key && (terminalNavigationControlsVisible || visibleCustomButtons.length > 0)
  const hasBottomDock = !isMobileFocusMode && (hasMobileDock || hasDesktopDock)

  useLayoutEffect(() => {
    if (!hasBottomDock || !hasMobileDock) {
      setVisualViewportBottomInset(0)
      return
    }

    const visualViewport = window.visualViewport
    if (!visualViewport) {
      setVisualViewportBottomInset(0)
      return
    }

    const updateBottomInset = () => {
      const next = Math.max(0, Math.ceil(window.innerHeight - visualViewport.offsetTop - visualViewport.height))
      setVisualViewportBottomInset((current) => (current === next ? current : next))
    }

    updateBottomInset()
    visualViewport.addEventListener('resize', updateBottomInset)
    visualViewport.addEventListener('scroll', updateBottomInset)
    window.addEventListener('resize', updateBottomInset)
    return () => {
      visualViewport.removeEventListener('resize', updateBottomInset)
      visualViewport.removeEventListener('scroll', updateBottomInset)
      window.removeEventListener('resize', updateBottomInset)
    }
  }, [hasBottomDock, hasMobileDock])

  const cycleTerminal = useCallback(
    (direction: -1 | 1) => {
      if (!key) return
      const orderedCatalog = terminalCatalogInProjectOrder(terminalCatalog)
      if (orderedCatalog.length > 1) {
        const currentIndex = orderedCatalog.findIndex((session) => session.key === key)
        if (currentIndex >= 0) {
          const target = orderedCatalog[(currentIndex + direction + orderedCatalog.length) % orderedCatalog.length]
          if (!target) return
          selectTerminal(target.worktreeTerminalKey, target.key)
          if (target.worktreeTerminalKey !== terminalWorktreeKey) {
            const state = useReposStore.getState()
            if (target.targetKind === 'branch-workspace' && target.branchWorkspaceId) {
              state.activateBranchWorkspace(target.repoRoot, target.branchWorkspaceId)
            } else if (target.branch === NON_GIT_WORKSPACE_TERMINAL_BRANCH) {
              navigation.showRepoDetailTab(target.repoRoot, 'terminal')
            } else {
              navigation.showRepoBranchDetailTab(target.repoRoot, target.branch, 'terminal')
            }
            state.setDetailCollapsed(false)
          }
          return
        }
      }
      if (worktreeSnapshot.sessions.length <= 1) return
      const currentIndex = worktreeSnapshot.sessions.findIndex((session) => session.key === key)
      const safeCurrentIndex = currentIndex < 0 ? 0 : currentIndex
      const nextIndex =
        (safeCurrentIndex + direction + worktreeSnapshot.sessions.length) % worktreeSnapshot.sessions.length
      const next = worktreeSnapshot.sessions[nextIndex]
      if (next) selectTerminal(terminalWorktreeKey, next.key)
    },
    [key, navigation, selectTerminal, terminalCatalog, terminalWorktreeKey, worktreeSnapshot.sessions],
  )
  const handleTerminalKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      handleKeyDownCapture(event)
      if (event.defaultPrevented || !key || switchableTerminalCount <= 1) return
      const direction = matchTerminalCycleShortcut(event, isMacPlatform)
      if (direction === null) return
      if (getRuntimeShortcutSettings().shortcutsDisabled) return
      if (!isTerminalFocusTarget(key, event.target)) return
      event.preventDefault()
      event.stopPropagation()
      cycleTerminal(direction)
    },
    [cycleTerminal, handleKeyDownCapture, isMacPlatform, isTerminalFocusTarget, key, switchableTerminalCount],
  )
  const handleScrollToBottom = useCallback(() => {
    if (!key) return
    stopTouchMotion()
    scrollToBottom(key)
  }, [key, scrollToBottom, stopTouchMotion])

  useLayoutEffect(() => {
    if (!hasBottomDock) {
      setBottomDockHeight(null)
      return
    }

    const dock = bottomDockRef.current
    if (!dock) return

    const updateDockHeight = () => {
      const next = Math.ceil(dock.getBoundingClientRect().height)
      if (next <= 0) return
      setBottomDockHeight((current) => (current === next ? current : next))
    }

    updateDockHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateDockHeight)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [hasBottomDock, hasMobileDock, visibleCustomButtons.length])

  const readonlyMessage = attachment?.role === 'viewer' ? t('terminal.mirror-controlled') : t('terminal.unowned')
  const progressVariant =
    progress?.state === 2 ? 'error' : progress?.state === 4 ? 'warning' : progress?.state === 3 ? 'indeterminate' : ''
  const slotStyle =
    bottomDockHeight === null && !hasMobileDock
      ? undefined
      : ({
          ...(bottomDockHeight === null ? {} : { '--goblin-terminal-bottom-dock-height': `${bottomDockHeight}px` }),
          ...(hasMobileDock
            ? { '--goblin-terminal-visual-viewport-bottom-inset': `${visualViewportBottomInset}px` }
            : {}),
        } as CSSProperties)
  const customButtonElements = visibleCustomButtons.map((button, index) => {
    const action = button.action === 'input' ? 'input' : 'execute'
    return (
      <Button
        key={`${index}:${button.presetId ?? `${button.label}:${button.value}`}:${action}`}
        type="button"
        size={terminalCustomButtonSize === 'large' ? 'default' : 'sm'}
        variant="secondary"
        className={cn(
          'goblin-terminal-custom-buttons__button',
          `goblin-terminal-custom-buttons__button--${terminalCustomButtonSize}`,
        )}
        title={button.value}
        onClick={() => {
          if (!key) return
          if (action === 'input') writeInput(key, button.value)
          else writeInput(key, `${button.value}\r`)
          focusTerminal(key)
        }}
      >
        {button.label}
      </Button>
    )
  })
  const customButtonsDock = hasDesktopDock ? (
    <DesktopTerminalDock
      key={key}
      terminalCount={switchableTerminalCount}
      onCycleTerminal={cycleTerminal}
      onScrollToBottom={handleScrollToBottom}
      quickInputButtons={customButtonElements}
      navigationControlsVisible={terminalNavigationControlsVisible}
    />
  ) : visibleCustomButtons.length > 0 ? (
    <div className="goblin-terminal-custom-buttons" aria-label={t('terminal.custom-buttons')}>
      {customButtonElements}
    </div>
  ) : null
  const terminalHost = (
    <div
      id={terminalHostId}
      ref={hostRef}
      className={cn(
        'goblin-terminal-slot__host',
        isReadonly && 'goblin-terminal-slot__host--canonical-readonly',
        isMobileTerminal && 'goblin-terminal-slot__host--touch-scroll',
        isMobileTerminal && !fitToWidth && 'goblin-terminal-slot__host--original-width',
      )}
      aria-readonly={(!isController && hasSessions) || undefined}
      onPointerDown={isMobileTerminal ? handleTouchScrollStart : undefined}
      onPointerMove={isMobileTerminal ? handleTouchScrollMove : undefined}
      onPointerUp={isMobileTerminal ? handleTouchScrollEnd : undefined}
      onPointerCancel={isMobileTerminal ? handleTouchScrollCancel : undefined}
      onContextMenu={isMobileTerminal ? handleTouchContextMenu : undefined}
    />
  )
  const terminalHostSurface = !isMobile ? (
    <ContextMenu open={desktopContextMenu !== null} onOpenChange={handleDesktopContextMenuOpenChange}>
      <ContextMenuTrigger asChild>{terminalHost}</ContextMenuTrigger>
      {desktopContextMenu !== null && (
        <ContextMenuContent>
          {desktopContextMenu.selectionText && (
            <ContextMenuItem onSelect={() => void copyDesktopTerminalSelection()}>
              {t('menu.edit.copy')}
            </ContextMenuItem>
          )}
          {isController && desktopContextMenu.key === key && (
            <ContextMenuItem onSelect={() => void pasteDesktopTerminalText()}>{t('menu.edit.paste')}</ContextMenuItem>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  ) : (
    terminalHost
  )

  return (
    <div
      className="goblin-terminal-slot focus-visible:outline-none"
      tabIndex={-1}
      style={slotStyle}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onKeyDownCapture={handleTerminalKeyDownCapture}
      onPasteCapture={handlePasteCapture}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {progress && (
        <div
          className={cn('goblin-terminal-progress', progressVariant && `goblin-terminal-progress--${progressVariant}`)}
          role="progressbar"
          aria-label={t('terminal.progress')}
          aria-valuenow={progress.state === 3 ? undefined : progress.value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-busy={progress.state === 3 ? true : undefined}
        >
          {progress.state !== 3 && (
            <div className="goblin-terminal-progress__bar" style={{ width: `${progress.value}%` }} />
          )}
        </div>
      )}
      {terminalHostSurface}
      {mobileSelectionCopyAction && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="goblin-terminal-selection-copy"
          style={
            {
              '--goblin-terminal-selection-copy-x': `${mobileSelectionCopyAction.clientX}px`,
              '--goblin-terminal-selection-copy-y': `${mobileSelectionCopyAction.clientY}px`,
            } as CSSProperties
          }
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={() => void copyMobileTerminalSelection()}
        >
          {t('menu.edit.copy')}
        </Button>
      )}
      {isMobileTerminal && (
        <div
          ref={initializeMobileScrollScrubber}
          className="goblin-terminal-edge-scrubber"
          role="scrollbar"
          tabIndex={0}
          aria-controls={terminalHostId}
          aria-label={t('terminal.mobile-scroll-scrubber')}
          aria-orientation="vertical"
          onPointerDown={stopTouchMotion}
        />
      )}
      <div className="goblin-terminal-float-group">
        {isMobileFocusMode && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="goblin-terminal-focus-exit"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setMobileFocusMode(false)}
          >
            {t('terminal.command-deck.exit-focus')}
          </Button>
        )}
        {searchOpen && (
          <div className="goblin-terminal-slot__search">
            <input
              ref={searchInputRef}
              className="goblin-terminal-slot__search-input"
              value={searchTerm}
              aria-label={t('terminal.search-placeholder')}
              placeholder={t('terminal.search-placeholder')}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <span className="goblin-terminal-slot__search-result" role="status" aria-live="polite" aria-atomic="true">
              {resultLabel}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={searchPrevious} disabled={!searchTerm}>
              {t('terminal.search-previous')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => searchNext()} disabled={!searchTerm}>
              {t('terminal.search-next')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={closeSearch}>
              {t('terminal.search-close')}
            </Button>
          </div>
        )}
      </div>
      {key && hasBottomDock && (
        <div ref={bottomDockRef} className="goblin-terminal-bottom-dock">
          {customButtonsDock}
          {hasMobileDock && (
            <MobileTerminalDock
              terminalKey={key}
              terminalCount={switchableTerminalCount}
              projection={
                isController
                  ? {
                      kind: 'controller',
                      inputMethodVisible: visualViewportBottomInset > 0,
                      fitToWidth,
                      onExtraKey: (input) => writeExtraKey(key, input),
                      onInput: (data) => writeInput(key, data),
                      onFitToWidthChange: setFitToWidth,
                      onEnterFocus: () => setMobileFocusMode(true),
                    }
                  : isReadonly
                    ? {
                        kind: 'readonly',
                        takeoverPending: snapshot.takeoverPending === true,
                        onTakeover: () => takeover(key),
                        ...(descriptor?.tmuxBacked ? { onTmuxPage: (direction) => pageTmux(key, direction) } : {}),
                      }
                    : { kind: 'pending' }
              }
              onScrollToBottom={handleScrollToBottom}
              onCycleTerminal={cycleTerminal}
              navigationControlsVisible={terminalNavigationControlsVisible}
            />
          )}
        </div>
      )}
      {isReadonly && !isMobile && (
        <ViewerStatus
          message={readonlyMessage}
          scrollToBottomLabel={t('terminal.command-deck.scroll-to-bottom')}
          takeoverLabel={t('terminal.takeover')}
          takeoverKey={key}
          onScrollToBottom={handleScrollToBottom}
          onTakeover={takeover}
          takeoverPending={snapshot.takeoverPending}
          terminalCount={switchableTerminalCount}
          onCycleTerminal={cycleTerminal}
          navigationControlsVisible={terminalNavigationControlsVisible}
        />
      )}
      {hasSessions && snapshot.phase === 'error' && snapshot.message !== 'terminal.empty' && (
        <div className="goblin-terminal-slot__status-overlay goblin-terminal-slot__status-overlay--error">
          <span>{t(snapshot.message ?? 'error.unknown')}</span>
          {key && (
            <Button type="button" size="sm" variant="ghost" onClick={() => restart(key)}>
              {t('terminal.restart')}
            </Button>
          )}
        </div>
      )}
      {dragOver && (
        <div className="goblin-terminal-slot__drop-overlay">
          <span>{t('terminal.drop-hint')}</span>
        </div>
      )}
    </div>
  )
}

interface ViewerStatusProps {
  message: string
  scrollToBottomLabel: string
  takeoverLabel: string
  takeoverKey: string | null
  onScrollToBottom: () => void
  onTakeover: (key: string) => void
  takeoverPending?: boolean
  terminalCount: number
  onCycleTerminal: (direction: -1 | 1) => void
  navigationControlsVisible: boolean
}

function ViewerStatus({
  message,
  scrollToBottomLabel,
  takeoverLabel,
  takeoverKey,
  onScrollToBottom,
  onTakeover,
  takeoverPending,
  terminalCount,
  onCycleTerminal,
  navigationControlsVisible,
}: ViewerStatusProps) {
  return (
    <div className="goblin-terminal-slot__viewer-status">
      <div className="goblin-terminal-slot__viewer-actions">
        {navigationControlsVisible && (
          <>
            <TerminalCycleButtons terminalCount={terminalCount} onCycleTerminal={onCycleTerminal} />
            <Button type="button" size="sm" variant="secondary" onClick={onScrollToBottom} disabled={!takeoverKey}>
              {scrollToBottomLabel}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => takeoverKey && onTakeover(takeoverKey)}
          disabled={!takeoverKey || takeoverPending}
        >
          {takeoverPending ? `${takeoverLabel}…` : takeoverLabel}
        </Button>
      </div>
      <span className="goblin-terminal-slot__viewer-message" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </span>
    </div>
  )
}

function isTerminalSearchShortcut(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.altKey || event.key.toLowerCase() !== 'f') return false
  return event.metaKey || (event.ctrlKey && event.shiftKey)
}

function shellEscapePath(path: string): string {
  if (path.length === 0) return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(path)) return path
  return "'" + path.replace(/'/g, "'\\''") + "'"
}

function hasPathDrop(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(GOBLIN_FILE_PATHS_MIME) || event.dataTransfer.types.includes('Files')
}

function pathsForDrop(event: DragEvent<HTMLElement>, worktreePath: string): string[] {
  if (event.dataTransfer.types.includes(GOBLIN_FILE_PATHS_MIME)) {
    return parseGoblinFilePathDragPayload(event.dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).map((path) =>
      pathForTerminalDrop(path, worktreePath),
    )
  }
  return Array.from(event.dataTransfer.files)
    .map((file) => pathForDroppedFile(file))
    .filter((path) => path.length > 0)
}

function binaryPasteFiles(data: DataTransfer): File[] {
  const directFiles = Array.from(data.files).filter((file) => file.size > 0)
  if (directFiles.length > 0) return directFiles
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file && file.size > 0)
}

interface ResolvePastedFilePathsOptions {
  repoRoot: string
  worktreePath: string
  temporaryFilesDirectory: string
  allowNativeClipboardImage: boolean
}

async function resolvePastedFilePaths(files: File[], options: ResolvePastedFilePathsOptions): Promise<string[]> {
  const sourcePaths = await readSystemClipboardFilePaths()
  const payloads = sourcePaths.length > 0 ? [] : await pastedBinaryPayloads(files, options.allowNativeClipboardImage)
  if (isRemoteRepoId(options.repoRoot)) return await resolveRemotePastedFilePaths(payloads, sourcePaths, options)
  if (sourcePaths.length > 0) {
    const result = await saveClipboardBinaryFilesFromPaste({
      worktreePath: options.worktreePath,
      temporaryFilesDirectory: options.temporaryFilesDirectory,
      files: [],
      sourcePaths,
    })
    return result.ok ? result.paths : []
  }
  if (payloads.length === 0) return []
  const result = await saveClipboardBinaryFilesFromPaste({
    worktreePath: options.worktreePath,
    temporaryFilesDirectory: options.temporaryFilesDirectory,
    files: payloads,
  })
  return result.ok ? result.paths : []
}

async function resolveRemotePastedFilePaths(
  payloads: ClipboardBinaryFilePayload[],
  sourcePaths: string[],
  options: ResolvePastedFilePathsOptions,
): Promise<string[]> {
  const targetDirPath = remoteTerminalPasteTargetDir(options.worktreePath)
  if (sourcePaths.length > 0) {
    const result = await transferRepositoryFiles({
      repoId: options.repoRoot,
      worktreePath: options.worktreePath,
      targetDirPath,
      source: {
        kind: 'localPaths',
        items: sourcePaths.map((path) => ({ path, destinationName: generatedTimestampedPasteFileName(path) })),
      },
    })
    return result.ok ? result.copied.map((entry) => entry.destinationPath) : []
  }
  if (payloads.length === 0) return []
  const items = await Promise.all(payloads.map((payload) => uploadedItemFromFile(fileFromClipboardPayload(payload))))
  const result = await transferRepositoryFiles({
    repoId: options.repoRoot,
    worktreePath: options.worktreePath,
    targetDirPath,
    source: {
      kind: 'uploadedItems',
      items,
    },
  })
  return result.ok ? result.copied.map((entry) => entry.destinationPath) : []
}

async function pastedBinaryPayloads(
  files: File[],
  allowNativeClipboardImage: boolean,
): Promise<ClipboardBinaryFilePayload[]> {
  if (files.length > 0) return await Promise.all(files.map(fileToClipboardPayload))
  if (!allowNativeClipboardImage) return []
  const image = await readSystemClipboardImage()
  return image ? [image] : []
}

function fileFromClipboardPayload(payload: ClipboardBinaryFilePayload): File {
  return new File([payload.bytes], payload.name ?? 'clipboard', { type: payload.type ?? '' })
}

function remoteTerminalPasteTargetDir(worktreePath: string): string {
  const normalized = worktreePath.replace(/\/+$/u, '')
  return normalized ? `${normalized}/tmp` : '/tmp'
}

async function fileToClipboardPayload(file: File): Promise<ClipboardBinaryFilePayload> {
  return {
    name: file.name,
    type: file.type,
    bytes: await file.arrayBuffer(),
  }
}

function pathForTerminalDrop(path: string, worktreePath: string): string {
  const root = stripTrailingPathSeparators(worktreePath)
  if (!root) return path
  if (path === root) return '.'
  const prefix = `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function stripTrailingPathSeparators(path: string): string {
  return path.replace(/[\\/]+$/u, '')
}
