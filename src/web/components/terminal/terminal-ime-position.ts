import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm'

interface TerminalImeAnchor {
  left: string
  top: string
}

type TerminalImeMode = 'standard' | 'opaque'

const IME_ANCHOR_CLASS = 'goblin-terminal-ime-anchor'
const IME_ANCHOR_LEFT = '--goblin-terminal-ime-anchor-left'
const IME_ANCHOR_TOP = '--goblin-terminal-ime-anchor-top'
const IME_CURSOR_ANCHORED_CLASS = 'goblin-terminal-ime-cursor-anchored'
const IME_CURSOR_PROXY_CLASS = 'goblin-terminal-ime-cursor-proxy'

function terminalCursorAnchor(term: XTermTerminal, screen: HTMLElement): TerminalImeAnchor | null {
  const screenWidth = Number.parseFloat(screen.style.width)
  const screenHeight = Number.parseFloat(screen.style.height)
  if (!(screenWidth > 0) || !(screenHeight > 0) || term.cols <= 0 || term.rows <= 0) return null
  const buffer = term.buffer.active
  const cursorX = Math.max(0, Math.min(buffer.cursorX, term.cols - 1))
  const cursorY = Math.max(0, Math.min(buffer.cursorY, term.rows - 1))
  return {
    left: `${cursorX * (screenWidth / term.cols)}px`,
    top: `${cursorY * (screenHeight / term.rows)}px`,
  }
}

function inlinePixelPosition(value: string): string | null {
  const normalized = value.trim()
  return /^\d+(?:\.\d+)?px$/.test(normalized) ? normalized : null
}

function textareaAnchor(textarea: HTMLTextAreaElement): TerminalImeAnchor | null {
  const left = inlinePixelPosition(textarea.style.left)
  const top = inlinePixelPosition(textarea.style.top)
  return left && top ? { left, top } : null
}

function terminalCellHeight(term: XTermTerminal, screen: HTMLElement, textarea: HTMLTextAreaElement): string | null {
  const textareaHeight = inlinePixelPosition(textarea.style.height)
  if (textareaHeight) return textareaHeight
  const screenHeight = Number.parseFloat(screen.style.height)
  return screenHeight > 0 && term.rows > 0 ? `${screenHeight / term.rows}px` : null
}

function keyIdentity(event: KeyboardEvent): string {
  return event.code || event.key
}

function isOpaqueImeStart(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

/** Keep the native Windows IME candidate at the logical terminal input position. */
export function stabilizeTerminalImePosition(
  term: XTermTerminal,
  navigatorPlatform = typeof navigator === 'undefined' ? '' : navigator.platform,
): IDisposable {
  if (!/^Win/i.test(navigatorPlatform)) return { dispose: () => {} }
  const textarea = term.textarea
  const terminalElement = term.element
  const screen = terminalElement?.querySelector<HTMLElement>('.xterm-screen') ?? null
  const compositionView = terminalElement?.querySelector<HTMLElement>('.composition-view') ?? null
  if (!textarea || !terminalElement || !screen || !compositionView) return { dispose: () => {} }
  const cursorProxy = screen.ownerDocument.createElement('div')
  cursorProxy.className = IME_CURSOR_PROXY_CLASS
  cursorProxy.setAttribute('aria-hidden', 'true')
  screen.append(cursorProxy)

  let anchor: TerminalImeAnchor | null = null
  let mode: TerminalImeMode | null = null
  let suppressNextOpaqueKeyUp = false
  const pressedKeys = new Set<string>()
  const anchoredElements = [textarea, compositionView]

  const applyAnchor = (nextAnchor: TerminalImeAnchor): void => {
    anchor = nextAnchor
    for (const element of anchoredElements) {
      element.style.setProperty(IME_ANCHOR_LEFT, nextAnchor.left)
      element.style.setProperty(IME_ANCHOR_TOP, nextAnchor.top)
      element.classList.add(IME_ANCHOR_CLASS)
    }
    if (mode === 'opaque') {
      terminalElement.classList.add(IME_CURSOR_ANCHORED_CLASS)
      cursorProxy.style.left = nextAnchor.left
      cursorProxy.style.top = nextAnchor.top
      const cursorHeight = terminalCellHeight(term, screen, textarea)
      if (cursorHeight) cursorProxy.style.height = cursorHeight
      cursorProxy.classList.add('is-active')
    }
  }
  const release = (): void => {
    anchor = null
    mode = null
    suppressNextOpaqueKeyUp = false
    pressedKeys.clear()
    for (const element of anchoredElements) {
      element.classList.remove(IME_ANCHOR_CLASS)
      element.style.removeProperty(IME_ANCHOR_LEFT)
      element.style.removeProperty(IME_ANCHOR_TOP)
    }
    terminalElement.classList.remove(IME_CURSOR_ANCHORED_CLASS)
    cursorProxy.classList.remove('is-active')
    cursorProxy.style.removeProperty('left')
    cursorProxy.style.removeProperty('top')
    cursorProxy.style.removeProperty('height')
  }
  const handleCompositionStart = (): void => {
    release()
    mode = 'standard'
    const nextAnchor = terminalCursorAnchor(term, screen)
    if (nextAnchor) applyAnchor(nextAnchor)
  }
  const handleCompositionUpdate = (): void => {
    mode ??= 'standard'
    if (anchor) return
    const nextAnchor = textareaAnchor(textarea) ?? terminalCursorAnchor(term, screen)
    if (nextAnchor) applyAnchor(nextAnchor)
  }
  const handleCompositionEnd = (): void => {
    const suppressCommitKeyUp = mode === 'standard'
    release()
    suppressNextOpaqueKeyUp = suppressCommitKeyUp
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    const identity = keyIdentity(event)
    suppressNextOpaqueKeyUp = false
    if (mode === 'standard') {
      // xterm's earlier capture listener removes this class when the key
      // finalizes composition. A custom key handler can leave it active.
      if (!compositionView.classList.contains('active')) release()
    } else if (mode === 'opaque' && event.key !== 'Process' && event.keyCode !== 229) {
      // Microsoft Pinyin emits Process/229 keydowns during opaque preedit.
      // Any other keydown reaching Chromium means TSF is no longer consuming input.
      release()
    }
    if (identity) pressedKeys.add(identity)
  }
  const handleKeyUp = (event: KeyboardEvent): void => {
    const identity = keyIdentity(event)
    if (identity && pressedKeys.delete(identity)) return
    if (suppressNextOpaqueKeyUp) {
      suppressNextOpaqueKeyUp = false
      return
    }
    if (event.key === 'Escape') {
      release()
      return
    }
    if (mode !== null || !isOpaqueImeStart(event)) return
    const nextAnchor = textareaAnchor(textarea) ?? terminalCursorAnchor(term, screen)
    if (!nextAnchor) return
    mode = 'opaque'
    applyAnchor(nextAnchor)
  }
  const handleCommittedInput = (event: InputEvent): void => {
    if (event.inputType === 'insertFromPaste') {
      if (mode === 'opaque') release()
      return
    }
    if (mode === 'opaque') release()
    suppressNextOpaqueKeyUp = true
  }

  textarea.addEventListener('compositionstart', handleCompositionStart)
  textarea.addEventListener('compositionupdate', handleCompositionUpdate)
  textarea.addEventListener('compositionend', handleCompositionEnd)
  textarea.addEventListener('keydown', handleKeyDown)
  textarea.addEventListener('keyup', handleKeyUp)
  textarea.addEventListener('beforeinput', handleCommittedInput)
  textarea.addEventListener('input', handleCommittedInput)
  textarea.addEventListener('blur', release)

  return {
    dispose: () => {
      release()
      cursorProxy.remove()
      textarea.removeEventListener('compositionstart', handleCompositionStart)
      textarea.removeEventListener('compositionupdate', handleCompositionUpdate)
      textarea.removeEventListener('compositionend', handleCompositionEnd)
      textarea.removeEventListener('keydown', handleKeyDown)
      textarea.removeEventListener('keyup', handleKeyUp)
      textarea.removeEventListener('beforeinput', handleCommittedInput)
      textarea.removeEventListener('input', handleCommittedInput)
      textarea.removeEventListener('blur', release)
    },
  }
}
