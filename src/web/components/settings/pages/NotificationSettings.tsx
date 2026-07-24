import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsNumberInput,
  SettingsRow,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { useFetchSettingsController, useRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import {
  useRuntimeTelegramNotificationSettings,
  useTelegramNotificationSettingsController,
} from '#/web/runtime-settings-telegram-notifications.ts'
import { useT } from '#/web/stores/i18n.ts'
import { terminalBridge } from '#/web/terminal.ts'
import {
  TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS,
  TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS,
} from '#/shared/telegram-notifications.ts'

const TELEGRAM_ACTIVITY_DURATION_PRESETS = [
  { seconds: 1, label: 'settings.telegram.output-completion-min-activity-low' },
  { seconds: 10, label: 'settings.telegram.output-completion-min-activity-medium' },
  { seconds: 30, label: 'settings.telegram.output-completion-min-activity-high' },
] as const

export function NotificationSettings() {
  const t = useT()
  const { terminalNotificationsEnabled } = useRuntimeFetchSettings()
  const telegramSettings = useRuntimeTelegramNotificationSettings()
  const { setTerminalNotificationsEnabled } = useFetchSettingsController()
  const telegramController = useTelegramNotificationSettingsController()
  const [testingTerminalNotification, setTestingTerminalNotification] = useState(false)
  const [telegramEnabled, setTelegramEnabled] = useState(telegramSettings.enabled)
  const [telegramProxyEnabled, setTelegramProxyEnabled] = useState(telegramSettings.proxyEnabled)
  const [telegramBellEnabled, setTelegramBellEnabled] = useState(telegramSettings.bellEnabled)
  const [telegramOutputCompletionEnabled, setTelegramOutputCompletionEnabled] = useState(
    telegramSettings.outputCompletionEnabled,
  )
  const [telegramOutputCompletionMinimumActivitySeconds, setTelegramOutputCompletionMinimumActivitySeconds] = useState(
    telegramSettings.outputCompletionMinimumActivitySeconds,
  )
  const [telegramIncludeTerminalScreenImage, setTelegramIncludeTerminalScreenImage] = useState(
    telegramSettings.includeTerminalOutput,
  )
  const [botTokenConfigured, setBotTokenConfigured] = useState(telegramSettings.botTokenConfigured)
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState(telegramSettings.chatId)
  const [savingTelegram, setSavingTelegram] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [telegramSaveFailed, setTelegramSaveFailed] = useState(false)

  useEffect(() => {
    setTelegramEnabled(telegramSettings.enabled)
    setTelegramProxyEnabled(telegramSettings.proxyEnabled)
    setTelegramBellEnabled(telegramSettings.bellEnabled)
    setTelegramOutputCompletionEnabled(telegramSettings.outputCompletionEnabled)
    setTelegramOutputCompletionMinimumActivitySeconds(telegramSettings.outputCompletionMinimumActivitySeconds)
    setTelegramIncludeTerminalScreenImage(telegramSettings.includeTerminalOutput)
    setBotTokenConfigured(telegramSettings.botTokenConfigured)
    setBotToken('')
    setChatId(telegramSettings.chatId)
    setTelegramSaveFailed(false)
  }, [
    telegramSettings.bellEnabled,
    telegramSettings.botTokenConfigured,
    telegramSettings.chatId,
    telegramSettings.enabled,
    telegramSettings.includeTerminalOutput,
    telegramSettings.outputCompletionEnabled,
    telegramSettings.outputCompletionMinimumActivitySeconds,
    telegramSettings.proxyEnabled,
  ])

  const normalizedChatId = chatId.trim()
  const configurationComplete = Boolean((botTokenConfigured || botToken.trim()) && normalizedChatId)
  const telegramChanged =
    telegramEnabled !== telegramSettings.enabled ||
    telegramProxyEnabled !== telegramSettings.proxyEnabled ||
    telegramBellEnabled !== telegramSettings.bellEnabled ||
    telegramOutputCompletionEnabled !== telegramSettings.outputCompletionEnabled ||
    telegramOutputCompletionMinimumActivitySeconds !== telegramSettings.outputCompletionMinimumActivitySeconds ||
    telegramIncludeTerminalScreenImage !== telegramSettings.includeTerminalOutput ||
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
      proxyEnabled: telegramProxyEnabled,
      bellEnabled: telegramBellEnabled,
      outputCompletionEnabled: telegramOutputCompletionEnabled,
      outputCompletionMinimumActivitySeconds: telegramOutputCompletionMinimumActivitySeconds,
      includeTerminalOutput: telegramIncludeTerminalScreenImage,
      outputTailLength: telegramSettings.outputTailLength,
    })
    setSavingTelegram(false)
    if (!saved) {
      setTelegramSaveFailed(true)
      return
    }
    setBotToken('')
    setTelegramEnabled(saved.enabled)
    setTelegramProxyEnabled(saved.proxyEnabled)
    setTelegramBellEnabled(saved.bellEnabled)
    setTelegramOutputCompletionEnabled(saved.outputCompletionEnabled)
    setTelegramOutputCompletionMinimumActivitySeconds(saved.outputCompletionMinimumActivitySeconds)
    setTelegramIncludeTerminalScreenImage(saved.includeTerminalOutput)
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
            controlId="settings-telegram-proxy-enabled"
            label={t('settings.telegram.proxy-enabled')}
            hint={t('settings.telegram.proxy-enabled-hint')}
            control={
              <Switch
                id="settings-telegram-proxy-enabled"
                checked={telegramProxyEnabled}
                onCheckedChange={setTelegramProxyEnabled}
                aria-label={t('settings.telegram.proxy-enabled')}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-bell-enabled"
            label={t('settings.telegram.bell-enabled')}
            hint={t('settings.telegram.bell-enabled-hint')}
            control={
              <Switch
                id="settings-telegram-bell-enabled"
                checked={telegramBellEnabled}
                onCheckedChange={setTelegramBellEnabled}
                aria-label={t('settings.telegram.bell-enabled')}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-output-completion-enabled"
            label={t('settings.telegram.output-completion-enabled')}
            hint={t('settings.telegram.output-completion-enabled-hint')}
            control={
              <Switch
                id="settings-telegram-output-completion-enabled"
                checked={telegramOutputCompletionEnabled}
                onCheckedChange={setTelegramOutputCompletionEnabled}
                aria-label={t('settings.telegram.output-completion-enabled')}
              />
            }
          />
          <SettingsRow
            controlId="settings-telegram-output-completion-min-activity"
            label={t('settings.telegram.output-completion-min-activity')}
            hint={t('settings.telegram.output-completion-min-activity-hint')}
            control={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {TELEGRAM_ACTIVITY_DURATION_PRESETS.map(({ seconds, label }) => (
                  <Button
                    key={seconds}
                    type="button"
                    size="sm"
                    variant={telegramOutputCompletionMinimumActivitySeconds === seconds ? 'default' : 'outline'}
                    onClick={() => setTelegramOutputCompletionMinimumActivitySeconds(seconds)}
                  >
                    {t(label)}
                  </Button>
                ))}
                <SettingsNumberInput
                  id="settings-telegram-output-completion-min-activity"
                  min={TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS}
                  max={TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS}
                  value={telegramOutputCompletionMinimumActivitySeconds}
                  onChange={setTelegramOutputCompletionMinimumActivitySeconds}
                />
                <span className="text-xs text-muted-foreground">
                  {t('settings.telegram.output-completion-min-activity-unit')}
                </span>
              </div>
            }
          />
          <SettingsRow
            controlId="settings-telegram-include-terminal-screen-image"
            label={t('settings.telegram.include-terminal-screen-image')}
            hint={t('settings.telegram.include-terminal-screen-image-hint')}
            control={
              <Switch
                id="settings-telegram-include-terminal-screen-image"
                checked={telegramIncludeTerminalScreenImage}
                onCheckedChange={setTelegramIncludeTerminalScreenImage}
                aria-label={t('settings.telegram.include-terminal-screen-image')}
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
