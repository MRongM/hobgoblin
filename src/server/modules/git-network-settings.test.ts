import { describe, expect, test } from 'vitest'
import { gitNetworkOptionsFromPrefs } from '#/server/modules/git-network-settings.ts'
import { defaultSettingsPrefs } from '#/shared/settings-defaults.ts'

describe('gitNetworkOptionsFromPrefs', () => {
  test('returns timeout only when proxy is disabled', () => {
    expect(gitNetworkOptionsFromPrefs(defaultSettingsPrefs())).toEqual({
      timeoutMs: 120_000,
    })
  })

  test('includes proxy URL only when proxy is enabled and non-empty', () => {
    expect(
      gitNetworkOptionsFromPrefs(
        defaultSettingsPrefs({
          gitNetworkProxyEnabled: true,
          gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
          gitNetworkTimeoutSec: 240,
        }),
      ),
    ).toEqual({
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })
})
