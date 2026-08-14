import { describe, expect, test } from 'vitest'
import {
  EMBEDDED_SERVER_SHUTDOWN_MESSAGE,
  isEmbeddedServerShutdownMessage,
} from '#/shared/server-lifecycle.ts'

describe('embedded server lifecycle protocol', () => {
  test('accepts only the explicit shutdown message', () => {
    expect(isEmbeddedServerShutdownMessage(EMBEDDED_SERVER_SHUTDOWN_MESSAGE)).toBe(true)
    expect(isEmbeddedServerShutdownMessage({ type: 'shutdown' })).toBe(false)
    expect(isEmbeddedServerShutdownMessage(null)).toBe(false)
  })
})
