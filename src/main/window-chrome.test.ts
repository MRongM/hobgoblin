import { afterEach, describe, expect, test } from 'vitest'
import { APP_TOOLBAR_HEIGHT_PX, WINDOW_TOPBAR_HEIGHT_PX } from '#/shared/window-chrome.ts'
import { macTrafficLightPosition, titleBarOverlayForTheme } from '#/main/window-chrome.ts'

describe('window chrome helpers', () => {
  const originalPlatform = process.platform

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  test('uses a Chrome-like 34px height for window and app toolbars', () => {
    expect(WINDOW_TOPBAR_HEIGHT_PX).toBe(34)
    expect(APP_TOOLBAR_HEIGHT_PX).toBe(34)
  })

  test('uses the shared height for Win/Linux title bar overlay', () => {
    setPlatform('win32')

    expect(titleBarOverlayForTheme('light', 'macos', WINDOW_TOPBAR_HEIGHT_PX)).toEqual({
      color: '#ffffff',
      symbolColor: '#000000',
      height: 34,
    })
  })

  test('centers macOS traffic lights in the shared window topbar height', () => {
    setPlatform('darwin')

    expect(titleBarOverlayForTheme('light', 'macos', WINDOW_TOPBAR_HEIGHT_PX)).toBeUndefined()
    expect(macTrafficLightPosition(WINDOW_TOPBAR_HEIGHT_PX)).toEqual({ x: 16, y: 11 })
  })
})
