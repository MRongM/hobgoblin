import { Switch } from '#/web/components/ui/switch.tsx'
import { SettingsCard, SettingsListItem } from '#/web/components/settings/SettingsPrimitives.tsx'
import { useShortcutSettingsController, useRuntimeShortcutSettings } from '#/web/runtime-settings-shortcuts.ts'
import { useT } from '#/web/stores/i18n.ts'
export function ShortcutSettings() {
  const t = useT()
  const { shortcutsDisabled } = useRuntimeShortcutSettings()
  const { setShortcutsDisabled } = useShortcutSettingsController()

  return (
    <SettingsCard>
      <SettingsListItem size="md">
        <label
          htmlFor="shortcuts-disabled-switch"
          className="min-w-0 cursor-pointer select-none text-sm text-foreground"
        >
          {t('settings.shortcuts-disable-app')}
        </label>
        <Switch
          id="shortcuts-disabled-switch"
          checked={shortcutsDisabled}
          onCheckedChange={(disabled) => void setShortcutsDisabled(disabled)}
          aria-label={t('settings.shortcuts-disable-app')}
        />
      </SettingsListItem>
    </SettingsCard>
  )
}
