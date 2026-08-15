import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { getRendererBridge } from '#/web/renderer-bridge.ts'
import { useRuntimeSecuritySettings, useSecuritySettingsController } from '#/web/runtime-settings-security.ts'
import { useT } from '#/web/stores/i18n.ts'

const MIN_PASSWORD_LENGTH = 8

export function SecuritySettings() {
  const t = useT()
  const settings = useRuntimeSecuritySettings()
  const { saveWebAccessSettings } = useSecuritySettingsController()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [username, setUsername] = useState(settings.username)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    setEnabled(settings.enabled)
    setUsername(settings.username)
    setPassword('')
    setConfirmPassword('')
    setSaveFailed(false)
  }, [settings.enabled, settings.passwordConfigured, settings.username])

  const normalizedUsername = username.trim()
  const errorKey = useMemo(() => {
    if ((enabled || password.length > 0) && !normalizedUsername) return 'settings.security.error.username-required'
    if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
      return 'settings.security.error.password-too-short'
    }
    if (password !== confirmPassword) return 'settings.security.error.password-mismatch'
    const usernameChanged = normalizedUsername !== settings.username
    if ((enabled && !settings.passwordConfigured) || usernameChanged) {
      if (!password) return 'settings.security.error.password-required'
    }
    return null
  }, [confirmPassword, enabled, normalizedUsername, password, settings.passwordConfigured, settings.username])
  const changed = enabled !== settings.enabled || normalizedUsername !== settings.username || password.length > 0

  async function save() {
    if (saving || errorKey || !changed) return
    setSaving(true)
    setSaveFailed(false)
    const result = await saveWebAccessSettings({
      enabled,
      username: normalizedUsername,
      ...(password ? { password } : {}),
    })
    setSaving(false)
    if (!result) {
      setSaveFailed(true)
      return
    }
    if (getRendererBridge().kind() === 'web') window.location.assign('/auth/login')
  }

  return (
    <>
      <SettingsGroup label={t('settings.security.protection')} hint={t('settings.security.protection-hint')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-web-access-enabled"
            label={t('settings.security.enabled')}
            hint={t('settings.security.enabled-hint')}
            control={
              <Switch
                id="settings-web-access-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label={t('settings.security.enabled')}
              />
            }
          />
          <SettingsRow
            controlId="settings-web-access-username"
            label={t('settings.security.username')}
            hint={t('settings.security.username-hint')}
            control={
              <Input
                id="settings-web-access-username"
                autoComplete="username"
                value={username}
                className="h-8 w-60 max-w-full px-2 text-xs"
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-web-access-password"
            label={t('settings.security.password')}
            hint={t(
              settings.passwordConfigured
                ? 'settings.security.password-hint-configured'
                : 'settings.security.password-hint-new',
            )}
            control={
              <Input
                id="settings-web-access-password"
                type="password"
                autoComplete="new-password"
                value={password}
                className="h-8 w-60 max-w-full px-2 text-xs"
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-web-access-confirm-password"
            label={t('settings.security.confirm-password')}
            control={
              <Input
                id="settings-web-access-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                className="h-8 w-60 max-w-full px-2 text-xs"
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              />
            }
          />
        </SettingsList>
        <SettingsCard className="flex gap-2 border-warning-border bg-warning-surface px-4 py-3 text-[11px] leading-snug text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('settings.security.trusted-network-warning')}</span>
        </SettingsCard>
        <div className="flex min-h-8 items-center justify-end gap-3 px-3">
          <span className="text-[11px] text-danger" role={errorKey || saveFailed ? 'alert' : undefined}>
            {errorKey ? t(errorKey) : saveFailed ? t('settings.security.error.save-failed') : ''}
          </span>
          <Button disabled={saving || Boolean(errorKey) || !changed} onClick={() => void save()}>
            {t(saving ? 'settings.security.saving' : 'settings.security.save')}
          </Button>
        </div>
      </SettingsGroup>
    </>
  )
}
