import { forwardRef, type KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'

interface TerminalExternalInputProps {
  value: string
  placeholder: string
  submitLabel: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}

export const TerminalExternalInput = forwardRef<HTMLInputElement, TerminalExternalInputProps>(
  function TerminalExternalInput({ value, placeholder, submitLabel, onChange, onSubmit }, ref) {
    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== 'Enter') return
      event.preventDefault()
      onSubmit(value)
    }

    return (
      <div className="goblin-terminal-external-input">
        <span className="goblin-terminal-external-input__prefix">$</span>
        <input
          ref={ref}
          className="goblin-terminal-external-input__control"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="goblin-terminal-external-input__send"
          aria-label={submitLabel}
          title={submitLabel}
          onClick={() => onSubmit(value)}
        >
          <SendHorizontal />
        </Button>
      </div>
    )
  },
)
