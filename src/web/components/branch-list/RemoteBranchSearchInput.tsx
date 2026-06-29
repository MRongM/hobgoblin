import { useEffect, useLayoutEffect, useRef, type SyntheticEvent } from 'react'
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

  useLayoutEffect(() => {
    focusInput(active, disabled, inputRef.current)
  })

  useEffect(() => {
    focusInput(active, disabled, inputRef.current)
  })

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
  if (!active || disabled) return
  input?.focus({ preventScroll: true })
}
