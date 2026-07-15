import { useState } from 'react'
import type { RepoGroupColor } from '#/web/stores/repos/types.ts'
import { ALL_GROUP_COLORS, getGroupColorClasses } from '#/web/components/repo-tabs/group-colors.ts'
import { cn } from '#/web/lib/cn.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/web/components/ui/dialog.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'

interface CreateGroupDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: RepoGroupColor) => void
  labels: {
    title: string
    nameLabel: string
    namePlaceholder: string
    colorLabel: string
    cancel: string
    create: string
  }
}

export function CreateGroupDialog({ open, onClose, onCreate, labels }: CreateGroupDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<RepoGroupColor>('blue')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, color)
    setName('')
    setColor('blue')
    onClose()
  }

  const handleCancel = () => {
    setName('')
    setColor('blue')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="group-name" className="text-sm font-medium">
              {labels.nameLabel}
            </label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.namePlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{labels.colorLabel}</div>
            <div className="flex flex-wrap gap-2">
              {ALL_GROUP_COLORS.map((c) => {
                const colorClasses = getGroupColorClasses(c)
                const isSelected = c === color
                return (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'relative size-8 rounded-md border-2 transition-all',
                      colorClasses.bg,
                      isSelected ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={isSelected}
                  >
                    <span className={cn('block size-3 rounded-full m-auto', colorClasses.dot)} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>
            {labels.cancel}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            {labels.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
