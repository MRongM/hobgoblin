import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { TerminalCustomButton } from '#/shared/rpc.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { SettingsCard, SettingsGroup, SettingsListItem } from '#/web/components/settings/SettingsPrimitives.tsx'
import {
  useRuntimeTerminalCustomButtons,
  useTerminalCustomButtonsController,
} from '#/web/runtime-settings-terminal-buttons.ts'
import { useT } from '#/web/stores/i18n.ts'

type EditableTerminalCustomButton = TerminalCustomButton & {
  id: string
}

function editableFromButtons(buttons: TerminalCustomButton[]): EditableTerminalCustomButton[] {
  return buttons.map((button, index) => ({
    id: `${index}:${button.label}:${button.value}`,
    label: button.label,
    value: button.value,
  }))
}

function validButtons(rows: EditableTerminalCustomButton[]): TerminalCustomButton[] {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value }))
    .filter((row) => row.label.length > 0 && row.value.trim().length > 0)
    .slice(0, 20)
}

export function TerminalSettings() {
  const t = useT()
  const buttons = useRuntimeTerminalCustomButtons()
  const initialRows = useMemo(() => editableFromButtons(buttons), [buttons])
  const [rows, setRows] = useState<EditableTerminalCustomButton[]>(initialRows)
  const [dirty, setDirty] = useState(false)
  const { setTerminalCustomButtons } = useTerminalCustomButtonsController()

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
            updateRows([...rows, { id: `new:${Date.now()}`, label: '', value: '' }])
          }}
        >
          <Plus className="size-3" />
          {t('settings.terminal-custom-buttons.add')}
        </Button>
      }
    >
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
  )
}
