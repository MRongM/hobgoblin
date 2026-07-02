import { describe, expect, test, vi } from 'vitest'
import {
  configureWindowsRendererProcessStability,
  shouldUseRendererSandbox,
  windowsRendererStabilityConfig,
} from '#/main/windows-renderer-stability.ts'

describe('Windows renderer stability policy', () => {
  test('keeps the renderer sandbox outside packaged Windows', () => {
    expect(shouldUseRendererSandbox({ platform: 'darwin', isPackaged: true })).toBe(true)
    expect(shouldUseRendererSandbox({ platform: 'linux', isPackaged: true })).toBe(true)
    expect(shouldUseRendererSandbox({ platform: 'win32', isPackaged: false })).toBe(true)
  })

  test('relaxes packaged Windows renderer launch constraints', () => {
    expect(windowsRendererStabilityConfig({ platform: 'win32', isPackaged: true })).toEqual({
      disabledFeatures: ['RendererCodeIntegrity'],
      rendererSandbox: false,
    })
  })

  test('appends the packaged Windows Chromium switch before windows are created', () => {
    const appendSwitch = vi.fn()
    const config = configureWindowsRendererProcessStability(
      { isPackaged: true, commandLine: { appendSwitch } },
      'win32',
    )

    expect(config.rendererSandbox).toBe(false)
    expect(appendSwitch).toHaveBeenCalledWith('disable-features', 'RendererCodeIntegrity')
  })
})
