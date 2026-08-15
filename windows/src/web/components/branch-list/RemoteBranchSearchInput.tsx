import { useEffect, useRef, type SyntheticEvent } from 'react'
import { Input } from '#/web/components/ui/input.tsx'

interface Props {
  id: string
  value: string
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  active?: boolean
  onChange: (value: string) => void
}

export function RemoteBranchSearchInput({
  id,
  value,
  placeholder,
  ariaLabel,
  disabled = false,
  active = true,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) focusInput(active, disabled, inputRef.current)
    })
    return () => {
      cancelled = true
    }
  }, [active, disabled])

  return (
    <Input
      ref={inputRef}
      id={id}
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={stopSelectEvent}
      onKeyDownCapture={stopSelectEvent}
      onPointerDown={stopSelectEvent}
      onPointerDownCapture={stopSelectEvent}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className="h-8"
    />
  )
}

function stopSelectEvent(event: SyntheticEvent) {
  event.stopPropagation()
}

function focusInput(active: boolean, disabled: boolean, input: HTMLInputElement | null) {
  if (!active || disabled || !input || document.activeElement === input) return
  input.focus({ preventScroll: true })
}
