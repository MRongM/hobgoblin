import type { HTMLAttributes, ReactNode } from 'react'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { DEFAULT_DETAIL_PANE_SIZES, DEFAULT_WORKSPACE_LAYOUT, workspaceLayoutAxis } from '#/shared/workspace-layout.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'
const LEFT_RIGHT_BRANCH_MIN_SIZE = '14rem'
const LEFT_RIGHT_DETAIL_MIN_SIZE = '22rem'
const TOP_BOTTOM_BRANCH_MIN_SIZE = '10rem'
const TOP_BOTTOM_DETAIL_MIN_SIZE = '9rem'

interface ShellProps {
  children: ReactNode
}

interface RepoWorkspaceProps {
  branchPane: ReactNode
  detailPane: ReactNode
  layout?: RepoWorkspaceLayout
  mode?: Exclude<RepoWorkspaceMode, 'focus'>
  detailSize?: number
  onDetailSizeChange?: (size: number) => void
  branchCollapsed?: boolean
}

interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  variant?: 'plain' | 'repo' | 'detail'
  chrome?: 'toolbar' | 'topbar'
}

interface PaneProps {
  children: ReactNode
}

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  body?: ReactNode
  tone?: 'neutral' | 'success'
}

export function Toolbar({ children, className, variant = 'plain', chrome = 'toolbar', style, ...props }: ToolbarProps) {
  const { topbarHeightPx, toolbarHeightPx } = useRuntimeChromeSettings()
  const topbar = chrome === 'topbar'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b',
        topbar
          ? 'topbar-tone border-topbar-border bg-topbar text-topbar-foreground'
          : 'border-toolbar-border bg-toolbar text-toolbar-foreground',
        variant === 'repo' && 'gap-3 px-4',
        variant === 'detail' && 'min-w-0 justify-between gap-2 px-2',
        className,
      )}
      style={{ ...style, height: topbar ? topbarHeightPx : toolbarHeightPx }}
      {...props}
    >
      {children}
    </div>
  )
}

export function RepoWorkspace({
  branchPane,
  detailPane,
  layout = DEFAULT_WORKSPACE_LAYOUT,
  mode = 'split',
  detailSize = DEFAULT_DETAIL_PANE_SIZES[layout],
  onDetailSizeChange,
  branchCollapsed = false,
}: RepoWorkspaceProps) {
  const axis = workspaceLayoutAxis(layout)
  const { toolbarHeightPx } = useRuntimeChromeSettings()
  if (mode === 'split') {
    return (
      <SplitPane
        orientation={axis === 'columns' ? 'horizontal' : 'vertical'}
        before={branchPane}
        after={detailPane}
        afterSize={detailSize}
        onAfterSizeChange={onDetailSizeChange}
        beforeCollapsed={branchCollapsed}
        beforeMinSize={axis === 'columns' ? LEFT_RIGHT_BRANCH_MIN_SIZE : TOP_BOTTOM_BRANCH_MIN_SIZE}
        afterMinSize={axis === 'columns' ? LEFT_RIGHT_DETAIL_MIN_SIZE : TOP_BOTTOM_DETAIL_MIN_SIZE}
        afterMaxSize="90%"
        className="flex-1"
      />
    )
  }

  if (axis === 'columns') {
    return (
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {branchPane}
        <div
          className="absolute right-0 top-0 z-20 max-w-full overflow-hidden border-b border-l border-separator bg-detail shadow-sm"
          style={{ width: `min(100%, max(${LEFT_RIGHT_DETAIL_MIN_SIZE}, ${detailSize}%))` }}
        >
          {detailPane}
        </div>
      </div>
    )
  }

  // Collapsed top/bottom layout keeps only the detail toolbar visible.
  return (
    <div className="grid min-h-0 flex-1" style={{ gridTemplateRows: `minmax(0, 1fr) 1px ${toolbarHeightPx}px` }}>
      {branchPane}
      <WorkspaceSeparator />
      {detailPane}
    </div>
  )
}

function WorkspaceSeparator() {
  return <div className="bg-separator/70" aria-hidden />
}

export function RepoWorkspacePane({ children }: PaneProps) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}

export function ScrollPane({ children }: ShellProps) {
  return <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
}

export function EmptyState({ icon, title, body, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="space-y-1">
        {icon && (
          <div
            className={cn(
              'mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full',
              tone === 'success' ? 'bg-success-surface text-success' : 'bg-muted text-muted-foreground',
            )}
          >
            {icon}
          </div>
        )}
        <div className="text-sm font-medium text-foreground">{title}</div>
        {body && <div className="text-xs text-muted-foreground">{body}</div>}
      </div>
    </div>
  )
}
