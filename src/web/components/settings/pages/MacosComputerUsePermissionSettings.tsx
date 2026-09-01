import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import {
  canManageMacosComputerUsePermissions,
  getMacosComputerUsePermissions,
  requestMacosComputerUsePermission,
} from '#/web/app-shell-client.ts'
import { SettingsGroup, SettingsList, SettingsRow } from '#/web/components/settings/SettingsPrimitives.tsx'
import { Badge, type BadgeVariant } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type {
  MacosComputerUsePermissionKind,
  MacosComputerUsePermissionStatus,
  MacosComputerUsePermissionsSnapshot,
} from '#/shared/macos-computer-use-permissions.ts'

const UNKNOWN_PERMISSIONS: MacosComputerUsePermissionsSnapshot = {
  screenRecording: 'unknown',
  accessibility: 'unknown',
}

export function MacosComputerUsePermissionSettings() {
  if (getInitialBootstrap().hostPlatform !== 'darwin' || !canManageMacosComputerUsePermissions()) return null
  return <MacosComputerUsePermissionSettingsContent />
}

function MacosComputerUsePermissionSettingsContent() {
  const t = useT()
  const [permissions, setPermissions] = useState<MacosComputerUsePermissionsSnapshot | null>(null)
  const [pendingKind, setPendingKind] = useState<MacosComputerUsePermissionKind | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPermissions(await getMacosComputerUsePermissions())
    } catch {
      setPermissions(UNKNOWN_PERMISSIONS)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  async function request(kind: MacosComputerUsePermissionKind): Promise<void> {
    if (pendingKind) return
    setPendingKind(kind)
    try {
      const result = await requestMacosComputerUsePermission(kind)
      setPermissions(result.permissions)
      if (!result.ok) toast.error(t('settings.macos-permissions.request-failed'))
    } catch {
      toast.error(t('settings.macos-permissions.request-failed'))
    } finally {
      setPendingKind(null)
    }
  }

  return (
    <SettingsGroup label={t('settings.macos-permissions.title')} hint={t('settings.macos-permissions.hint')}>
      <SettingsList>
        <PermissionRow
          kind="screen-recording"
          status={permissions?.screenRecording ?? 'unknown'}
          ready={permissions !== null}
          pendingKind={pendingKind}
          onRequest={request}
        />
        <PermissionRow
          kind="accessibility"
          status={permissions?.accessibility ?? 'unknown'}
          ready={permissions !== null}
          pendingKind={pendingKind}
          onRequest={request}
        />
      </SettingsList>
      <div className="px-4 py-2 text-[11px] leading-snug text-muted-foreground">
        {t('settings.macos-permissions.restart-hint')}
      </div>
    </SettingsGroup>
  )
}

function PermissionRow({
  kind,
  status,
  ready,
  pendingKind,
  onRequest,
}: {
  kind: MacosComputerUsePermissionKind
  status: MacosComputerUsePermissionStatus
  ready: boolean
  pendingKind: MacosComputerUsePermissionKind | null
  onRequest: (kind: MacosComputerUsePermissionKind) => Promise<void>
}) {
  const t = useT()
  const granted = status === 'granted'
  const pending = pendingKind === kind
  const actionKey =
    kind === 'screen-recording' && status !== 'not-determined'
      ? 'settings.macos-permissions.open-system-settings'
      : 'settings.macos-permissions.authorize'

  return (
    <SettingsRow
      controlId={`settings-macos-permission-${kind}`}
      label={t(`settings.macos-permissions.${kind}`)}
      hint={t(`settings.macos-permissions.${kind}-hint`)}
      control={
        <div className="flex items-center gap-2">
          <Badge variant={permissionStatusVariant(status)}>{t(`settings.macos-permissions.status.${status}`)}</Badge>
          {ready && !granted && status !== 'unsupported' ? (
            <Button
              id={`settings-macos-permission-${kind}`}
              type="button"
              size="sm"
              variant="outline"
              disabled={pendingKind !== null}
              aria-busy={pending}
              onClick={() => void onRequest(kind)}
            >
              {t(pending ? 'settings.macos-permissions.requesting' : actionKey)}
            </Button>
          ) : null}
        </div>
      }
    />
  )
}

function permissionStatusVariant(status: MacosComputerUsePermissionStatus): BadgeVariant {
  if (status === 'granted') return 'success'
  if (status === 'denied' || status === 'restricted') return 'warning'
  return 'outline'
}
