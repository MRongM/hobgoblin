import { afterEach, describe, expect, test, vi } from 'vitest'
import { isMobileDevice } from '#/web/components/terminal/mobile-detection.ts'

describe('isMobileDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('does not classify a touch-capable Windows desktop as Mobile Web', () => {
    stubDevice({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/1.0',
      maxTouchPoints: 10,
      hasTouchEvent: true,
    })

    expect(isMobileDevice()).toBe(false)
  })

  test('classifies an Android browser as Mobile Web without touch capability signals', () => {
    stubDevice({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile)',
      maxTouchPoints: 0,
      hasTouchEvent: false,
    })

    expect(isMobileDevice()).toBe(true)
  })

  test('preserves an explicit mobile user agent when it also contains Windows NT', () => {
    stubDevice({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; ARM; Touch) IEMobile/11.0',
      maxTouchPoints: 1,
      hasTouchEvent: true,
    })

    expect(isMobileDevice()).toBe(true)
  })

  test('preserves touch detection for an iPad using a desktop-style user agent', () => {
    stubDevice({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',
      maxTouchPoints: 5,
      hasTouchEvent: true,
    })

    expect(isMobileDevice()).toBe(true)
  })

  test('does not classify a non-touch desktop as Mobile Web', () => {
    stubDevice({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/1.0',
      maxTouchPoints: 0,
      hasTouchEvent: false,
    })

    expect(isMobileDevice()).toBe(false)
  })
})

function stubDevice(options: { userAgent: string; maxTouchPoints: number; hasTouchEvent: boolean }): void {
  vi.stubGlobal('navigator', {
    maxTouchPoints: options.maxTouchPoints,
    userAgent: options.userAgent,
  })
  vi.stubGlobal('window', options.hasTouchEvent ? { ontouchstart: null } : {})
}
