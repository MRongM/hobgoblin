import type { WebAccessSettingsSnapshot, WebAccessSettingsUpdateInput } from '#/shared/rpc.ts'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { runSettingsControllerAction, setWebAccessSettingsPreference } from '#/web/settings-write-paths.ts'

const DEFAULT_WEB_ACCESS_SETTINGS: WebAccessSettingsSnapshot = {
  enabled: false,
  username: '',
  passwordConfigured: false,
}

export function useRuntimeSecuritySettings(): WebAccessSettingsSnapshot {
  return useSettingsSnapshotQuery().data?.webAccess ?? DEFAULT_WEB_ACCESS_SETTINGS
}

export function useSecuritySettingsController() {
  return {
    async saveWebAccessSettings(input: WebAccessSettingsUpdateInput): Promise<WebAccessSettingsSnapshot | null> {
      return await runSettingsControllerAction('Web access settings update', async () =>
        setWebAccessSettingsPreference(input),
      )
    },
  }
}
