import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ColorTheme } from '#/shared/color-theme.ts'

const mocks = vi.hoisted(() => ({
  shouldUseDarkColors: false,
  themeSource: 'system',
  nativeThemeOn: vi.fn(),
  getSettingsPrefs: vi.fn<() => Promise<{ theme?: 'auto' | 'light' | 'dark'; colorTheme?: ColorTheme }>>(async () => ({
    theme: 'auto',
    colorTheme: 'macos',
  })),
}))

vi.mock('electron', () => ({
  nativeTheme: {
    get shouldUseDarkColors() {
      return mocks.shouldUseDarkColors
    },
    set shouldUseDarkColors(value: boolean) {
      mocks.shouldUseDarkColors = value
    },
    get themeSource() {
      return mocks.themeSource
    },
    set themeSource(value: string) {
      mocks.themeSource = value
    },
    on: mocks.nativeThemeOn,
  },
}))

vi.mock('#/main/settings-server-client.ts', () => ({
  getSettingsPrefs: mocks.getSettingsPrefs,
}))

describe('theme persistence mirroring', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.shouldUseDarkColors = false
    mocks.themeSource = 'system'
    mocks.getSettingsPrefs.mockResolvedValue({ theme: 'auto', colorTheme: 'macos' })
  })

  test('initializes theme state from embedded server prefs when available', async () => {
    mocks.getSettingsPrefs.mockResolvedValueOnce({ theme: 'dark', colorTheme: 'github' })
    const theme = await import('#/main/theme.ts')

    await theme.initTheme()

    expect(theme.getTheme()).toMatchObject({ pref: 'dark', colorTheme: 'github', resolved: 'dark' })
  })
})
