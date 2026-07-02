import {
  MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MAX_FILE_TREE_FONT_SIZE,
  MAX_FILE_TREE_TOPBAR_FONT_SIZE,
  MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_FILE_TREE_TOPBAR_FONT_SIZE,
} from '#/shared/settings.ts'
import {
  MAX_WORKSPACE_PANE_SIZE,
  MIN_WORKSPACE_PANE_SIZE,
} from '#/shared/workspace-layout.ts'
import {
  SettingsGroup,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFileAreaSettingsController, useRuntimeFileAreaSettings } from '#/web/runtime-settings-file-area.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'

export function FileAreaSettings() {
  const t = useT()
  const { fileTreeFontSize, fileTreeTopbarFontSize, fileTreeClipboardMaxBytesMb } = useRuntimeFileAreaSettings()
  const { setFileTreeFontSize, setFileTreeTopbarFontSize, setFileTreeClipboardMaxBytesMb } =
    useFileAreaSettingsController()
  const workspaceLayout = useReposStore((state) =>
    state.activeId ? state.repos[state.activeId]?.ui.workspaceLayout ?? state.workspaceLayout : state.workspaceLayout,
  )
  const fileTreePaneSize = useReposStore((state) => state.fileTreePaneSizes[workspaceLayout])
  const setDefaultFileTreePaneSize = useReposStore((state) => state.setDefaultFileTreePaneSize)

  return (
    <>
      <SettingsGroup label={t('settings.files.layout.title')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-file-tree-pane-size"
            label={t('settings.files.height-ratio')}
            hint={t('settings.files.height-ratio-hint')}
            control={
              <SettingsNumberInput
                id="settings-file-tree-pane-size"
                min={MIN_WORKSPACE_PANE_SIZE}
                max={MAX_WORKSPACE_PANE_SIZE}
                step={0.1}
                value={fileTreePaneSize}
                onChange={(size) => setDefaultFileTreePaneSize(workspaceLayout, size)}
              />
            }
          />
          <SettingsRow
            controlId="settings-file-tree-clipboard-max-bytes"
            label={t('settings.files.clipboard-max-size')}
            hint={t('settings.files.clipboard-max-size-hint')}
            control={
              <SettingsNumberInput
                id="settings-file-tree-clipboard-max-bytes"
                min={MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
                max={MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
                value={fileTreeClipboardMaxBytesMb}
                onChange={(value) => void setFileTreeClipboardMaxBytesMb(value)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
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
          <SettingsRow
            controlId="settings-file-tree-topbar-font-size"
            label={t('settings.files.topbar-font-size')}
            hint={t('settings.files.topbar-font-size-hint')}
            control={
              <SettingsNumberInput
                id="settings-file-tree-topbar-font-size"
                min={MIN_FILE_TREE_TOPBAR_FONT_SIZE}
                max={MAX_FILE_TREE_TOPBAR_FONT_SIZE}
                value={fileTreeTopbarFontSize}
                onChange={(fontSize) => void setFileTreeTopbarFontSize(fontSize)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
    </>
  )
}
