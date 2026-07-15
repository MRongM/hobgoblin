interface TerminalOscHandlerHost {
  parser: {
    registerOscHandler: (ident: number, callback: (data: string) => boolean) => { dispose: () => void }
  }
}

const OSC52_CLIPBOARD_IDENT = 52
const BASE64_WHITESPACE_PATTERN = /\s+/gu

export function terminalTextForOsc52Payload(payload: string): string | null {
  const separatorIndex = payload.indexOf(';')
  const data = (separatorIndex === -1 ? payload : payload.slice(separatorIndex + 1)).replace(
    BASE64_WHITESPACE_PATTERN,
    '',
  )
  // '?' asks the terminal to report clipboard contents back to the application.
  // Never answer it: read-back would leak local clipboard data to remote programs.
  if (data === '?') return null
  return decodeBase64Utf8(data)
}

export function registerTerminalOsc52ClipboardHandler(
  term: TerminalOscHandlerHost,
  writeClipboardText: (text: string) => void = writeSystemClipboardText,
): { dispose: () => void } {
  return term.parser.registerOscHandler(OSC52_CLIPBOARD_IDENT, (payload) => {
    const text = terminalTextForOsc52Payload(payload)
    if (text !== null) writeClipboardText(text)
    return true
  })
}

function decodeBase64Utf8(data: string): string | null {
  try {
    const binary = atob(data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function writeSystemClipboardText(text: string): void {
  const clipboard = globalThis.navigator?.clipboard
  if (clipboard?.writeText) {
    clipboard.writeText(text).catch(() => {
      copyViaHiddenTextarea(text)
    })
    return
  }
  // Server mode reached over plain http has no navigator.clipboard (insecure context).
  copyViaHiddenTextarea(text)
}

function copyViaHiddenTextarea(text: string): boolean {
  const doc = globalThis.document
  if (!doc?.body) return false
  const previousActive = doc.activeElement
  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  doc.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = doc.execCommand('copy')
  } catch {
    copied = false
  }
  textarea.remove()
  if (previousActive instanceof HTMLElement) previousActive.focus({ preventScroll: true })
  return copied
}
