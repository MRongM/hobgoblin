import { Plus, X, ChevronDown, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '#/web/lib/cn.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { ConfirmCheckbox } from '#/web/components/ConfirmCheckbox.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { DelegatedTooltipLayer, DELEGATED_TOOLTIP_DEFAULTS } from '#/web/components/DelegatedTooltipLayer.tsx'
import { createRestrictToTabStripBounds } from '#/web/components/tab-strip/drag-bounds.ts'
import { useT } from '#/web/stores/i18n.ts'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import type { TerminalCloseOptions, TerminalSessionSummary } from '#/web/components/terminal/types.ts'
import type { TerminalCloseResult } from '#/shared/terminal.ts'
import { ToolbarTabList, ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { ToolbarClosableTab } from '#/web/components/tab-strip/ToolbarClosableTab.tsx'
import { toolbarTabButtonClassName, toolbarTabChromeClassName } from '#/web/components/tab-strip/tab-variants.ts'
import { useFocusRegistry, type FocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { useSortableTab } from '#/web/components/tab-strip/useSortableTab.ts'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '#/web/components/ui/context-menu.tsx'
import type { TerminalLaunchMode } from '#/shared/terminal.ts'

interface TerminalTabsProps {
  worktreeTerminalKey: string
  sessions: TerminalSessionSummary[]
  detailId: string
  responsiveCompact?: boolean
  panelActive?: boolean
  focusMode?: boolean
  focusRegistry?: FocusRegistry<string, HTMLButtonElement>
  emptyFocusKey?: string
  onNew: (launchMode: TerminalLaunchMode) => void
  onSelect: (worktreeTerminalKey: string, key: string) => void
  onScrollToBottom: (key: string) => void
  onFocusTerminal?: (key: string) => void
  onClose: (key: string, options?: TerminalCloseOptions) => void | Promise<TerminalCloseResult>
  onReorder: (worktreeTerminalKey: string, orderedKeys: string[]) => void
  onNavigateOut?: (direction: 'prev' | 'next' | 'first' | 'last') => void
}

export const EMPTY_TERMINAL_TAB_FOCUS_KEY = '__terminal-empty__'

const TERMINAL_TAB_TOOLTIP_SELECTOR = '[data-terminal-tab-tooltip-id]'

type TerminalCloseScope = 'current' | 'others' | 'all'
type PendingBulkClose = { kind: 'all' } | { kind: 'others'; targetKey: string }

export function TerminalTabs({
  worktreeTerminalKey,
  sessions,
  detailId,
  responsiveCompact,
  panelActive,
  focusMode,
  focusRegistry: externalFocusRegistry,
  emptyFocusKey = EMPTY_TERMINAL_TAB_FOCUS_KEY,
  onNew,
  onSelect,
  onScrollToBottom,
  onFocusTerminal = () => {},
  onClose,
  onReorder,
  onNavigateOut,
}: TerminalTabsProps) {
  const t = useT()
  const showCollapsedTabs = !!responsiveCompact
  const selectedSession = sessions.find((s) => s.selected) ?? sessions[0]
  const internalFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const focusRegistry = externalFocusRegistry ?? internalFocusRegistry
  const viewportRef = useRef<HTMLDivElement>(null)
  const prevSessionCountRef = useRef(sessions.length)
  const newButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null)
  const [closeTmuxSession, setCloseTmuxSession] = useState(false)
  const [pendingBulkClose, setPendingBulkClose] = useState<PendingBulkClose | null>(null)
  const pendingCloseSession = sessions.find((session) => session.key === pendingCloseKey) ?? null
  const pendingBulkCloseKeys =
    pendingBulkClose?.kind === 'others'
      ? sessions.filter((session) => session.key !== pendingBulkClose.targetKey).map((session) => session.key)
      : sessions.map((session) => session.key)

  useLayoutEffect(() => {
    if (sessions.length <= prevSessionCountRef.current) {
      prevSessionCountRef.current = sessions.length
      return
    }
    prevSessionCountRef.current = sessions.length
    const viewport = viewportRef.current
    if (!viewport) return
    if (viewport.scrollWidth <= viewport.clientWidth) return
    viewport.style.scrollBehavior = 'smooth'
    viewport.scrollLeft = viewport.scrollWidth
    // Reset scroll-behavior on the next frame so subsequent user-driven scrolls
    // (e.g. dragging the scrollbar) are not animated, while the in-flight scroll
    // initiated above still benefits from the smooth behavior.
    const frame = requestAnimationFrame(() => {
      viewport.style.scrollBehavior = ''
    })
    return () => cancelAnimationFrame(frame)
  }, [sessions.length])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const restrictToVisibleTabStrip = useMemo(
    () => createRestrictToTabStripBounds({ rightBoundaryRef: newButtonRef }),
    [],
  )

  // Must be called unconditionally so the hook order stays stable across renders
  // (e.g. when sessions goes from 0 → 1 or back, which would otherwise bypass the
  // helper below and trigger React's "Rendered more hooks than during the previous render").
  const sortableIds = useMemo(() => sessions.map((s) => s.key), [sessions])

  const handleSelect = useCallback(
    (key: string) => {
      const session = sessions.find((s) => s.key === key)
      if (!session) return
      if (session.selected && panelActive) {
        onScrollToBottom(key)
      } else {
        onSelect(worktreeTerminalKey, key)
      }
      onFocusTerminal(key)
    },
    [sessions, onSelect, onScrollToBottom, onFocusTerminal, worktreeTerminalKey, panelActive],
  )

  const handleClose = useCallback((event: React.MouseEvent, key: string) => {
    event.preventDefault()
    event.stopPropagation()
    setCloseTmuxSession(false)
    setPendingCloseKey(key)
  }, [])

  const confirmClose = useCallback(() => {
    const key = pendingCloseKey
    if (!key) return
    const isActive = sessions.find((s) => s.key === key)?.selected ?? false
    const idx = sessions.findIndex((s) => s.key === key)
    const nextKey = sessions[idx + 1]?.key ?? sessions[idx - 1]?.key ?? null

    const finish = () => {
      setPendingCloseKey(null)
      setCloseTmuxSession(false)
      if (isActive && nextKey) focusRegistry.focus(nextKey)
    }
    const result = closeTmuxSession ? onClose(key, { closeTmuxSession: true }) : onClose(key)
    if (!result) {
      finish()
      return
    }
    return result.then(
      (closeResult) => {
        if (!closeResult.ok) {
          toast.error(t('terminal.close-tmux-session-failed'), { description: t(closeResult.message) })
          return
        }
        finish()
      },
      () => {
        toast.error(t('terminal.close-tmux-session-failed'), { description: t('error.tmux-command-failed') })
      },
    )
  }, [closeTmuxSession, focusRegistry, onClose, pendingCloseKey, sessions, t])

  const confirmBulkClose = useCallback(() => {
    setPendingBulkClose(null)
    for (const key of pendingBulkCloseKeys) {
      onClose(key)
    }
  }, [onClose, pendingBulkCloseKeys])

  const requestContextClose = useCallback((scope: TerminalCloseScope, targetKey: string) => {
    if (scope === 'current') {
      setCloseTmuxSession(false)
      setPendingCloseKey(targetKey)
      return
    }
    setPendingBulkClose(scope === 'others' ? { kind: 'others', targetKey } : { kind: 'all' })
  }, [])

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, sessionKey: string) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
      e.preventDefault()
      const keys = sessions.map((s) => s.key)
      const idx = keys.indexOf(sessionKey)
      if (showCollapsedTabs) {
        if (e.key === 'ArrowLeft') onNavigateOut?.('prev')
        else if (e.key === 'ArrowRight') onNavigateOut?.('next')
        else focusRegistry.focus(sessionKey)
        return
      }
      if (e.key === 'Home') {
        const firstKey = keys[0]
        if (firstKey) focusRegistry.focus(firstKey)
        return
      }
      if (e.key === 'End') {
        const lastKey = keys[keys.length - 1]
        if (lastKey) focusRegistry.focus(lastKey)
        return
      }
      if (e.key === 'ArrowLeft' && idx === 0) {
        onNavigateOut?.('prev')
        return
      }
      if (e.key === 'ArrowRight' && idx === keys.length - 1) {
        onNavigateOut?.('next')
        return
      }
      const nextIdx = e.key === 'ArrowLeft' ? (idx - 1 + keys.length) % keys.length : (idx + 1) % keys.length
      const nextKey = keys[nextIdx]
      if (nextKey) {
        focusRegistry.focus(nextKey)
      }
    },
    [focusRegistry, onNavigateOut, sessions, showCollapsedTabs],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return
      const activeId = String(active.id)
      const overId = String(over.id)
      if (activeId === overId) return
      const oldIndex = sessions.findIndex((s) => s.key === activeId)
      const newIndex = sessions.findIndex((s) => s.key === overId)
      if (oldIndex === -1 || newIndex === -1) return
      const next = arrayMove(
        sessions.map((s) => s.key),
        oldIndex,
        newIndex,
      )
      onReorder(worktreeTerminalKey, next)
    },
    [sessions, onReorder, worktreeTerminalKey],
  )

  if (sessions.length === 0) {
    return (
      <Button
        ref={focusRegistry.setRef(emptyFocusKey)}
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 border border-separator"
        id={`${detailId}-terminal-tab`}
        onClick={() => onNew('native')}
        aria-label={t('terminal.new')}
        title={t('terminal.new')}
      >
        <Terminal className="size-4" />
      </Button>
    )
  }

  if (!selectedSession) return null

  function renderCompactTabsBody() {
    return (
      <ToolbarTabStripBody className="w-full gap-0">
        <DropdownMenu>
          <TerminalTabTooltipLayer sessions={sessions} focusMode={focusMode}>
            <TerminalTabChrome
              session={selectedSession}
              isActive={!!panelActive && selectedSession.selected}
              isSelected={selectedSession.selected}
              contextSessionCount={sessions.length}
              compactSwitcher
              tabId={`${detailId}-terminal-tab`}
              buttonRef={focusRegistry.setRef(selectedSession.key)}
              buttonWrapper={(button) => <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>}
              onSelect={handleSelect}
              onClose={handleClose}
              onNew={onNew}
              onRequestClose={requestContextClose}
              onKeyDown={handleTabKeyDown}
              t={t}
            />
          </TerminalTabTooltipLayer>
          <DropdownMenuContent align="start" className="flex w-max flex-col !overflow-hidden">
            <ScrollArea className="max-h-[200px]" scrollbarMode="compact">
              {sessions.map((session) => (
                <div key={session.key} className="group relative flex items-center">
                  <DropdownMenuItem
                    className={cn(
                      'min-w-0 flex-1 gap-2 pr-8',
                      session.selected && 'bg-selected text-selected-foreground',
                    )}
                    onSelect={() => handleSelect(session.key)}
                    aria-label={session.fullTitle ?? session.title}
                    aria-current={session.selected ? 'true' : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    {session.hasBell && <TerminalBellDot label={t('terminal.bell-unread')} ping={false} />}
                  </DropdownMenuItem>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="absolute right-1 h-6 w-6 text-muted-foreground"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => handleClose(event, session.key)}
                    title={t('terminal.close-named', { name: session.title })}
                    aria-label={t('terminal.close-named', { name: session.title })}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={() => onNew('native')}>
              <Plus size={14} />
              {t('terminal.new')}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => onNew('tmux-if-available')}>
              <Terminal size={14} />
              {t('terminal.new-with-tmux')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              variant="destructive"
              onSelect={() => setPendingBulkClose({ kind: 'all' })}
            >
              <X size={14} />
              {t('terminal.close-all')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarTabStripBody>
    )
  }

  function renderScrollableTabsBody() {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVisibleTabStrip]}
        onDragEnd={handleDragEnd}
      >
        <ToolbarTabStripBody scroll className="w-fit gap-0">
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            <TerminalTabTooltipLayer
              sessions={sessions}
              focusMode={focusMode}
              role="tablist"
              aria-label={t('terminal.sessions')}
              className="min-w-min"
            >
              {sessions.map((session, index) => (
                <SortableTerminalTab
                  key={session.key}
                  session={session}
                  isActive={!!panelActive && session.selected}
                  isSelected={session.selected}
                  index={index}
                  total={sessions.length}
                  tabId={index === 0 ? `${detailId}-terminal-tab` : `${detailId}-terminal-tab-${session.key}`}
                  focusRegistry={focusRegistry}
                  onSelect={handleSelect}
                  onClose={handleClose}
                  onNew={onNew}
                  onRequestClose={requestContextClose}
                  onKeyDown={handleTabKeyDown}
                  t={t}
                />
              ))}
            </TerminalTabTooltipLayer>
          </SortableContext>
          <Button
            ref={newButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onNew('native')}
            aria-label={t('terminal.new')}
            title={t('terminal.new')}
          >
            <Plus size={14} />
          </Button>
        </ToolbarTabStripBody>
      </DndContext>
    )
  }

  return (
    <>
      <ToolbarTabStrip
        compact={showCollapsedTabs}
        compactContent={renderCompactTabsBody()}
        scrollContent={renderScrollableTabsBody()}
        viewportRef={viewportRef}
      />
      <ConfirmDialog
        open={!!pendingCloseSession}
        title={t('terminal.close-confirm-title')}
        message={
          <div className="flex flex-col gap-3">
            <p>{t('terminal.close-confirm-body', { name: pendingCloseSession?.title ?? '' })}</p>
            {pendingCloseSession?.tmuxBacked === true && pendingCloseSession.tmuxCloseSupported === false && (
              <p className="text-xs text-muted-foreground">
                {t('terminal.close-tmux-session-exit-required')}
              </p>
            )}
            {pendingCloseSession?.tmuxBacked === true && pendingCloseSession.tmuxCloseSupported !== false && (
              <ConfirmCheckbox checked={closeTmuxSession} onCheckedChange={setCloseTmuxSession} destructive>
                <span className="flex flex-col gap-1">
                  <span>{t('terminal.close-tmux-session')}</span>
                  <span className="text-xs text-muted-foreground">{t('terminal.close-tmux-session-hint')}</span>
                </span>
              </ConfirmCheckbox>
            )}
          </div>
        }
        confirmLabel={t('terminal.close-confirm-confirm')}
        destructive
        onCancel={() => {
          setPendingCloseKey(null)
          setCloseTmuxSession(false)
        }}
        onConfirm={confirmClose}
      />
      <ConfirmDialog
        open={pendingBulkClose?.kind === 'all'}
        title={t('terminal.close-all-confirm-title')}
        message={t('terminal.close-all-confirm-body', { count: sessions.length })}
        confirmLabel={t('terminal.close-all-confirm-confirm')}
        destructive
        onCancel={() => setPendingBulkClose(null)}
        onConfirm={confirmBulkClose}
      />
      <ConfirmDialog
        open={pendingBulkClose?.kind === 'others'}
        title={t('terminal.close-others-confirm-title')}
        message={t('terminal.close-others-confirm-body', { count: pendingBulkCloseKeys.length })}
        confirmLabel={t('terminal.close-others-confirm-confirm')}
        destructive
        onCancel={() => setPendingBulkClose(null)}
        onConfirm={confirmBulkClose}
      />
    </>
  )
}

interface TerminalTabProps {
  session: TerminalSessionSummary
  isActive: boolean
  isSelected: boolean
  index?: number
  total?: number
  contextSessionCount?: number
  tabId: string
  focusRegistry: FocusRegistry<string, HTMLButtonElement>
  onSelect: (key: string) => void
  onClose: (event: React.MouseEvent, key: string) => void
  onNew: (launchMode: TerminalLaunchMode) => void
  onRequestClose: (scope: TerminalCloseScope, key: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, sessionKey: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

interface TerminalTabChromeProps {
  session: TerminalSessionSummary
  isActive: boolean
  isSelected: boolean
  index?: number
  total?: number
  contextSessionCount?: number
  isDragging?: boolean
  fillWidth?: boolean
  compactSwitcher?: boolean
  tabId: string
  buttonRef: ((node: HTMLButtonElement | null) => void) | undefined
  buttonProps?: ComponentPropsWithoutRef<'button'>
  buttonWrapper?: (button: ReactElement) => ReactNode
  onSelect: (key: string) => void
  onClose: (event: React.MouseEvent, key: string) => void
  onNew: (launchMode: TerminalLaunchMode) => void
  onRequestClose: (scope: TerminalCloseScope, key: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, sessionKey: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

function TerminalTabChrome({
  session,
  isActive,
  isSelected,
  index,
  total,
  contextSessionCount,
  isDragging = false,
  fillWidth = false,
  compactSwitcher = false,
  tabId,
  buttonRef,
  buttonProps,
  buttonWrapper,
  onSelect,
  onClose,
  onNew,
  onRequestClose,
  onKeyDown,
  t,
}: TerminalTabChromeProps) {
  const terminalLabelBase = session.originalTitle ?? session.fullTitle ?? session.title
  const terminalLabel = session.hasBell ? `${terminalLabelBase} — ${t('terminal.bell-unread')}` : terminalLabelBase
  const collectionAria =
    index !== undefined && total !== undefined
      ? {
          'aria-posinset': index + 1,
          'aria-setsize': total,
        }
      : {}
  return (
    <ToolbarClosableTab
      containerProps={{
        'data-terminal-tab-tooltip-id': session.key,
        // Opt the whole tab (padding + close button) out of the Electron
        // window drag region: in detail focus mode this toolbar becomes the
        // OS drag area (`.topbar`), which would otherwise swallow the pointer
        // events dnd-kit needs for tab reordering.
        'data-interactive': true,
      }}
      containerClassName={cn(
        toolbarTabChromeClassName({ variant: 'terminal', active: isActive, dragging: isDragging }),
        fillWidth && 'w-full',
        compactSwitcher && 'min-w-0 w-full max-w-[100dvw] shrink',
      )}
      contextMenu={
        <TerminalTabContextMenu
          sessionKey={session.key}
          sessionCount={contextSessionCount ?? total ?? 1}
          onNew={onNew}
          onRequestClose={onRequestClose}
          t={t}
        />
      }
      buttonRef={buttonRef}
      buttonProps={
        compactSwitcher
          ? {
              ...buttonProps,
              id: tabId,
              'aria-label': t('terminal.sessions'),
              title: terminalLabel,
            }
          : {
              ...buttonProps,
              role: 'tab',
              id: tabId,
              'aria-selected': isSelected,
              'aria-label': terminalLabel,
              ...collectionAria,
              tabIndex: isSelected ? 0 : -1,
              onClick: () => onSelect(session.key),
              onKeyDown: (e) => onKeyDown(e, session.key),
            }
      }
      buttonWrapper={buttonWrapper}
      buttonClassName={toolbarTabButtonClassName('terminal')}
      closeLabel={t('terminal.close-named', { name: session.title })}
      closeVisible={compactSwitcher || isActive}
      onClose={(e) => onClose(e, session.key)}
    >
      <span className="truncate">{session.title}</span>
      {session.hasBell && <TerminalBellDot label={t('terminal.bell-unread')} pingClassName="opacity-100" />}
      {compactSwitcher && <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
    </ToolbarClosableTab>
  )
}

function SortableTerminalTab({
  session,
  isActive,
  isSelected,
  index,
  total,
  contextSessionCount,
  tabId,
  focusRegistry,
  onSelect,
  onClose,
  onNew,
  onRequestClose,
  onKeyDown,
  t,
}: TerminalTabProps) {
  const sortable = useSortableTab(session.key, { onButtonRef: focusRegistry.setRef(session.key) })

  return (
    <div
      ref={sortable.setContainerRef}
      style={sortable.style}
      className="min-w-28 max-w-56 flex-[1_1_14rem] touch-none select-none"
    >
      <TerminalTabChrome
        session={session}
        isActive={isActive}
        isSelected={isSelected}
        index={index}
        total={total}
        contextSessionCount={contextSessionCount}
        isDragging={sortable.isDragging}
        fillWidth
        tabId={tabId}
        buttonRef={sortable.setButtonRef}
        buttonProps={{ ...sortable.attributes, ...sortable.sortableListeners }}
        onSelect={onSelect}
        onClose={onClose}
        onNew={onNew}
        onRequestClose={onRequestClose}
        onKeyDown={(e) => {
          sortable.sortableOnKeyDown?.(e)
          if (e.defaultPrevented || sortable.isDragging) return
          onKeyDown(e, session.key)
        }}
        t={t}
      />
    </div>
  )
}

function TerminalTabContextMenu({
  sessionKey,
  sessionCount,
  onNew,
  onRequestClose,
  t,
}: {
  sessionKey: string
  sessionCount: number
  onNew: (launchMode: TerminalLaunchMode) => void
  onRequestClose: (scope: TerminalCloseScope, key: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={() => onNew('native')}>
        <Plus />
        {t('terminal.new')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onNew('tmux-if-available')}>
        <Terminal />
        {t('terminal.new-with-tmux')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onRequestClose('current', sessionKey)}>
        <X />
        {t('terminal.close-current')}
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        disabled={sessionCount <= 1}
        onSelect={() => onRequestClose('others', sessionKey)}
      >
        <X />
        {t('terminal.close-others')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onRequestClose('all', sessionKey)}>
        <X />
        {t('terminal.close-all')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

interface TerminalTabTooltipLayerProps extends ComponentPropsWithoutRef<'div'> {
  sessions: TerminalSessionSummary[]
  focusMode?: boolean
}

function TerminalTabTooltipLayer({ sessions, focusMode, children, ...props }: TerminalTabTooltipLayerProps) {
  return (
    <DelegatedTooltipLayer
      items={sessions}
      selector={TERMINAL_TAB_TOOLTIP_SELECTOR}
      attributeName="data-terminal-tab-tooltip-id"
      getItemId={(session) => session.key}
      renderTooltip={(session) => {
        const title = session.originalTitle ?? session.fullTitle ?? session.title
        return <div className="truncate text-xs font-semibold text-foreground">{title}</div>
      }}
      placement={focusMode ? 'bottom-start' : 'top-start'}
      delayMs={DELEGATED_TOOLTIP_DEFAULTS.delayMs}
      tooltipClassName="px-3 py-2"
      asChild
    >
      <ToolbarTabList aria-orientation={props.role === 'tablist' ? 'horizontal' : undefined} {...props}>
        {children}
      </ToolbarTabList>
    </DelegatedTooltipLayer>
  )
}

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const result = array.slice()
  const [removed] = result.splice(from, 1)
  if (removed === undefined) return result
  result.splice(to, 0, removed)
  return result
}
