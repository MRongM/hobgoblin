import { hasAppCli, openByAppCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Cursor'
const CLI_NAME = 'cursor'

export function isCursorInstalled(): boolean {
  return hasAppCli(APP_NAME, CLI_NAME)
}

export function openInCursor(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByAppCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInCursor(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
