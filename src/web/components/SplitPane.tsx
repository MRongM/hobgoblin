import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useGroupRef, usePanelRef } from 'react-resizable-panels'
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
  const afterPanelRef = usePanelRef()
  const wasAfterCollapsedRef = useRef(afterCollapsed)
  const layout = useMemo<Layout>(
    () => ({
      [BEFORE_PANEL_ID]: afterCollapsed ? 100 : 100 - afterSize,
      [AFTER_PANEL_ID]: afterCollapsed ? 0 : afterSize,
    }),
    [afterCollapsed, afterSize],
  )
  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      if (afterCollapsed) return
      const next = layout[AFTER_PANEL_ID]
      if (typeof next === 'number' && next > 0) onAfterSizeChange?.(next)
    },
    [afterCollapsed, onAfterSizeChange],
  )

  useEffect(() => {
    groupRef.current?.setLayout(layout)
  }, [groupRef, layout])

  useEffect(() => {
    const panel = afterPanelRef.current
    if (!panel) return
    if (afterCollapsed) panel.collapse()
    else if (wasAfterCollapsedRef.current) panel.resize(afterSize)
    wasAfterCollapsedRef.current = afterCollapsed
  }, [afterCollapsed, afterPanelRef, afterSize])

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation={orientation}
      disabled={disabled}
      resizeTargetMinimumSize={RESIZE_TARGET_MINIMUM_SIZE}
      defaultLayout={layout}
      onLayoutChanged={handleLayoutChanged}
      className={cn('min-h-0 min-w-0', className)}
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
        className={afterCollapsed ? 'hidden' : undefined}
      />
      <ResizablePanel
        id={AFTER_PANEL_ID}
        panelRef={afterPanelRef}
        collapsible={afterCollapsed}
        collapsedSize={0}
        minSize={afterCollapsed ? 0 : afterMinSize}
        maxSize={afterMaxSize}
        className={cn('flex min-h-0 min-w-0 overflow-hidden', afterClassName)}
      >
        <div
          aria-hidden={afterCollapsed || undefined}
          className={cn('flex min-h-0 min-w-0 flex-1', afterCollapsed && 'hidden')}
        >
          {after}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
