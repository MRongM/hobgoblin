import { Hono } from 'hono'
import {
  sendConfiguredTelegramBellNotification,
  sendConfiguredTelegramOutputCompletionNotification,
  sendConfiguredTelegramTestNotification,
} from '#/server/modules/telegram-notification-write-paths.ts'
import type {
  TelegramBellNotificationContext,
  TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'

export function createTelegramNotificationRoutes() {
  const app = new Hono()
  app.post('/test', async (c) =>
    c.json(
      await sendConfiguredTelegramTestNotification({
        acceptLanguage: c.req.header('accept-language'),
      }),
    ),
  )
  app.post('/bell', async (c) => {
    const context = await c.req.json().catch(() => null)
    return c.json(
      await sendConfiguredTelegramBellNotification(context as TelegramBellNotificationContext, {
        acceptLanguage: c.req.header('accept-language'),
      }),
    )
  })
  app.post('/output-completion', async (c) => {
    const context = await c.req.json().catch(() => null)
    return c.json(
      await sendConfiguredTelegramOutputCompletionNotification(context as TelegramOutputCompletionNotificationContext, {
        acceptLanguage: c.req.header('accept-language'),
      }),
    )
  })
  return app
}
