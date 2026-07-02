import type { ILink, ILinkProvider } from '@xterm/xterm'
import { filePathTargetsForText, type FilePathTarget } from '#/shared/file-path-target.ts'

type RevealPathHandler = (relativePath: string) => void
type OpenPathInEditorHandler = (target: FilePathTarget) => void
type TerminalBufferLine = {
  readonly isWrapped?: boolean
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
  target: FilePathTarget
  startColumn: number
  endColumn: number
}

interface TerminalLineWindow {
  text: string
  startLineIndex: number
  lineStarts: number[]
  lineLengths: number[]
}

interface TerminalLinkPosition {
  lineIndex: number
  column: number
}

const MAX_TERMINAL_LINK_WINDOW_LENGTH = 4096
const HARD_WRAP_PATH_PREFIX_PATTERN =
  /(^|[\s"'`([{<：,，、;；（［【｛《〈「『])(?:\.\/)?(?:[A-Za-z0-9_@%+=.-]+\/)+$/u
const HARD_WRAP_PATH_CONTINUATION_PATTERN =
  /^[ \t]*(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?(?=$|[\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、])/u

function activationDetail(event: MouseEvent): number {
  const detail = (event as { detail?: unknown }).detail
  return typeof detail === 'number' ? detail : 0
}

export function terminalRelativePathLinksForLine(line: string): TerminalRelativePathLink[] {
  return filePathTargetsForText(line).map((span) => ({
    text: span.text,
    target: span.target,
    startColumn: span.startIndex + 1,
    endColumn: span.endIndex,
  }))
}

function terminalLineWindowForBufferLine(term: TerminalLinkProviderHost, lineIndex: number): TerminalLineWindow {
  let startLineIndex = lineIndex
  while (startLineIndex > 0) {
    const currentLine = term.buffer.active.getLine(startLineIndex)
    const previousLine = term.buffer.active.getLine(startLineIndex - 1)
    if (!currentLine || !previousLine) break
    if (!currentLine.isWrapped && !isHardWrappedPathBoundary(previousLine, currentLine)) break
    startLineIndex -= 1
  }

  const lines: string[] = []
  const lineStarts: number[] = []
  const lineLengths: number[] = []
  let textLength = 0
  for (let index = startLineIndex; ; index += 1) {
    const line = term.buffer.active.getLine(index)
    if (!line) break
    const text = line.translateToString(true)
    if (textLength + text.length > MAX_TERMINAL_LINK_WINDOW_LENGTH) break
    lineStarts.push(textLength)
    lines.push(text)
    lineLengths.push(text.length)
    textLength += text.length
    const nextLine = term.buffer.active.getLine(index + 1)
    if (!nextLine) break
    if (nextLine.isWrapped) continue
    if (!isHardWrappedPathBoundary(line, nextLine)) break
    if (textLength + 1 > MAX_TERMINAL_LINK_WINDOW_LENGTH) break
    lines.push('\n')
    textLength += 1
  }

  return { text: lines.join(''), startLineIndex, lineStarts, lineLengths }
}

function terminalPositionForOffset(window: TerminalLineWindow, offset: number): TerminalLinkPosition | null {
  for (let index = 0; index < window.lineLengths.length; index += 1) {
    const lineStart = window.lineStarts[index] ?? 0
    const lineLength = window.lineLengths[index] ?? 0
    const lineEnd = lineStart + lineLength
    if (offset >= lineStart && offset < lineEnd) {
      return { lineIndex: window.startLineIndex + index, column: offset - lineStart }
    }
    if (offset === lineEnd && index === window.lineLengths.length - 1) {
      return { lineIndex: window.startLineIndex + index, column: lineLength }
    }
  }
  return null
}

function isHardWrappedPathBoundary(leftLine: TerminalBufferLine, rightLine: TerminalBufferLine): boolean {
  const left = leftLine.translateToString(true)
  const right = rightLine.translateToString(true)
  return HARD_WRAP_PATH_PREFIX_PATTERN.test(left.trimEnd()) && HARD_WRAP_PATH_CONTINUATION_PATTERN.test(right)
}

function terminalRelativePathLinksForWindow(
  window: TerminalLineWindow,
): Array<TerminalRelativePathLink & { rangeLineStart: number; rangeLineEnd: number }> {
  return filePathTargetsForText(window.text)
    .map((span) => {
      const start = terminalPositionForOffset(window, span.startIndex)
      const end = terminalPositionForOffset(window, span.endIndex - 1)
      if (!start || !end) return null
      return {
        text: span.text,
        target: span.target,
        startColumn: start.column + 1,
        endColumn: end.column + 1,
        rangeLineStart: start.lineIndex + 1,
        rangeLineEnd: end.lineIndex + 1,
      }
    })
    .filter((link): link is TerminalRelativePathLink & { rangeLineStart: number; rangeLineEnd: number } => !!link)
}

export function registerTerminalRelativePathLinkProvider(
  term: TerminalLinkProviderHost,
  getRevealPathHandler: () => RevealPathHandler | null,
  getOpenPathInEditorHandler: () => OpenPathInEditorHandler | null,
): { dispose: () => void } {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const revealPath = getRevealPathHandler()
      const openPathInEditor = getOpenPathInEditorHandler()
      if (!revealPath && !openPathInEditor) {
        callback(undefined)
        return
      }
      const window = terminalLineWindowForBufferLine(term, bufferLineNumber - 1)
      const links = terminalRelativePathLinksForWindow(window)
        .filter((link) => link.rangeLineStart <= bufferLineNumber && bufferLineNumber <= link.rangeLineEnd)
        .map<ILink>((link) => ({
          range: {
            start: { x: link.startColumn, y: link.rangeLineStart },
            end: { x: link.endColumn, y: link.rangeLineEnd },
          },
          text: link.text,
          decorations: { pointerCursor: true, underline: true },
          activate: (event) => {
            if (activationDetail(event) >= 2) {
              getOpenPathInEditorHandler()?.(link.target)
              return
            }
            getRevealPathHandler()?.(link.target.path)
          },
        }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
