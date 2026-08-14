import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm'

const SYNCHRONIZED_OUTPUT_BEGIN = '\x1b[?2026h'
const OUTPUT_CURSOR_SETTLE_MS = 250
const CURSOR_REANCHOR_SAMPLE_MS = 120
const OUTPUT_CURSOR_STABILIZED_CLASS = 'goblin-terminal-output-cursor-stabilized'
const OUTPUT_CURSOR_PROXY_CLASS = 'goblin-terminal-output-cursor-proxy'

export interface TerminalOutputCursorStabilizer extends IDisposable {
  handleOutput(data: string): void
}

interface TerminalCursorGeometry {
  height: string
  left: string
  top: string
}

interface CursorCandidate {
  count: number
  geometry: TerminalCursorGeometry
  lastSeen: number
}

/** Keep xterm's cursor on the inline-TUI composer while transient status frames render. */
export function stabilizeTerminalOutputCursor(
  term: XTermTerminal,
  navigatorPlatform = typeof navigator === 'undefined' ? '' : navigator.platform,
): TerminalOutputCursorStabilizer {
  if (!/^Win/i.test(navigatorPlatform)) return { dispose: () => {}, handleOutput: () => {} }
  const textarea = term.textarea
  const terminalElement = term.element
  const screen = terminalElement?.querySelector<HTMLElement>('.xterm-screen') ?? null
  if (!textarea || !terminalElement || !screen) return { dispose: () => {}, handleOutput: () => {} }

  const cursorProxy = screen.ownerDocument.createElement('div')
  cursorProxy.className = OUTPUT_CURSOR_PROXY_CLASS
  cursorProxy.setAttribute('aria-hidden', 'true')
  screen.append(cursorProxy)

  let active = false
  let disposed = false
  let reanchorPending = false
  let reanchorOrigin = ''
  let reanchorTimer: number | null = null
  let renderSequence = 0
  let sequenceTail = ''
  let settleTimer: number | null = null
  const candidates = new Map<string, CursorCandidate>()

  const cancelSettle = (): void => {
    if (settleTimer === null) return
    screen.ownerDocument.defaultView?.clearTimeout(settleTimer)
    settleTimer = null
  }
  const cancelReanchor = (): void => {
    if (reanchorTimer !== null) {
      screen.ownerDocument.defaultView?.clearTimeout(reanchorTimer)
      reanchorTimer = null
    }
    reanchorPending = false
    reanchorOrigin = ''
    candidates.clear()
  }
  const release = (): void => {
    cancelSettle()
    cancelReanchor()
    active = false
    terminalElement.classList.remove(OUTPUT_CURSOR_STABILIZED_CLASS)
    cursorProxy.classList.remove('is-active')
    cursorProxy.style.removeProperty('left')
    cursorProxy.style.removeProperty('top')
    cursorProxy.style.removeProperty('height')
  }
  const eligible = (): boolean => {
    const buffer = term.buffer.active
    return (
      textarea.ownerDocument.activeElement === textarea && buffer.type === 'normal' && buffer.viewportY >= buffer.baseY
    )
  }
  const cursorGeometry = (): TerminalCursorGeometry | null => {
    const nativeCursor = terminalElement.querySelector<HTMLElement>('.xterm-cursor.xterm-cursor-bar')
    if (!nativeCursor) return null
    return renderedCursorGeometry(nativeCursor, screen) ?? terminalCursorGeometry(term, screen)
  }
  const applyGeometry = (geometry: TerminalCursorGeometry): void => {
    active = true
    cursorProxy.style.left = geometry.left
    cursorProxy.style.top = geometry.top
    cursorProxy.style.height = geometry.height
    cursorProxy.classList.add('is-active')
    terminalElement.classList.add(OUTPUT_CURSOR_STABILIZED_CLASS)
  }
  const activate = (): boolean => {
    const geometry = cursorGeometry()
    if (!geometry) return false
    applyGeometry(geometry)
    return true
  }
  const scheduleRelease = (): void => {
    cancelSettle()
    const window = screen.ownerDocument.defaultView
    if (!window) {
      release()
      return
    }
    settleTimer = window.setTimeout(() => {
      settleTimer = null
      release()
    }, OUTPUT_CURSOR_SETTLE_MS)
  }
  const handleOutput = (data: string): void => {
    if (disposed || !data) return
    const sequenceWindow = sequenceTail + data
    sequenceTail = sequenceWindow.slice(-(SYNCHRONIZED_OUTPUT_BEGIN.length - 1))

    if (!eligible()) {
      if (active) release()
      return
    }
    if (!active) {
      if (!sequenceWindow.includes(SYNCHRONIZED_OUTPUT_BEGIN) || !activate()) return
      beginReanchorSampling()
    }
    scheduleRelease()
  }

  const finalizeReanchor = (): void => {
    reanchorTimer = null
    if (!active || !reanchorPending) return
    reanchorPending = false
    if (!eligible()) {
      release()
      return
    }

    let selected: CursorCandidate | null = null
    for (const candidate of candidates.values()) {
      if (
        !selected ||
        candidate.count > selected.count ||
        (candidate.count === selected.count && candidate.lastSeen > selected.lastSeen)
      ) {
        selected = candidate
      }
    }
    candidates.clear()
    reanchorOrigin = ''
    if (selected) applyGeometry(selected.geometry)
  }
  const scheduleReanchorFinalize = (): void => {
    if (reanchorTimer !== null) {
      screen.ownerDocument.defaultView?.clearTimeout(reanchorTimer)
      reanchorTimer = null
    }
    const window = screen.ownerDocument.defaultView
    if (!window) {
      reanchorPending = false
      return
    }
    reanchorTimer = window.setTimeout(finalizeReanchor, CURSOR_REANCHOR_SAMPLE_MS)
  }
  const beginReanchorSampling = (): void => {
    if (!active) return
    reanchorPending = true
    reanchorOrigin = geometryKey({
      height: cursorProxy.style.height,
      left: cursorProxy.style.left,
      top: cursorProxy.style.top,
    })
    candidates.clear()
    scheduleReanchorFinalize()
  }

  const inputDisposable = term.onData(() => {
    if (!active) return
    beginReanchorSampling()
    scheduleRelease()
  })
  const renderDisposable = term.onRender(() => {
    if (!active || !reanchorPending) return
    if (!eligible()) {
      release()
      return
    }
    const geometry = cursorGeometry()
    if (!geometry) return
    const key = geometryKey(geometry)
    if (key === reanchorOrigin) return
    const candidate = candidates.get(key)
    renderSequence += 1
    candidates.set(key, {
      count: (candidate?.count ?? 0) + 1,
      geometry,
      lastSeen: renderSequence,
    })
  })

  textarea.addEventListener('blur', release)
  return {
    handleOutput,
    dispose: () => {
      if (disposed) return
      disposed = true
      release()
      inputDisposable.dispose()
      renderDisposable.dispose()
      textarea.removeEventListener('blur', release)
      cursorProxy.remove()
    },
  }
}

function geometryKey(geometry: TerminalCursorGeometry): string {
  return `${geometry.left}\u0000${geometry.top}\u0000${geometry.height}`
}

function renderedCursorGeometry(cursor: HTMLElement, screen: HTMLElement): TerminalCursorGeometry | null {
  const cursorRect = cursor.getBoundingClientRect()
  const screenRect = screen.getBoundingClientRect()
  if (!(cursorRect.height > 0) || !(screenRect.width > 0) || !(screenRect.height > 0)) return null
  return {
    height: `${cursorRect.height}px`,
    left: `${cursorRect.left - screenRect.left}px`,
    top: `${cursorRect.top - screenRect.top}px`,
  }
}

function terminalCursorGeometry(term: XTermTerminal, screen: HTMLElement): TerminalCursorGeometry | null {
  const screenWidth = Number.parseFloat(screen.style.width)
  const screenHeight = Number.parseFloat(screen.style.height)
  if (!(screenWidth > 0) || !(screenHeight > 0) || term.cols <= 0 || term.rows <= 0) return null
  const buffer = term.buffer.active
  const cursorX = Math.max(0, Math.min(buffer.cursorX, term.cols - 1))
  const cursorY = Math.max(0, Math.min(buffer.cursorY, term.rows - 1))
  const cellHeight = screenHeight / term.rows
  return {
    height: `${cellHeight}px`,
    left: `${cursorX * (screenWidth / term.cols)}px`,
    top: `${cursorY * cellHeight}px`,
  }
}
