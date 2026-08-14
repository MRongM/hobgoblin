import type { FitAddon as XTermFitAddon } from '@xterm/addon-fit'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { ProgressAddon } from '@xterm/addon-progress'
import type { SearchAddon as XTermSearchAddon, ISearchOptions, ISearchResultChangeEvent } from '@xterm/addon-search'
import { SearchAddon } from '@xterm/addon-search'
import type { SerializeAddon as XTermSerializeAddon } from '@xterm/addon-serialize'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ITheme } from '@xterm/xterm'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import { Terminal } from '@xterm/xterm'
import { TERMINAL_SCROLLBACK_LINES } from '#/shared/terminal.ts'
import {
  observeTerminalTheme,
  terminalSearchDecorationsForCurrentDocument,
  terminalThemeForCurrentDocument,
  type TerminalThemeMode,
} from '#/web/components/terminal/terminal-theme.ts'
import {
  SafariShiftKeyResolver,
  isMacNavigatorPlatform,
  terminalInputForMacOptionArrow,
} from '#/web/components/terminal/terminal-keyboard.ts'
import { registerTerminalRelativePathLinkProvider } from '#/web/components/terminal/terminal-path-links.ts'
import { registerTerminalLocalUrlLinkProvider } from '#/web/components/terminal/terminal-local-url-links.ts'
import { registerTerminalOsc52ClipboardHandler } from '#/web/components/terminal/terminal-osc52-clipboard.ts'
import { terminalInputForExtraKey, type TerminalExtraKeyInput } from '#/web/components/terminal/terminal-extra-keys.ts'
import { DEFAULT_TERMINAL_FONT_SIZE } from '#/shared/settings-defaults.ts'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  measureTerminalGeometry,
  type TerminalGeometry,
} from '#/web/components/terminal/terminal-geometry.ts'
import {
  terminalEmulatorInput,
  userTerminalInput,
  type TerminalInput,
  type TerminalUserInputSource,
} from '#/web/components/terminal/terminal-input.ts'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import type { TerminalWindowsPty } from '#/shared/terminal.ts'
import type { TerminalTouchScrollInput } from '#/web/components/terminal/types.ts'
import type { TerminalMobileSelectionPoint } from '#/web/components/terminal/types.ts'
import {
  beginTerminalMobileSelection,
  cancelTerminalMobileSelection,
  clearTerminalMobileSelection,
  extendTerminalMobileSelection,
  finishTerminalMobileSelection,
  terminalMobileSelectionText,
} from '#/web/components/terminal/terminal-mobile-selection.ts'
import { stabilizeTerminalImePosition } from '#/web/components/terminal/terminal-ime-position.ts'
import {
  stabilizeTerminalOutputCursor,
  type TerminalOutputCursorStabilizer,
} from '#/web/components/terminal/terminal-output-cursor-stabilizer.ts'

const RESIZE_DEBOUNCE_MS = 80
const FONT_REMEASURE_DEBOUNCE_MS = 80

export class TerminalSessionView {
  private readonly frame: HTMLDivElement
  private readonly xtermHost: HTMLDivElement
  private readonly parkingElement: HTMLDivElement
  private term: XTermTerminal | null = null
  private fitAddon: XTermFitAddon | null = null
  private searchAddon: XTermSearchAddon | null = null
  private serializeAddon: XTermSerializeAddon | null = null
  private outputCursorStabilizer: TerminalOutputCursorStabilizer | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposables: Array<{ dispose: () => void }> = []
  private disposeThemeObserver: (() => void) | null = null
  private disposeFontObserver: (() => void) | null = null
  private fitFlushTimer: number | null = null
  private fontFitTimer: number | null = null
  private fontFitFrame: number | null = null
  private pinToBottomFrame: number | null = null
  private autoFitEnabled = true
  private host: HTMLElement | null = null
  private revealPathHandler: ((relativePath: string) => void) | null = null
  private openPathInEditorHandler: ((target: FilePathTarget) => void) | null = null
  private worktreePath: string | null = null
  private mobileScrollScrubber: HTMLElement | null = null
  private mobileScrollScrubberPointerId: number | null = null
  private fontSize: number
  private fontFamily: string
  private inputEnabled = true
  private terminalThemeMode: () => TerminalThemeMode
  private readonly safariShiftKeyResolver = new SafariShiftKeyResolver()
  private pendingCoreUserInput = 0
  private pendingFallbackUserInput: Array<{ data: string; source: TerminalUserInputSource }> = []

  constructor(
    handlers: {
      onInput: (data: TerminalInput) => void
      onBell: () => void
      onResize: (size: { cols: number; rows: number }) => void
      onSearchResult: (event: ISearchResultChangeEvent) => void
      onProgress: (state: number, value: number) => void
      onOpenExternalLink: (uri: string) => void
      onRenderRecoveryRequest: () => void
    },
    options: { fontSize?: number; fontFamily?: string; terminalThemeMode?: () => TerminalThemeMode } = {},
  ) {
    this.fontSize = options.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE
    this.fontFamily = options.fontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY
    this.terminalThemeMode = options.terminalThemeMode ?? (() => 'theme')
    this.frame = document.createElement('div')
    this.frame.className = 'goblin-managed-terminal-frame'
    this.xtermHost = document.createElement('div')
    this.xtermHost.className = 'goblin-managed-terminal-host'
    this.frame.appendChild(this.xtermHost)
    this.parkingElement = document.createElement('div')
    this.parkingElement.className = 'goblin-terminal-parking__item'
    this.handlers = handlers
  }

  private readonly handlers: {
    onInput: (data: TerminalInput) => void
    onBell: () => void
    onResize: (size: { cols: number; rows: number }) => void
    onSearchResult: (event: ISearchResultChangeEvent) => void
    onProgress: (state: number, value: number) => void
    onOpenExternalLink: (uri: string) => void
    onRenderRecoveryRequest: () => void
  }

  setRevealPathHandler(handler: ((relativePath: string) => void) | null): void {
    this.revealPathHandler = handler
  }

  setOpenPathInEditorHandler(handler: ((target: FilePathTarget) => void) | null): void {
    this.openPathInEditorHandler = handler
  }

  setMobileScrollScrubber(scrubber: HTMLElement | null): void {
    if (this.mobileScrollScrubber === scrubber) {
      this.syncMobileScrollScrubber()
      return
    }
    if (this.mobileScrollScrubber) {
      const pointerId = this.mobileScrollScrubberPointerId
      if (pointerId !== null && this.mobileScrollScrubber.hasPointerCapture?.(pointerId)) {
        this.mobileScrollScrubber.releasePointerCapture(pointerId)
      }
      this.removeMobileScrollScrubberListeners(this.mobileScrollScrubber)
      resetMobileScrollScrubber(this.mobileScrollScrubber)
    }
    this.mobileScrollScrubberPointerId = null
    this.mobileScrollScrubber = scrubber
    if (scrubber) this.addMobileScrollScrubberListeners(scrubber)
    this.syncMobileScrollScrubber()
  }

  setWorktreePath(worktreePath: string | null): void {
    this.worktreePath = worktreePath
  }

  setFontSize(fontSize: number): void {
    if (this.fontSize === fontSize) return
    this.fontSize = fontSize
    const term = this.term
    if (!term) return
    term.options.fontSize = fontSize
    this.fitForFontLoad(term)
  }

  setFontFamily(fontFamily: string): void {
    if (this.fontFamily === fontFamily) return
    this.fontFamily = fontFamily
    const term = this.term
    if (!term) return
    term.options.fontFamily = fontFamily
    this.fitForFontLoad(term)
  }

  setTerminalThemeMode(terminalThemeMode: () => TerminalThemeMode): void {
    this.terminalThemeMode = terminalThemeMode
    const term = this.term
    if (!term) return
    this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()))
  }

  setAutoFitEnabled(enabled: boolean): void {
    if (this.autoFitEnabled === enabled) return
    this.autoFitEnabled = enabled
    if (enabled) return
    this.cancelFitFlush()
    this.cancelFontFit()
  }

  setWindowsPty(windowsPty: TerminalWindowsPty | undefined): void {
    if (!windowsPty) return
    const term = this.term
    if (!term) return
    term.options.windowsPty = windowsPty
  }

  setInputEnabled(inputEnabled: boolean): void {
    this.inputEnabled = inputEnabled
    const term = this.term
    if (!term) return
    this.applyInputMode(term)
  }

  attach(host: HTMLElement): void {
    this.host = host
    host.replaceChildren(this.frame)
    if (this.term) {
      this.installResizeObserver()
      this.fitSoon()
    }
  }

  isConnected(): boolean {
    return this.frame.isConnected
  }

  detach(host: HTMLElement, parkingRoot: HTMLElement): void {
    if (this.host !== host) return
    this.host = null
    this.blurIfFocused()
    this.disconnectResizeObserver()
    this.cancelFitFlush()
    if (!this.parkingElement.parentElement) parkingRoot.appendChild(this.parkingElement)
    this.parkingElement.replaceChildren(this.frame)
  }

  disposeFrame(): void {
    this.parkingElement.remove()
    this.frame.remove()
  }

  isTerminalFocusTarget(target: EventTarget | null): boolean {
    return target instanceof Node && !!this.term?.element?.contains(target)
  }

  isVisible(): boolean {
    return !!this.host?.isConnected
  }

  blurIfFocused(): void {
    blurElementIfFocused(this.frame)
  }

  measureGeometry(): TerminalGeometry | null {
    return measureTerminalGeometry({ host: this.xtermHost, fontSize: this.fontSize, fontFamily: this.fontFamily })
  }

  openTerminal(
    geometry: TerminalGeometry,
    onMacOptionInput: (input: TerminalInput) => void,
    windowsPty?: TerminalWindowsPty,
  ): XTermTerminal {
    const theme = terminalThemeForCurrentDocument(this.terminalThemeMode())
    const isWindows = /^Win/i.test(globalThis.navigator?.platform ?? '')
    this.xtermHost.classList.toggle('goblin-terminal-static-cursor', isWindows)
    const term = new Terminal({
      allowProposedApi: true,
      cols: geometry.cols,
      rows: geometry.rows,
      cursorBlink: !isWindows,
      cursorStyle: 'bar',
      disableStdin: !this.inputEnabled,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      lineHeight: 1,
      linkHandler: {
        activate: (event, uri) => this.activateExternalLink(event, uri),
      },
      minimumContrastRatio: 4.5,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      macOptionIsMeta: true,
      rescaleOverlappingGlyphs: true,
      scrollOnUserInput: true,
      theme,
      ...(windowsPty ? { windowsPty } : {}),
    })
    const fitAddon = new FitAddon()
    this.term = term
    this.fitAddon = fitAddon
    term.loadAddon(fitAddon)
    this.installOptionalAddons(term)
    this.installKeyboardHandlers(term, onMacOptionInput)
    this.applyTerminalTheme(term, theme)
    this.disposeThemeObserver = observeTerminalTheme(this.terminalThemeMode, (nextTheme) => {
      this.applyTerminalTheme(term, nextTheme)
    })
    const hasCoreUserInputAttribution = this.installCoreUserInputAttribution(term)
    if (!hasCoreUserInputAttribution) this.installFallbackUserInputAttribution(term)
    this.disposables.push(term.onData((data) => this.handlers.onInput(this.inputFromXtermData(data, 'data'))))
    this.disposables.push(term.onBinary((data) => this.handlers.onInput(this.inputFromXtermData(data, 'binary'))))
    this.disposables.push(term.onBell(() => this.handlers.onBell()))
    this.disposables.push(
      term.onResize((size) => {
        this.handlers.onResize(size)
        this.syncMobileScrollScrubber()
      }),
    )
    this.disposables.push(term.onScroll(() => this.syncMobileScrollScrubber()))
    this.disposables.push(term.onWriteParsed(() => this.syncMobileScrollScrubber()))
    this.disposables.push(
      term.buffer.onBufferChange(() => {
        this.fitNow()
        this.syncMobileScrollScrubber()
      }),
    )
    term.open(this.xtermHost)
    this.disposables.push(stabilizeTerminalImePosition(term))
    this.outputCursorStabilizer = stabilizeTerminalOutputCursor(term)
    this.disposables.push(this.outputCursorStabilizer)
    this.applyInputMode(term)
    this.installResizeObserver()
    this.installFontObserver(term)
    this.syncMobileScrollScrubber()
    return term
  }

  currentTerminal(): XTermTerminal | null {
    return this.term
  }

  writeOutput(data: string): void {
    const term = this.term
    if (!term) return
    this.outputCursorStabilizer?.handleOutput(data)
    term.write(data)
  }

  focus(): void {
    this.term?.focus()
  }

  resizeTo(cols: number, rows: number): void {
    const term = this.term
    if (!term || (term.cols === cols && term.rows === rows)) return
    term.resize(cols, rows)
    this.pinToBottomSoon()
  }

  private applyInputMode(term: XTermTerminal): void {
    term.options.disableStdin = !this.inputEnabled
    const textarea = term.textarea
    if (!textarea) return
    textarea.readOnly = !this.inputEnabled
    if (this.inputEnabled) {
      textarea.removeAttribute('inputmode')
      return
    }
    textarea.inputMode = 'none'
    if (textarea.ownerDocument.activeElement === textarea) textarea.blur()
  }

  serialize(): string {
    return this.serializeAddon?.serialize({ excludeAltBuffer: true }) ?? ''
  }

  clearSearch(): void {
    this.searchAddon?.clearDecorations()
  }

  scrollToBottom(): void {
    scrollTerminalToBottom(this.term)
    this.syncMobileScrollScrubber()
  }

  scrollLines(amount: number): void {
    this.term?.scrollLines(amount)
    this.syncMobileScrollScrubber()
  }

  scrollByTouch(input: TerminalTouchScrollInput): void {
    const term = this.term
    const lines = Math.trunc(input.lines)
    if (!term || lines === 0) return

    if (term.buffer.active.type === 'normal' && term.modes.mouseTrackingMode === 'none') {
      term.scrollLines(lines)
      this.syncMobileScrollScrubber()
      return
    }

    // Alternate buffers and mouse-aware applications must retain xterm's wheel semantics.
    const element = term.element
    const WheelEventConstructor = element?.ownerDocument.defaultView?.WheelEvent
    if (!element || !WheelEventConstructor) return
    const direction = Math.sign(lines)
    for (let index = 0; index < Math.abs(lines); index += 1) {
      element.dispatchEvent(
        new WheelEventConstructor('wheel', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: input.clientX,
          clientY: input.clientY,
          deltaMode: WheelEventConstructor.DOM_DELTA_LINE,
          deltaY: direction,
        }),
      )
    }
  }

  beginMobileSelection(point: TerminalMobileSelectionPoint): boolean {
    return beginTerminalMobileSelection(this.term, point)
  }

  extendMobileSelection(point: TerminalMobileSelectionPoint): void {
    extendTerminalMobileSelection(this.term, point)
  }

  finishMobileSelection(point: TerminalMobileSelectionPoint): void {
    finishTerminalMobileSelection(this.term, point)
  }

  cancelMobileSelection(point: TerminalMobileSelectionPoint): void {
    cancelTerminalMobileSelection(this.term, point)
  }

  mobileSelectionText(): string {
    return terminalMobileSelectionText(this.term)
  }

  clearMobileSelection(): void {
    clearTerminalMobileSelection(this.term)
  }

  inputForExtraKey(input: TerminalExtraKeyInput): string | null {
    const term = this.term
    if (!term) return null
    return terminalInputForExtraKey(input, {
      applicationCursorKeysMode: term.modes.applicationCursorKeysMode,
    })
  }

  find(term: string, direction: 'next' | 'previous', incremental: boolean): boolean {
    if (!term || !this.searchAddon) {
      this.clearSearch()
      return false
    }
    return direction === 'next'
      ? this.searchAddon.findNext(term, terminalSearchOptions(this.terminalThemeMode(), incremental))
      : this.searchAddon.findPrevious(term, terminalSearchOptions(this.terminalThemeMode()))
  }

  fitSoon(): void {
    if (!this.autoFitEnabled || !this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    const dimensions = this.fitAddon.proposeDimensions()
    if (!dimensions || (dimensions.cols === this.term.cols && dimensions.rows === this.term.rows)) return
    this.cancelFitFlush()
    this.fitFlushTimer = window.setTimeout(() => {
      this.fitFlushTimer = null
      this.fitNow()
    }, RESIZE_DEBOUNCE_MS)
  }

  fitNow(): void {
    if (!this.autoFitEnabled || !this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    this.fitAddon.fit()
    this.pinToBottomSoon()
  }

  destroyTerminal(): void {
    this.disconnectResizeObserver()
    this.cancelFitFlush()
    for (const disposable of this.disposables.splice(0)) disposable.dispose()
    this.disposeThemeObserver?.()
    this.disposeThemeObserver = null
    this.disposeFontObserver?.()
    this.disposeFontObserver = null
    this.cancelFontFit()
    this.cancelPinToBottom()
    this.safariShiftKeyResolver.reset()
    this.pendingCoreUserInput = 0
    this.pendingFallbackUserInput = []
    clearTerminalMobileSelection(this.term)
    this.fitAddon = null
    this.searchAddon = null
    this.serializeAddon = null
    this.outputCursorStabilizer = null
    this.term?.dispose()
    this.term = null
    this.syncMobileScrollScrubber()
    this.xtermHost.replaceChildren()
    if (!this.frame.contains(this.xtermHost)) this.frame.appendChild(this.xtermHost)
  }

  private addMobileScrollScrubberListeners(scrubber: HTMLElement): void {
    scrubber.addEventListener('pointerdown', this.handleMobileScrollScrubberPointerDown)
    scrubber.addEventListener('pointermove', this.handleMobileScrollScrubberPointerMove)
    scrubber.addEventListener('pointerup', this.handleMobileScrollScrubberPointerEnd)
    scrubber.addEventListener('pointercancel', this.handleMobileScrollScrubberPointerEnd)
    scrubber.addEventListener('keydown', this.handleMobileScrollScrubberKeyDown)
  }

  private removeMobileScrollScrubberListeners(scrubber: HTMLElement): void {
    scrubber.removeEventListener('pointerdown', this.handleMobileScrollScrubberPointerDown)
    scrubber.removeEventListener('pointermove', this.handleMobileScrollScrubberPointerMove)
    scrubber.removeEventListener('pointerup', this.handleMobileScrollScrubberPointerEnd)
    scrubber.removeEventListener('pointercancel', this.handleMobileScrollScrubberPointerEnd)
    scrubber.removeEventListener('keydown', this.handleMobileScrollScrubberKeyDown)
  }

  private readonly handleMobileScrollScrubberPointerDown = (event: PointerEvent): void => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return
    const scrubber = this.mobileScrollScrubber
    if (!scrubber || !this.scrollMobileHistoryToClientY(event.clientY)) return

    event.preventDefault()
    this.mobileScrollScrubberPointerId = event.pointerId
    scrubber.dataset.active = 'true'
    scrubber.setPointerCapture?.(event.pointerId)
  }

  private readonly handleMobileScrollScrubberPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.mobileScrollScrubberPointerId) return
    event.preventDefault()
    this.scrollMobileHistoryToClientY(event.clientY)
  }

  private readonly handleMobileScrollScrubberPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.mobileScrollScrubberPointerId) return
    event.preventDefault()
    const scrubber = this.mobileScrollScrubber
    if (scrubber?.hasPointerCapture?.(event.pointerId)) scrubber.releasePointerCapture(event.pointerId)
    this.mobileScrollScrubberPointerId = null
    if (scrubber) scrubber.dataset.active = 'false'
    this.syncMobileScrollScrubber()
  }

  private readonly handleMobileScrollScrubberKeyDown = (event: KeyboardEvent): void => {
    const term = this.term
    const buffer = term?.buffer.active
    if (!term || buffer?.type !== 'normal' || buffer.baseY <= 0) return

    const baseY = Math.max(0, Math.trunc(buffer.baseY))
    const viewportY = Math.max(0, Math.min(baseY, Math.trunc(buffer.viewportY)))
    const pageSize = Math.max(1, Math.trunc(term.rows))
    const targetLine =
      event.key === 'ArrowUp'
        ? viewportY - 1
        : event.key === 'ArrowDown'
          ? viewportY + 1
          : event.key === 'PageUp'
            ? viewportY - pageSize
            : event.key === 'PageDown'
              ? viewportY + pageSize
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? baseY
                  : null
    if (targetLine === null) return

    event.preventDefault()
    event.stopPropagation()
    term.scrollToLine(Math.max(0, Math.min(baseY, targetLine)))
    this.syncMobileScrollScrubber()
  }

  private scrollMobileHistoryToClientY(clientY: number): boolean {
    const scrubber = this.mobileScrollScrubber
    const term = this.term
    const buffer = term?.buffer.active
    if (!scrubber || !term || buffer?.type !== 'normal' || buffer.baseY <= 0) {
      this.syncMobileScrollScrubber()
      return false
    }
    const rect = scrubber.getBoundingClientRect()
    if (rect.height <= 0) return false
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const baseY = Math.max(0, Math.trunc(buffer.baseY))
    term.scrollToLine(Math.round(baseY * ratio))
    this.syncMobileScrollScrubber()
    return true
  }

  private syncMobileScrollScrubber(): void {
    const scrubber = this.mobileScrollScrubber
    if (!scrubber) return
    const buffer = this.term?.buffer.active
    if (!buffer || buffer.type !== 'normal' || buffer.baseY <= 0) {
      const pointerId = this.mobileScrollScrubberPointerId
      if (pointerId !== null && scrubber.hasPointerCapture?.(pointerId)) scrubber.releasePointerCapture(pointerId)
      this.mobileScrollScrubberPointerId = null
      resetMobileScrollScrubber(scrubber)
      return
    }
    const baseY = Math.max(0, Math.trunc(buffer.baseY))
    const viewportY = Math.max(0, Math.min(baseY, Math.trunc(buffer.viewportY)))
    const percent = Math.round((viewportY / baseY) * 100)
    const position = `${percent}%`
    if (scrubber.getAttribute('aria-valuemin') !== '0') scrubber.setAttribute('aria-valuemin', '0')
    if (scrubber.getAttribute('aria-valuemax') !== '100') scrubber.setAttribute('aria-valuemax', '100')
    if (scrubber.getAttribute('aria-valuenow') !== String(percent)) {
      scrubber.setAttribute('aria-valuenow', String(percent))
    }
    if (scrubber.getAttribute('aria-valuetext') !== position) scrubber.setAttribute('aria-valuetext', position)
    if (scrubber.dataset.position !== position) scrubber.dataset.position = position
    if (scrubber.style.getPropertyValue('--goblin-terminal-scrub-position') !== position) {
      scrubber.style.setProperty('--goblin-terminal-scrub-position', position)
    }
    if (scrubber.hidden) scrubber.hidden = false
  }

  private installKeyboardHandlers(term: XTermTerminal, onInput: (input: TerminalInput) => void): void {
    const isMac = isMacNavigatorPlatform(globalThis.navigator?.platform ?? '')
    const safariShiftKeyResolver = this.safariShiftKeyResolver
    term.attachCustomKeyEventHandler((event) => {
      if (isNonMacTerminalPasteShortcut(event, isMac)) return false
      const optionInput = terminalInputForMacOptionArrow(event, {
        isMac,
        applicationCursorKeysMode: term.modes.applicationCursorKeysMode,
      })
      if (optionInput) {
        event.preventDefault()
        event.stopPropagation()
        onInput(userTerminalInput(optionInput, 'keyboard'))
        return false
      }
      const safariShiftInput = safariShiftKeyResolver.inputForEvent(event)
      if (safariShiftInput) {
        event.preventDefault()
        event.stopPropagation()
        onInput(userTerminalInput(safariShiftInput, 'keyboard'))
        return false
      }
      return true
    })
  }

  private installCoreUserInputAttribution(term: XTermTerminal): boolean {
    const coreService = xtermCoreUserInputService(term)
    if (!coreService) return false
    this.disposables.push(
      coreService.onUserInput(() => {
        this.pendingCoreUserInput += 1
      }),
    )
    return true
  }

  private installFallbackUserInputAttribution(term: XTermTerminal): void {
    this.disposables.push(term.onKey(({ key }) => this.queueFallbackUserInput(key, 'keyboard')))
    const markPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return
      const text = event.clipboardData?.getData('text/plain')
      if (text) this.queueFallbackUserInput(textForTerminalPaste(text, term.modes.bracketedPasteMode), 'paste')
    }
    const markTextInput = (event: Event) => {
      if (!(event instanceof InputEvent)) return
      if (event.data && event.inputType === 'insertText') this.queueFallbackUserInput(event.data, 'keyboard')
    }
    this.xtermHost.addEventListener('paste', markPaste, true)
    this.xtermHost.addEventListener('input', markTextInput, true)
    this.disposables.push({
      dispose: () => {
        this.xtermHost.removeEventListener('paste', markPaste, true)
        this.xtermHost.removeEventListener('input', markTextInput, true)
      },
    })
  }

  private inputFromXtermData(data: string, source: 'data' | 'binary'): TerminalInput {
    if (source === 'binary') return userTerminalInput(data, 'xterm')
    if (source === 'data' && this.pendingCoreUserInput > 0) {
      this.pendingCoreUserInput -= 1
      return userTerminalInput(data, 'xterm')
    }
    const fallback = source === 'data' ? this.consumeFallbackUserInput(data) : null
    if (fallback) return userTerminalInput(data, fallback.source)
    return terminalEmulatorInput(data, source)
  }

  private queueFallbackUserInput(data: string, source: TerminalUserInputSource): void {
    if (!data) return
    const entry = { data, source }
    this.pendingFallbackUserInput.push(entry)
    window.setTimeout(() => {
      const index = this.pendingFallbackUserInput.indexOf(entry)
      if (index !== -1) this.pendingFallbackUserInput.splice(index, 1)
    }, 0)
  }

  private consumeFallbackUserInput(data: string): { data: string; source: TerminalUserInputSource } | null {
    const index = this.pendingFallbackUserInput.findIndex((entry) => entry.data === data)
    if (index === -1) return null
    const [entry] = this.pendingFallbackUserInput.splice(index, 1)
    return entry ?? null
  }

  private installOptionalAddons(term: XTermTerminal): void {
    this.installUnicode11Addon(term)
    this.installWebLinksAddon(term)
    this.installRelativePathLinkProvider(term)
    this.installLocalUrlLinkProvider(term)
    this.installSearchAddon(term)
    this.installSerializeAddon(term)
    this.installImageAddon(term)
    this.installProgressAddon(term)
    this.installOsc52ClipboardHandler(term)
  }

  private installOsc52ClipboardHandler(term: XTermTerminal): void {
    try {
      this.disposables.push(registerTerminalOsc52ClipboardHandler(term))
    } catch (err) {
      console.warn('[terminal] failed to register osc52 clipboard handler', err)
    }
  }

  private installUnicode11Addon(term: XTermTerminal): void {
    try {
      term.loadAddon(new Unicode11Addon())
      term.unicode.activeVersion = '11'
    } catch (err) {
      console.warn('[terminal] failed to load unicode11 addon', err)
    }
  }

  private installWebLinksAddon(term: XTermTerminal): void {
    try {
      term.loadAddon(
        new WebLinksAddon((event, uri) => {
          this.activateExternalLink(event, uri)
        }),
      )
    } catch (err) {
      console.warn('[terminal] failed to load web links addon', err)
    }
  }

  private activateExternalLink(event: MouseEvent, uri: string): void {
    if (!event.metaKey && !event.ctrlKey) return
    this.handlers.onOpenExternalLink(uri)
  }

  private installRelativePathLinkProvider(term: XTermTerminal): void {
    try {
      this.disposables.push(
        registerTerminalRelativePathLinkProvider(
          term,
          () => this.revealPathHandler,
          () => this.openPathInEditorHandler,
          () => this.worktreePath,
        ),
      )
    } catch (err) {
      console.warn('[terminal] failed to register relative path links', err)
    }
  }

  private installLocalUrlLinkProvider(term: XTermTerminal): void {
    try {
      this.disposables.push(registerTerminalLocalUrlLinkProvider(term, () => this.handlers.onOpenExternalLink))
    } catch (err) {
      console.warn('[terminal] failed to register local url links', err)
    }
  }

  private installSearchAddon(term: XTermTerminal): void {
    try {
      const searchAddon = new SearchAddon({ highlightLimit: 1000 })
      term.loadAddon(searchAddon)
      this.disposables.push(searchAddon.onDidChangeResults((event) => this.handlers.onSearchResult(event)))
      this.searchAddon = searchAddon
    } catch (err) {
      console.warn('[terminal] failed to load search addon', err)
    }
  }

  private installSerializeAddon(term: XTermTerminal): void {
    try {
      const serializeAddon = new SerializeAddon()
      term.loadAddon(serializeAddon)
      this.serializeAddon = serializeAddon
    } catch (err) {
      console.warn('[terminal] failed to load serialize addon', err)
    }
  }

  private installImageAddon(term: XTermTerminal): void {
    try {
      const imageAddon = new ImageAddon()
      term.loadAddon(imageAddon)
    } catch (err) {
      console.warn('[terminal] failed to load image addon', err)
    }
  }

  private installProgressAddon(term: XTermTerminal): void {
    try {
      const progressAddon = new ProgressAddon()
      term.loadAddon(progressAddon)
      this.disposables.push(progressAddon.onChange(({ state, value }) => this.handlers.onProgress(state, value)))
    } catch (err) {
      console.warn('[terminal] failed to load progress addon', err)
    }
  }

  private applyTerminalTheme(term: XTermTerminal, theme: ITheme): void {
    term.options.theme = theme
    const background = typeof theme.background === 'string' && theme.background ? theme.background : 'black'
    this.frame.style.background = background
    this.frame.style.setProperty('--goblin-terminal-background', background)
  }

  private installResizeObserver(): void {
    this.disconnectResizeObserver()
    this.resizeObserver = new ResizeObserver(() => this.fitSoon())
    this.resizeObserver.observe(this.xtermHost)
  }

  private installFontObserver(term: XTermTerminal): void {
    this.disposeFontObserver?.()
    this.disposeFontObserver = null
    const fonts = document.fonts
    if (!fonts) return
    const refit = () => this.scheduleFontFit(term)
    fonts.ready.then(refit).catch(() => {})
    fonts.addEventListener?.('loadingdone', refit)
    this.disposeFontObserver = () => {
      fonts.removeEventListener?.('loadingdone', refit)
    }
  }

  private disconnectResizeObserver(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  private scheduleFontFit(term: XTermTerminal): void {
    if (!this.autoFitEnabled || this.term !== term) return
    this.cancelFontFit()
    this.fontFitTimer = window.setTimeout(() => {
      this.fontFitTimer = null
      this.fitForFontLoad(term)
      // The first fit can make xterm remeasure a newly loaded font. Fit again
      // on the next frame so the PTY receives dimensions from the new metrics.
      this.fontFitFrame = requestAnimationFrame(() => {
        this.fontFitFrame = null
        this.fitForFontLoad(term)
      })
    }, FONT_REMEASURE_DEBOUNCE_MS)
  }

  private cancelFontFit(): void {
    if (this.fontFitTimer !== null) {
      window.clearTimeout(this.fontFitTimer)
      this.fontFitTimer = null
    }
    if (this.fontFitFrame !== null) {
      cancelScheduledAnimationFrame(this.fontFitFrame)
      this.fontFitFrame = null
    }
  }

  private fitForFontLoad(term: XTermTerminal): void {
    if (!this.autoFitEnabled || this.term !== term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    this.fitAddon.fit()
    this.pinToBottomSoon()
  }

  private cancelFitFlush(): void {
    if (this.fitFlushTimer === null) return
    window.clearTimeout(this.fitFlushTimer)
    this.fitFlushTimer = null
  }

  private pinToBottomSoon(): void {
    if (!this.term) return
    if (!isTerminalAtBottom(this.term)) return
    // Product policy: keep user-visible output in sync with live output unless
    // the user is actively scrolling history.
    this.cancelPinToBottom()
    this.pinToBottomFrame = requestAnimationFrame(() => {
      this.pinToBottomFrame = null
      scrollTerminalToBottom(this.term)
    })
  }

  private cancelPinToBottom(): void {
    if (this.pinToBottomFrame === null) return
    cancelScheduledAnimationFrame(this.pinToBottomFrame)
    this.pinToBottomFrame = null
  }
}

function isNonMacTerminalPasteShortcut(event: KeyboardEvent, isMac: boolean): boolean {
  return (
    !isMac &&
    event.type === 'keydown' &&
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    (event.code === 'KeyV' || event.key.toLowerCase() === 'v')
  )
}

function terminalSearchOptions(mode: TerminalThemeMode, incremental?: boolean): ISearchOptions {
  return {
    caseSensitive: false,
    decorations: terminalSearchDecorationsForCurrentDocument(mode),
    ...(incremental === undefined ? {} : { incremental }),
  }
}

function blurElementIfFocused(element: HTMLElement): void {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) activeElement.blur()
}

function hasMeasurableBox(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function resetMobileScrollScrubber(scrubber: HTMLElement): void {
  if (scrubber.getAttribute('aria-valuemin') !== '0') scrubber.setAttribute('aria-valuemin', '0')
  if (scrubber.getAttribute('aria-valuemax') !== '100') scrubber.setAttribute('aria-valuemax', '100')
  if (scrubber.getAttribute('aria-valuenow') !== '0') scrubber.setAttribute('aria-valuenow', '0')
  if (scrubber.getAttribute('aria-valuetext') !== '0%') scrubber.setAttribute('aria-valuetext', '0%')
  if (scrubber.dataset.active !== 'false') scrubber.dataset.active = 'false'
  if (scrubber.dataset.position !== '0%') scrubber.dataset.position = '0%'
  if (scrubber.style.getPropertyValue('--goblin-terminal-scrub-position') !== '0%') {
    scrubber.style.setProperty('--goblin-terminal-scrub-position', '0%')
  }
  if (!scrubber.hidden) scrubber.hidden = true
}

function scrollTerminalToBottom(term: XTermTerminal | null): void {
  if (!term) return
  term.scrollToBottom()
}

function isTerminalAtBottom(term: XTermTerminal): boolean {
  const active = term.buffer?.active as { viewportY?: number; baseY?: number } | undefined
  if (!active) return true
  const viewportY = active.viewportY
  if (typeof viewportY !== 'number') return true
  const baseY = active.baseY
  return typeof baseY === 'number' ? viewportY >= baseY : viewportY <= 0
}

interface XtermCoreUserInputService {
  onUserInput: (listener: () => void) => { dispose: () => void }
}

function xtermCoreUserInputService(term: XTermTerminal): XtermCoreUserInputService | null {
  const coreService = (term as unknown as { _core?: { coreService?: { onUserInput?: unknown } } })._core?.coreService
  const onUserInput = coreService?.onUserInput
  if (!coreService || typeof onUserInput !== 'function') return null
  return {
    onUserInput: (listener) => onUserInput.call(coreService, listener) as { dispose: () => void },
  }
}

function textForTerminalPaste(text: string, bracketedPasteMode: boolean): string {
  const normalized = text.replace(/\r?\n/g, '\r')
  return bracketedPasteMode ? `\x1b[200~${normalized}\x1b[201~` : normalized
}

function cancelScheduledAnimationFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  else clearTimeout(frame)
}
