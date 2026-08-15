import { useCallback, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useGroupRef } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#/web/components/ui/resizable.tsx'
import { cn } from '#/web/lib/cn.ts'
type SplitPaneOrientation = 'horizontal' | 'vertical'

interface SplitPaneProps {
  before: ReactNode
  after: ReactNode
  afterSize: number
  onAfterSizeChange?: (size: number) => void
  orientation?: SplitPaneOrientation
  className?: string
  beforeClassName?: string
  afterClassName?: string
  beforeMinSize?: number | string
  afterMinSize?: number | string
  afterMaxSize?: number | string
  beforeCollapsed?: boolean
  afterCollapsed?: boolean
  disabled?: boolean
}

const BEFORE_PANEL_ID = 'before'
const AFTER_PANEL_ID = 'after'
const RESIZE_TARGET_MINIMUM_SIZE = { fine: 7, coarse: 20 }

export function SplitPane({
  before,
  after,
  afterSize,
  onAfterSizeChange,
  orientation = 'horizontal',
  className,
  beforeClassName,
  afterClassName,
  beforeMinSize = '12rem',
  afterMinSize = '12rem',
  afterMaxSize,
  beforeCollapsed = false,
  afterCollapsed = false,
  disabled = false,
}: SplitPaneProps) {
  const groupRef = useGroupRef()
  const layout = useMemo<Layout>(
    () => ({ [BEFORE_PANEL_ID]: 100 - afterSize, [AFTER_PANEL_ID]: afterSize }),
    [afterSize],
  )
  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      if (beforeCollapsed || afterCollapsed) return
      const next = layout[AFTER_PANEL_ID]
      if (typeof next === 'number' && next > 0) onAfterSizeChange?.(next)
    },
    [afterCollapsed, beforeCollapsed, onAfterSizeChange],
  )

  // Collapse is CSS-driven rather than panel.collapse()/dynamic minSize:
  // imperative collapse validates against the registered min-size constraints
  // and never reaches zero, and panel.resize(number) treats the value as
  // pixels. Keep the panel root in flex layout with zero growth instead of
  // display:none; react-resizable-panels registers panels by their measured
  // DOM order, so an initially hidden trailing panel would otherwise sort
  // before the visible panel and invert the drag direction after expansion.
  // Panel applies className to its nested content, which stays hidden while
  // the sibling panel absorbs the full flex share. Re-applying the controlled
  // layout on expand clears any re-measuring performed while collapsed.
  useEffect(() => {
    if (beforeCollapsed || afterCollapsed) return
    groupRef.current?.setLayout(layout)
  }, [afterCollapsed, beforeCollapsed, groupRef, layout])

  const paneCollapsed = beforeCollapsed || afterCollapsed

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation={orientation}
      disabled={disabled}
      resizeTargetMinimumSize={RESIZE_TARGET_MINIMUM_SIZE}
      defaultLayout={layout}
      onLayoutChanged={handleLayoutChanged}
      className={cn(
        'min-h-0 min-w-0',
        beforeCollapsed &&
          '[&>[data-panel]:first-child]:!grow-0 [&>[data-panel]:first-child]:!overflow-hidden',
        afterCollapsed &&
          '[&>[data-panel]:last-child]:!grow-0 [&>[data-panel]:last-child]:!overflow-hidden',
        className,
      )}
    >
      <ResizablePanel
        id={BEFORE_PANEL_ID}
        minSize={beforeMinSize}
        className={cn('flex min-h-0 min-w-0 overflow-hidden', beforeCollapsed && 'hidden', beforeClassName)}
      >
        {before}
      </ResizablePanel>
      <ResizableHandle
        orientation={orientation}
        disabled={disabled || paneCollapsed}
        className={paneCollapsed ? '!hidden' : undefined}
      />
      <ResizablePanel
        id={AFTER_PANEL_ID}
        minSize={afterMinSize}
        maxSize={afterMaxSize}
        className={cn('flex min-h-0 min-w-0 overflow-hidden', afterCollapsed && 'hidden', afterClassName)}
      >
        {after}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
