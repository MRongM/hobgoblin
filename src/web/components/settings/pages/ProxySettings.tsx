import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { MAX_GIT_NETWORK_TIMEOUT_SEC, MIN_GIT_NETWORK_TIMEOUT_SEC } from '#/shared/settings.ts'
import {
  useGitNetworkSettingsController,
  useRuntimeGitNetworkSettings,
} from '#/web/runtime-settings-git-network.ts'
import { useT } from '#/web/stores/i18n.ts'

export function ProxySettings() {
  const t = useT()
  const { gitNetworkProxyEnabled, gitNetworkProxyUrl, gitNetworkTimeoutSec } = useRuntimeGitNetworkSettings()
  const { setGitNetworkProxyEnabled, setGitNetworkProxyUrl, setGitNetworkTimeoutSec } =
    useGitNetworkSettingsController()

  return (
    <SettingsGroup label={t('settings.proxy.git-title')} hint={t('settings.proxy.git-body')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-git-network-proxy-enabled"
          label={t('settings.proxy.git-proxy')}
          hint={t('settings.proxy.git-proxy-hint')}
          control={
            <Switch
              id="settings-git-network-proxy-enabled"
              checked={gitNetworkProxyEnabled}
              onCheckedChange={(checked) => void setGitNetworkProxyEnabled(checked)}
              aria-label={t('settings.proxy.git-proxy')}
            />
          }
        />
        <SettingsRow
          controlId="settings-git-network-proxy-url"
          label={t('settings.proxy.git-proxy-url')}
          hint={t('settings.proxy.git-proxy-url-hint')}
          control={
            <Input
              id="settings-git-network-proxy-url"
              value={gitNetworkProxyUrl}
              placeholder="socks5://127.0.0.1:7890"
              className="h-8 w-60 max-w-full px-2 text-xs"
              onChange={(event) => void setGitNetworkProxyUrl(event.currentTarget.value)}
            />
          }
        />
        <SettingsRow
          controlId="settings-git-network-timeout-sec"
          label={t('settings.proxy.git-timeout')}
          hint={t('settings.proxy.git-timeout-hint')}
          control={
            <div className="flex items-center justify-end gap-2">
              <SettingsNumberInput
                id="settings-git-network-timeout-sec"
                value={gitNetworkTimeoutSec}
                min={MIN_GIT_NETWORK_TIMEOUT_SEC}
                max={MAX_GIT_NETWORK_TIMEOUT_SEC}
                step={1}
                onChange={(value) => void setGitNetworkTimeoutSec(value)}
              />
              <span className="text-xs text-muted-foreground">{t('settings.proxy.seconds')}</span>
            </div>
          }
        />
      </SettingsList>
      <SettingsCard className="px-4 py-3 text-[11px] leading-snug text-muted-foreground">
        {t('settings.proxy.ssh-note')}
      </SettingsCard>
    </SettingsGroup>
  )
}
