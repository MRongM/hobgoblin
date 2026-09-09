import { afterEach, describe, expect, test } from 'vitest'
import { DEFAULT_TOOLBAR_HEIGHT_PX, DEFAULT_TOPBAR_HEIGHT_PX } from '#/shared/window-chrome.ts'
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
    expect(DEFAULT_TOPBAR_HEIGHT_PX).toBe(34)
    expect(DEFAULT_TOOLBAR_HEIGHT_PX).toBe(34)
  })

  test('uses the shared height for Win/Linux title bar overlay', () => {
    setPlatform('win32')

    expect(titleBarOverlayForTheme('light', 'macos', DEFAULT_TOPBAR_HEIGHT_PX)).toEqual({
      color: '#d8e7f8',
      symbolColor: '#000000',
      height: 34,
    })
  })

  test('matches GitHub title bar overlays to the web topbar', () => {
    setPlatform('win32')

    expect(titleBarOverlayForTheme('light', 'github', DEFAULT_TOPBAR_HEIGHT_PX)).toEqual({
      color: '#f6f8fa',
      symbolColor: '#000000',
      height: 34,
    })
    expect(titleBarOverlayForTheme('dark', 'github', DEFAULT_TOPBAR_HEIGHT_PX)).toEqual({
      color: '#161b22',
      symbolColor: '#ffffff',
      height: 34,
    })
  })

  test('centers macOS traffic lights in the shared window topbar height', () => {
    setPlatform('darwin')

    expect(titleBarOverlayForTheme('light', 'macos', DEFAULT_TOPBAR_HEIGHT_PX)).toBeUndefined()
    expect(macTrafficLightPosition(DEFAULT_TOPBAR_HEIGHT_PX)).toEqual({ x: 16, y: 11 })
  })
})
