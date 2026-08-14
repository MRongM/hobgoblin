import { Children, type PointerEvent, type ReactNode } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { TerminalCycleButtons } from '#/web/components/terminal/TerminalCycleButtons.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface DesktopTerminalDockProps {
  terminalCount: number
  onCycleTerminal: (direction: -1 | 1) => void
  onScrollToBottom: () => void
  quickInputButtons?: ReactNode
  navigationControlsVisible?: boolean
}

const DOCK_BUTTON_CLASS = 'goblin-terminal-custom-buttons__button goblin-terminal-custom-buttons__button--medium'

export function DesktopTerminalDock({
  terminalCount,
  onCycleTerminal,
  onScrollToBottom,
  quickInputButtons,
  navigationControlsVisible = true,
}: DesktopTerminalDockProps) {
  const t = useT()
  const hasQuickInputButtons = Children.count(quickInputButtons) > 0

  return (
    <div
      className="goblin-terminal-custom-buttons goblin-terminal-custom-buttons--desktop"
      role="toolbar"
      aria-label={t('terminal.command-deck')}
    >
      <div className="goblin-terminal-custom-buttons__row">
        {navigationControlsVisible && (
          <>
            <TerminalCycleButtons
              terminalCount={terminalCount}
              onCycleTerminal={onCycleTerminal}
              buttonClassName={DOCK_BUTTON_CLASS}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={DOCK_BUTTON_CLASS}
              onPointerDown={preserveTerminalFocus}
              onClick={onScrollToBottom}
            >
              {t('terminal.command-deck.scroll-to-bottom')}
            </Button>
          </>
        )}
        {navigationControlsVisible && hasQuickInputButtons && (
          <span className="goblin-terminal-custom-buttons__separator" aria-hidden="true">
            |
          </span>
        )}
        {quickInputButtons}
      </div>
    </div>
  )
}

function preserveTerminalFocus(event: PointerEvent<HTMLButtonElement>): void {
  event.preventDefault()
}
