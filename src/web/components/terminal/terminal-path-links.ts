import type { ILink, ILinkProvider } from '@xterm/xterm'
import { filePathTargetsForText, type FilePathTarget } from '#/shared/file-path-target.ts'

type RevealPathHandler = (relativePath: string) => void
type OpenPathInEditorHandler = (target: FilePathTarget) => void
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
  target: FilePathTarget
  startColumn: number
  endColumn: number
}

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
      const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? ''
      const links = terminalRelativePathLinksForLine(line).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
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
