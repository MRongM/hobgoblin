import { PanelLeft, PanelTop, type LucideIcon } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

interface Props {
  value: RepoWorkspaceLayout
  onChange: (layout: RepoWorkspaceLayout) => void
}

const WORKSPACE_LAYOUT_TOOLTIP_KEYS = {
  'top-bottom': 'workspace.layout-tooltip.top-bottom',
  'left-right': 'workspace.layout-tooltip.left-right',
} satisfies Record<RepoWorkspaceLayout, string>

const WORKSPACE_LAYOUT_ICONS = {
  'top-bottom': PanelTop,
  'left-right': PanelLeft,
} satisfies Record<RepoWorkspaceLayout, LucideIcon>

function nextWorkspaceLayout(value: RepoWorkspaceLayout): RepoWorkspaceLayout {
  return value === 'left-right' ? 'top-bottom' : 'left-right'
}

export function WorkspaceLayoutControl({ value, onChange }: Props) {
  const t = useT()
  const nextLayout = nextWorkspaceLayout(value)
  const CurrentIcon = WORKSPACE_LAYOUT_ICONS[value]
  const label = t(WORKSPACE_LAYOUT_TOOLTIP_KEYS[nextLayout])

  return (
    <Tip label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="shrink-0"
        aria-label={label}
        onClick={() => onChange(nextLayout)}
      >
        <CurrentIcon />
      </Button>
    </Tip>
  )
}
