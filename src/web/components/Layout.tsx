import type { HTMLAttributes, ReactNode } from 'react'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { DEFAULT_DETAIL_PANE_SIZES, DEFAULT_WORKSPACE_LAYOUT } from '#/shared/workspace-layout.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'
const LEFT_RIGHT_BRANCH_MIN_SIZE = '14rem'
const LEFT_RIGHT_DETAIL_MIN_SIZE = '22rem'

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
  detailSize = DEFAULT_DETAIL_PANE_SIZES[layout],
  onDetailSizeChange,
  branchCollapsed = false,
}: RepoWorkspaceProps) {
  return (
    <SplitPane
      orientation="horizontal"
      before={branchPane}
      after={detailPane}
      afterSize={detailSize}
      onAfterSizeChange={onDetailSizeChange}
      beforeCollapsed={branchCollapsed}
      beforeMinSize={LEFT_RIGHT_BRANCH_MIN_SIZE}
      afterMinSize={LEFT_RIGHT_DETAIL_MIN_SIZE}
      afterMaxSize="90%"
      className="flex-1"
    />
  )
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
