import type { ILink, ILinkProvider } from '@xterm/xterm'

type OpenUrlHandler = (url: string) => void
type TerminalBufferLine = {
  translateToString: (trimRight?: boolean, startColumn?: number, endColumn?: number) => string
}

interface TerminalLinkProviderHost {
  buffer: {
    active: {
      getLine: (index: number) => TerminalBufferLine | undefined
    }
  }
  registerLinkProvider: (linkProvider: ILinkProvider) => { dispose: () => void }
}

export interface TerminalLocalUrlLink {
  text: string
  url: string
  startColumn: number
  endColumn: number
}

const LOCAL_URL_PATTERN =
  /(^|[\s"'`([{<])(?<url>(?:localhost|127\.0\.0\.1):\d{1,5}(?:[/?#][^\s"'`<>()\[\]{}]*)?)(?=$|[\s"'`,;)\]}>])/giu
const TRAILING_URL_PUNCTUATION_PATTERN = /[,.!?;:]+$/u

function shouldOpenFromEvent(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey
}

function normalizeLocalUrl(candidate: string): { text: string; url: string } | null {
  const text = candidate.replace(TRAILING_URL_PUNCTUATION_PATTERN, '')
  if (!text) return null

  try {
    const parsed = new URL(`http://${text}`)
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null
    const port = Number(parsed.port)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return null
    return { text, url: parsed.toString() }
  } catch {
    return null
  }
}

export function terminalLocalUrlLinksForLine(line: string): TerminalLocalUrlLink[] {
  const links: TerminalLocalUrlLink[] = []
  for (const match of line.matchAll(LOCAL_URL_PATTERN)) {
    const candidate = match.groups?.url
    if (!candidate || match.index === undefined) continue
    const normalized = normalizeLocalUrl(candidate)
    if (!normalized) continue
    const candidateOffset = match[0].indexOf(candidate)
    const startIndex = match.index + candidateOffset
    const endIndex = startIndex + normalized.text.length
    links.push({
      text: normalized.text,
      url: normalized.url,
      startColumn: startIndex + 1,
      endColumn: endIndex,
    })
  }
  return links
}

export function registerTerminalLocalUrlLinkProvider(
  term: TerminalLinkProviderHost,
  getOpenUrlHandler: () => OpenUrlHandler | null,
): { dispose: () => void } {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      if (!getOpenUrlHandler()) {
        callback(undefined)
        return
      }
      const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? ''
      const links = terminalLocalUrlLinksForLine(line).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
        },
        text: link.text,
        decorations: { pointerCursor: true, underline: true },
        activate: (event) => {
          if (!shouldOpenFromEvent(event)) return
          getOpenUrlHandler()?.(link.url)
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
