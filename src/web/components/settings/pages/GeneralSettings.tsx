import { type ReactNode } from 'react'
import { Laptop, Moon, Sun } from 'lucide-react'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import {
  SettingsGroup,
  SettingsCard,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
  SettingsSelect,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useRuntimeGeneralSettings } from '#/web/runtime-settings-general.ts'
import { useGeneralSettingsController } from '#/web/runtime-settings-general.ts'
import { useFontSettingsController, useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
import { useChromeSettingsController, useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useThemeStore } from '#/web/stores/theme.ts'
import { useI18nStore } from '#/web/stores/i18n.ts'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { MAX_CHROME_HEIGHT_PX, MIN_CHROME_HEIGHT_PX } from '#/shared/window-chrome.ts'
import { MAX_SERVER_PORT, MIN_SERVER_PORT } from '#/shared/settings.ts'
import type { ColorTheme } from '#/shared/color-theme.ts'
import type { FontFamilyPref, LangPref, ThemePref } from '#/shared/rpc.ts'

export function GeneralSettings() {
  const t = useT()
  const themePref = useThemeStore((s) => s.pref)
  const colorTheme = useThemeStore((s) => s.colorTheme)
  const setThemePref = useThemeStore((s) => s.setPref)
  const setColorTheme = useThemeStore((s) => s.setColorTheme)
  const langPref = useI18nStore((s) => s.pref)
  const setLangPref = useI18nStore((s) => s.setPref)
  const { fontFamily } = useRuntimeFontSettings()
  const { topbarHeightPx, toolbarHeightPx } = useRuntimeChromeSettings()
  const { toggleDetailOnActionBarBlankClick, terminalThemeSyncEnabled, temporaryFilesDirectory, serverPort } =
    useRuntimeGeneralSettings()
  const {
    setToggleDetailOnActionBarBlankClick,
    setTerminalThemeSyncEnabled,
    setTemporaryFilesDirectory,
    setServerPort,
  } = useGeneralSettingsController()
  const { setFontFamily } = useFontSettingsController()
  const { setTopbarHeightPx, setToolbarHeightPx } = useChromeSettingsController()
  const appearanceOptions: { value: ThemePref; labelKey: string; icon: ReactNode }[] = [
    { value: 'auto', labelKey: 'settings.appearance.auto', icon: <Laptop className="size-4" /> },
    { value: 'light', labelKey: 'settings.appearance.light', icon: <Sun className="size-4" /> },
    { value: 'dark', labelKey: 'settings.appearance.dark', icon: <Moon className="size-4" /> },
  ]
  const themePresetOptions: { value: ColorTheme; labelKey: string }[] = COLOR_THEMES.map((value) => ({
    value,
    labelKey: `settings.theme-preset.${value}`,
  }))
  const fontFamilyOptions: { value: FontFamilyPref; labelKey: string }[] = [
    { value: 'mono', labelKey: 'settings.font-family.mono' },
    { value: 'maple', labelKey: 'settings.font-family.maple' },
    { value: 'system', labelKey: 'settings.font-family.system' },
  ]
  const langOptions: { value: LangPref; labelKey: string; emoji: string }[] = [
    { value: 'auto', labelKey: 'settings.lang.auto', emoji: '🌐' },
    { value: 'en', labelKey: 'settings.lang.en', emoji: '🇺🇸' },
    { value: 'zh', labelKey: 'settings.lang.zh', emoji: '🇨🇳' },
    { value: 'ko', labelKey: 'settings.lang.ko', emoji: '🇰🇷' },
    { value: 'ja', labelKey: 'settings.lang.ja', emoji: '🇯🇵' },
  ]
  return (
    <>
      <SettingsGroup label={t('settings.group.general')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-theme-preset"
            label={t('settings.theme-preset')}
            control={
              <SettingsSelect
                id="settings-theme-preset"
                value={colorTheme}
                options={themePresetOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                onChange={(v) => void setColorTheme(v)}
              />
            }
          />
          <SettingsRow
            controlId="settings-appearance"
            label={t('settings.appearance')}
            control={
              <SettingsSelect
                id="settings-appearance"
                value={themePref}
                options={appearanceOptions.map((o) => ({ value: o.value, label: t(o.labelKey), icon: o.icon }))}
                onChange={(v) => void setThemePref(v)}
              />
            }
          />
          <SettingsRow
            controlId="settings-font-family"
            label={t('settings.font-family')}
            hint={t('settings.font-family-hint')}
            control={
              <SettingsSelect<FontFamilyPref>
                id="settings-font-family"
                value={fontFamily}
                options={fontFamilyOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                onChange={(v) => void setFontFamily(v)}
              />
            }
          />
          <SettingsRow
            controlId="settings-language"
            label={t('settings.lang')}
            control={
              <SettingsSelect
                id="settings-language"
                value={langPref}
                options={langOptions.map((o) => ({ value: o.value, label: `${o.emoji} ${t(o.labelKey)}` }))}
                onChange={(v) => void setLangPref(v)}
              />
            }
          />
          <SettingsRow
            controlId="settings-terminal-theme-sync"
            label={t('settings.terminal-theme-sync')}
            hint={t('settings.terminal-theme-sync-hint')}
            control={
              <Switch
                id="settings-terminal-theme-sync"
                checked={terminalThemeSyncEnabled}
                onCheckedChange={(enabled) => void setTerminalThemeSyncEnabled(enabled)}
                aria-label={t('settings.terminal-theme-sync')}
              />
            }
          />
          <SettingsRow
            controlId="settings-action-bar-blank-toggle"
            label={t('settings.action-bar-blank-toggle')}
            hint={t('settings.action-bar-blank-toggle-hint')}
            control={
              <Switch
                id="settings-action-bar-blank-toggle"
                checked={toggleDetailOnActionBarBlankClick}
                onCheckedChange={(enabled) => void setToggleDetailOnActionBarBlankClick(enabled)}
                aria-label={t('settings.action-bar-blank-toggle')}
              />
            }
          />
          <SettingsRow
            controlId="settings-server-port"
            label={t('settings.server-port')}
            hint={t('settings.server-port-hint')}
            control={
              <SettingsNumberInput
                id="settings-server-port"
                value={serverPort}
                min={MIN_SERVER_PORT}
                max={MAX_SERVER_PORT}
                onChange={(value) => void setServerPort(value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-temporary-files-directory"
            label={t('settings.temporary-files-directory')}
            hint={t('settings.temporary-files-directory-hint')}
            control={
              <Input
                id="settings-temporary-files-directory"
                value={temporaryFilesDirectory}
                placeholder={t('settings.temporary-files-directory-placeholder')}
                className="h-8 w-64 max-w-full px-2 text-xs"
                onChange={(event) => void setTemporaryFilesDirectory(event.currentTarget.value)}
                aria-label={t('settings.temporary-files-directory')}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup label={t('settings.chrome-heights.title')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-topbar-height"
            label={t('settings.chrome-heights.topbar')}
            hint={t('settings.chrome-heights.topbar-hint')}
            control={
              <SettingsNumberInput
                id="settings-topbar-height"
                value={topbarHeightPx}
                min={MIN_CHROME_HEIGHT_PX}
                max={MAX_CHROME_HEIGHT_PX}
                onChange={(value) => void setTopbarHeightPx(value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-toolbar-height"
            label={t('settings.chrome-heights.toolbar')}
            hint={t('settings.chrome-heights.toolbar-hint')}
            control={
              <SettingsNumberInput
                id="settings-toolbar-height"
                value={toolbarHeightPx}
                min={MIN_CHROME_HEIGHT_PX}
                max={MAX_CHROME_HEIGHT_PX}
                onChange={(value) => void setToolbarHeightPx(value)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup
        label={t('settings.general.open-from-terminal-title')}
        hint={t('settings.general.open-from-terminal-body')}
      >
        <SettingsCard>
          <div className="px-4 py-3">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-snug text-muted-foreground">
              {t('settings.general.open-from-terminal-command')}
            </pre>
          </div>
        </SettingsCard>
      </SettingsGroup>
    </>
  )
}
