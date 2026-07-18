import { describe, expect, test, vi } from 'vitest'
import { configureChromiumKeychainPolicy } from '#/main/chromium-keychain-policy.ts'

describe('configureChromiumKeychainPolicy', () => {
  test('uses the Chromium mock keychain on macOS', () => {
    const appendSwitch = vi.fn()

    configureChromiumKeychainPolicy({ appendSwitch }, 'darwin')

    expect(appendSwitch).toHaveBeenCalledTimes(1)
    expect(appendSwitch).toHaveBeenCalledWith('use-mock-keychain')
  })

  test.each<NodeJS.Platform>(['linux', 'win32'])('leaves Chromium keychain behavior unchanged on %s', (platform) => {
    const appendSwitch = vi.fn()

    configureChromiumKeychainPolicy({ appendSwitch }, platform)

    expect(appendSwitch).not.toHaveBeenCalled()
  })
})
