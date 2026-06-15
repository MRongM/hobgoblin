import {
  MAX_FILE_TREE_FONT_SIZE,
  MIN_FILE_TREE_FONT_SIZE,
} from '#/shared/settings.ts'
import {
  SettingsGroup,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFontSettingsController, useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
import { useT } from '#/web/stores/i18n.ts'

export function FileAreaSettings() {
  const t = useT()
  const { fileTreeFontSize } = useRuntimeFontSettings()
  const { setFileTreeFontSize } = useFontSettingsController()

  return (
    <SettingsGroup label={t('settings.files.font.title')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-file-tree-font-size"
          label={t('settings.files.font-size')}
          hint={t('settings.files.font-size-hint')}
          control={
            <SettingsNumberInput
              id="settings-file-tree-font-size"
              min={MIN_FILE_TREE_FONT_SIZE}
              max={MAX_FILE_TREE_FONT_SIZE}
              value={fileTreeFontSize}
              onChange={(fontSize) => void setFileTreeFontSize(fontSize)}
            />
          }
        />
      </SettingsList>
    </SettingsGroup>
  )
}
