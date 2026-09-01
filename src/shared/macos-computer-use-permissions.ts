export const MACOS_COMPUTER_USE_PERMISSION_KINDS = ['screen-recording', 'accessibility'] as const

export type MacosComputerUsePermissionKind = (typeof MACOS_COMPUTER_USE_PERMISSION_KINDS)[number]

export type MacosComputerUsePermissionStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown'
  | 'unsupported'

export interface MacosComputerUsePermissionsSnapshot {
  screenRecording: MacosComputerUsePermissionStatus
  accessibility: MacosComputerUsePermissionStatus
}

export interface MacosComputerUsePermissionResult {
  ok: boolean
  permissions: MacosComputerUsePermissionsSnapshot
}
