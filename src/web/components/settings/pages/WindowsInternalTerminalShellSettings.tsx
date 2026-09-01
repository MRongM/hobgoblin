import type { WindowsInternalTerminalShellPref } from '#/shared/rpc.ts'
import {
  SettingsGroup,
  SettingsList,
  SettingsRow,
  SettingsSelect,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import {
  useRuntimeWindowsInternalTerminalShellSettings,
  useWindowsInternalTerminalShellController,
} from '#/web/runtime-settings-terminal-shell.ts'
import { useT } from '#/web/stores/i18n.ts'

const WINDOWS_INTERNAL_TERMINAL_SHELL_OPTIONS = [
  'auto',
  'wsl',
  'powershell',
  'cmd',
] as const satisfies readonly WindowsInternalTerminalShellPref[]

export function WindowsInternalTerminalShellSettings() {
  const t = useT()
  const { windowsInternalTerminalShell } = useRuntimeWindowsInternalTerminalShellSettings()
  const { setWindowsInternalTerminalShell } = useWindowsInternalTerminalShellController()

  if (getInitialBootstrap().hostPlatform !== 'win32') return null

  return (
    <SettingsGroup label={t('settings.windows-internal-terminal-shell.title')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-windows-internal-terminal-shell"
          label={t('settings.windows-internal-terminal-shell.label')}
          hint={t('settings.windows-internal-terminal-shell.hint')}
          control={
            <SettingsSelect<WindowsInternalTerminalShellPref>
              id="settings-windows-internal-terminal-shell"
              value={windowsInternalTerminalShell}
              options={WINDOWS_INTERNAL_TERMINAL_SHELL_OPTIONS.map((value) => ({
                value,
                label: t(`settings.windows-internal-terminal-shell.${value}`),
              }))}
              onChange={(preference) => void setWindowsInternalTerminalShell(preference)}
            />
          }
        />
      </SettingsList>
    </SettingsGroup>
  )
}
