import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getMacosComputerUsePermissions,
  requestMacosComputerUsePermission,
} from '#/main/macos-computer-use-permissions.ts'

const { getMediaAccessStatus, isTrustedAccessibilityClient, getSources, openExternal } = vi.hoisted(() => ({
  getMediaAccessStatus: vi.fn(),
  isTrustedAccessibilityClient: vi.fn(),
  getSources: vi.fn(),
  openExternal: vi.fn(),
}))

vi.mock('electron', () => ({
  desktopCapturer: { getSources },
  shell: { openExternal },
  systemPreferences: { getMediaAccessStatus, isTrustedAccessibilityClient },
}))

describe('macOS Computer Use permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMediaAccessStatus.mockReturnValue('denied')
    isTrustedAccessibilityClient.mockReturnValue(false)
    getSources.mockResolvedValue([])
    openExternal.mockResolvedValue(undefined)
  })

  test('reads screen recording and accessibility permission states on macOS', () => {
    getMediaAccessStatus.mockReturnValue('granted')
    isTrustedAccessibilityClient.mockReturnValue(true)

    expect(getMacosComputerUsePermissions()).toEqual({
      screenRecording: 'granted',
      accessibility: 'granted',
    })
    expect(getMediaAccessStatus).toHaveBeenCalledWith('screen')
    expect(isTrustedAccessibilityClient).toHaveBeenCalledWith(false)
  })

  test('requests first-time screen recording access through desktop capture', async () => {
    getMediaAccessStatus.mockReturnValueOnce('not-determined').mockReturnValue('denied')

    const result = await requestMacosComputerUsePermission('screen-recording')

    expect(getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    })
    expect(openExternal).not.toHaveBeenCalled()
    expect(result.permissions.screenRecording).toBe('denied')
  })

  test('opens the fixed screen recording settings pane after denial', async () => {
    const result = await requestMacosComputerUsePermission('screen-recording')

    expect(openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    )
    expect(result.ok).toBe(true)
  })

  test('requests accessibility permission through the system API', async () => {
    const result = await requestMacosComputerUsePermission('accessibility')

    expect(isTrustedAccessibilityClient).toHaveBeenCalledWith(true)
    expect(result.permissions.accessibility).toBe('denied')
  })

  test('returns unsupported without touching system APIs outside macOS', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    expect(getMacosComputerUsePermissions()).toEqual({
      screenRecording: 'unsupported',
      accessibility: 'unsupported',
    })
    await expect(requestMacosComputerUsePermission('accessibility')).resolves.toEqual({
      ok: false,
      permissions: {
        screenRecording: 'unsupported',
        accessibility: 'unsupported',
      },
    })
    expect(getMediaAccessStatus).not.toHaveBeenCalled()
    expect(isTrustedAccessibilityClient).not.toHaveBeenCalled()
    platform.mockRestore()
  })
})
