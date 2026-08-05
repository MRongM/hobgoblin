import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type HobCliInstallStatus = 'installed' | 'already-installed' | 'conflict' | 'source-missing'

export interface HobCliInstallResult {
  status: HobCliInstallStatus
  sourcePath: string
  targetPath: string
  pathConfigured: boolean
}

interface HobCliInstallOptions {
  homeDir?: string
  pathValue?: string
}

export function installHobCli(appPath: string, options: HobCliInstallOptions = {}): HobCliInstallResult {
  const homeDir = path.resolve(options.homeDir ?? os.homedir())
  const binDir = path.join(homeDir, '.local/bin')
  const sourcePath = path.join(path.resolve(appPath), 'Contents/Resources/bin/hob')
  const targetPath = path.join(binDir, 'hob')
  const pathConfigured = (options.pathValue ?? process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => path.resolve(entry) === binDir)
  const result = (status: HobCliInstallStatus): HobCliInstallResult => ({
    status,
    sourcePath,
    targetPath,
    pathConfigured,
  })

  if (!existsSync(sourcePath)) return result('source-missing')

  mkdirSync(binDir, { recursive: true })
  const targetStats = lstatSync(targetPath, { throwIfNoEntry: false })
  if (!targetStats) {
    symlinkSync(sourcePath, targetPath)
    return result('installed')
  }

  if (!targetStats.isSymbolicLink()) return result('conflict')

  const currentSource = path.resolve(binDir, readlinkSync(targetPath))
  return result(currentSource === sourcePath ? 'already-installed' : 'conflict')
}
