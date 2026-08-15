import { statSync } from 'node:fs'
import path from 'node:path'

export type WindowsTerminalShellKind = 'powershell-core' | 'windows-powershell' | 'cmd'

export interface WindowsTerminalShellCandidate {
  kind: WindowsTerminalShellKind
  command: string
  args: string[]
}

interface ResolveWindowsTerminalShellOptions {
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

const POWERSHELL_ARGS = ['-NoLogo'] as const

export function resolveWindowsTerminalShellCandidates(
  options: ResolveWindowsTerminalShellOptions = {},
): WindowsTerminalShellCandidate[] {
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? isFile
  const candidates: WindowsTerminalShellCandidate[] = []
  const seen = new Set<string>()

  const addCandidate = (kind: WindowsTerminalShellKind, command: string | undefined, args: readonly string[]) => {
    const executable = normalizeAbsoluteWindowsPath(command)
    if (!executable || !fileExists(executable)) return
    const identity = executable.toLowerCase()
    if (seen.has(identity)) return
    seen.add(identity)
    candidates.push({ kind, command: executable, args: [...args] })
  }

  for (const programFiles of uniqueEnvironmentValues(env, ['PROGRAMW6432', 'PROGRAMFILES'])) {
    addCandidate('powershell-core', path.win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'), POWERSHELL_ARGS)
  }

  for (const directory of windowsPathDirectories(environmentValue(env, 'PATH'))) {
    addCandidate('powershell-core', path.win32.join(directory, 'pwsh.exe'), POWERSHELL_ARGS)
  }

  const systemRoot = environmentValue(env, 'SYSTEMROOT') ?? environmentValue(env, 'WINDIR')
  if (systemRoot) {
    addCandidate(
      'windows-powershell',
      path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      POWERSHELL_ARGS,
    )
  }

  addCandidate('cmd', environmentValue(env, 'COMSPEC'), [])
  if (systemRoot) addCandidate('cmd', path.win32.join(systemRoot, 'System32', 'cmd.exe'), [])

  return candidates
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function uniqueEnvironmentValues(env: NodeJS.ProcessEnv, names: string[]): string[] {
  const values: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const value = environmentValue(env, name)
    if (!value) continue
    const identity = path.win32.normalize(value).toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    values.push(value)
  }
  return values
}

function windowsPathDirectories(value: string | undefined): string[] {
  if (!value) return []
  const directories: string[] = []
  for (const entry of value.split(path.win32.delimiter)) {
    const directory = stripMatchingQuotes(entry.trim())
    if (!normalizeAbsoluteWindowsPath(directory)) continue
    directories.push(directory)
  }
  return directories
}

function stripMatchingQuotes(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).trim() : value
}

function normalizeAbsoluteWindowsPath(value: string | undefined): string | null {
  if (!value || value.includes('\0') || !path.win32.isAbsolute(value)) return null
  return path.win32.normalize(value)
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
