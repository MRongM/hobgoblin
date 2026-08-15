import path from 'node:path'

export function serverDataDir(): string {
  const explicit = process.env.GOBLIN_SERVER_DATA_DIR?.trim()
  if (explicit) return explicit
  if (process.platform === 'darwin') {
    const home = process.env.HOME?.trim()
    if (home) return path.join(home, 'Library', 'Application Support', 'Hobgoblin')
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA?.trim()
    if (localAppData) return path.join(localAppData, 'Hobgoblin')
    const appData = process.env.APPDATA?.trim()
    if (appData) return path.join(appData, 'Hobgoblin')
    const userProfile = process.env.USERPROFILE?.trim()
    if (userProfile) return path.join(userProfile, 'AppData', 'Local', 'Hobgoblin')
  }
  const xdgStateHome = process.env.XDG_STATE_HOME?.trim()
  if (xdgStateHome) return path.join(xdgStateHome, 'hobgoblin')
  const home = process.env.HOME?.trim()
  if (home) return path.join(home, '.local', 'state', 'hobgoblin')
  return path.join(process.cwd(), '.hobgoblin-server')
}

export function serverDataFile(name: string): string {
  return path.join(serverDataDir(), name)
}
