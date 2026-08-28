import { statSync } from 'node:fs'
import path from 'node:path'

interface ResolveGitExecutableOptions {
  platform?: NodeJS.Platform | string
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

export function resolveGitExecutable(options: ResolveGitExecutableOptions = {}): string | null {
  if ((options.platform ?? process.platform) !== 'win32') return 'git'

  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? isFile
  const seen = new Set<string>()
  const candidates: string[] = []
  const addCandidate = (candidate: string | undefined) => {
    const executable = normalizeAbsoluteWindowsPath(candidate)
    if (!executable) return
    const identity = executable.toLowerCase()
    if (seen.has(identity)) return
    seen.add(identity)
    candidates.push(executable)
  }

  addGitInstallCandidate(addCandidate, environmentValue(env, 'PROGRAMW6432'))
  addGitInstallCandidate(addCandidate, environmentValue(env, 'PROGRAMFILES(X86)'))
  addGitInstallCandidate(addCandidate, environmentValue(env, 'PROGRAMFILES'))

  const localAppData = environmentValue(env, 'LOCALAPPDATA')
  if (localAppData) addGitInstallCandidate(addCandidate, path.win32.join(localAppData, 'Programs'))

  for (const directory of windowsPathDirectories(environmentValue(env, 'PATH'))) {
    addCandidate(path.win32.join(directory, 'git.exe'))
  }

  return candidates.find(fileExists) ?? null
}

function addGitInstallCandidate(addCandidate: (candidate: string) => void, base: string | undefined): void {
  if (base) addCandidate(path.win32.join(base, 'Git', 'cmd', 'git.exe'))
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function windowsPathDirectories(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(path.win32.delimiter)
    .map((entry) => stripMatchingQuotes(entry.trim()))
    .filter((entry) => normalizeAbsoluteWindowsPath(entry) !== null)
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
