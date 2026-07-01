import path from 'node:path'

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/

export function pathModuleForLocalPaths(paths: string[]): typeof path {
  return paths.some((value) => WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) ? path.win32 : path
}

export function localPathComparisonKey(pathModule: typeof path, value: string): string {
  const resolved = pathModule.resolve(value)
  return pathModule === path.win32 ? resolved.toLowerCase() : resolved
}
