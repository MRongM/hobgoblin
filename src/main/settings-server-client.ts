import type { SettingsPrefs, SettingsSnapshot } from '#/shared/rpc.ts'
import { requestEmbeddedServerJson } from '#/shared/embedded-server-client.ts'
import { getEmbeddedServerRuntime } from '#/main/server-manager.ts'

// Main-process client for server-owned settings/session APIs.
function requireEmbeddedServerRuntime() {
  const runtime = getEmbeddedServerRuntime()
  if (!runtime) throw new Error('Embedded server unavailable')
  return runtime
}

async function requestSettingsJson<T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
  errorMessage?: string,
): Promise<T> {
  const runtime = requireEmbeddedServerRuntime()
  try {
    return await requestEmbeddedServerJson<T>(runtime, path, init)
  } catch (error) {
    throw new Error(
      `${errorMessage ?? 'Embedded server rejected settings request'}${error instanceof Error ? `: ${error.message}` : ''}`,
    )
  }
}

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  return await requestSettingsJson<SettingsSnapshot>(
    '/api/settings',
    undefined,
    'Embedded server rejected settings snapshot request',
  )
}

export async function getSettingsPrefs(): Promise<SettingsPrefs> {
  return await requestSettingsJson<SettingsPrefs>(
    '/api/settings/prefs',
    undefined,
    'Embedded server rejected settings prefs request',
  )
}
