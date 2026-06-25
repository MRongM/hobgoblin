import { FolderTree, List, type LucideIcon } from 'lucide-react'
import { Tip } from '#/web/components/Tip.tsx'
import { ToggleGroup, ToggleGroupItem } from '#/web/components/ui/toggle-group.tsx'
import { segmentedItemClass } from '#/web/components/repo-toolbar/segmented-control.ts'
import { useT } from '#/web/stores/i18n.ts'

export type FileListViewMode = 'list' | 'tree'

const FILE_LIST_VIEW_OPTIONS: Array<{ id: FileListViewMode; labelKey: string; icon: LucideIcon }> = [
  { id: 'list', labelKey: 'file-list.view-list', icon: List },
  { id: 'tree', labelKey: 'file-list.view-tree', icon: FolderTree },
]

interface FileListViewModeControlProps {
  value: FileListViewMode
  onChange: (mode: FileListViewMode) => void
}

export function FileListViewModeControl({ value, onChange }: FileListViewModeControlProps) {
  const t = useT()

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as FileListViewMode)
      }}
      aria-label={t('file-list.view-mode')}
      variant="outline"
      size="sm"
      className="shrink-0"
    >
      {FILE_LIST_VIEW_OPTIONS.map((option) => {
        const Icon = option.icon
        const label = t(option.labelKey)
        return (
          <Tip key={option.id} label={label}>
            <ToggleGroupItem value={option.id} aria-label={label} className={segmentedItemClass(option.id === value)}>
              <Icon />
            </ToggleGroupItem>
          </Tip>
        )
      })}
    </ToggleGroup>
  )
}

export function FileListViewToolbar(props: FileListViewModeControlProps) {
  return (
    <div className="flex min-h-8 shrink-0 items-center justify-end border-b border-toolbar-border bg-toolbar px-2">
      <FileListViewModeControl {...props} />
    </div>
  )
}
