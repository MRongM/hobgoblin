import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import { MAX_TERMINAL_FONT_SIZE, MIN_TERMINAL_FONT_SIZE } from '#/shared/settings.ts'
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
import { moveTerminalCustomButtonRow } from '#/web/components/settings/terminal-custom-button-order.ts'
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

  function addRow() {
    updateRows([...rows, { id: `new:${Date.now()}:${rows.length}`, label: '', value: '', action: 'execute' }])
  }

  function replaceRow(rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) {
    updateRows(rows.map((item) => (item.id === rowId ? { ...item, ...patch } : item)))
  }

  function removeRow(rowId: string) {
    updateRows(rows.filter((item) => item.id !== rowId))
  }

  function moveRow(fromIndex: number, toIndex: number) {
    const nextRows = moveTerminalCustomButtonRow(rows, fromIndex, toIndex)
    if (nextRows !== rows) updateRows(nextRows)
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
          <Button type="button" data-interactive variant="ghost" size="sm" onClick={addRow}>
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
        {rows.length === 0 ? (
          <SettingsCard>
            <SettingsListItem size="lg">
              <p className="text-sm text-muted-foreground">{t('settings.terminal-custom-buttons.empty')}</p>
            </SettingsListItem>
          </SettingsCard>
        ) : (
          <TerminalCustomButtonGrid rows={rows} onRowChange={replaceRow} onRowRemove={removeRow} onRowMove={moveRow} />
        )}
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

function TerminalCustomButtonGrid({
  rows,
  onRowChange,
  onRowRemove,
  onRowMove,
}: {
  rows: EditableTerminalCustomButton[]
  onRowChange: (rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) => void
  onRowRemove: (rowId: string) => void
  onRowMove: (fromIndex: number, toIndex: number) => void
}) {
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || activeId === overId) return
    const fromIndex = rows.findIndex((row) => row.id === activeId)
    const toIndex = rows.findIndex((row) => row.id === overId)
    onRowMove(fromIndex, toIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rowIds} strategy={rectSortingStrategy}>
        <div className="grid gap-3 px-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <TerminalCustomButtonCard
              key={row.id}
              row={row}
              index={index}
              rowCount={rows.length}
              onChange={onRowChange}
              onRemove={onRowRemove}
              onMove={onRowMove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function TerminalCustomButtonCard({
  row,
  index,
  rowCount,
  onChange,
  onRemove,
  onMove,
}: {
  row: EditableTerminalCustomButton
  index: number
  rowCount: number
  onChange: (rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) => void
  onRemove: (rowId: string) => void
  onMove: (fromIndex: number, toIndex: number) => void
}) {
  const t = useT()
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const cardStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={[
        'min-w-0 rounded-[var(--goblin-brand-radius-lg,var(--radius-lg))] border border-border/60 bg-[var(--goblin-card-bg,var(--color-background))] p-2 shadow-[var(--shadow-inset-highlight)]',
        isDragging ? 'z-10 shadow-sm' : '',
      ].join(' ')}
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          data-interactive
          {...attributes}
          {...listeners}
          aria-label={t('settings.terminal-custom-buttons.reorder')}
          title={t('settings.terminal-custom-buttons.reorder')}
          className="flex size-6 touch-none cursor-grab items-center justify-center rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] text-muted-foreground hover:bg-list-row-hover hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] bg-control text-[11px] text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <SettingsSelect<'execute' | 'input'>
            id={`terminal-custom-button-action-${index}`}
            value={row.action}
            options={[
              { value: 'execute', label: t('settings.terminal-custom-buttons.action-execute') },
              { value: 'input', label: t('settings.terminal-custom-buttons.action-input') },
            ]}
            onChange={(action) => onChange(row.id, { action })}
          />
        </div>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          disabled={index === 0}
          aria-label={t('settings.terminal-custom-buttons.move-up')}
          title={t('settings.terminal-custom-buttons.move-up')}
          onClick={() => onMove(index, index - 1)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          disabled={index === rowCount - 1}
          aria-label={t('settings.terminal-custom-buttons.move-down')}
          title={t('settings.terminal-custom-buttons.move-down')}
          onClick={() => onMove(index, index + 1)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          aria-label={t('settings.terminal-custom-buttons.remove')}
          onClick={() => onRemove(row.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="grid min-w-0 gap-2">
        <Input
          id={`terminal-custom-button-label-${index}`}
          value={row.label}
          placeholder={t('settings.terminal-custom-buttons.label-placeholder')}
          aria-label={t('settings.terminal-custom-buttons.label')}
          onChange={(event) => onChange(row.id, { label: event.target.value })}
        />
        <textarea
          id={`terminal-custom-button-value-${index}`}
          className="min-h-[52px] max-h-40 w-full resize-y rounded-md border border-input-border bg-input-background px-3 py-2 text-sm text-input-foreground placeholder:text-input-placeholder focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          value={row.value}
          placeholder={t('settings.terminal-custom-buttons.value-placeholder')}
          aria-label={t('settings.terminal-custom-buttons.value')}
          onChange={(event) => onChange(row.id, { value: event.target.value })}
        />
      </div>
    </div>
  )
}
