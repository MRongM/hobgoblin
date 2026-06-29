import { hasAppCli, openByAppCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Windsurf'
const CLI_NAME = 'windsurf'

export function isWindsurfInstalled(): boolean {
  return hasAppCli(APP_NAME, CLI_NAME)
}

export function openInWindsurf(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByAppCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInWindsurf(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
