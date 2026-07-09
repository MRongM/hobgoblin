import { FolderTree, List, type LucideIcon } from 'lucide-react'
import { Tip } from '#/web/components/Tip.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'

export type FileListViewMode = 'list' | 'tree'

const FILE_LIST_VIEW_OPTIONS: Array<{ id: FileListViewMode; labelKey: string; icon: LucideIcon }> = [
  { id: 'list', labelKey: 'file-list.view-list', icon: List },
  { id: 'tree', labelKey: 'file-list.view-tree', icon: FolderTree },
]

const FILE_LIST_VIEW_OPTION_BY_ID = Object.fromEntries(
  FILE_LIST_VIEW_OPTIONS.map((option) => [option.id, option]),
) as Record<FileListViewMode, (typeof FILE_LIST_VIEW_OPTIONS)[number]>

interface FileListViewModeControlProps {
  value: FileListViewMode
  onChange: (mode: FileListViewMode) => void
}

function nextFileListViewMode(value: FileListViewMode): FileListViewMode {
  return value === 'tree' ? 'list' : 'tree'
}

export function FileListViewModeControl({ value, onChange }: FileListViewModeControlProps) {
  const t = useT()
  const nextValue = nextFileListViewMode(value)
  const CurrentIcon = FILE_LIST_VIEW_OPTION_BY_ID[value].icon
  const label = t(FILE_LIST_VIEW_OPTION_BY_ID[nextValue].labelKey)

  return (
    <Tip label={label}>
      <Button type="button" variant="outline" size="icon-sm" aria-label={label} onClick={() => onChange(nextValue)}>
        <CurrentIcon />
      </Button>
    </Tip>
  )
}

export function FileListViewToolbar(props: FileListViewModeControlProps) {
  return (
    <div className="flex min-h-8 shrink-0 items-center justify-end border-b border-toolbar-border bg-toolbar px-2">
      <FileListViewModeControl {...props} />
    </div>
  )
}
