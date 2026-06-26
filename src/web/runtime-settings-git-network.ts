import {
  currentRuntimeSettingsSnapshot,
  readRuntimeGitNetworkSettings,
  useRuntimeSettingsSnapshot,
} from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setGitNetworkProxyEnabledPreference,
  setGitNetworkProxyUrlPreference,
  setGitNetworkTimeoutSecPreference,
} from '#/web/settings-write-paths.ts'

export function getRuntimeGitNetworkSettings() {
  return readRuntimeGitNetworkSettings(currentRuntimeSettingsSnapshot())
}

export function useRuntimeGitNetworkSettings() {
  return readRuntimeGitNetworkSettings(useRuntimeSettingsSnapshot())
}

export function useGitNetworkSettingsController() {
  return {
    async setGitNetworkProxyEnabled(enabled: boolean): Promise<void> {
      await runSettingsControllerAction('git network proxy enabled update', async () => {
        await setGitNetworkProxyEnabledPreference(enabled)
      })
    },
    async setGitNetworkProxyUrl(url: string): Promise<void> {
      await runSettingsControllerAction('git network proxy url update', async () => {
        await setGitNetworkProxyUrlPreference(url)
      })
    },
    async setGitNetworkTimeoutSec(sec: number): Promise<void> {
      await runSettingsControllerAction('git network timeout update', async () => {
        await setGitNetworkTimeoutSecPreference(sec)
      })
    },
  }
}
