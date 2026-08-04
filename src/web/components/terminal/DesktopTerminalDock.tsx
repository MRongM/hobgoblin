import { Children, useEffect, useId, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { TerminalCycleButtons } from '#/web/components/terminal/TerminalCycleButtons.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface DesktopTerminalDockProps {
  terminalCount: number
  onCycleTerminal: (direction: -1 | 1) => void
  onScrollToBottom: () => void
  onInput: (data: string) => void
  quickInputButtons?: ReactNode
}

const DOCK_BUTTON_CLASS = 'goblin-terminal-custom-buttons__button goblin-terminal-custom-buttons__button--medium'

export function DesktopTerminalDock({
  terminalCount,
  onCycleTerminal,
  onScrollToBottom,
  onInput,
  quickInputButtons,
}: DesktopTerminalDockProps) {
  const t = useT()
  const composerId = useId()
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [command, setCommand] = useState('')
  const hasQuickInputButtons = Children.count(quickInputButtons) > 0

  useEffect(() => {
    if (composerOpen) commandInputRef.current?.focus({ preventScroll: true })
  }, [composerOpen])

  const submitCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (command.length === 0) return
    onInput(`${command}\r`)
    setCommand('')
  }

  return (
    <div
      className="goblin-terminal-custom-buttons goblin-terminal-custom-buttons--desktop"
      role="toolbar"
      aria-label={t('terminal.command-deck')}
    >
      <div className="goblin-terminal-custom-buttons__row">
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
        <Button
          type="button"
          size="sm"
          variant={composerOpen ? 'default' : 'secondary'}
          aria-expanded={composerOpen}
          aria-controls={composerId}
          className={DOCK_BUTTON_CLASS}
          onPointerDown={preserveTerminalFocus}
          onClick={() => setComposerOpen((open) => !open)}
        >
          {t(composerOpen ? 'terminal.command-deck.hide-compose' : 'terminal.command-deck.compose')}
        </Button>
        {hasQuickInputButtons && (
          <span className="goblin-terminal-custom-buttons__separator" aria-hidden="true">
            |
          </span>
        )}
        {quickInputButtons}
      </div>
      {composerOpen && (
        <form id={composerId} className="goblin-terminal-custom-buttons__composer" onSubmit={submitCommand}>
          <Input
            ref={commandInputRef}
            value={command}
            placeholder={t('terminal.command-deck.input-placeholder')}
            aria-label={t('terminal.command-deck.input-placeholder')}
            className="goblin-terminal-custom-buttons__composer-input"
            onChange={(event) => setCommand(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={command.length === 0}>
            {t('terminal.command-deck.send')}
          </Button>
        </form>
      )}
    </div>
  )
}

function preserveTerminalFocus(event: PointerEvent<HTMLButtonElement>): void {
  event.preventDefault()
}
