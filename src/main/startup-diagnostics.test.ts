import { describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  appendFileSync: mocks.appendFileSync,
  mkdirSync: mocks.mkdirSync,
}))

describe('startup diagnostics', () => {
  test('redacts sensitive server values before writing log lines', async () => {
    const { formatStartupLogLine } = await import('#/main/startup-diagnostics.ts')

    const line = formatStartupLogLine('server-command', {
      bin: 'Hobgoblin.exe',
      secret: 'super-secret-value',
      GOBLIN_SERVER_INTERNAL_SECRET: 'env-secret',
      nested: { clientSecret: 'nested-secret' },
    })

    expect(line).toContain('[server-command]')
    expect(line).toContain('"bin":"Hobgoblin.exe"')
    expect(line).not.toContain('super-secret-value')
    expect(line).not.toContain('env-secret')
    expect(line).not.toContain('nested-secret')
    expect(line).toContain('"secret":"[redacted]"')
    expect(line).toContain('"GOBLIN_SERVER_INTERNAL_SECRET":"[redacted]"')
    expect(line).toContain('"clientSecret":"[redacted]"')
  })

  test('creates the diagnostics directory and appends one line per event', async () => {
    const { createStartupDiagnostics } = await import('#/main/startup-diagnostics.ts')
    const diagnostics = createStartupDiagnostics('/tmp/Hobgoblin/startup.log')

    diagnostics.log('renderer-url', { url: 'http://127.0.0.1:32200/' })

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/tmp/Hobgoblin', { recursive: true })
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1)
    expect(mocks.appendFileSync.mock.calls[0]?.[0]).toBe('/tmp/Hobgoblin/startup.log')
    expect(String(mocks.appendFileSync.mock.calls[0]?.[1])).toContain('[renderer-url]')
  })
})
