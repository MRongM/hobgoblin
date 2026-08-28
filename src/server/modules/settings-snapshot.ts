import {
  getServerRecentRepos,
  getServerRepoSettings,
  getServerSessionState,
  getServerSettingsPrefs,
  getServerTelegramNotificationSettings,
  getServerWebAccessSettings,
} from '#/server/modules/settings-source.ts'
import type { ServerSettingsState } from '#/server/modules/settings-state.ts'
import { buildSettingsSnapshot } from '#/shared/settings-snapshot.ts'
import type { SettingsSnapshot } from '#/shared/rpc.ts'

export async function getSettingsSnapshot(state: ServerSettingsState): Promise<SettingsSnapshot> {
  const serverSettings = await getServerSettingsPrefs()
  const telegramNotifications = await getServerTelegramNotificationSettings()
  return buildSettingsSnapshot({
    prefs: serverSettings,
    globalShortcutRegistered: state.globalShortcutRegistered,
    session: await getServerSessionState(),
    recentRepos: await getServerRecentRepos(),
    repoSettings: await getServerRepoSettings(),
    webAccess: await getServerWebAccessSettings(),
    telegramNotifications: {
      ...telegramNotifications,
      terminalInputRuntime: { ...state.telegramTerminalInputRuntime },
    },
  })
}
