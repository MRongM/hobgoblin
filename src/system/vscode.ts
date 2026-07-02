import { hasEditorCli, openByEditorCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Visual Studio Code'
const CLI_NAME = 'code'

export function isVSCodeInstalled(): boolean {
  return hasEditorCli(APP_NAME, CLI_NAME)
}

export function openInVSCode(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByEditorCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInVSCode(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
