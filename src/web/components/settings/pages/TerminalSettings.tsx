import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from '#/shared/settings.ts'
import type { TerminalCustomButton, TerminalCustomButtonSize } from '#/shared/rpc.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsListItem,
  SettingsNumberInput,
  SettingsRow,
  SettingsSelect,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import {
  useRuntimeTerminalSettings,
  useTerminalCustomButtonsController,
} from '#/web/runtime-settings-terminal-buttons.ts'
import { useFontSettingsController } from '#/web/runtime-settings-fonts.ts'
import { useT } from '#/web/stores/i18n.ts'

type EditableTerminalCustomButton = TerminalCustomButton & {
  id: string
  action: 'execute' | 'input'
}

function actionFromButton(button: TerminalCustomButton): 'execute' | 'input' {
  return button.action === 'input' ? 'input' : 'execute'
}

function editableFromButtons(buttons: TerminalCustomButton[]): EditableTerminalCustomButton[] {
  return buttons.map((button, index) => ({
    id: `${index}:${button.label}:${button.value}:${actionFromButton(button)}`,
    label: button.label,
    value: button.value,
    action: actionFromButton(button),
  }))
}

function validButtons(rows: EditableTerminalCustomButton[]): TerminalCustomButton[] {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value, action: row.action }))
    .filter((row) => row.label.length > 0 && row.value.trim().length > 0)
    .slice(0, 20)
}

export function TerminalSettings() {
  const t = useT()
  const {
    terminalCustomButtons: buttons,
    terminalExternalInputEnabled,
    remoteTerminalTmuxEnabled,
    terminalCustomButtonsVisible,
    terminalCustomButtonSize,
    terminalFontSize,
  } = useRuntimeTerminalSettings()
  const initialRows = useMemo(() => editableFromButtons(buttons), [buttons])
  const [rows, setRows] = useState<EditableTerminalCustomButton[]>(initialRows)
  const [dirty, setDirty] = useState(false)
  const {
    setTerminalCustomButtons,
    setTerminalExternalInputEnabled,
    setRemoteTerminalTmuxEnabled,
    setTerminalCustomButtonsVisible,
    setTerminalCustomButtonSize,
  } = useTerminalCustomButtonsController()
  const { setTerminalFontSize } = useFontSettingsController()

  useEffect(() => {
    if (dirty) return
    setRows(initialRows)
  }, [dirty, initialRows])

  function updateRows(nextRows: EditableTerminalCustomButton[]) {
    setRows(nextRows)
    setDirty(true)
  }

  async function save() {
    const nextButtons = validButtons(rows)
    await setTerminalCustomButtons(nextButtons)
    setRows(editableFromButtons(nextButtons))
    setDirty(false)
  }

  return (
    <>
      <SettingsGroup label={t('settings.terminal-font.title')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-terminal-font-size"
            label={t('settings.terminal-font-size')}
            hint={t('settings.terminal-font-size-hint')}
            control={
              <SettingsNumberInput
                id="settings-terminal-font-size"
                min={MIN_TERMINAL_FONT_SIZE}
                max={MAX_TERMINAL_FONT_SIZE}
                value={terminalFontSize}
                onChange={(fontSize) => void setTerminalFontSize(fontSize)}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup label={t('settings.terminal-input.title')} hint={t('settings.terminal-input.hint')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-terminal-external-input"
            label={t('settings.terminal-external-input')}
            hint={t('settings.terminal-external-input-hint')}
            control={
              <Switch
                id="settings-terminal-external-input"
                checked={terminalExternalInputEnabled}
                onCheckedChange={(enabled) => void setTerminalExternalInputEnabled(enabled)}
                aria-label={t('settings.terminal-external-input')}
              />
            }
          />
          <SettingsRow
            controlId="settings-terminal-remote-tmux"
            label={t('settings.terminal-remote-tmux')}
            hint={t('settings.terminal-remote-tmux-hint')}
            control={
              <Switch
                id="settings-terminal-remote-tmux"
                checked={remoteTerminalTmuxEnabled}
                onCheckedChange={(enabled) => void setRemoteTerminalTmuxEnabled(enabled)}
                aria-label={t('settings.terminal-remote-tmux')}
              />
            }
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup
        label={t('settings.terminal-custom-buttons.title')}
        hint={t('settings.terminal-custom-buttons.hint')}
        action={
          <Button
            type="button"
            data-interactive
            variant="ghost"
            size="sm"
            onClick={() => {
              updateRows([...rows, { id: `new:${Date.now()}`, label: '', value: '', action: 'execute' }])
            }}
          >
            <Plus className="size-3" />
            {t('settings.terminal-custom-buttons.add')}
          </Button>
        }
      >
        <SettingsList>
          <SettingsRow
            controlId="settings-terminal-custom-buttons-visible"
            label={t('settings.terminal-custom-buttons.visible')}
            hint={t('settings.terminal-custom-buttons.visible-hint')}
            control={
              <Switch
                id="settings-terminal-custom-buttons-visible"
                checked={terminalCustomButtonsVisible}
                onCheckedChange={(visible) => void setTerminalCustomButtonsVisible(visible)}
                aria-label={t('settings.terminal-custom-buttons.visible')}
              />
            }
          />
          <SettingsRow
            controlId="settings-terminal-custom-button-size"
            label={t('settings.terminal-custom-buttons.size')}
            hint={t('settings.terminal-custom-buttons.size-hint')}
            control={
              <SettingsSelect<TerminalCustomButtonSize>
                id="settings-terminal-custom-button-size"
                value={terminalCustomButtonSize}
                options={[
                  { value: 'small', label: t('settings.terminal-custom-buttons.size-small') },
                  { value: 'medium', label: t('settings.terminal-custom-buttons.size-medium') },
                  { value: 'large', label: t('settings.terminal-custom-buttons.size-large') },
                ]}
                onChange={(size) => void setTerminalCustomButtonSize(size)}
              />
            }
          />
        </SettingsList>
        <SettingsCard>
          {rows.length === 0 ? (
            <SettingsListItem size="lg">
              <p className="text-sm text-muted-foreground">{t('settings.terminal-custom-buttons.empty')}</p>
            </SettingsListItem>
          ) : (
            rows.map((row, index) => (
              <SettingsListItem key={row.id} size="xl" className="items-start">
                <div className="grid min-w-0 flex-1 gap-2">
                  <Input
                    id={`terminal-custom-button-label-${index}`}
                    value={row.label}
                    placeholder={t('settings.terminal-custom-buttons.label-placeholder')}
                    aria-label={t('settings.terminal-custom-buttons.label')}
                    onChange={(event) => {
                      const nextRows = rows.map((item) =>
                        item.id === row.id ? { ...item, label: event.target.value } : item,
                      )
                      updateRows(nextRows)
                    }}
                  />
                  <textarea
                    id={`terminal-custom-button-value-${index}`}
                    className="min-h-[64px] w-full resize-y rounded-md border border-input bg-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={row.value}
                    placeholder={t('settings.terminal-custom-buttons.value-placeholder')}
                    aria-label={t('settings.terminal-custom-buttons.value')}
                    onChange={(event) => {
                      const nextRows = rows.map((item) =>
                        item.id === row.id ? { ...item, value: event.target.value } : item,
                      )
                      updateRows(nextRows)
                    }}
                  />
                  <SettingsSelect
                    id={`terminal-custom-button-action-${index}`}
                    value={row.action}
                    options={[
                      { value: 'execute', label: t('settings.terminal-custom-buttons.action-execute') },
                      { value: 'input', label: t('settings.terminal-custom-buttons.action-input') },
                    ]}
                    onChange={(action) => {
                      const nextRows = rows.map((item) => (item.id === row.id ? { ...item, action } : item))
                      updateRows(nextRows)
                    }}
                  />
                </div>
                <Button
                  type="button"
                  data-interactive
                  variant="ghost"
                  size="icon"
                  aria-label={t('settings.terminal-custom-buttons.remove')}
                  onClick={() => {
                    updateRows(rows.filter((item) => item.id !== row.id))
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </SettingsListItem>
            ))
          )}
        </SettingsCard>
        <div className="flex justify-end px-3">
          <Button
            type="button"
            data-interactive
            size="sm"
            disabled={!dirty}
            onClick={() => {
              void save()
            }}
          >
            <Save className="size-3" />
            {t('settings.terminal-custom-buttons.save')}
          </Button>
        </div>
      </SettingsGroup>
    </>
  )
}
