import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { cn } from '#/web/lib/cn.ts'

const DEFAULT_REPOSITORY_LIST_HEIGHT = 160
const MIN_REPOSITORY_LIST_HEIGHT = 96
const RESERVED_NAVIGATION_HEIGHT = 128
const REPOSITORY_LIST_KEYBOARD_STEP = 16

interface WorkspaceRepositoryListPaneProps {
  label: string
  actions: ReactNode
  children: ReactNode
}

function clampRepositoryListHeight(height: number, maxHeight: number): number {
  return Math.min(Math.max(Math.round(height), MIN_REPOSITORY_LIST_HEIGHT), maxHeight)
}

export function WorkspaceRepositoryListPane({ label, actions, children }: WorkspaceRepositoryListPaneProps) {
  const compact = useIsCompactUi()
  const [height, setHeight] = useState(DEFAULT_REPOSITORY_LIST_HEIGHT)
  const [maximumHeight, setMaximumHeight] = useState(DEFAULT_REPOSITORY_LIST_HEIGHT)
  const [resizing, setResizing] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      resizeCleanupRef.current?.()
      resizeCleanupRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (!compact) return
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
    setResizing(false)
  }, [compact])

  const calculateMaximumHeight = useCallback(() => {
    const availableHeight = sectionRef.current?.parentElement?.parentElement?.getBoundingClientRect().height ?? 0
    const fallbackHeight = typeof window === 'undefined' ? DEFAULT_REPOSITORY_LIST_HEIGHT : window.innerHeight
    return Math.max(
      MIN_REPOSITORY_LIST_HEIGHT,
      Math.round((availableHeight || fallbackHeight) - RESERVED_NAVIGATION_HEIGHT),
    )
  }, [])

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      resizeCleanupRef.current?.()

      const startY = event.clientY
      const startHeight = height
      const maxHeight = calculateMaximumHeight()
      setMaximumHeight(maxHeight)

      function handlePointerMove(pointerEvent: PointerEvent) {
        setHeight(clampRepositoryListHeight(startHeight + pointerEvent.clientY - startY, maxHeight))
      }

      function stopListening() {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
      }

      function finish() {
        stopListening()
        resizeCleanupRef.current = null
        setResizing(false)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      resizeCleanupRef.current = stopListening
      setResizing(true)
    },
    [calculateMaximumHeight, height],
  )

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const maxHeight = calculateMaximumHeight()
      let nextHeight: number
      if (event.key === 'ArrowUp') nextHeight = height - REPOSITORY_LIST_KEYBOARD_STEP
      else if (event.key === 'ArrowDown') nextHeight = height + REPOSITORY_LIST_KEYBOARD_STEP
      else if (event.key === 'Home') nextHeight = MIN_REPOSITORY_LIST_HEIGHT
      else if (event.key === 'End') nextHeight = maxHeight
      else return

      event.preventDefault()
      setMaximumHeight(maxHeight)
      setHeight(clampRepositoryListHeight(nextHeight, maxHeight))
    },
    [calculateMaximumHeight, height],
  )

  return (
    <section ref={sectionRef} className="shrink-0" aria-label={label}>
      <div className="flex h-7 items-center gap-1 px-3 pt-1">
        <span className="min-w-0 flex-1 text-[length:var(--goblin-project-titlebar-font-size)] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
          {label}
        </span>
        {actions}
      </div>
      <div
        className={cn('relative overflow-y-auto px-1.5 pb-1.5', compact && 'max-h-40')}
        data-testid="workspace-repository-upper-list"
        style={compact ? undefined : { height }}
      >
        {children}
      </div>
      {!compact ? (
        <div
          role="separator"
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={MIN_REPOSITORY_LIST_HEIGHT}
          aria-valuemax={maximumHeight}
          aria-valuenow={height}
          tabIndex={0}
          data-testid="workspace-repository-list-resize-handle"
          data-separator={resizing ? 'active' : undefined}
          onPointerDown={startResize}
          onKeyDown={handleResizeKeyDown}
          className="group relative z-10 h-0 w-full shrink-0 cursor-row-resize bg-transparent outline-none before:absolute before:inset-x-0 before:top-1/2 before:z-10 before:h-2 before:-translate-y-1/2 before:content-['']"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-px -translate-y-1/2 rounded-full bg-brand opacity-0 transition-[opacity,height] duration-100 group-hover:h-0.5 group-hover:opacity-60 group-focus-visible:h-0.5 group-focus-visible:opacity-100 group-data-[separator=active]:h-0.5 group-data-[separator=active]:opacity-100"
          />
        </div>
      ) : null}
    </section>
  )
}
