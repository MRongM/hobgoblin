import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { generateOpenApiKey } from '#/web/settings-client.ts'
import { useOpenApiKeyStatusQuery } from '#/web/settings-queries.ts'
import { openApiKeyStatusQueryKey } from '#/web/settings-query-cache.ts'
import { useT } from '#/web/stores/i18n.ts'

export function OpenApiKeySettings() {
  const t = useT()
  const queryClient = useQueryClient()
  const statusQuery = useOpenApiKeyStatusQuery()
  const status = statusQuery.data?.status
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)
  const [generateFailed, setGenerateFailed] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'copied' | 'selected' | null>(null)
  const keyInput = useRef<HTMLInputElement>(null)

  async function generate(replace: boolean) {
    setPending(true)
    setGenerateFailed(false)
    setCopyStatus(null)
    try {
      const { key, status } = await generateOpenApiKey(replace)
      queryClient.setQueryData(openApiKeyStatusQueryKey(), { status })
      setGenerated(key)
    } catch {
      setGenerateFailed(true)
      void statusQuery.refetch()
    } finally {
      setPending(false)
      setConfirm(false)
    }
  }

  async function copyKey() {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated)
      setCopyStatus('copied')
    } catch {
      keyInput.current?.focus()
      keyInput.current?.select()
      setCopyStatus('selected')
    }
  }

  return (
    <SettingsGroup label={t('settings.open-api-keys.title')}>
      {status ? (
        <SettingsList>
          <SettingsRow
            controlId="settings-open-api-key"
            label={t('settings.open-api-keys.label')}
            hint={t('settings.open-api-keys.hint')}
            control={
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{t(`settings.open-api-keys.${status}`)}</span>
                <Button
                  id="settings-open-api-key"
                  size="sm"
                  variant="outline"
                  disabled={pending || generated !== null}
                  aria-busy={pending}
                  onClick={() => (status === 'unset' ? void generate(false) : setConfirm(true))}
                >
                  {t(status === 'unset' ? 'settings.open-api-keys.generate' : 'settings.open-api-keys.regenerate')}
                </Button>
              </div>
            }
          />
        </SettingsList>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground" role="status">
          {t(statusQuery.isError ? 'settings.open-api-keys.load-failed' : 'settings.open-api-keys.loading')}
          {statusQuery.isError && (
            <Button size="sm" variant="outline" onClick={() => void statusQuery.refetch()}>
              {t('settings.open-api-keys.retry')}
            </Button>
          )}
        </div>
      )}
      {generateFailed && (
        <p className="px-3 py-2 text-xs text-danger" role="alert">
          {t('settings.open-api-keys.generate-failed')}
        </p>
      )}
      {generated && (
        <SettingsCard className="space-y-2 px-3 py-3">
          <label className="block text-xs font-medium" htmlFor="generated-open-api-key">
            {t('settings.open-api-keys.label')}
          </label>
          <Input
            id="generated-open-api-key"
            ref={keyInput}
            readOnly
            value={generated}
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">{t('settings.open-api-keys.one-time')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void copyKey()}>
              {t('settings.open-api-keys.copy')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGenerated(null)}>
              {t('settings.open-api-keys.done')}
            </Button>
            {copyStatus && (
              <span className="text-xs text-muted-foreground" role="status">
                {t(`settings.open-api-keys.${copyStatus}`)}
              </span>
            )}
          </div>
        </SettingsCard>
      )}
      <ConfirmDialog
        open={confirm}
        title={t('settings.open-api-keys.regenerate')}
        message={t('settings.open-api-keys.replace-confirm')}
        confirmLabel={t('settings.open-api-keys.regenerate')}
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => generate(true)}
      />
    </SettingsGroup>
  )
}
