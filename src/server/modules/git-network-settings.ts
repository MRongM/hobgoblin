import type { SettingsPrefs } from '#/shared/settings.ts'
import type { GitNetworkOptions } from '#/system/git/helper.ts'

export function gitNetworkOptionsFromPrefs(
  prefs: Pick<SettingsPrefs, 'gitNetworkProxyEnabled' | 'gitNetworkProxyUrl' | 'gitNetworkTimeoutSec'>,
): GitNetworkOptions {
  const proxyUrl = prefs.gitNetworkProxyEnabled && prefs.gitNetworkProxyUrl ? prefs.gitNetworkProxyUrl : undefined
  return {
    timeoutMs: prefs.gitNetworkTimeoutSec * 1000,
    ...(proxyUrl ? { proxyUrl } : {}),
  }
}
