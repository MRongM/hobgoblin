import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFetchSettingsController, useRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import {
  useRuntimeTelegramNotificationSettings,
  useTelegramNotificationSettingsController,
} from '#/web/runtime-settings-telegram-notifications.ts'
import { useT } from '#/web/stores/i18n.ts'
import { terminalBridge } from '#/web/terminal.ts'

export function NotificationSettings() {
  const t = useT()
  const { terminalNotificationsEnabled } = useRuntimeFetchSettings()
  const telegramSettings = useRuntimeTelegramNotificationSettings()
  const { setTerminalNotificationsEnabled } = useFetchSettingsController()
  const telegramController = useTelegramNotificationSettingsController()
  const [testingTerminalNotification, setTestingTerminalNotification] = useState(false)
  const [telegramEnabled, setTelegramEnabled] = useState(telegramSettings.enabled)
  const [botTokenConfigured, setBotTokenConfigured] = useState(telegramSettings.botTokenConfigured)
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState(telegramSettings.chatId)
  const [savingTelegram, setSavingTelegram] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [telegramSaveFailed, setTelegramSaveFailed] = useState(false)

  useEffect(() => {
    setTelegramEnabled(telegramSettings.enabled)
    setBotTokenConfigured(telegramSettings.botTokenConfigured)
    setBotToken('')
    setChatId(telegramSettings.chatId)
    setTelegramSaveFailed(false)
  }, [telegramSettings.botTokenConfigured, telegramSettings.chatId, telegramSettings.enabled])

  const normalizedChatId = chatId.trim()
  const configurationComplete = Boolean((botTokenConfigured || botToken.trim()) && normalizedChatId)
  const telegramChanged =
    telegramEnabled !== telegramSettings.enabled ||
    normalizedChatId !== telegramSettings.chatId ||
    Boolean(botToken.trim())
  const telegramConfigurationError = telegramEnabled && !configurationComplete

  const testTerminalNotification = () => {
    if (testingTerminalNotification) return
    setTestingTerminalNotification(true)
    void terminalBridge
      .sendTestNotification()
      .then((shown) => {
        if (shown) {
          toast.success(t('settings.terminal-notifications-test-sent'))
        } else {
          toast.error(t('settings.terminal-notifications-test-failed'), {
            description: t('settings.terminal-notifications-test-failed-hint'),
          })
        }
      })
      .catch((err) => {
        console.warn('[settings] terminal notification test failed', err)
        toast.error(t('settings.terminal-notifications-test-failed'), {
          description: t('settings.terminal-notifications-test-failed-hint'),
        })
      })
      .finally(() => {
        setTestingTerminalNotification(false)
      })
  }

  async function saveTelegramSettings() {
    if (savingTelegram || !telegramChanged || telegramConfigurationError) return
    setSavingTelegram(true)
    setTelegramSaveFailed(false)
    const saved = await telegramController.save({
      enabled: telegramEnabled,
      ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
      chatId: normalizedChatId,
    })
    setSavingTelegram(false)
    if (!saved) {
      setTelegramSaveFailed(true)
      return
    }
    setBotToken('')
    setTelegramEnabled(saved.enabled)
    setBotTokenConfigured(saved.botTokenConfigured)
    setChatId(saved.chatId)
    toast.success(t('settings.telegram.saved'))
  }

  async function testTelegramNotification() {
    if (testingTelegram || !botTokenConfigured || !normalizedChatId) return
    setTestingTelegram(true)
    const result = await telegramController.test()
    setTestingTelegram(false)
    if (result?.ok) {
      toast.success(t('settings.telegram.test-sent'))
      return
    }
    const code = result?.error.code ?? 'network-failed'
    toast.error(t(`settings.telegram.error.${code}`))
  }

  return (
    <>
      <SettingsGroup label={t('settings.nav.notifications')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-terminal-notifications"
            label={t('settings.terminal-notifications')}
            hint={t('settings.terminal-notifications-hint')}
            control={
              <Switch
                id="settings-terminal-notifications"
                checked={terminalNotificationsEnabled}
                onCheckedChange={(enabled) => void setTerminalNotificationsEnabled(enabled)}
                aria-label={t('settings.terminal-notifications')}
              />
            }
          />
          <SettingsRow
            controlId="settings-terminal-notifications-test"
            label={t('settings.terminal-notifications-test')}
            hint={t('settings.terminal-notifications-test-hint')}
            control={
              <Button
                id="settings-terminal-notifications-test"
                type="button"
                data-interactive
                size="sm"
                variant="outline"
                onClick={testTerminalNotification}
                disabled={testingTerminalNotification}
              >
                {t('settings.terminal-notifications-test-button')}
              </Button>
            }
          />
        </SettingsList>
      </SettingsGroup>

      <SettingsGroup label={t('settings.telegram.title')} hint={t('settings.telegram.hint')}>
        <SettingsList>
          <SettingsRow
            controlId="settings-telegram-enabled"
            label={t('settings.telegram.enabled')}
            hint={t('settings.telegram.enabled-hint')}
            control={
              <Switch
                id="settings-telegram-enabled"
                checked={telegramEnabled}
                onCheckedChange={setTelegramEnabled}
                aria-label={t('settings.telegram.enabled')}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-bot-token"
            label={t('settings.telegram.bot-token')}
            hint={t(
              botTokenConfigured
                ? 'settings.telegram.bot-token-hint-configured'
                : 'settings.telegram.bot-token-hint-new',
            )}
            control={
              <Input
                id="settings-telegram-bot-token"
                type="password"
                autoComplete="new-password"
                value={botToken}
                className="h-8 w-60 max-w-full px-2 text-xs"
                onChange={(event) => setBotToken(event.currentTarget.value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-chat-id"
            label={t('settings.telegram.chat-id')}
            hint={t('settings.telegram.chat-id-hint')}
            control={
              <Input
                id="settings-telegram-chat-id"
                value={chatId}
                className="h-8 w-60 max-w-full px-2 text-xs"
                onChange={(event) => setChatId(event.currentTarget.value)}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-test"
            label={t('settings.telegram.test')}
            hint={t('settings.telegram.test-hint')}
            control={
              <Button
                id="settings-telegram-test"
                type="button"
                size="sm"
                variant="outline"
                disabled={testingTelegram || !botTokenConfigured || !normalizedChatId}
                onClick={() => void testTelegramNotification()}
              >
                {t(testingTelegram ? 'settings.telegram.testing' : 'settings.telegram.test-button')}
              </Button>
            }
          />
        </SettingsList>
        {!terminalNotificationsEnabled && (
          <SettingsCard className="px-4 py-3 text-[11px] leading-snug text-muted-foreground">
            {t('settings.telegram.master-off-hint')}
          </SettingsCard>
        )}
        <div className="flex min-h-8 items-center justify-end gap-3 px-3">
          <span
            className="text-[11px] text-danger"
            role={telegramConfigurationError || telegramSaveFailed ? 'alert' : undefined}
          >
            {telegramConfigurationError
              ? t('settings.telegram.error.configuration-incomplete')
              : telegramSaveFailed
                ? t('settings.telegram.error.save-failed')
                : ''}
          </span>
          <Button
            disabled={savingTelegram || !telegramChanged || telegramConfigurationError}
            onClick={() => void saveTelegramSettings()}
          >
            {t(savingTelegram ? 'settings.telegram.saving' : 'settings.telegram.save')}
          </Button>
        </div>
      </SettingsGroup>
    </>
  )
}
