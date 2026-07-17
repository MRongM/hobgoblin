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
      if (afterCollapsed) return
      const next = layout[AFTER_PANEL_ID]
      if (typeof next === 'number' && next > 0) onAfterSizeChange?.(next)
    },
    [afterCollapsed, onAfterSizeChange],
  )

  // Collapse is CSS-driven (display:none on the trailing panel) rather than
  // panel.collapse()/dynamic minSize: imperative collapse validates against
  // the registered min-size constraints and never reaches zero, and
  // panel.resize(number) treats the value as pixels, so both directions end
  // up clamped at the minimum size. Hiding the panel lets the leading pane
  // absorb the full flex share while the group keeps its layout state.
  // The rule lives on the group because Panel does not forward className
  // to its DOM element. Re-applying the controlled layout on expand clears
  // any re-measuring the library did while the panel was display:none.
  useEffect(() => {
    if (afterCollapsed) return
    groupRef.current?.setLayout(layout)
  }, [afterCollapsed, groupRef, layout])

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation={orientation}
      disabled={disabled}
      resizeTargetMinimumSize={RESIZE_TARGET_MINIMUM_SIZE}
      defaultLayout={layout}
      onLayoutChanged={handleLayoutChanged}
      className={cn('min-h-0 min-w-0', afterCollapsed && '[&>[data-panel]:last-child]:!hidden', className)}
    >
      <ResizablePanel
        id={BEFORE_PANEL_ID}
        minSize={beforeMinSize}
        className={cn('flex min-h-0 min-w-0 overflow-hidden', beforeClassName)}
      >
        {before}
      </ResizablePanel>
      <ResizableHandle
        orientation={orientation}
        disabled={disabled || afterCollapsed}
        className={afterCollapsed ? '!hidden' : undefined}
      />
      <ResizablePanel
        id={AFTER_PANEL_ID}
        minSize={afterMinSize}
        maxSize={afterMaxSize}
        className={cn('flex min-h-0 min-w-0 overflow-hidden', afterClassName)}
      >
        {after}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
