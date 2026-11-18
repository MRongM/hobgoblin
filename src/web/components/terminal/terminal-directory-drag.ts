import type { DragEvent } from 'react'
import { pathStyle } from '#/shared/path-semantics.ts'

export const TERMINAL_DIRECTORY_MIME = 'application/x-goblin-terminal-directory'

export function isTerminalDirectoryPath(path: string | null | undefined): path is string {
  return !!path && pathStyle(path) !== 'relative' && !/[\u0000-\u001f\u007f]/u.test(path)
}

export function terminalDirectoryDragProps(path: string | null | undefined) {
  if (!isTerminalDirectoryPath(path)) return {}
  return {
    draggable: true,
    onDragStart(event: DragEvent<HTMLElement>) {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData(TERMINAL_DIRECTORY_MIME, path)
    },
  }
}
