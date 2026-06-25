import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import { compositeFocusRing } from '#/web/components/ui/focus.ts'
interface Props {
  value: string
  disabled?: boolean
  className?: string
  onChange: (value: string) => void
}

export function BranchSearchInput({ value, disabled = false, className, onChange }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const label = t('branches.search-label')

  function handleClear() {
    onChange('')
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div
      className={cn(
        'group/search relative flex h-7 w-52 shrink-0 items-center overflow-hidden rounded-md border border-input-border bg-input-background shadow-xs transition-[background-color,opacity] duration-150 ease-out hover:bg-input-hover',
        compositeFocusRing,
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Search
        className={cn(
          'ml-1.5 size-3.5 shrink-0 text-muted-foreground',
          !disabled && 'group-hover/search:text-foreground',
        )}
        aria-hidden
      />
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          if (value) {
            onChange('')
            return
          }
          event.currentTarget.blur()
        }}
        aria-label={label}
        placeholder={t('branches.search-placeholder')}
        tabIndex={0}
        className={cn(
          'h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-xs text-input-foreground outline-none placeholder:text-input-placeholder disabled:cursor-not-allowed',
        )}
      />
      {value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleClear}
          aria-label={t('branches.search-clear')}
          className="mr-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none [&_svg:not([class*='size-'])]:size-3"
        >
          <X />
        </Button>
      )}
    </div>
  )
}
