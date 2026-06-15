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
} from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { GOBLIN_FILE_PATHS_MIME, parseGoblinFilePathDragPayload, type RepoFileTransferUploadedItem } from '#/shared/file-tree.ts'
import type { ClipboardBinaryFilePayload } from '#/shared/clipboard-binary-temp-files.ts'
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
import {
  useWorktreeTerminalSelectedDescriptor,
  useWorktreeTerminalCount,
  useTerminalSnapshot,
} from '#/web/components/terminal/terminal-session-store.ts'
import { MobileTerminalToolbar } from '#/web/components/terminal/mobile-terminal-toolbar.tsx'
import { isMobileDevice } from '#/web/components/terminal/mobile-detection.ts'
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
import { TerminalExternalInput } from '#/web/components/terminal/terminal-external-input.tsx'
interface TerminalSlotProps {
  repoRoot: string
  branch: string
  worktreePath: string
  onRevealPath?: (relativePath: string) => void
}

export function TerminalSlot({ repoRoot, branch, worktreePath, onRevealPath }: TerminalSlotProps) {
  const t = useT()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const externalInputRef = useRef<HTMLTextAreaElement | null>(null)
  const bottomDockRef = useRef<HTMLDivElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [externalInputValue, setExternalInputValue] = useState('')
  const [bottomDockHeight, setBottomDockHeight] = useState<number | null>(null)
  const context = useTerminalSessionContext()
  const {
    clearBell,
    attach,
    detach,
    scrollLines,
    isTerminalFocusTarget,
    findNext,
    findPrevious,
    clearSearch,
    writeInput,
    takeover,
    restart,
  } = context
  const terminalWorktreeKey = worktreeTerminalKey(repoRoot, worktreePath)
  const descriptor = useWorktreeTerminalSelectedDescriptor(terminalWorktreeKey)
  const key = descriptor?.key ?? null
  const snapshot = useTerminalSnapshot(key)
  const hasSessions = useWorktreeTerminalCount(terminalWorktreeKey) > 0
  const {
    terminalExternalInputEnabled,
    temporaryFilesDirectory,
    terminalCustomButtonsVisible,
    terminalCustomButtonSize,
    terminalCustomButtons,
  } = useRuntimeTerminalSettings()
  const progress = snapshot.progress
  const attachment = snapshot.attachment
  const isController = hasSessions && snapshot.phase === 'open' && attachment?.role === 'controller'
  const isReadonly =
    hasSessions && snapshot.phase === 'open' && (attachment?.role === 'viewer' || attachment?.role === 'unowned')

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !descriptor) return
    attach(descriptor, host, { onRevealPath })
    return () => detach(descriptor.key, host)
  }, [attach, descriptor, detach, onRevealPath])

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
      if (isExternalInputPasteTarget(event.target, externalInputRef.current)) return
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
  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasPathDrop(event)) return
    event.preventDefault()
    setDragOver(true)
  }, [])
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasPathDrop(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])
  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasPathDrop(event)) return
    const relatedTarget = event.relatedTarget
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setDragOver(false)
  }, [])
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasPathDrop(event)) return
      event.preventDefault()
      setDragOver(false)
      if (!key) return
      const paths = pathsForDrop(event, worktreePath)
      if (paths.length === 0) return
      const escaped = paths.map(shellEscapePath).join(' ')
      writeInput(key, escaped)
    },
    [key, worktreePath, writeInput],
  )
  const handleExternalInputDragOver = useCallback((event: DragEvent<HTMLTextAreaElement>) => {
    if (!hasPathDrop(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [])
  const handleExternalInputDrop = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      if (!hasPathDrop(event)) return
      event.preventDefault()
      event.stopPropagation()
      const paths = pathsForDrop(event, worktreePath)
      if (paths.length === 0) return
      const text = paths.map(shellEscapePath).join(' ')
      const textarea = externalInputRef.current
      const selectionStart = textarea?.selectionStart ?? externalInputValue.length
      const selectionEnd = textarea?.selectionEnd ?? selectionStart
      const next = insertExternalInputText(externalInputValue, selectionStart, selectionEnd, text)
      setExternalInputValue(next.value)
      queueMicrotask(() => {
        const input = externalInputRef.current
        if (!input) return
        input.focus({ preventScroll: true })
        input.setSelectionRange(next.cursor, next.cursor)
      })
    },
    [externalInputValue, worktreePath],
  )
  const handleExternalInputPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (event.clipboardData.getData('text/plain').length > 0) return
      const files = binaryPasteFiles(event.clipboardData)

      event.preventDefault()
      event.stopPropagation()
      const textarea = externalInputRef.current
      const selectionStart = textarea?.selectionStart ?? externalInputValue.length
      const selectionEnd = textarea?.selectionEnd ?? selectionStart
      void savePastedFilesIntoExternalInput(files, {
        repoRoot,
        worktreePath,
        temporaryFilesDirectory,
        externalInputValue,
        selectionStart,
        selectionEnd,
        setExternalInputValue,
        focusInput: () => externalInputRef.current,
      })
    },
    [externalInputValue, repoRoot, temporaryFilesDirectory, worktreePath],
  )

  const showExternalInput = isController && terminalExternalInputEnabled && !!key
  const visibleCustomButtons = isController && terminalCustomButtonsVisible
    ? terminalCustomButtons.filter((button) => button.label.trim() && button.value.trim())
    : []
  const hasBottomDock = showExternalInput || visibleCustomButtons.length > 0
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
  }, [hasBottomDock, showExternalInput, visibleCustomButtons.length])
  const readonlyBadge = attachment?.role === 'viewer' ? t('terminal.mirror-controlled') : t('terminal.unowned')
  const progressVariant =
    progress?.state === 2 ? 'error' : progress?.state === 4 ? 'warning' : progress?.state === 3 ? 'indeterminate' : ''
  const submitExternalInput = useCallback(
    (value: string) => {
      if (!key || value.trim().length === 0) return
      writeInput(key, `${value}\r`)
      setExternalInputValue('')
    },
    [key, writeInput],
  )
  const fillExternalInput = useCallback((value: string) => {
    setExternalInputValue(value)
    queueMicrotask(() => {
      externalInputRef.current?.focus({ preventScroll: true })
      externalInputRef.current?.setSelectionRange(value.length, value.length)
    })
  }, [])
  const slotStyle =
    bottomDockHeight === null
      ? undefined
      : ({ '--goblin-terminal-bottom-dock-height': `${bottomDockHeight}px` } as CSSProperties)

  return (
    <div
      style={slotStyle}
      className="goblin-terminal-slot focus-visible:outline-none"
      tabIndex={-1}
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
        className={cn('goblin-terminal-slot__host', isReadonly && 'goblin-terminal-slot__host--hidden')}
        aria-readonly={(!isController && hasSessions) || undefined}
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
        {isMobileDevice() && isController && key && (
          <MobileTerminalToolbar
            onInput={(data) => writeInput(key, data)}
            onScrollLines={(amount) => scrollLines(key, amount)}
          />
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
                    key={`${index}:${button.label}:${button.value}:${action}`}
                    type="button"
                    size={terminalCustomButtonSize === 'large' ? 'default' : 'sm'}
                    variant="secondary"
                    className={cn(
                      'goblin-terminal-custom-buttons__button',
                      `goblin-terminal-custom-buttons__button--${terminalCustomButtonSize}`,
                    )}
                    title={button.value}
                    onClick={() => {
                      if (action === 'input') {
                        if (showExternalInput) fillExternalInput(button.value)
                        else writeInput(key, button.value)
                      } else {
                        writeInput(key, `${button.value}\r`)
                      }
                    }}
                  >
                    {button.label}
                  </Button>
                )
              })}
            </div>
          )}
          {showExternalInput && (
            <TerminalExternalInput
              ref={externalInputRef}
              value={externalInputValue}
              placeholder={t('terminal.external-input-placeholder')}
              submitLabel={t('terminal.external-input-send')}
              resizeLabel={t('terminal.external-input-resize')}
              onChange={setExternalInputValue}
              onSubmit={submitExternalInput}
              onPaste={handleExternalInputPaste}
              onDragOver={handleExternalInputDragOver}
              onDrop={handleExternalInputDrop}
            />
          )}
        </div>
      )}
      {isReadonly && (
        <ViewerOverlay
          badge={readonlyBadge}
          takeoverLabel={t('terminal.takeover')}
          snapshot={snapshot}
          takeoverKey={key}
          onTakeover={takeover}
          takeoverPending={snapshot.takeoverPending}
        />
      )}
      {hasSessions && snapshot.phase === 'opening' && (
        <div className="goblin-terminal-slot__status-overlay">
          <span>{t('terminal.opening')}</span>
        </div>
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

interface ViewerOverlayProps {
  badge: string
  takeoverLabel: string
  snapshot: ReturnType<typeof useTerminalSnapshot>
  takeoverKey: string | null
  onTakeover: (key: string) => void
  takeoverPending?: boolean
}

function ViewerOverlay({ badge, takeoverLabel, snapshot, takeoverKey, onTakeover, takeoverPending }: ViewerOverlayProps) {
  return (
    <div className="goblin-terminal-slot__viewer-overlay">
      <div className="goblin-terminal-slot__viewer-content">
        <div className="goblin-terminal-slot__viewer-badge">{badge}</div>
        <div className="goblin-terminal-slot__viewer-meta">
          <span className="goblin-terminal-slot__viewer-process">{snapshot.processName}</span>
          {snapshot.canonicalTitle && (
            <span className="goblin-terminal-slot__viewer-title">{snapshot.canonicalTitle}</span>
          )}
        </div>
        {snapshot.outputSummary && (
          <pre className="goblin-terminal-slot__viewer-output">{snapshot.outputSummary}</pre>
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

function isExternalInputPasteTarget(target: EventTarget | null, input: HTMLTextAreaElement | null): boolean {
  return !!input && target instanceof Node && input.contains(target)
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
        items: sourcePaths.map((path) => ({ path })),
      },
    })
    return result.ok ? result.copied.map((entry) => entry.destinationPath) : []
  }
  if (files.length === 0) return []
  const items = await Promise.all(files.map(fileToUploadedItem))
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

interface SavePastedFilesIntoExternalInputOptions extends ResolvePastedFilePathsOptions {
  externalInputValue: string
  selectionStart: number
  selectionEnd: number
  setExternalInputValue: (value: string) => void
  focusInput: () => HTMLTextAreaElement | null
}

async function savePastedFilesIntoExternalInput(
  files: File[],
  options: SavePastedFilesIntoExternalInputOptions,
): Promise<void> {
  const paths = await resolvePastedFilePaths(files, options)
  if (paths.length === 0) return
  const text = paths.map(shellEscapePath).join(' ')
  const next = insertExternalInputText(
    options.externalInputValue,
    options.selectionStart,
    options.selectionEnd,
    text,
  )
  options.setExternalInputValue(next.value)
  queueMicrotask(() => {
    const input = options.focusInput()
    if (!input) return
    input.focus({ preventScroll: true })
    input.setSelectionRange(next.cursor, next.cursor)
  })
}

async function fileToClipboardPayload(file: File): Promise<ClipboardBinaryFilePayload> {
  return {
    name: file.name,
    type: file.type,
    bytes: await file.arrayBuffer(),
  }
}

async function fileToUploadedItem(file: File): Promise<RepoFileTransferUploadedItem> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return {
    name: file.name || 'pasted.bin',
    mimeType: file.type || undefined,
    bytesBase64: bytesToBase64(bytes),
    byteLength: bytes.byteLength,
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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

function insertExternalInputText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
): { value: string; cursor: number } {
  const start = clampSelectionIndex(selectionStart, value.length)
  const end = clampSelectionIndex(selectionEnd, value.length)
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  const before = value.slice(0, from)
  const after = value.slice(to)
  const prefix = before.length > 0 && !/\s$/u.test(before) ? ' ' : ''
  const suffix = after.length > 0 && !/^\s/u.test(after) ? ' ' : ''
  const inserted = `${prefix}${text}${suffix}`
  return {
    value: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length,
  }
}

function clampSelectionIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) return length
  return Math.max(0, Math.min(length, Math.trunc(value)))
}
