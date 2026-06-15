import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'

const MIN_TEXTAREA_HEIGHT = 26
const MAX_TEXTAREA_HEIGHT = 220

interface TerminalExternalInputProps {
  value: string
  placeholder: string
  submitLabel: string
  resizeLabel: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onDragOver?: (event: DragEvent<HTMLTextAreaElement>) => void
  onDrop?: (event: DragEvent<HTMLTextAreaElement>) => void
}

export const TerminalExternalInput = forwardRef<HTMLTextAreaElement, TerminalExternalInputProps>(
  function TerminalExternalInput({
    value,
    placeholder,
    submitLabel,
    resizeLabel,
    onChange,
    onSubmit,
    onPaste,
    onDragOver,
    onDrop,
  }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
    const [height, setHeight] = useState<number | null>(null)
    const setTextareaRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node
        assignRef(ref, node)
      },
      [ref],
    )

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key.toLowerCase() === 'c' && event.ctrlKey && !event.altKey && !event.metaKey && value.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        onChange('')
        return
      }
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      onSubmit(value)
    }

    function handleResizeStart(event: PointerEvent<HTMLButtonElement>) {
      const textarea = textareaRef.current
      if (!textarea) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const startHeight = (height ?? textarea.getBoundingClientRect().height) || MIN_TEXTAREA_HEIGHT
      dragRef.current = { startY: event.clientY, startHeight }
    }

    function handleResizeMove(event: PointerEvent<HTMLButtonElement>) {
      const drag = dragRef.current
      if (!drag) return
      event.preventDefault()
      const maxHeight = Math.min(MAX_TEXTAREA_HEIGHT, Math.floor(globalThis.innerHeight * 0.32) || MAX_TEXTAREA_HEIGHT)
      setHeight(clamp(drag.startHeight + drag.startY - event.clientY, MIN_TEXTAREA_HEIGHT, maxHeight))
    }

    function handleResizeEnd(event: PointerEvent<HTMLButtonElement>) {
      if (!dragRef.current) return
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      dragRef.current = null
    }

    return (
      <div className="goblin-terminal-external-input">
        <button
          type="button"
          className="goblin-terminal-external-input__resize"
          aria-label={resizeLabel}
          title={resizeLabel}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        >
          <span aria-hidden="true" />
        </button>
        <span className="goblin-terminal-external-input__prefix">&gt;</span>
        <textarea
          ref={setTextareaRef}
          className="goblin-terminal-external-input__control"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          spellCheck={false}
          style={height === null ? undefined : { height: `${height}px` }}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
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

function assignRef<T>(ref: Ref<T>, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref) {
    ref.current = value
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
