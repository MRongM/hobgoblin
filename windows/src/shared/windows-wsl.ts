import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'

interface ResolveUsableWindowsWslOptions {
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

const wslProbeCache = new Map<string, string | null>()

export function clearWindowsWslProbeCache(): void {
  wslProbeCache.clear()
}

export function resolveUsableWindowsWslExecutable(options: ResolveUsableWindowsWslOptions = {}): string | null {
  const env = options.env ?? process.env
  const systemRoot = environmentValue(env, 'SYSTEMROOT') ?? environmentValue(env, 'WINDIR')
  if (!systemRoot) return null

  const executable = normalizeAbsoluteWindowsPath(path.win32.join(systemRoot, 'System32', 'wsl.exe'))
  const fileExists = options.fileExists ?? isFile
  if (!executable || !fileExists(executable)) return null

  // Shell resolution is currently synchronous. Cache the capability result
  // so opening several terminals does not repeatedly block the server for up
  // to five seconds.
  // Custom file probes are used by tests and are intentionally not cached.
  const cacheKey = executable.toLowerCase()
  if (options.fileExists === undefined && wslProbeCache.has(cacheKey)) {
    return wslProbeCache.get(cacheKey) ?? null
  }

  let usable: string | null = null
  try {
    const result = spawnSync(executable, ['--list', '--quiet'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    })
    usable =
      result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim().length > 0 ? executable : null
  } catch {
    usable = null
  }
  if (options.fileExists === undefined) wslProbeCache.set(cacheKey, usable)
  return usable
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function normalizeAbsoluteWindowsPath(value: string): string | null {
  if (value.includes('\0') || !path.win32.isAbsolute(value)) return null
  return path.win32.normalize(value)
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
