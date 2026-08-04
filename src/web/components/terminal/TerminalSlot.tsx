import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { toast } from 'sonner'
import { Button } from '#/web/components/ui/button.tsx'
import { GOBLIN_FILE_PATHS_MIME, parseGoblinFilePathDragPayload } from '#/shared/file-tree.ts'
import type { ClipboardBinaryFilePayload } from '#/shared/clipboard-binary-temp-files.ts'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { cn } from '#/web/lib/cn.ts'
import { setTerminalFocused } from '#/web/terminal-focus.ts'
import {
  pathForDroppedFile,
  readSystemClipboardFilePaths,
  saveClipboardBinaryFilesFromPaste,
} from '#/web/app-shell-client.ts'
import { transferRepositoryFiles } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { useWorktreeTerminalSnapshot, useTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { MobileTerminalCommandDeck } from '#/web/components/terminal/mobile-terminal-toolbar.tsx'
import { isMobileDevice } from '#/web/components/terminal/mobile-detection.ts'
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
import { generatedTimestampedPasteFileName } from '#/web/components/file-tree/model.ts'
import { uploadedItemFromFile } from '#/web/components/file-tree/clipboard.ts'
import { openWorktreeEditorTarget } from '#/web/lib/editor-open-targets.ts'
import { resolveTerminalCustomButtonPreset } from '#/shared/terminal-custom-button-presets.ts'
const MOBILE_TERMINAL_TOUCH_DRAG_THRESHOLD_PX = 8
const MOBILE_TERMINAL_INERTIA_FRAME_MS = 1000 / 60
const MOBILE_TERMINAL_INERTIA_DECAY_PER_FRAME = 0.92
const MOBILE_TERMINAL_INERTIA_MIN_VELOCITY_PX_PER_MS = 0.05
const MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS = 3
const MOBILE_TERMINAL_INERTIA_MAX_FRAME_MS = 32
const MOBILE_TERMINAL_INERTIA_RELEASE_WINDOW_MS = 80
const MOBILE_TERMINAL_TOUCH_VELOCITY_SAMPLE_WEIGHT = 0.35

function clampTouchVelocity(velocityPxPerMs: number): number {
  return Math.max(
    -MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS,
    Math.min(MOBILE_TERMINAL_INERTIA_MAX_VELOCITY_PX_PER_MS, velocityPxPerMs),
  )
}

interface MobileTerminalTouchGesture {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  lastTimestamp: number
  velocityPxPerMs: number
  remainder: number
  dragging: boolean
}

interface MobileTerminalTouchInertia {
  velocityPxPerMs: number
  remainder: number
  clientX: number
  clientY: number
  lastTimestamp: number
}

interface TerminalSlotProps {
  repoRoot: string
  worktreePath: string
  onRevealPath?: (relativePath: string) => void
}

export function TerminalSlot({ repoRoot, worktreePath, onRevealPath }: TerminalSlotProps) {
  const t = useT()
  const hostRef = useRef<HTMLDivElement | null>(null)
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
  const [bottomDockHeight, setBottomDockHeight] = useState<number | null>(null)
  const context = useTerminalSessionContext()
  const {
    clearBell,
    registerWorktreeHost,
    attach,
    detach,
    selectTerminal,
    focusTerminal,
    isTerminalFocusTarget,
    findNext,
    findPrevious,
    clearSearch,
    writeExtraKey,
    writeInput,
    scrollByTouch,
    takeover,
    restart,
  } = context
  const terminalWorktreeKey = worktreeTerminalKey(repoRoot, worktreePath)
  const worktreeSnapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const descriptor = worktreeSnapshot.selectedDescriptor
  const key = descriptor?.key ?? null
  const snapshot = useTerminalSnapshot(key)
  const terminalCount = worktreeSnapshot.count
  const hasSessions = terminalCount > 0
  const renderPending = hasSessions && snapshot.renderPending === true
  const {
    temporaryFilesDirectory,
    terminalFontSize,
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
  const isMobileTerminal = isMobile && (isController || isReadonly) && !!key

  const cancelTouchInertia = useCallback(() => {
    if (touchInertiaFrameRef.current !== null) window.cancelAnimationFrame(touchInertiaFrameRef.current)
    touchInertiaFrameRef.current = null
    touchInertiaRef.current = null
  }, [])

  useEffect(() => {
    touchScrollRef.current = null
    cancelTouchInertia()
    return cancelTouchInertia
  }, [attachment?.role, cancelTouchInertia, isMobileTerminal, key, snapshot.phase])

  useLayoutEffect(() => {
    if (fitToWidth && hostRef.current) hostRef.current.scrollLeft = 0
  }, [fitToWidth, key])

  const handleTouchScrollStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileTerminal || event.pointerType !== 'touch' || event.isPrimary === false) return
      cancelTouchInertia()
      touchScrollRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTimestamp: event.timeStamp,
        velocityPxPerMs: 0,
        remainder: 0,
        dragging: false,
      }
    },
    [cancelTouchInertia, isMobileTerminal],
  )
  const handleTouchScrollMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = touchScrollRef.current
      if (!isMobileTerminal || !key || !gesture || event.pointerId !== gesture.pointerId) return

      if (!gesture.dragging) {
        const horizontalDistance = Math.abs(event.clientX - gesture.startX)
        const verticalDistance = Math.abs(event.clientY - gesture.startY)
        if (Math.max(horizontalDistance, verticalDistance) < MOBILE_TERMINAL_TOUCH_DRAG_THRESHOLD_PX) return
        if (horizontalDistance > verticalDistance) {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          touchScrollRef.current = null
          return
        }
        gesture.dragging = true
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
    [isMobileTerminal, key, scrollByTouch, terminalFontSize],
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
      if (gesture.dragging) {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      touchScrollRef.current = null
      if (allowInertia && gesture.dragging) startTouchInertia(gesture, event.timeStamp)
      else cancelTouchInertia()
    },
    [cancelTouchInertia, startTouchInertia],
  )
  const handleTouchScrollEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishTouchScroll(event, true),
    [finishTouchScroll],
  )
  const handleTouchScrollCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishTouchScroll(event, false),
    [finishTouchScroll],
  )

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
    attach(descriptor, host, { onRevealPath: handleRevealPath, onOpenPathInEditor: handleOpenPathInEditor })
    return () => detach(descriptor.key, host)
  }, [attach, descriptor, detach, handleOpenPathInEditor, handleRevealPath])

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
      setTerminalFocused(!!key && isTerminalFocusTarget(key, event.target))
    },
    [isTerminalFocusTarget, key],
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
      void resolvePastedFilePaths(files, { repoRoot, worktreePath, temporaryFilesDirectory }).then((paths) => {
        if (paths.length === 0) return
        writeInput(key, paths.map(shellEscapePath).join(' '))
      })
    },
    [isController, key, repoRoot, temporaryFilesDirectory, worktreePath, writeInput],
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
  const hasMobileCommandDeck = isMobile && isController && !!key
  const hasBottomDock = visibleCustomButtons.length > 0 || hasMobileCommandDeck

  const cycleTerminal = useCallback(
    (direction: -1 | 1) => {
      if (!key || worktreeSnapshot.sessions.length <= 1) return
      const currentIndex = worktreeSnapshot.sessions.findIndex((session) => session.key === key)
      const safeCurrentIndex = currentIndex < 0 ? 0 : currentIndex
      const nextIndex =
        (safeCurrentIndex + direction + worktreeSnapshot.sessions.length) % worktreeSnapshot.sessions.length
      const next = worktreeSnapshot.sessions[nextIndex]
      if (next) selectTerminal(terminalWorktreeKey, next.key)
    },
    [key, selectTerminal, terminalWorktreeKey, worktreeSnapshot.sessions],
  )

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
  }, [hasBottomDock, hasMobileCommandDeck, visibleCustomButtons.length])

  const readonlyMessage = attachment?.role === 'viewer' ? t('terminal.mirror-controlled') : t('terminal.unowned')
  const progressVariant =
    progress?.state === 2 ? 'error' : progress?.state === 4 ? 'warning' : progress?.state === 3 ? 'indeterminate' : ''
  const slotStyle =
    bottomDockHeight === null
      ? undefined
      : ({ '--goblin-terminal-bottom-dock-height': `${bottomDockHeight}px` } as CSSProperties)

  return (
    <div
      className="goblin-terminal-slot focus-visible:outline-none"
      tabIndex={-1}
      style={slotStyle}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onKeyDownCapture={handleKeyDownCapture}
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
      <div
        ref={hostRef}
        className={cn(
          'goblin-terminal-slot__host',
          isMobileTerminal && 'goblin-terminal-slot__host--touch-scroll',
          isMobileTerminal && !fitToWidth && 'goblin-terminal-slot__host--original-width',
        )}
        aria-readonly={(!isController && hasSessions) || undefined}
        onPointerDown={isMobileTerminal ? handleTouchScrollStart : undefined}
        onPointerMove={isMobileTerminal ? handleTouchScrollMove : undefined}
        onPointerUp={isMobileTerminal ? handleTouchScrollEnd : undefined}
        onPointerCancel={isMobileTerminal ? handleTouchScrollCancel : undefined}
      />
      <div className="goblin-terminal-float-group">
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
          {visibleCustomButtons.length > 0 && (
            <div className="goblin-terminal-custom-buttons" aria-label={t('terminal.custom-buttons')}>
              {visibleCustomButtons.map((button, index) => {
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
                      if (action === 'input') writeInput(key, button.value)
                      else writeInput(key, `${button.value}\r`)
                      focusTerminal(key)
                    }}
                  >
                    {button.label}
                  </Button>
                )
              })}
            </div>
          )}
          {hasMobileCommandDeck && (
            <MobileTerminalCommandDeck
              key={key}
              terminalCount={terminalCount}
              fitToWidth={fitToWidth}
              onExtraKey={(input) => writeExtraKey(key, input)}
              onInput={(data) => writeInput(key, data)}
              onCycleTerminal={cycleTerminal}
              onFitToWidthChange={setFitToWidth}
            />
          )}
        </div>
      )}
      {isReadonly && (
        <ViewerStatus
          message={readonlyMessage}
          takeoverLabel={t('terminal.takeover')}
          takeoverKey={key}
          onTakeover={takeover}
          takeoverPending={snapshot.takeoverPending}
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
  takeoverLabel: string
  takeoverKey: string | null
  onTakeover: (key: string) => void
  takeoverPending?: boolean
}

function ViewerStatus({ message, takeoverLabel, takeoverKey, onTakeover, takeoverPending }: ViewerStatusProps) {
  return (
    <div className="goblin-terminal-slot__viewer-status">
      <span className="goblin-terminal-slot__viewer-message" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </span>
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
}

async function resolvePastedFilePaths(files: File[], options: ResolvePastedFilePathsOptions): Promise<string[]> {
  const sourcePaths = await readSystemClipboardFilePaths()
  if (isRemoteRepoId(options.repoRoot)) return await resolveRemotePastedFilePaths(files, sourcePaths, options)
  if (sourcePaths.length > 0) {
    const result = await saveClipboardBinaryFilesFromPaste({
      worktreePath: options.worktreePath,
      temporaryFilesDirectory: options.temporaryFilesDirectory,
      files: [],
      sourcePaths,
    })
    return result.ok ? result.paths : []
  }
  if (files.length === 0) return []
  const payload = await Promise.all(files.map(fileToClipboardPayload))
  const result = await saveClipboardBinaryFilesFromPaste({
    worktreePath: options.worktreePath,
    temporaryFilesDirectory: options.temporaryFilesDirectory,
    files: payload,
  })
  return result.ok ? result.paths : []
}

async function resolveRemotePastedFilePaths(
  files: File[],
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
  if (files.length === 0) return []
  const items = await Promise.all(files.map(uploadedItemFromFile))
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
