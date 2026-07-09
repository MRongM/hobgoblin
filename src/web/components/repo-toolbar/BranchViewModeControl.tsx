import { FolderTree, ListTree, type LucideIcon } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { BRANCH_VIEW_MODE_OPTIONS } from '#/web/components/repo-toolbar/branch-view-mode-options.ts'
import type { BranchViewMode } from '#/web/stores/repos/types.ts'

interface Props {
  value: BranchViewMode
  disabled?: boolean
  onChange: (viewMode: BranchViewMode) => void
}

type BranchViewToggleMode = (typeof BRANCH_VIEW_MODE_OPTIONS)[number]['id']

const BRANCH_VIEW_MODE_ICONS = {
  all: ListTree,
  worktrees: FolderTree,
} satisfies Record<BranchViewToggleMode, LucideIcon>

const BRANCH_VIEW_MODE_TOOLTIP_KEYS = Object.fromEntries(
  BRANCH_VIEW_MODE_OPTIONS.map((option) => [option.id, option.tooltipKey]),
) as Record<BranchViewToggleMode, string>

function visibleBranchViewMode(value: BranchViewMode): BranchViewToggleMode {
  return value === 'worktrees' ? 'worktrees' : 'all'
}

function nextBranchViewMode(value: BranchViewMode): BranchViewToggleMode {
  return visibleBranchViewMode(value) === 'all' ? 'worktrees' : 'all'
}

export function BranchViewModeControl({ value, disabled = false, onChange }: Props) {
  const t = useT()
  const currentValue = visibleBranchViewMode(value)
  const nextValue = nextBranchViewMode(value)
  const Icon = BRANCH_VIEW_MODE_ICONS[currentValue]
  const label = t(BRANCH_VIEW_MODE_TOOLTIP_KEYS[nextValue])

  return (
    <Tip label={label}>
      <span className="inline-flex shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={() => onChange(nextValue)}
        >
          <Icon />
        </Button>
      </span>
    </Tip>
  )
}
