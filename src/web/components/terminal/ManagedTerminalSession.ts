import type { ISearchResultChangeEvent } from '@xterm/addon-search'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type {
  TerminalAttachResult,
  TerminalExitEvent,
  TerminalAttachInput,
  TerminalOutputEvent,
  TerminalRestartInput,
  TerminalTmuxPageDirection,
  TerminalWindowsPty,
} from '#/shared/terminal.ts'
import { normalizeTerminalSize, resolveTerminalOwnership } from '#/shared/terminal.ts'
import { terminalBridge } from '#/web/terminal.ts'
import { setTerminalFocused } from '#/web/terminal-focus.ts'
import { openExternalUrl } from '#/web/app-shell-client.ts'
import { createTerminalBellScanner } from '#/web/components/terminal/terminal-bell-scan.ts'
import { TerminalSessionRuntime } from '#/web/components/terminal/terminal-session-runtime.ts'
import { writeWithTerminalAuthority } from '#/web/components/terminal/authority-gate.ts'
import { TerminalSessionView } from '#/web/components/terminal/terminal-session-view.ts'
import { readOrCreateWebTerminalAttachmentId } from '#/web/renderer-terminal-bridge.ts'
import { DEFAULT_TERMINAL_FONT_SIZE } from '#/shared/settings-defaults.ts'
import { DEFAULT_TERMINAL_FONT_FAMILY } from '#/web/components/terminal/terminal-geometry.ts'
import { isTerminalEmulatorInput, type TerminalInput } from '#/web/components/terminal/terminal-input.ts'
import type { TerminalExtraKeyInput } from '#/web/components/terminal/terminal-extra-keys.ts'
import {
  terminalWindowsPtyAppearanceForCurrentDocument,
  type TerminalThemeMode,
} from '#/web/components/terminal/terminal-theme.ts'
import type {
  TerminalBellEvent,
  TerminalDescriptor,
  TerminalOwnershipViewModel,
  TerminalSearchResult,
  TerminalSessionAttachHandlers,
  TerminalMobileSelectionPoint,
  TerminalTouchScrollInput,
} from '#/web/components/terminal/types.ts'
const RESIZE_DEBOUNCE_MS = 80
const EMPTY_SEARCH_RESULT: TerminalSearchResult = { resultIndex: -1, resultCount: 0, found: false }

type TerminalAttachResultWithOwnership = Extract<TerminalAttachResult, { ok: true }> & {
  role: TerminalOwnershipViewModel['role']
  controllerStatus: TerminalOwnershipViewModel['controllerStatus']
}

export class ManagedTerminalSession {
  descriptor: TerminalDescriptor
  private readonly notify: () => void
  private readonly onBell: ((descriptor: TerminalDescriptor, event: TerminalBellEvent) => void) | null
  private readonly onInput: ((descriptor: TerminalDescriptor) => void) | null
  private terminalThemeMode: () => TerminalThemeMode
  private readonly runtime = new TerminalSessionRuntime()
  private readonly view: TerminalSessionView
  private readonly backgroundBellScanner = createTerminalBellScanner()
  private startToken = 0
  private resizeFlushTimer: number | null = null
  private outputFlushFrame: number | null = null
  private pendingFocus = false
  private renderPending = true
  private tmuxNavigationTail: Promise<void> = Promise.resolve()

  private pendingResize: { cols: number; rows: number } | null = null
  private pendingOutput: string[] = []
  private pendingWriteBuffer = ''
  private pendingWriteHasUserIntent = false
  private inputFlushScheduled = false
  // One-shot bypass of Hobgoblin's frame queue for authoritative output after user intent.
  private prioritizeNextOutput = false
  private hydratedSnapshot: { snapshot: string; snapshotSeq: number } | null = null
  private windowsPty: TerminalWindowsPty | undefined
  private disposed = false

  constructor(
    descriptor: TerminalDescriptor,
    notify: () => void,
    onBell: ((descriptor: TerminalDescriptor, event: TerminalBellEvent) => void) | null = null,
    fontSize = DEFAULT_TERMINAL_FONT_SIZE,
    fontFamily = DEFAULT_TERMINAL_FONT_FAMILY,
    terminalThemeMode: () => TerminalThemeMode = () => 'theme',
    onInput: ((descriptor: TerminalDescriptor) => void) | null = null,
  ) {
    this.descriptor = descriptor
    this.notify = notify
    this.onBell = onBell
    this.onInput = onInput
    this.terminalThemeMode = terminalThemeMode
    this.view = new TerminalSessionView(
      {
        onInput: (data) => this.writeInput(data),
        onBell: () => this.handleBell(),
        onResize: ({ cols, rows }) => this.queueResize(cols, rows),
        onSearchResult: (event) => this.updateSearchResult(event),
        onProgress: (state, value) => this.updateProgress(state, value),
        onOpenExternalLink: (uri) => this.openExternalLink(uri),
        onRenderRecoveryRequest: () => this.recoverActiveView(),
      },
      { fontSize, fontFamily, terminalThemeMode },
    )
    this.view.setWorktreePath(descriptor.worktreePath)
  }

  updateDescriptor(descriptor: TerminalDescriptor): void {
    this.descriptor = descriptor
    this.view.setWorktreePath(descriptor.worktreePath)
  }

  setFontSize(fontSize: number): void {
    this.view.setFontSize(fontSize)
  }

  setFontFamily(fontFamily: string): void {
    this.view.setFontFamily(fontFamily)
  }

  setTerminalThemeMode(terminalThemeMode: () => TerminalThemeMode): void {
    this.terminalThemeMode = terminalThemeMode
    this.view.setTerminalThemeMode(terminalThemeMode)
  }

  attach(host: HTMLElement, handlers?: TerminalSessionAttachHandlers): void {
    if (this.disposed) return
    this.view.setRevealPathHandler(handlers?.onRevealPath ?? null)
    this.view.setOpenPathInEditorHandler(handlers?.onOpenPathInEditor ?? null)
    this.view.setMobileScrollScrubber(handlers?.mobileScrollScrubber ?? null)
    this.view.setAutoFitEnabled(this.runtime.canResize())
    this.view.attach(host)
    if (!this.view.currentTerminal()) this.start()
    else if (this.runtime.canResize()) this.view.fitSoon()
    else this.applyCanonicalSizeToView()
    this.flushPendingFocus()
  }

  detach(host: HTMLElement, parkingRoot: HTMLElement): void {
    this.clearTerminalFocusIfOwned()
    this.view.setRevealPathHandler(null)
    this.view.setOpenPathInEditorHandler(null)
    this.view.setMobileScrollScrubber(null)
    this.view.detach(host, parkingRoot)
  }

  focus(): void {
    if (this.disposed) return
    if (!this.view.isVisible() || !this.view.currentTerminal()) {
      this.pendingFocus = true
      return
    }
    this.pendingFocus = false
    this.view.focus()
  }

  restart(): void {
    if (this.disposed) return
    const { changed } = this.runtime.prepareRestart()
    this.destroyActiveView()
    if (changed) this.notify()
    this.start()
  }

  dispose(options: { closeSession?: boolean } = {}): void {
    if (this.disposed) return
    this.disposed = true
    this.clearTerminalFocusIfOwned()
    this.view.blurIfFocused()
    const sessionIds = this.runtime.disposeSessionIds()
    if (options.closeSession !== false) {
      for (const sessionId of sessionIds) void terminalBridge.close({ sessionId }).catch(() => {})
    }
    this.destroyActiveView()
    this.view.disposeFrame()
  }

  snapshot() {
    const snapshot = this.runtime.snapshot()
    if (this.renderPending && !this.disposed && snapshot.phase !== 'error' && snapshot.phase !== 'closed') {
      return { ...snapshot, renderPending: true }
    }
    return snapshot
  }

  isTerminalFocusTarget(target: EventTarget | null): boolean {
    return this.view.isTerminalFocusTarget(target)
  }

  scrollByTouch(input: TerminalTouchScrollInput): void {
    this.view.scrollByTouch(input)
  }

  beginMobileSelection(point: TerminalMobileSelectionPoint): boolean {
    return this.view.beginMobileSelection(point)
  }

  extendMobileSelection(point: TerminalMobileSelectionPoint): void {
    this.view.extendMobileSelection(point)
  }

  finishMobileSelection(point: TerminalMobileSelectionPoint): void {
    this.view.finishMobileSelection(point)
  }

  cancelMobileSelection(point: TerminalMobileSelectionPoint): void {
    this.view.cancelMobileSelection(point)
  }

  mobileSelectionText(): string {
    return this.view.mobileSelectionText()
  }

  clearMobileSelection(): void {
    this.view.clearMobileSelection()
  }

  writeExtraKey(input: TerminalExtraKeyInput): void {
    const data = this.view.inputForExtraKey(input)
    if (data) this.writeInput(data)
  }

  writeInput(input: string | TerminalInput): void {
    const isUserIntentInput = typeof input === 'string' || !isTerminalEmulatorInput(input)
    if (!isUserIntentInput && this.runtime.isReplaying()) return
    const data = typeof input === 'string' ? input : input.data
    const sessionId = this.runtime.currentSessionId()
    if (!data || !sessionId || !this.runtime.canWrite()) return
    if (isUserIntentInput) {
      this.prioritizeNextOutput = true
      this.pendingWriteHasUserIntent = true
      this.onInput?.(this.descriptor)
    }
    this.pendingWriteBuffer += data
    this.scheduleInputFlush()
  }

  private scheduleInputFlush(): void {
    if (this.disposed || this.inputFlushScheduled) return
    this.inputFlushScheduled = true
    queueMicrotask(() => {
      this.inputFlushScheduled = false
      this.flushInput()
    })
  }

  private flushInput(): void {
    if (this.disposed) return
    const data = this.pendingWriteBuffer
    const userIntent = this.pendingWriteHasUserIntent
    this.pendingWriteBuffer = ''
    this.pendingWriteHasUserIntent = false
    if (!data || !this.runtime.currentSessionId() || !this.runtime.canWrite()) return
    void writeWithTerminalAuthority({
      data,
      ...(userIntent ? {} : { userIntent: false }),
      getSessionId: () => this.runtime.currentSessionId(),
      getAttachment: () => this.runtime.snapshot().attachment,
      bridge: terminalBridge,
    }).catch(() => {})
  }

  findNext(term: string, incremental = false): TerminalSearchResult {
    return this.find(term, 'next', incremental)
  }

  findPrevious(term: string): TerminalSearchResult {
    return this.find(term, 'previous', false)
  }

  clearSearch(): void {
    this.view.clearSearch()
    this.setSearchResult(null)
  }

  scrollToBottom(): void {
    this.view.scrollToBottom()
    const sessionId = this.runtime.currentSessionId()
    if (!sessionId || !this.descriptor.tmuxBacked) return
    this.prioritizeNextOutput = true
    this.enqueueTmuxNavigation(() => terminalBridge.returnToBottom({ sessionId }))
  }

  pageTmux(direction: TerminalTmuxPageDirection): void {
    const sessionId = this.runtime.currentSessionId()
    if (!sessionId || !this.descriptor.tmuxBacked) return
    this.prioritizeNextOutput = true
    this.enqueueTmuxNavigation(() => terminalBridge.pageTmux({ sessionId, direction }))
  }

  scrollLines(amount: number): void {
    this.view.scrollLines(amount)
  }

  private enqueueTmuxNavigation(action: () => Promise<unknown>): void {
    this.tmuxNavigationTail = this.tmuxNavigationTail.then(action).then(
      () => undefined,
      () => undefined,
    )
  }

  serialize(): string {
    return this.view.serialize()
  }

  currentSessionId(): string | null {
    return this.runtime.currentSessionId()
  }

  hydrate(input: {
    sessionId: string
    processName: string
    canonicalTitle?: string | null
    role: TerminalOwnershipViewModel['role']
    controllerStatus: TerminalOwnershipViewModel['controllerStatus']
    canonicalCols: number
    canonicalRows: number
    phase?: TerminalAttachResultWithOwnership['phase']
    message?: string | null
    snapshot?: string
    snapshotSeq?: number
    windowsPty?: TerminalWindowsPty
  }): void {
    const wasController = this.runtime.canResize()
    this.windowsPty = input.windowsPty
    this.view.setWindowsPty(this.windowsPty)
    this.hydratedSnapshot =
      typeof input.snapshot === 'string' && typeof input.snapshotSeq === 'number'
        ? { snapshot: input.snapshot, snapshotSeq: input.snapshotSeq }
        : null
    const previousSessionId = this.runtime.currentSessionId()
    const changed = this.runtime.hydrateSession({
      sessionId: input.sessionId,
      processName: input.processName,
      canonicalTitle: input.canonicalTitle ?? null,
      role: input.role,
      controllerStatus: input.controllerStatus,
      canonicalCols: input.canonicalCols,
      canonicalRows: input.canonicalRows,
      phase: input.phase,
      message: input.message,
    })
    this.syncViewForOwnership(wasController)
    if (previousSessionId !== input.sessionId) {
      this.backgroundBellScanner.reset()
      this.prioritizeNextOutput = false
    }
    if (previousSessionId && previousSessionId !== input.sessionId) this.applyHydratedSnapshotToActiveView()
    if (changed) this.notify()
  }

  handleOutput(event: TerminalOutputEvent): void {
    const result = this.runtime.handleOutput(event)
    if (result.changed) this.notify()
    if (!result.output) return
    if (this.view.currentTerminal()) {
      this.queueOutput(result.output)
      return
    }
    // No live xterm parses this output (background project or never-attached
    // session) — detect BEL here so the bell still goes unread.
    if (this.backgroundBellScanner.scan(result.output)) this.handleBell()
  }

  handleOwnership(event: TerminalOwnershipViewModel): void {
    const wasController = this.runtime.canResize()
    const changed = this.runtime.handleOwnership(event)
    const pendingCleared = this.runtime.clearTakeoverPending()
    if (changed) {
      this.syncViewForOwnership(wasController)
    }
    if (changed || pendingCleared) {
      this.notify()
    }
  }

  handleServerTitle(canonicalTitle: string | null): void {
    if (this.runtime.setCanonicalTitle(canonicalTitle)) this.notify()
  }

  handleExit(event: TerminalExitEvent): boolean {
    if (!this.runtime.handleExit(event)) return false
    this.backgroundBellScanner.reset()
    this.prioritizeNextOutput = false
    this.flushOutput()
    this.clearTerminalFocusIfOwned()
    this.view.blurIfFocused()
    return true
  }

  takeover(): void {
    const sessionId = this.runtime.currentSessionId()
    if (!sessionId) return
    const term = this.view.currentTerminal()
    const size = term ? { cols: term.cols, rows: term.rows } : this.runtime.currentCanonicalSize()
    // Apply the authoritative takeover response immediately. A matching realtime
    // ownership event remains idempotent.
    if (this.runtime.setTakeoverPending(true)) this.notify()
    void terminalBridge
      .takeover({ sessionId, cols: size.cols, rows: size.rows })
      .then((result) => {
        if (!result.ok) return
        const wasController = this.runtime.canResize()
        const changed = this.runtime.applyTakeoverResult(result)
        const pendingCleared = this.runtime.clearTakeoverPending()
        if (changed) this.syncViewForOwnership(wasController)
        if (changed || pendingCleared) this.notify()
      })
      .catch(() => {})
      .finally(() => {
        // If the server response settles but we never received an ownership event,
        // clear the pending state so the user can retry.
        if (this.runtime.isTakeoverPending()) {
          if (this.runtime.setTakeoverPending(false)) this.notify()
        }
      })
  }

  private start(): void {
    if (this.disposed || this.view.currentTerminal() || !this.view.isConnected()) return
    const token = (this.startToken += 1)
    const renderPendingChanged = !this.renderPending
    this.renderPending = true
    const phaseChanged =
      (!this.runtime.currentSessionId() || this.runtime.phase() === 'open') && this.runtime.startAttaching()
    if (renderPendingChanged || phaseChanged) this.notify()
    void this.startAsync(token)
  }

  private flushPendingFocus(): void {
    if (!this.pendingFocus) return
    if (!this.view.isVisible() || !this.view.currentTerminal()) return
    this.pendingFocus = false
    this.view.focus()
  }

  private async startAsync(token: number): Promise<void> {
    try {
      const { term, preloaded } = await this.openPhase(token)
      const result = await this.rpcPhase(token, term)
      await this.replayPhase(token, term, result, preloaded)
      await this.finalizePhase(token, term)
    } catch (err) {
      if (err instanceof StartCancelledError) return
      this.closeReplacingPtySession()
      if (!this.currentToken(token)) return
      this.destroyActiveView()
      if (this.runtime.failRuntime(err instanceof Error ? err.message : String(err))) this.notify()
    }
  }

  private async openPhase(token: number): Promise<{ term: XTermTerminal; preloaded: boolean }> {
    if (this.disposed || this.startToken !== token || this.view.currentTerminal()) throw new StartCancelledError()
    const measuredGeometry = this.view.measureGeometry()
    if (!measuredGeometry) throw new Error('error.terminal-not-measurable')
    const isController = this.runtime.canResize()
    const geometry = isController ? measuredGeometry : (this.canonicalGeometry() ?? measuredGeometry)
    this.view.setAutoFitEnabled(isController)
    const term = this.view.openTerminal(geometry, (input) => this.writeInput(input), this.windowsPty)
    const preloaded = await this.preloadHydratedSnapshot(token, term)
    await waitForTerminalLayout()
    this.guardStart(token, term)
    if (isController) this.view.fitNow()
    await waitForTerminalLayout()
    this.guardStart(token, term)
    return { term, preloaded }
  }

  private async rpcPhase(token: number, term: XTermTerminal): Promise<TerminalAttachResultWithOwnership> {
    const restart = this.runtime.consumeRestartFlag()
    const sessionId = restart ? this.runtime.restartingSessionId() : this.runtime.currentSessionId()
    if (!sessionId) {
      this.destroyActiveView()
      if (this.runtime.failAttachAttempt('error.invalid-arguments')) this.notify()
      throw new StartCancelledError()
    }
    const result = restart
      ? await terminalBridge.restart(this.terminalRestartInput(sessionId, term))
      : await terminalBridge.attach(this.terminalAttachInput(sessionId, term))
    if (this.disposed || this.startToken !== token || this.view.currentTerminal() !== term) {
      if (result.ok) void terminalBridge.close({ sessionId: result.sessionId }).catch(() => {})
      else this.closeReplacingPtySession()
      throw new StartCancelledError()
    }
    this.runtime.settleStartAttempt()
    if (!result.ok) {
      this.closeReplacingPtySession()
      this.destroyActiveView()
      if (this.runtime.failAttachAttempt(result.message)) this.notify()
      throw new StartCancelledError()
    }
    return this.withLocalOwnership(result)
  }

  private async replayPhase(
    token: number,
    term: XTermTerminal,
    result: TerminalAttachResultWithOwnership,
    preloaded: boolean,
  ): Promise<void> {
    const wasController = this.runtime.canResize()
    this.runtime.applyAttachResult(result, { cols: term.cols, rows: term.rows })
    this.windowsPty = result.windowsPty
    this.view.setWindowsPty(this.windowsPty)
    const isController = this.runtime.canResize()
    this.syncViewForOwnership(wasController)
    if (isController) {
      const canonicalSize = this.runtime.currentCanonicalSize()
      if (term.cols !== canonicalSize.cols || term.rows !== canonicalSize.rows) {
        this.queueResize(term.cols, term.rows)
      }
    }
    const replay = result.snapshot ?? result.replay
    const replaySeq = result.snapshotSeq ?? result.replaySeq
    const replayTruncated = preloaded || !!result.snapshot ? true : result.replayTruncated
    const hydratedSnapshot = this.hydratedSnapshot
    const skipDuplicatePreloadedSnapshot =
      preloaded &&
      !!hydratedSnapshot &&
      typeof result.snapshot === 'string' &&
      typeof result.snapshotSeq === 'number' &&
      result.snapshotSeq === hydratedSnapshot.snapshotSeq &&
      result.snapshot === hydratedSnapshot.snapshot
    await this.replayActiveView(
      token,
      term,
      skipDuplicatePreloadedSnapshot ? '' : replay,
      replaySeq,
      skipDuplicatePreloadedSnapshot ? false : replayTruncated,
    )
    this.guardStart(token, term)
  }

  private async finalizePhase(token: number, term: XTermTerminal): Promise<void> {
    this.guardStart(token, term)
    const changed = this.runtime.markAttached()
    await waitForTerminalLayout()
    this.guardStart(token, term)
    const renderPendingChanged = this.renderPending
    this.renderPending = false
    this.flushPendingFocus()
    if (changed || renderPendingChanged) this.notify()
  }

  private guardStart(token: number, term: XTermTerminal): void {
    if (this.disposed || this.startToken !== token || this.view.currentTerminal() !== term) {
      throw new StartCancelledError()
    }
  }

  private terminalAttachInput(sessionId: string, term: XTermTerminal): TerminalAttachInput {
    return {
      sessionId,
      cols: term.cols,
      rows: term.rows,
    }
  }

  private terminalRestartInput(sessionId: string, term: XTermTerminal): TerminalRestartInput {
    return {
      sessionId,
      cols: term.cols,
      rows: term.rows,
      windowsPtyAppearance: terminalWindowsPtyAppearanceForCurrentDocument(this.terminalThemeMode()),
    }
  }

  private withLocalOwnership(result: Extract<TerminalAttachResult, { ok: true }>): TerminalAttachResultWithOwnership {
    const attachmentId = readOrCreateWebTerminalAttachmentId()
    return {
      ...result,
      ...resolveTerminalOwnership(result.controller, attachmentId),
    }
  }

  private async replayActiveView(
    token: number,
    term: XTermTerminal,
    replay: string,
    replaySeq: number,
    replayTruncated: boolean,
  ): Promise<void> {
    const replayGeneration = this.runtime.beginReplay(replaySeq)
    try {
      if (replayTruncated) term.reset()
      if (replay) await termWrite(term, replay)
    } finally {
      if (this.currentStart(token, term)) {
        for (const event of this.runtime.finishReplay(replayGeneration)) this.queueOutput(event.data)
      } else {
        this.runtime.discardReplay(replayGeneration)
      }
    }
  }

  private async preloadHydratedSnapshot(token: number, term: XTermTerminal): Promise<boolean> {
    const hydratedSnapshot = this.hydratedSnapshot
    if (!hydratedSnapshot || !this.currentStart(token, term)) return false
    const replayGeneration = this.runtime.beginReplay(hydratedSnapshot.snapshotSeq)
    try {
      term.reset()
      if (hydratedSnapshot.snapshot) await termWrite(term, hydratedSnapshot.snapshot)
      return this.currentStart(token, term)
    } finally {
      if (this.currentStart(token, term)) {
        this.runtime.finishReplay(replayGeneration)
      } else {
        this.runtime.discardReplay(replayGeneration)
      }
    }
  }

  private applyHydratedSnapshotToActiveView(): void {
    const term = this.view.currentTerminal()
    const hydratedSnapshot = this.hydratedSnapshot
    if (!term || !hydratedSnapshot) return
    const replayGeneration = this.runtime.beginReplay(hydratedSnapshot.snapshotSeq)
    try {
      term.reset()
      if (!hydratedSnapshot.snapshot) {
        this.finishActiveHydratedSnapshotReplay(term, replayGeneration)
        return
      }
      term.write(hydratedSnapshot.snapshot, () => {
        if (this.disposed) {
          this.runtime.discardReplay(replayGeneration)
          return
        }
        this.finishActiveHydratedSnapshotReplay(term, replayGeneration)
      })
    } catch (err) {
      this.runtime.discardReplay(replayGeneration)
      throw err
    }
  }

  private finishActiveHydratedSnapshotReplay(term: XTermTerminal, replayGeneration: number): void {
    if (this.view.currentTerminal() === term) {
      for (const event of this.runtime.finishReplay(replayGeneration)) this.queueOutput(event.data)
    } else {
      this.runtime.discardReplay(replayGeneration)
    }
  }

  private queueResize(cols: number, rows: number): void {
    if (!this.runtime.currentSessionId() || !this.runtime.canResize()) return
    const canonicalSize = this.runtime.currentCanonicalSize()
    if (canonicalSize.cols === cols && canonicalSize.rows === rows && !this.pendingResize) return
    this.pendingResize = { cols, rows }
    this.cancelResizeFlush()
    this.resizeFlushTimer = window.setTimeout(() => {
      this.resizeFlushTimer = null
      this.flushResize()
    }, RESIZE_DEBOUNCE_MS)
  }

  private flushResize(): void {
    const sessionId = this.runtime.currentSessionId()
    const resize = this.pendingResize
    if (!sessionId || !resize) return
    if (!this.runtime.canResize()) return
    this.pendingResize = null
    const { cols, rows } = resize
    const canonicalSize = this.runtime.currentCanonicalSize()
    if (canonicalSize.cols === cols && canonicalSize.rows === rows) return
    void terminalBridge
      .resize({ sessionId, cols, rows })
      .then((ok) => {
        if (ok && this.runtime.currentSessionId() === sessionId) this.runtime.acknowledgeResize(cols, rows)
      })
      .catch(() => {})
  }

  private canonicalGeometry(): { cols: number; rows: number } | null {
    const { cols, rows } = this.runtime.currentCanonicalSize()
    return normalizeTerminalSize(cols, rows)
  }

  private applyCanonicalSizeToView(): void {
    const geometry = this.canonicalGeometry()
    if (geometry) this.view.resizeTo(geometry.cols, geometry.rows)
  }

  private syncViewForOwnership(wasController: boolean): void {
    const isController = this.runtime.canResize()
    this.view.setInputEnabled(this.runtime.canWrite())
    this.view.setAutoFitEnabled(isController)
    if (!isController) {
      this.cancelResizeFlush()
      this.pendingResize = null
      this.pendingWriteBuffer = ''
      this.pendingWriteHasUserIntent = false
      this.prioritizeNextOutput = false
      this.applyCanonicalSizeToView()
    }
    if (!this.view.currentTerminal()) {
      if (this.view.isConnected()) this.start()
      return
    }
    if (wasController !== isController && isController) this.view.fitSoon()
  }

  private cancelResizeFlush(): void {
    if (this.resizeFlushTimer === null) return
    window.clearTimeout(this.resizeFlushTimer)
    this.resizeFlushTimer = null
  }

  private queueOutput(data: string): void {
    if (!this.view.currentTerminal()) return
    this.pendingOutput.push(data)
    if (this.prioritizeNextOutput) {
      this.prioritizeNextOutput = false
      this.flushOutput()
      return
    }
    if (this.outputFlushFrame !== null) return
    this.outputFlushFrame = requestAnimationFrame(() => {
      this.outputFlushFrame = null
      this.flushOutput()
    })
  }

  private flushOutput(): void {
    if (this.outputFlushFrame !== null) {
      cancelScheduledAnimationFrame(this.outputFlushFrame)
      this.outputFlushFrame = null
    }
    if (!this.pendingOutput.length) return
    const output = this.pendingOutput.join('')
    this.pendingOutput = []
    this.view.writeOutput(output)
  }

  private recoverActiveView(): void {
    if (this.disposed) return
    if (!this.runtime.currentSessionId()) return
    if (!this.view.isConnected()) return
    this.flushInput()
    this.destroyActiveView({ preserveTransientState: true })
    this.start()
  }

  private destroyActiveView(options?: { preserveTransientState?: boolean }): void {
    this.cancelResizeFlush()
    if (this.outputFlushFrame !== null) {
      cancelScheduledAnimationFrame(this.outputFlushFrame)
      this.outputFlushFrame = null
    }
    this.pendingResize = null
    this.pendingOutput = []
    this.pendingWriteBuffer = ''
    this.pendingWriteHasUserIntent = false
    this.inputFlushScheduled = false
    this.prioritizeNextOutput = false
    // The xterm view was parsing the stream up to now; scanning resumes from a
    // clean state rather than the middle of whatever sequence it last saw.
    this.backgroundBellScanner.reset()
    this.startToken += 1
    if (!options?.preserveTransientState) this.runtime.resetTransientState()
    this.view.destroyTerminal()
  }

  private currentStart(token: number, term: XTermTerminal): boolean {
    return !this.disposed && this.startToken === token && this.view.currentTerminal() === term
  }

  private currentToken(token: number): boolean {
    return !this.disposed && this.startToken === token
  }

  private updateProgress(state: number, value: number): void {
    if (this.runtime.setProgress(state, value)) this.notify()
  }

  private handleBell(): void {
    const sessionId = this.runtime.currentSessionId()
    this.onBell?.(this.descriptor, {
      ...(sessionId ? { sessionId } : {}),
      processName: this.runtime.processName(),
      canonicalTitle: this.runtime.canonicalTitle(),
      visible: this.view.isVisible(),
    })
  }

  private find(term: string, direction: 'next' | 'previous', incremental: boolean): TerminalSearchResult {
    if (!term) {
      this.clearSearch()
      return EMPTY_SEARCH_RESULT
    }
    const found = this.view.find(term, direction, incremental)
    if (!found) this.setSearchResult(EMPTY_SEARCH_RESULT)
    return this.runtime.currentSearchResult() ?? { ...EMPTY_SEARCH_RESULT, found }
  }

  private updateSearchResult(event: ISearchResultChangeEvent): void {
    this.setSearchResult({
      resultIndex: event.resultIndex,
      resultCount: event.resultCount,
      found: event.resultCount > 0,
    })
  }

  private setSearchResult(result: TerminalSearchResult | null): void {
    if (this.runtime.setSearchResult(result)) this.notify()
  }

  private openExternalLink(uri: string): void {
    if (!isHttpExternalUrl(uri)) return
    void openExternalUrl(uri).catch(() => {})
  }

  private clearTerminalFocusIfOwned(): void {
    if (this.isTerminalFocusTarget(document.activeElement)) setTerminalFocused(false)
  }

  private closeReplacingPtySession(): void {
    const sessionId = this.runtime.closeReplacingSessionId()
    if (sessionId) void terminalBridge.close({ sessionId }).catch(() => {})
  }
}

function termWrite(term: XTermTerminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    term.write(data, resolve)
  })
}

function waitForTerminalLayout(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function cancelScheduledAnimationFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  else clearTimeout(frame)
}

function isHttpExternalUrl(value: string): boolean {
  try {
    if (value.length > 4096 || /[\0-\x1f\x7f]/.test(value)) return false
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

class StartCancelledError extends Error {
  constructor() {
    super('start cancelled')
  }
}
