import { accessSync, constants, lstatSync, statSync } from 'node:fs'
import path from 'node:path'

function candidateDirectories(extraDirectories: string[]): string[] {
  const seen = new Set<string>()
  const values = [...(process.env.PATH?.split(path.delimiter) ?? []), ...extraDirectories]
  const directories: string[] = []
  for (const value of values) {
    const directory = value.trim()
    if (!directory || seen.has(directory)) continue
    seen.add(directory)
    directories.push(directory)
  }
  return directories
}

function isExecutableFile(filePath: string): boolean {
  let isExecutableCandidate = false
  try {
    isExecutableCandidate = statSync(filePath).isFile()
  } catch {
    try {
      // Windows App Execution Aliases (for example WindowsApps/wt.exe) are
      // executable reparse-point symlinks, but Bun's statSync may return EACCES.
      isExecutableCandidate = lstatSync(filePath).isSymbolicLink()
    } catch {
      return false
    }
  }
  if (!isExecutableCandidate) return false
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function hasCommand(command: string, extraDirectories: string[] = []): boolean {
  if (!command || command.includes(path.sep) || command.includes('\0')) return false
  return candidateDirectories(extraDirectories).some((directory) => isExecutableFile(path.join(directory, command)))
}

export function firstAvailableCommand(commands: string[], extraDirectories: string[] = []): string | null {
  for (const command of commands) {
    if (hasCommand(command, extraDirectories)) return command
  }
  return null
}
