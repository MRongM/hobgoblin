import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'

export interface CreateTagRequest {
  name: string
  ref: string
}

interface Props {
  open: boolean
  defaultRef?: string
  onClose: () => void
  onCreate: (request: CreateTagRequest) => void | Promise<void>
}

export function CreateTagDialog({ open, defaultRef = 'HEAD', onClose, onCreate }: Props) {
  const t = useT()
  const { isPending, run } = useAsyncPending<'create'>()
  const [name, setName] = useState('')
  const [ref, setRef] = useState(defaultRef)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setName('')
      setRef(defaultRef)
      setError(null)
      return
    }
    setName('')
    setRef(defaultRef)
    setError(null)
  }, [defaultRef, open])

  async function handleSubmit() {
    const nextName = name.trim()
    const nextRef = ref.trim() || 'HEAD'
    if (!nextName || !nextRef) return
    await run('create', async () => {
      try {
        await onCreate({ name: nextName, ref: nextRef })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) onClose()
      }}
      title={t('tags.create')}
      description={t('tags.ref-label')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <Field>
          <FieldLabel htmlFor="create-tag-name">{t('tags.name-label')}</FieldLabel>
          <Input
            id="create-tag-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('tags.name-label')}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="create-tag-ref">{t('tags.ref-label')}</FieldLabel>
          <Input
            id="create-tag-ref"
            value={ref}
            onChange={(event) => setRef(event.target.value)}
            placeholder="HEAD"
            autoComplete="off"
          />
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={isPending || name.trim().length === 0 || ref.trim().length === 0}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('tags.create')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
