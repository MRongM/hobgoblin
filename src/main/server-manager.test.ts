import { afterEach, describe, expect, test } from 'vitest'
import { createServer } from 'node:net'
import path from 'node:path'
import {
  DEFAULT_EMBEDDED_SERVER_PORT,
  parseServerPort,
  reserveEmbeddedServerPort,
  resolveEmbeddedServerEntryPath,
  resolveEmbeddedServerWorkingDirectory,
} from '#/main/server-manager.ts'

const openServers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

async function reserveTestPort(): Promise<number> {
  const server = createServer()
  openServers.push(server)
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('failed to reserve test port'))
        return
      }
      resolve(address.port)
    })
  })
}

describe('embedded server port selection', () => {
  test('parses configured ports and falls back to the default port for invalid values', () => {
    expect(DEFAULT_EMBEDDED_SERVER_PORT).toBe(32200)
    expect(parseServerPort('32123')).toBe(32123)
    expect(parseServerPort(undefined)).toBe(DEFAULT_EMBEDDED_SERVER_PORT)
    expect(parseServerPort('0')).toBe(DEFAULT_EMBEDDED_SERVER_PORT)
    expect(parseServerPort('abc')).toBe(DEFAULT_EMBEDDED_SERVER_PORT)
  })

  test('prefers the fixed port when it is available', async () => {
    const preferredPort = await reserveEmbeddedServerPort('127.0.0.1', 0)

    await expect(reserveEmbeddedServerPort('127.0.0.1', preferredPort)).resolves.toBe(preferredPort)
  })

  test('falls back to a random port when the fixed port is already occupied', async () => {
    const preferredPort = await reserveTestPort()

    const port = await reserveEmbeddedServerPort('127.0.0.1', preferredPort)

    expect(port).not.toBe(preferredPort)
    expect(port).toBeGreaterThan(0)
  })
})

describe('embedded server entry resolution', () => {
  test('uses the source TypeScript entry in packaged apps to avoid non-portable Bun bundle paths', () => {
    const appPath = path.join('/Applications/Hobgoblin.app/Contents/Resources', 'app.asar')

    expect(resolveEmbeddedServerEntryPath(appPath)).toBe(
      path.join(appPath, 'src/server/entrypoints/main.ts'),
    )
  })

  test('uses the resources directory as cwd when the packaged app path is an asar archive', () => {
    const appPath = path.join('/Applications/Hobgoblin.app/Contents/Resources', 'app.asar')

    expect(resolveEmbeddedServerWorkingDirectory(appPath, true)).toBe(path.dirname(appPath))
  })

  test('uses the app path as cwd outside packaged asar mode', () => {
    const appPath = path.join('/repo/hobgoblin')

    expect(resolveEmbeddedServerWorkingDirectory(appPath, false)).toBe(appPath)
  })
})
