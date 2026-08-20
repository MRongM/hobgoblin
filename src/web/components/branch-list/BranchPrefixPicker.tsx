import { Check, ChevronDown } from 'lucide-react'
import {
  BRANCH_PREFIX_OPTIONS,
  applyBranchPrefix,
  detectBranchPrefix,
  type BranchPrefix,
} from '#/shared/branch-prefixes.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface Props {
  value: string
  disabled?: boolean
  onChange: (nextValue: string) => void
}

export function BranchPrefixPicker({ value, disabled = false, onChange }: Props) {
  const t = useT()
  const active = detectBranchPrefix(value)
  const noneLabel = t('workspace.branch-workspace.branch-prefix.none')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={t('workspace.branch-workspace.branch-prefix.pick')}
          title={t('workspace.branch-workspace.branch-prefix.pick')}
          className="h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)] font-mono"
          data-branch-prefix-active={active ?? 'none'}
        >
          <span className="truncate">{active ?? noneLabel}</span>
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-32">
        {BRANCH_PREFIX_OPTIONS.map((option) => (
          <PrefixMenuItem
            key={option}
            value={option}
            active={active === option}
            onSelect={() => onChange(applyBranchPrefix(value, option))}
          />
        ))}
        <DropdownMenuSeparator />
        <PrefixMenuItem
          value={null}
          label={noneLabel}
          active={active === null}
          onSelect={() => onChange(applyBranchPrefix(value, null))}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface PrefixMenuItemProps {
  value: BranchPrefix | null
  label?: string
  active: boolean
  onSelect: () => void
}

function PrefixMenuItem({ value, label, active, onSelect }: PrefixMenuItemProps) {
  return (
    <DropdownMenuItem data-branch-prefix-option={value ?? 'none'} onSelect={onSelect} className="font-mono">
      <span className="flex w-3.5 items-center justify-center">{active ? <Check className="size-3" /> : null}</span>
      <span className="truncate">{label ?? value}</span>
    </DropdownMenuItem>
  )
}
