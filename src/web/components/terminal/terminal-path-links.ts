import type { ILink, ILinkProvider } from '@xterm/xterm'

type RevealPathHandler = (relativePath: string) => void
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

export interface TerminalRelativePathLink {
  text: string
  relativePath: string
  startColumn: number
  endColumn: number
}

const PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<])(?<token>(?:\.\/)?(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>])/gu
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/u
const LEADING_PUNCTUATION_PATTERN = /^[`"'([{<]+/u
const TRAILING_PUNCTUATION_PATTERN = /[`"',;)\]}>]+$/u

export function normalizeTerminalRelativePath(raw: string): string | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) return null

  let relativePath = trimmed.replace(LINE_SUFFIX_PATTERN, '')
  while (relativePath.startsWith('./')) relativePath = relativePath.slice(2)
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) return null

  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return relativePath
}

export function terminalRelativePathLinksForLine(line: string): TerminalRelativePathLink[] {
  const links: TerminalRelativePathLink[] = []
  for (const match of line.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const relativePath = normalizeTerminalRelativePath(token)
    if (!relativePath) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    links.push({
      text: token,
      relativePath,
      startColumn: startIndex + 1,
      endColumn: startIndex + token.length,
    })
  }
  return links
}

export function registerTerminalRelativePathLinkProvider(
  term: TerminalLinkProviderHost,
  getRevealPathHandler: () => RevealPathHandler | null,
): { dispose: () => void } {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const revealPath = getRevealPathHandler()
      if (!revealPath) {
        callback(undefined)
        return
      }
      const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? ''
      const links = terminalRelativePathLinksForLine(line).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
        },
        text: link.text,
        decorations: { pointerCursor: true, underline: true },
        activate: (_event, text) => {
          const relativePath = normalizeTerminalRelativePath(text)
          if (relativePath) getRevealPathHandler()?.(relativePath)
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
