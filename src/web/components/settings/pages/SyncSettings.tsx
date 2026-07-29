import {
  SettingsGroup,
  SettingsList,
  SettingsRow,
  SettingsSelect,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFetchSettingsController, useRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import { useT } from '#/web/stores/i18n.ts'

const INTERVAL_OPTIONS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'settings.fetch.off' },
  { value: 30, labelKey: 'settings.fetch.30s' },
  { value: 60, labelKey: 'settings.fetch.1m' },
  { value: 120, labelKey: 'settings.fetch.2m' },
  { value: 180, labelKey: 'settings.fetch.3m' },
  { value: 300, labelKey: 'settings.fetch.5m' },
  { value: 900, labelKey: 'settings.fetch.15m' },
]

export function SyncSettings() {
  const t = useT()
  const { fetchIntervalSec: fetchInterval, statusRefreshIntervalSec } = useRuntimeFetchSettings()
  const { setFetchInterval, setStatusRefreshInterval } = useFetchSettingsController()
  const intervalOptions = INTERVAL_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))
  return (
    <>
      <SettingsGroup label={t('settings.group.sync')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-fetch"
            label={t('settings.fetch')}
            hint={t('settings.fetch-hint')}
            control={
              <SettingsSelect
                id="settings-fetch"
                value={fetchInterval}
                options={intervalOptions}
                onChange={(v) => void setFetchInterval(v)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup label={t('settings.group.status-refresh')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-status-refresh"
            label={t('settings.status-refresh')}
            hint={t('settings.status-refresh-hint')}
            control={
              <SettingsSelect
                id="settings-status-refresh"
                value={statusRefreshIntervalSec}
                options={intervalOptions}
                onChange={(v) => void setStatusRefreshInterval(v)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
    </>
  )
}
