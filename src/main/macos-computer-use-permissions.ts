import { desktopCapturer, shell, systemPreferences } from 'electron'
import type {
  MacosComputerUsePermissionKind,
  MacosComputerUsePermissionResult,
  MacosComputerUsePermissionsSnapshot,
} from '#/shared/macos-computer-use-permissions.ts'

const SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

const UNSUPPORTED_PERMISSIONS: MacosComputerUsePermissionsSnapshot = {
  screenRecording: 'unsupported',
  accessibility: 'unsupported',
}

export function getMacosComputerUsePermissions(): MacosComputerUsePermissionsSnapshot {
  if (process.platform !== 'darwin') return { ...UNSUPPORTED_PERMISSIONS }

  return {
    screenRecording: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
  }
}

export async function requestMacosComputerUsePermission(
  kind: MacosComputerUsePermissionKind,
): Promise<MacosComputerUsePermissionResult> {
  if (process.platform !== 'darwin') {
    return { ok: false, permissions: { ...UNSUPPORTED_PERMISSIONS } }
  }

  if (kind === 'screen-recording') {
    const status = systemPreferences.getMediaAccessStatus('screen')
    if (status === 'not-determined') {
      await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      })
    } else if (status !== 'granted') {
      await shell.openExternal(SCREEN_RECORDING_SETTINGS_URL)
    }
  } else if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true)
  }

  return { ok: true, permissions: getMacosComputerUsePermissions() }
}
