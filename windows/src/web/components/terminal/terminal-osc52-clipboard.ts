import { writeTerminalClipboardText } from '#/web/components/terminal/terminal-clipboard.ts'

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
  void writeTerminalClipboardText(text)
}
