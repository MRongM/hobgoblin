import type { FitAddon as XTermFitAddon } from '@xterm/addon-fit'
import { FitAddon } from '@xterm/addon-fit'
import type { ImageAddon as XTermImageAddon } from '@xterm/addon-image'
import { ImageAddon } from '@xterm/addon-image'
import type { ProgressAddon as XTermProgressAddon } from '@xterm/addon-progress'
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
import { TERMINAL_SCROLLBACK_LINES, TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY } from '#/shared/terminal.ts'
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
import { DEFAULT_TERMINAL_FONT_SIZE } from '#/shared/settings-defaults.ts'
import {
  TERMINAL_FONT_FAMILY,
  measureTerminalGeometry,
  type TerminalGeometry,
} from '#/web/components/terminal/terminal-geometry.ts'
import type { TerminalInput } from '#/web/components/terminal/terminal-input.ts'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
const DEFAULT_PARKING_WIDTH = 800
const DEFAULT_PARKING_HEIGHT = 400
const RESIZE_DEBOUNCE_MS = 80
const FONT_REMEASURE_DEBOUNCE_MS = 80
const OUTPUT_RENDER_SETTLE_MS = 80

interface TerminalViewportSnapshot {
  viewportY: number | null
  baseY: number | null
}

interface TerminalWithPrivateRenderService {
  _core?: {
    _renderService?: {
      clear?: () => void
    }
  }
}

export class TerminalSessionView {
  private readonly frame: HTMLDivElement
  private readonly xtermHost: HTMLDivElement
  private readonly parkingElement: HTMLDivElement
  private term: XTermTerminal | null = null
  private fitAddon: XTermFitAddon | null = null
  private searchAddon: XTermSearchAddon | null = null
  private serializeAddon: XTermSerializeAddon | null = null
  private imageAddon: XTermImageAddon | null = null
  private progressAddon: XTermProgressAddon | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposables: Array<{ dispose: () => void }> = []
  private disposeThemeObserver: (() => void) | null = null
  private disposeFontObserver: (() => void) | null = null
  private fitFlushTimer: number | null = null
  private fontFitTimer: number | null = null
  private pinToBottomFrame: number | null = null
  private outputSettleTimer: number | null = null
  private viewportRefreshFrame: number | null = null
  private outputWriteDepth = 0
  private scrollbackRenderDirty = false
  private deferredOutput: string[] = []
  private deferredOutputCallbacks: Array<() => void> = []
  private viewportElement: HTMLElement | null = null
  private textInputElement: HTMLTextAreaElement | null = null
  private textInputComposing = false
  private host: HTMLElement | null = null
  private revealPathHandler: ((relativePath: string) => void) | null = null
  private openPathInEditorHandler: ((target: FilePathTarget) => void) | null = null
  private fontSize: number
  private terminalThemeMode: () => TerminalThemeMode
  private readonly safariShiftKeyResolver = new SafariShiftKeyResolver()
  private readonly handleViewportScroll = () => this.scheduleViewportRefresh()
  private readonly handleTerminalPointerDown = (event: Event) => {
    if (!(event.target instanceof Node)) return
    if (!this.xtermHost.contains(event.target)) return
    if ('button' in event && typeof event.button === 'number' && event.button !== 0) return
    this.term?.focus()
  }
  private readonly handleTextInputCompositionStart = () => {
    this.textInputComposing = true
  }
  private readonly handleTextInputCompositionEnd = () => {
    this.textInputComposing = false
    window.setTimeout(() => {
      if (this.textInputComposing) return
      this.flushDeferredOutput()
      if (this.scrollbackRenderDirty) this.scheduleOutputSettleRepaint()
    }, 0)
  }

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
    options: { fontSize?: number; terminalThemeMode?: () => TerminalThemeMode } = {},
  ) {
    this.fontSize = options.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE
    this.terminalThemeMode = options.terminalThemeMode ?? (() => 'theme')
    this.frame = document.createElement('div')
    this.frame.className = 'goblin-managed-terminal-frame'
    this.xtermHost = document.createElement('div')
    this.xtermHost.className = 'goblin-managed-terminal-host'
    this.frame.appendChild(this.xtermHost)
    this.frame.addEventListener('pointerdown', this.handleTerminalPointerDown)
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

  setFontSize(fontSize: number): void {
    if (this.fontSize === fontSize) return
    this.fontSize = fontSize
    const term = this.term
    if (!term) return
    term.options.fontSize = fontSize
    this.fitForFontLoad(term)
  }

  setTerminalThemeMode(terminalThemeMode: () => TerminalThemeMode): void {
    this.terminalThemeMode = terminalThemeMode
    const term = this.term
    if (!term) return
    this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()), { refresh: true })
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
    this.frame.removeEventListener('pointerdown', this.handleTerminalPointerDown)
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
    return measureTerminalGeometry({ host: this.xtermHost, fontSize: this.fontSize })
  }

  openTerminal(geometry: TerminalGeometry, onMacOptionInput: (input: TerminalInput) => void): XTermTerminal {
    const theme = terminalThemeForCurrentDocument(this.terminalThemeMode())
    const term = new Terminal({
      allowProposedApi: true,
      cols: geometry.cols,
      rows: geometry.rows,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: this.fontSize,
      lineHeight: 1,
      minimumContrastRatio: 4.5,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      scrollOnEraseInDisplay: TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY,
      macOptionIsMeta: true,
      rescaleOverlappingGlyphs: true,
      scrollOnUserInput: true,
      theme,
    })
    const fitAddon = new FitAddon()
    this.term = term
    this.fitAddon = fitAddon
    term.loadAddon(fitAddon)
    this.installOptionalAddons(term)
    this.installKeyboardHandlers(term, onMacOptionInput)
    this.applyTerminalTheme(term, theme)
    this.disposeThemeObserver = observeTerminalTheme(this.terminalThemeMode, (nextTheme) => {
      this.applyTerminalTheme(term, nextTheme, { refresh: true })
    })
    this.disposables.push(term.onData((data) => this.handleTerminalData(data)))
    this.disposables.push(
      term.onBinary((data) => this.handlers.onInput({ origin: 'user-intent', source: 'xterm', data })),
    )
    this.disposables.push(term.onBell(() => this.handlers.onBell()))
    this.disposables.push(term.onResize((size) => this.handlers.onResize(size)))
    this.disposables.push(term.onScroll(() => this.scheduleViewportRefresh()))
    term.open(this.xtermHost)
    this.installTextInputCompositionGuard(term)
    this.installViewportScrollListener(term)
    this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()), { refresh: true })
    this.installResizeObserver()
    this.installFontObserver(term)
    return term
  }

  currentTerminal(): XTermTerminal | null {
    return this.term
  }

  writeOutput(data: string, callback?: () => void): void {
    const term = this.term
    if (!term) {
      callback?.()
      return
    }
    if (this.textInputComposing) {
      this.deferOutput(data, callback)
      return
    }
    const before = readTerminalViewportSnapshot(term)
    this.outputWriteDepth += 1
    term.write(data, () => {
      this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
      this.handleOutputWriteParsed(term, before)
      callback?.()
    })
  }

  focus(): void {
    this.term?.focus()
  }

  resizeTo(cols: number, rows: number): void {
    if (!this.term) return
    if (this.term.cols === cols && this.term.rows === rows) return
    this.term.resize(cols, rows)
    this.pinToBottomSoon()
  }

  serialize(): string {
    return this.serializeAddon?.serialize({ excludeAltBuffer: true }) ?? ''
  }

  clearSearch(): void {
    this.searchAddon?.clearDecorations()
  }

  scrollToBottom(): void {
    scrollTerminalToBottom(this.term)
  }

  scrollLines(amount: number): void {
    this.term?.scrollLines(amount)
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
    if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    const dimensions = this.fitAddon.proposeDimensions()
    if (!dimensions || (dimensions.cols === this.term.cols && dimensions.rows === this.term.rows)) return
    this.cancelFitFlush()
    this.fitFlushTimer = window.setTimeout(() => {
      this.fitFlushTimer = null
      this.fitNow()
    }, RESIZE_DEBOUNCE_MS)
  }

  fitNow(): void {
    if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    this.fitAddon.fit()
    this.term.refresh(0, Math.max(0, this.term.rows - 1))
    this.pinToBottomSoon()
  }

  destroyTerminal(): void {
    this.disconnectResizeObserver()
    this.disconnectViewportScrollListener()
    this.disconnectTextInputCompositionGuard()
    this.cancelFitFlush()
    for (const disposable of this.disposables.splice(0)) disposable.dispose()
    this.disposeThemeObserver?.()
    this.disposeThemeObserver = null
    this.disposeFontObserver?.()
    this.disposeFontObserver = null
    this.cancelFontFit()
    this.cancelPinToBottom()
    this.cancelOutputSettleRepaint()
    this.outputWriteDepth = 0
    this.scrollbackRenderDirty = false
    this.clearDeferredOutput(true)
    this.textInputComposing = false
    this.safariShiftKeyResolver.reset()
    this.fitAddon = null
    this.searchAddon = null
    this.serializeAddon = null
    this.imageAddon = null
    this.progressAddon = null
    this.term?.dispose()
    this.term = null
    this.xtermHost.replaceChildren()
    if (!this.frame.contains(this.xtermHost)) this.frame.appendChild(this.xtermHost)
  }

  private installKeyboardHandlers(term: XTermTerminal, onInput: (input: TerminalInput) => void): void {
    const isMac = isMacNavigatorPlatform(globalThis.navigator?.platform ?? '')
    const safariShiftKeyResolver = this.safariShiftKeyResolver
    term.attachCustomKeyEventHandler((event) => {
      const optionInput = terminalInputForMacOptionArrow(event, {
        isMac,
        applicationCursorKeysMode: term.modes.applicationCursorKeysMode,
      })
      if (optionInput) {
        event.preventDefault()
        event.stopPropagation()
        onInput({ origin: 'user-intent', source: 'keyboard', data: optionInput })
        return false
      }
      const safariShiftInput = safariShiftKeyResolver.inputForEvent(event)
      if (safariShiftInput) {
        event.preventDefault()
        event.stopPropagation()
        onInput({ origin: 'user-intent', source: 'keyboard', data: safariShiftInput })
        return false
      }
      return true
    })
  }

  private handleTerminalData(data: string): void {
    if (this.outputWriteDepth <= 0) {
      this.handlers.onInput({ origin: 'user-intent', source: 'xterm', data })
      return
    }
    const userData = stripTerminalProtocolReplies(data)
    const input =
      userData.length === 0
        ? ({ origin: 'terminal-emulator', source: 'data', data } as const)
        : ({ origin: 'user-intent', source: 'xterm', data: userData } as const)
    this.handlers.onInput(input)
  }

  private handleOutputWriteParsed(term: XTermTerminal, before: TerminalViewportSnapshot): void {
    if (this.term !== term) return
    const after = readTerminalViewportSnapshot(term)
    if (before.baseY !== null && after.baseY !== null && after.baseY > before.baseY) {
      this.scrollbackRenderDirty = true
    }
    if (this.scrollbackRenderDirty) this.scheduleOutputSettleRepaint()
  }

  private installOptionalAddons(term: XTermTerminal): void {
    this.installUnicode11Addon(term)
    this.installWebLinksAddon(term)
    this.installRelativePathLinkProvider(term)
    this.installSearchAddon(term)
    this.installSerializeAddon(term)
    this.installImageAddon(term)
    this.installProgressAddon(term)
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
      term.loadAddon(new WebLinksAddon((event, uri) => {
        if (!event.metaKey && !event.ctrlKey) return
        this.handlers.onOpenExternalLink(uri)
      }))
    } catch (err) {
      console.warn('[terminal] failed to load web links addon', err)
    }
  }

  private installRelativePathLinkProvider(term: XTermTerminal): void {
    try {
      this.disposables.push(
        registerTerminalRelativePathLinkProvider(
          term,
          () => this.revealPathHandler,
          () => this.openPathInEditorHandler,
        ),
      )
    } catch (err) {
      console.warn('[terminal] failed to register relative path links', err)
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
      this.imageAddon = imageAddon
    } catch (err) {
      console.warn('[terminal] failed to load image addon', err)
    }
  }

  private installProgressAddon(term: XTermTerminal): void {
    try {
      const progressAddon = new ProgressAddon()
      term.loadAddon(progressAddon)
      this.disposables.push(progressAddon.onChange(({ state, value }) => this.handlers.onProgress(state, value)))
      this.progressAddon = progressAddon
    } catch (err) {
      console.warn('[terminal] failed to load progress addon', err)
    }
  }

  private applyTerminalTheme(
    term: XTermTerminal,
    theme: ITheme,
    options: { refresh?: boolean } = {},
  ): void {
    term.options.theme = theme
    const background = typeof theme.background === 'string' && theme.background ? theme.background : 'black'
    this.frame.style.background = background
    this.frame.style.setProperty('--goblin-terminal-background', background)
    if (options.refresh !== true || !term.element) return
    term.refresh(0, Math.max(0, term.rows - 1))
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

  private installViewportScrollListener(term: XTermTerminal): void {
    this.disconnectViewportScrollListener()
    const viewportElement = term.element?.querySelector<HTMLElement>('.xterm-viewport') ?? null
    if (!viewportElement) return
    this.viewportElement = viewportElement
    viewportElement.addEventListener('scroll', this.handleViewportScroll, { passive: true })
  }

  private disconnectViewportScrollListener(): void {
    this.viewportElement?.removeEventListener('scroll', this.handleViewportScroll)
    this.viewportElement = null
    this.cancelViewportRefresh()
  }

  private installTextInputCompositionGuard(term: XTermTerminal): void {
    this.disconnectTextInputCompositionGuard()
    const input = term.element?.querySelector<HTMLTextAreaElement>('textarea') ?? null
    if (!input) return
    this.textInputElement = input
    input.addEventListener('compositionstart', this.handleTextInputCompositionStart)
    input.addEventListener('compositionend', this.handleTextInputCompositionEnd)
    input.addEventListener('compositioncancel', this.handleTextInputCompositionEnd)
  }

  private disconnectTextInputCompositionGuard(): void {
    const input = this.textInputElement
    if (!input) return
    input.removeEventListener('compositionstart', this.handleTextInputCompositionStart)
    input.removeEventListener('compositionend', this.handleTextInputCompositionEnd)
    input.removeEventListener('compositioncancel', this.handleTextInputCompositionEnd)
    this.textInputElement = null
  }

  private deferOutput(data: string, callback?: () => void): void {
    this.deferredOutput.push(data)
    if (callback) this.deferredOutputCallbacks.push(callback)
  }

  private flushDeferredOutput(): void {
    if (this.textInputComposing || this.deferredOutput.length === 0) return
    const data = this.deferredOutput.join('')
    const callbacks = this.deferredOutputCallbacks.splice(0)
    this.deferredOutput = []
    this.writeOutput(
      data,
      callbacks.length > 0
        ? () => {
            for (const callback of callbacks) callback()
          }
        : undefined,
    )
  }

  private clearDeferredOutput(runCallbacks = false): void {
    this.deferredOutput = []
    const callbacks = this.deferredOutputCallbacks.splice(0)
    if (runCallbacks) {
      for (const callback of callbacks) callback()
    }
  }

  private scheduleFontFit(term: XTermTerminal): void {
    if (this.term !== term) return
    this.cancelFontFit()
    this.fontFitTimer = window.setTimeout(() => {
      this.fontFitTimer = null
      this.fitForFontLoad(term)
    }, FONT_REMEASURE_DEBOUNCE_MS)
  }

  private cancelFontFit(): void {
    if (this.fontFitTimer === null) return
    window.clearTimeout(this.fontFitTimer)
    this.fontFitTimer = null
  }

  private fitForFontLoad(term: XTermTerminal): void {
    if (this.term !== term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
    this.fitAddon.fit()
    term.refresh(0, Math.max(0, term.rows - 1))
    this.pinToBottomSoon()
  }

  private cancelFitFlush(): void {
    if (this.fitFlushTimer === null) return
    window.clearTimeout(this.fitFlushTimer)
    this.fitFlushTimer = null
  }

  private scheduleOutputSettleRepaint(): void {
    this.cancelOutputSettleRepaint()
    this.outputSettleTimer = window.setTimeout(() => {
      this.outputSettleTimer = null
      if (this.textInputComposing) return
      this.repaintVisibleRowsPreservingViewport({ clearRendererCache: true })
      this.scrollbackRenderDirty = false
    }, OUTPUT_RENDER_SETTLE_MS)
  }

  private cancelOutputSettleRepaint(): void {
    if (this.outputSettleTimer === null) return
    window.clearTimeout(this.outputSettleTimer)
    this.outputSettleTimer = null
  }

  private scheduleViewportRefresh(): void {
    if (!this.term || this.viewportRefreshFrame !== null) return
    this.viewportRefreshFrame = requestAnimationFrame(() => {
      this.viewportRefreshFrame = null
      const term = this.term
      if (!term) return
      const viewport = readTerminalViewportSnapshot(term)
      const isReadingHistory =
        viewport.viewportY !== null && viewport.baseY !== null && viewport.viewportY < viewport.baseY
      this.repaintVisibleRowsPreservingViewport({
        clearRendererCache: this.scrollbackRenderDirty || isReadingHistory,
        viewportY: viewport.viewportY,
      })
    })
  }

  private cancelViewportRefresh(): void {
    if (this.viewportRefreshFrame === null) return
    cancelScheduledAnimationFrame(this.viewportRefreshFrame)
    this.viewportRefreshFrame = null
  }

  private repaintVisibleRowsPreservingViewport(options: { clearRendererCache?: boolean; viewportY?: number | null } = {}): void {
    const term = this.term
    if (!term) return
    const before = readTerminalViewportSnapshot(term)
    if (!this.safeRefreshVisibleRows(term, options)) return
    restoreTerminalViewport(term, options.viewportY ?? before.viewportY)
  }

  private safeRefreshVisibleRows(term: XTermTerminal, options: { clearRendererCache?: boolean }): boolean {
    try {
      if (options.clearRendererCache) clearTerminalRendererCache(term)
      refreshVisibleRows(term)
      return true
    } catch (err) {
      console.warn('[terminal] failed to repaint terminal viewport', err)
      this.handlers.onRenderRecoveryRequest()
      return false
    }
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

function scrollTerminalToBottom(term: XTermTerminal | null): void {
  if (!term) return
  term.scrollToBottom()
}

function readTerminalViewportSnapshot(term: XTermTerminal): TerminalViewportSnapshot {
  const active = term.buffer?.active as { viewportY?: number; baseY?: number } | undefined
  return {
    viewportY: typeof active?.viewportY === 'number' ? active.viewportY : null,
    baseY: typeof active?.baseY === 'number' ? active.baseY : null,
  }
}

function refreshVisibleRows(term: XTermTerminal): void {
  term.refresh(0, Math.max(0, term.rows - 1))
}

function clearTerminalRendererCache(term: XTermTerminal): void {
  term.clearTextureAtlas()
  const renderService = (term as unknown as TerminalWithPrivateRenderService)._core?._renderService
  renderService?.clear?.()
}

function restoreTerminalViewport(term: XTermTerminal, viewportY: number | null): void {
  if (viewportY === null) return
  const active = term.buffer?.active as { viewportY?: number } | undefined
  if (active?.viewportY === viewportY) return
  term.scrollToLine(viewportY)
}

function isTerminalAtBottom(term: XTermTerminal): boolean {
  const active = term.buffer?.active as { viewportY?: number; baseY?: number } | undefined
  if (!active) return true
  const viewportY = active.viewportY
  if (typeof viewportY !== 'number') return true
  const baseY = active.baseY
  return typeof baseY === 'number' ? viewportY >= baseY : viewportY <= 0
}

const TERMINAL_PROTOCOL_REPLY_PATTERN =
  /(?:\x1b\[\??\d+n)|(?:\x1b\[\??\d+;\d+R)|(?:\x1b\[(?:[?>])?[0-9;]*c)|(?:\x1b\](?:4;\d+|10|11|12);[^\x07\x1b]*(?:\x07|\x1b\\))/g

function stripTerminalProtocolReplies(data: string): string {
  return data.replace(TERMINAL_PROTOCOL_REPLY_PATTERN, '')
}

function cancelScheduledAnimationFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  else clearTimeout(frame)
}
