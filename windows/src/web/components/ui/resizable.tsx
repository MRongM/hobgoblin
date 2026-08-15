import * as React from 'react'
import * as ResizablePrimitive from 'react-resizable-panels'
import { cn } from '#/web/lib/cn.ts'
type ResizeDirection = 'horizontal' | 'vertical'
type ResizableHandleProps = React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  orientation?: ResizeDirection
}

// The handle itself takes no space so adjacent panes sit flush against each
// other. An invisible hit target straddles the boundary for dragging, and the
// line only paints on hover, drag, or keyboard focus.
const resizeHandle = {
  hitTarget: [
    'group relative z-10 flex shrink-0 items-center justify-center bg-transparent outline-none',
    'before:absolute before:z-10 before:content-[""]',
  ].join(' '),
  horizontal: 'h-full w-0 cursor-col-resize before:inset-y-0 before:left-1/2 before:w-2 before:-translate-x-1/2',
  vertical: 'h-0 w-full cursor-row-resize before:inset-x-0 before:top-1/2 before:h-2 before:-translate-y-1/2',
  visibleLine: [
    'pointer-events-none absolute z-20 rounded-full bg-brand',
    'transition-[opacity,width,height] duration-100',
    'opacity-0 group-data-[separator=hover]:opacity-60',
    'group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100',
  ].join(' '),
  lineHorizontal:
    'inset-y-0 left-1/2 w-px -translate-x-1/2 group-data-[separator=hover]:w-0.5 group-focus-visible:w-0.5 group-data-[separator=active]:w-0.5',
  lineVertical:
    'inset-x-0 top-1/2 h-px -translate-y-1/2 group-data-[separator=hover]:h-0.5 group-focus-visible:h-0.5 group-data-[separator=active]:h-0.5',
} as const

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group data-slot="resizable-panel-group" className={cn('h-full w-full', className)} {...props} />
  )
}

function ResizablePanel(props: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({ className, orientation = 'horizontal', ...props }: ResizableHandleProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(resizeHandle.hitTarget, resizeHandle[orientation], className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          resizeHandle.visibleLine,
          orientation === 'horizontal' ? resizeHandle.lineHorizontal : resizeHandle.lineVertical,
        )}
      />
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
