import type { PointerEvent } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface TerminalCycleButtonsProps {
  terminalCount: number
  onCycleTerminal: (direction: -1 | 1) => void
  buttonClassName?: string
}

export function TerminalCycleButtons({ terminalCount, onCycleTerminal, buttonClassName }: TerminalCycleButtonsProps) {
  const t = useT()
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        title={t('terminal.command-deck.previous-terminal')}
        aria-label={t('terminal.command-deck.previous-terminal')}
        disabled={terminalCount <= 1}
        className={buttonClassName}
        onPointerDown={preserveTerminalFocus}
        onClick={() => onCycleTerminal(-1)}
      >
        T↑
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        title={t('terminal.command-deck.next-terminal')}
        aria-label={t('terminal.command-deck.next-terminal')}
        disabled={terminalCount <= 1}
        className={buttonClassName}
        onPointerDown={preserveTerminalFocus}
        onClick={() => onCycleTerminal(1)}
      >
        T↓
      </Button>
    </>
  )
}

function preserveTerminalFocus(event: PointerEvent<HTMLButtonElement>): void {
  event.preventDefault()
}
