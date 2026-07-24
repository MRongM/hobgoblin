import { useEffect, useState, type ReactNode } from 'react'
import { File, Folder } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { ToggleGroup, ToggleGroupItem } from '#/web/components/ui/toggle-group.tsx'
import { useT } from '#/web/stores/i18n.ts'

export type MaterializationCandidateChoice = 'skip' | 'copy' | 'symlink'

export interface MaterializationCandidateItem {
  id: string
  label: string
  kind: 'file' | 'directory'
  disabled?: boolean
  annotation?: ReactNode
}

interface MaterializationCandidateListProps {
  items: readonly MaterializationCandidateItem[]
  choices: Readonly<Record<string, MaterializationCandidateChoice | undefined>>
  onChoiceChange: (id: string, choice: MaterializationCandidateChoice) => void
  headingId: string
  label: string
  description?: string
  emptyMessage?: string
  headerAction?: ReactNode
  disabled?: boolean
}

const CHOICES = [
  { value: 'skip', labelKey: 'action.create-worktree-bootstrap-candidate-skip' },
  { value: 'copy', labelKey: 'action.create-worktree-bootstrap-candidate-copy' },
  { value: 'symlink', labelKey: 'action.create-worktree-bootstrap-candidate-symlink' },
] satisfies Array<{ value: MaterializationCandidateChoice; labelKey: string }>

export function MaterializationCandidateList({
  items,
  choices,
  onChoiceChange,
  headingId,
  label,
  description,
  emptyMessage,
  headerAction,
  disabled = false,
}: MaterializationCandidateListProps) {
  const t = useT()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectableItems = disabled ? [] : items.filter((item) => !item.disabled)
  const selectableIds = new Set(selectableItems.map((item) => item.id))
  const selectedCount = selectableItems.reduce((count, item) => count + Number(selectedIds.has(item.id)), 0)
  const allSelected = selectableItems.length > 0 && selectedCount === selectableItems.length
  const selectAllState = selectedCount === 0 ? false : allSelected ? true : 'indeterminate'
  const bulkDisabled = disabled || selectableItems.length === 0

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => selectableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [disabled, items])

  const setItemSelected = (id: string, checked: boolean) => {
    if (!selectableIds.has(id)) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const setAllSelected = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableItems.map((item) => item.id)) : new Set())
  }

  const applyBulkChoice = (choice: MaterializationCandidateChoice) => {
    const applyToAll = selectedIds.size === 0
    for (const item of selectableItems) {
      if (applyToAll || selectedIds.has(item.id)) onChoiceChange(item.id, choice)
    }
  }

  return (
    <section className="rounded-md border border-border/80 bg-muted/20" aria-labelledby={headingId}>
      <div className="border-b border-border/70 px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 id={headingId} className="text-xs font-medium text-foreground">
              {label}
            </h3>
            {description ? <p className="text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
          </div>
          {headerAction}
        </div>
        {items.length > 0 ? (
          <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1">
            <Checkbox
              data-materialization-select-all
              aria-label={t('action.materialization-select-all')}
              checked={selectAllState}
              disabled={disabled || selectableItems.length === 0}
              onCheckedChange={(checked) => setAllSelected(checked === true)}
            />
            <span className="text-[11px] font-medium text-muted-foreground">
              {t('action.materialization-selected-count', { count: selectedCount })}
            </span>
            <div
              className="ml-auto inline-flex max-w-full flex-wrap items-center"
              role="group"
              aria-label={t('action.materialization-bulk-actions')}
            >
              {CHOICES.map((option) => {
                const choiceLabel = t(option.labelKey)
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    data-materialization-bulk-choice={option.value}
                    aria-label={t('action.materialization-bulk-choice', { choice: choiceLabel })}
                    disabled={bulkDisabled}
                    className="h-7 rounded-none px-2 text-[11px] first:rounded-l-md last:rounded-r-md [&:not(:first-child)]:-ml-px"
                    onClick={() => applyBulkChoice(option.value)}
                  >
                    {choiceLabel}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ScrollArea className="max-h-44" scrollbarMode="compact">
          <div className="divide-y divide-border/60 p-1">
            {items.map((item) => {
              const Icon = item.kind === 'directory' ? Folder : File
              const itemDisabled = disabled || item.disabled === true
              const choice = choices[item.id] ?? 'skip'
              return (
                <div
                  key={item.id}
                  data-materialization-item={item.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-sm px-2 py-1.5"
                >
                  <Checkbox
                    data-materialization-select={item.id}
                    aria-label={t('action.materialization-select-candidate', { name: item.label })}
                    checked={selectedIds.has(item.id)}
                    disabled={itemDisabled}
                    onCheckedChange={(checked) => setItemSelected(item.id, checked === true)}
                  />
                  <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="flex min-w-32 flex-1 items-center gap-2 overflow-hidden">
                    <span className="min-w-0 truncate font-mono text-xs" title={item.label}>
                      {item.label}
                    </span>
                    {item.annotation}
                  </div>
                  <ToggleGroup
                    type="single"
                    value={choice}
                    onValueChange={(next) => {
                      if (next) onChoiceChange(item.id, next as MaterializationCandidateChoice)
                    }}
                    variant="outline"
                    size="sm"
                    aria-label={item.label}
                    disabled={itemDisabled}
                    className="ml-auto max-w-full shrink-0"
                  >
                    {CHOICES.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        data-materialization-choice={option.value}
                        aria-label={`${item.label}: ${t(option.labelKey)}`}
                        className="h-7 px-2 text-[11px] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground"
                      >
                        {t(option.labelKey)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </section>
  )
}
