import { serverDataDir } from '#/server/common/data-dir.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import { openInPreferredEditor } from '#/system/editors.ts'
import type { ExecResult } from '#/shared/git-types.ts'

export async function openAppConfigDirectoryInEditor(): Promise<ExecResult> {
  const prefs = await getServerSettingsPrefs()
  return await openInPreferredEditor(serverDataDir(), prefs.editorApp)
}
