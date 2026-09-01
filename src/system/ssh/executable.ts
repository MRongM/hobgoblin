import { statSync } from 'node:fs'
import path from 'node:path'

interface ResolveNativeWindowsOpenSshExecutableOptions {
  platform?: NodeJS.Platform | string
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

export function resolveNativeWindowsOpenSshExecutable(
  options: ResolveNativeWindowsOpenSshExecutableOptions = {},
): string | null {
  if ((options.platform ?? process.platform) !== 'win32') return null

  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? isFile
  const seen = new Set<string>()
  for (const name of ['SYSTEMROOT', 'WINDIR']) {
    const root = environmentValue(env, name)
    if (!root || root.includes('\0') || !path.win32.isAbsolute(root)) continue
    const candidate = path.win32.normalize(path.win32.join(root, 'System32', 'OpenSSH', 'ssh.exe'))
    const identity = candidate.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    if (fileExists(candidate)) return candidate
  }
  return null
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
