import { MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB, MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB } from '#/shared/settings.ts'
import { MAX_WORKSPACE_PANE_SIZE, MIN_WORKSPACE_PANE_SIZE } from '#/shared/workspace-layout.ts'
import {
  SettingsGroup,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFileAreaSettingsController, useRuntimeFileAreaSettings } from '#/web/runtime-settings-file-area.ts'
import { useEffectiveWorkspaceLayout } from '#/web/lib/effective-workspace-layout.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'

export function FileAreaSettings() {
  const t = useT()
  const { fileTreeClipboardMaxBytesMb } = useRuntimeFileAreaSettings()
  const { setFileTreeClipboardMaxBytesMb } = useFileAreaSettingsController()
  // The workspace always renders with the responsive effective layout (see
  // useEffectiveWorkspaceLayout), so the setting must edit the same key —
  // the session's stored workspaceLayout may differ and would silently edit
  // an unused entry.
  const workspaceLayout = useEffectiveWorkspaceLayout()
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
    </>
  )
}
