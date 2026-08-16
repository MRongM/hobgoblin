export const EMBEDDED_SERVER_SHUTDOWN_MESSAGE = { type: 'embedded-server-shutdown' } as const

export function isEmbeddedServerShutdownMessage(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === EMBEDDED_SERVER_SHUTDOWN_MESSAGE.type
  )
}
