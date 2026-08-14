import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  TERMINAL_EXTRA_KEY_ROWS,
  type TerminalExtraKey,
  type TerminalExtraKeyInput,
} from '#/web/components/terminal/terminal-extra-keys.ts'
import { TerminalCycleButtons } from '#/web/components/terminal/TerminalCycleButtons.tsx'
import type { TerminalTmuxPageDirection } from '#/shared/terminal.ts'

export type MobileTerminalDockProjection =
  | { kind: 'pending' }
  | {
      kind: 'controller'
      inputMethodVisible: boolean
      fitToWidth: boolean
      onExtraKey: (input: TerminalExtraKeyInput) => void
      onInput: (data: string) => void
      onFitToWidthChange: (fitToWidth: boolean) => void
      onEnterFocus: () => void
    }
  | {
      kind: 'readonly'
      takeoverPending: boolean
      onTakeover: () => void
      onTmuxPage?: (direction: TerminalTmuxPageDirection) => void
    }

interface MobileTerminalDockProps {
  terminalKey: string
  terminalCount: number
  projection: MobileTerminalDockProjection
  onScrollToBottom: () => void
  onCycleTerminal: (direction: -1 | 1) => void
  navigationControlsVisible?: boolean
  className?: string
}

const DIRECT_INPUT_ACTIONS = [
  { label: 'ENTER', value: '\r', title: 'Enter' },
  { label: '⌫', value: '\x7f', title: 'Backspace' },
  { label: 'CTRL+C', value: '\x03', title: 'Control C' },
  { label: 'CTRL+L', value: '\x0c', title: 'Control L' },
] as const

export function MobileTerminalDock({
  terminalKey,
  terminalCount,
  projection,
  onScrollToBottom,
  onCycleTerminal,
  navigationControlsVisible = true,
  className,
}: MobileTerminalDockProps) {
  const t = useT()
  const controllerProjection = projection.kind === 'controller' ? projection : null
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const [ctrlPressed, setCtrlPressed] = useState(false)
  const [altPressed, setAltPressed] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [command, setCommand] = useState('')

  useLayoutEffect(() => {
    setCtrlPressed(false)
    setAltPressed(false)
    setComposeOpen(false)
    setCommand('')
  }, [projection.kind, terminalKey])

  useEffect(() => {
    if (composeOpen) commandInputRef.current?.focus({ preventScroll: true })
  }, [composeOpen])

  const clearModifiers = () => {
    setCtrlPressed(false)
    setAltPressed(false)
  }
  const sendDirectInput = (data: string) => {
    if (!controllerProjection) return
    clearModifiers()
    controllerProjection.onInput(data)
  }
  const handleExtraKey = (key: TerminalExtraKey | 'control' | 'alt') => {
    if (key === 'control') {
      setCtrlPressed((active) => !active)
      return
    }
    if (key === 'alt') {
      setAltPressed((active) => !active)
      return
    }
    if (!controllerProjection) return
    controllerProjection.onExtraKey({ key, ctrlPressed, altPressed })
    clearModifiers()
  }
  const submitCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (command.length === 0) return
    sendDirectInput(`${command}\r`)
    setCommand('')
  }

  return (
    <div
      className={cn('goblin-terminal-command-deck', className)}
      role="toolbar"
      aria-label={t('terminal.command-deck')}
    >
      {controllerProjection?.inputMethodVisible &&
        TERMINAL_EXTRA_KEY_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="goblin-terminal-command-deck__row goblin-terminal-command-deck__row--extra-keys"
          >
            {row.map((key) => {
              const active = key.key === 'control' ? ctrlPressed : key.key === 'alt' ? altPressed : false
              const label = active ? `${key.label} on` : key.label
              return (
                <Button
                  key={key.key}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'secondary'}
                  title={label}
                  aria-pressed={key.key === 'control' || key.key === 'alt' ? active : undefined}
                  className={cn('goblin-terminal-command-deck__btn', active && 'is-active')}
                  onPointerDown={preserveTerminalFocus}
                  onClick={() => handleExtraKey(key.key)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        ))}

      <div key="actions" className="goblin-terminal-command-deck__row goblin-terminal-command-deck__row--actions">
        {navigationControlsVisible && (
          <>
            <TerminalCycleButtons
              terminalCount={terminalCount}
              onCycleTerminal={onCycleTerminal}
              buttonClassName="goblin-terminal-command-deck__btn"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="goblin-terminal-command-deck__btn goblin-terminal-command-deck__btn--action"
              onPointerDown={preserveTerminalFocus}
              onClick={onScrollToBottom}
            >
              {t('terminal.command-deck.scroll-to-bottom')}
            </Button>
          </>
        )}
        {controllerProjection && (
          <>
            {DIRECT_INPUT_ACTIONS.map((action) => (
              <Button
                key={action.title}
                type="button"
                size="sm"
                variant="secondary"
                title={action.title}
                className="goblin-terminal-command-deck__btn"
                onPointerDown={preserveTerminalFocus}
                onClick={() => sendDirectInput(action.value)}
              >
                {action.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={composeOpen ? 'default' : 'secondary'}
              aria-pressed={composeOpen}
              className="goblin-terminal-command-deck__btn goblin-terminal-command-deck__btn--action"
              onPointerDown={preserveTerminalFocus}
              onClick={() => setComposeOpen((open) => !open)}
            >
              {t(composeOpen ? 'terminal.command-deck.hide-compose' : 'terminal.command-deck.compose')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="goblin-terminal-command-deck__btn goblin-terminal-command-deck__btn--action"
              onPointerDown={preserveTerminalFocus}
              onClick={() => controllerProjection.onFitToWidthChange(!controllerProjection.fitToWidth)}
            >
              {t(
                controllerProjection.fitToWidth
                  ? 'terminal.command-deck.original-width'
                  : 'terminal.command-deck.fit-width',
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="goblin-terminal-command-deck__btn goblin-terminal-command-deck__btn--action"
              onPointerDown={preserveTerminalFocus}
              onClick={controllerProjection.onEnterFocus}
            >
              {t('terminal.command-deck.focus')}
            </Button>
          </>
        )}
        {projection.kind === 'readonly' && projection.onTmuxPage && (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              title={t('terminal.command-deck.page-up')}
              aria-label={t('terminal.command-deck.page-up')}
              className="goblin-terminal-command-deck__btn"
              onPointerDown={preserveTerminalFocus}
              onClick={() => projection.onTmuxPage?.('up')}
            >
              ⇈
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              title={t('terminal.command-deck.page-down')}
              aria-label={t('terminal.command-deck.page-down')}
              className="goblin-terminal-command-deck__btn"
              onPointerDown={preserveTerminalFocus}
              onClick={() => projection.onTmuxPage?.('down')}
            >
              ⇊
            </Button>
          </>
        )}
        {projection.kind === 'readonly' && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="goblin-terminal-command-deck__btn goblin-terminal-command-deck__btn--action"
            disabled={projection.takeoverPending}
            onPointerDown={preserveTerminalFocus}
            onClick={projection.onTakeover}
          >
            {projection.takeoverPending ? `${t('terminal.takeover')}…` : t('terminal.takeover')}
          </Button>
        )}
      </div>

      {controllerProjection && composeOpen && (
        <form className="goblin-terminal-command-deck__composer" onSubmit={submitCommand}>
          <Input
            ref={commandInputRef}
            value={command}
            placeholder={t('terminal.command-deck.input-placeholder')}
            aria-label={t('terminal.command-deck.input-placeholder')}
            className="goblin-terminal-command-deck__composer-input"
            onChange={(event) => setCommand(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={command.length === 0} onPointerDown={preserveTerminalFocus}>
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
