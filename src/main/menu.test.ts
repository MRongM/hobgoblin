import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'

interface MockMenuRuntimeState {
  recentRepos: RepoSessionEntry[]
  shortcutsDisabled: boolean
  langPref: 'auto' | 'en' | 'zh' | 'ko' | 'ja'
}

function defaultMenuRuntimeState(): MockMenuRuntimeState {
  return {
    recentRepos: [],
    shortcutsDisabled: false,
    langPref: 'auto',
  }
}

const mocks = vi.hoisted(() => {
  const template: any[] = []
  const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: vi.fn() } }
  return {
    appGetPath: vi.fn<(name: string) => string>((name: string) => (name === 'home' ? '/home/user' : '/data')),
    openHttpExternal: vi.fn(() => Promise.resolve(true)),
    readMenuRuntimeState: vi.fn<() => MockMenuRuntimeState>(() => defaultMenuRuntimeState()),
    template,
    win,
    activateMainWindow: vi.fn(() => Promise.resolve(win)),
    getFocusedWindow: vi.fn((): any => null),
    focusedRegisteredSurface: vi.fn((): any => null),
    getMainWindow: vi.fn((): any => null),
    sendRendererEffectIntent: vi.fn(),
    buildFromTemplate: vi.fn((nextTemplate: any[]) => {
      template.splice(0, template.length, ...nextTemplate)
      return nextTemplate
    }),
    setApplicationMenu: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: {
    name: 'Hobgoblin',
    getPath: mocks.appGetPath,
  },
  BrowserWindow: {
    getFocusedWindow: mocks.getFocusedWindow,
  },
  dialog: {
    showErrorBox: vi.fn(),
  },
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
  shell: {
    openPath: vi.fn(),
  },
}))

vi.mock('#/main/window.ts', () => ({
  activateMainWindow: mocks.activateMainWindow,
  getMainWindow: mocks.getMainWindow,
}))

vi.mock('#/main/window-registry.ts', () => ({
  focusedRegisteredSurface: mocks.focusedRegisteredSurface,
}))

vi.mock('#/main/i18n/index.ts', () => ({
  t: vi.fn((key: string) => key),
}))

vi.mock('#/main/menu-state.ts', () => ({
  readMenuRuntimeState: mocks.readMenuRuntimeState,
  applyMenuRuntimeState: vi.fn(),
}))

vi.mock('#/main/renderer-surface-events.ts', () => ({
  broadcastRpcEvent: vi.fn(),
  sendRendererEffectIntent: mocks.sendRendererEffectIntent,
}))

vi.mock('#/main/window-shell.ts', () => ({
  getRendererBaseUrl: vi.fn(() => 'http://127.0.0.1:32100'),
  getEmbeddedServerUrl: vi.fn(() => 'http://127.0.0.1:32100'),
}))

vi.mock('#/main/external-url.ts', () => ({
  openHttpExternal: mocks.openHttpExternal,
}))

vi.mock('#/main/theme.ts', () => ({
  getTheme: vi.fn(() => ({ pref: 'auto', resolved: 'light', colorTheme: 'macos' })),
  applyThemeSettingsProjection: vi.fn(),
  initTheme: vi.fn(),
  subscribeTheme: vi.fn(() => () => {}),
}))

describe('app menu actions', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.template.length = 0
    mocks.appGetPath.mockImplementation((name: string) => (name === 'home' ? '/home/user' : '/data'))
    mocks.readMenuRuntimeState.mockReturnValue(defaultMenuRuntimeState())
    mocks.getMainWindow.mockReturnValue(null)
    mocks.getFocusedWindow.mockReturnValue(null)
    mocks.focusedRegisteredSurface.mockReturnValue(null)
    mocks.activateMainWindow.mockResolvedValue(mocks.win)
    const { platform } = await import('#/main/menu.ts')
    vi.spyOn(platform, 'isMacOS').mockReturnValue(true)
  })

  test('activates the main window before sending an action when no window exists', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')
    buildAppMenu()

    clickMenuItem('menu.file', 'menu.file.open-local-repo')
    await Promise.resolve()

    expect(mocks.activateMainWindow).toHaveBeenCalledTimes(1)
    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, { type: 'open-repo-requested' })
  })

  test('reuses an existing main window for menu actions', async () => {
    mocks.getMainWindow.mockReturnValue(mocks.win)
    const { buildAppMenu } = await import('#/main/menu.ts')
    buildAppMenu()

    clickMenuItem('menu.file', 'menu.file.open-local-repo')
    await Promise.resolve()

    expect(mocks.activateMainWindow).not.toHaveBeenCalled()
    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, { type: 'open-repo-requested' })
  })

  test('sends the path dialog action from the file menu', async () => {
    mocks.getMainWindow.mockReturnValue(mocks.win)
    const { buildAppMenu } = await import('#/main/menu.ts')
    buildAppMenu()

    clickMenuItem('menu.file', 'menu.file.open-local-repo-path')
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, { type: 'open-repo-path-requested' })
  })

  test('opens the WSL project dialog from the Windows file menu only', async () => {
    mocks.getMainWindow.mockReturnValue(mocks.win)
    const { buildAppMenu, platform } = await import('#/main/menu.ts')
    vi.spyOn(platform, 'isWindows').mockReturnValue(true)
    buildAppMenu()

    clickMenuItem('menu.file', 'menu.file.open-wsl-project')
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, { type: 'open-wsl-repo-requested' })
  })

  test('tildifies Windows home paths in the recent repos menu', async () => {
    mocks.appGetPath.mockImplementation((name: string) => (name === 'home' ? 'C:\\Users\\user' : '/data'))
    mocks.readMenuRuntimeState.mockReturnValue({
      ...defaultMenuRuntimeState(),
      recentRepos: [{ kind: 'local', id: 'C:\\Users\\user\\Developer\\repo' }],
    })
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const fileMenu = mocks.template.find((entry) => entry.label === 'menu.file')
    const recentMenu = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.open-recent')
    expect(recentMenu?.submenu?.[0]?.label).toBe('~\\Developer\\repo')
  })

  test('keeps the shortcuts help item available when shortcuts are disabled', async () => {
    mocks.readMenuRuntimeState.mockReturnValue({
      ...defaultMenuRuntimeState(),
      shortcutsDisabled: true,
    })
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const helpMenu = mocks.template.find((entry) => entry.label === 'menu.help')
    const shortcutsItem = helpMenu?.submenu?.find((entry: any) => entry.label === 'menu.help.shortcuts')
    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    const devToolsItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.toggle-dev-tools')
    expect(shortcutsItem?.enabled).not.toBe(false)
    expect(devToolsItem?.accelerator).toBeUndefined()
    shortcutsItem.click()
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'open-settings-requested',
      page: 'shortcuts',
    })
  })

  test('routes settings from the file menu through the main window shell', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()
    clickMenuItem('Hobgoblin', 'menu.app.settings')
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'open-settings-requested',
      page: 'general',
    })
  })

  test('routes appearance changes through renderer intent instead of mutating settings in main', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()
    clickNestedMenuItem('Hobgoblin', 'settings.appearance', 'settings.appearance.dark')
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'theme-pref-set-requested',
      pref: 'dark',
    })
  })

  test('routes language changes through renderer intent instead of mutating settings in main', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()
    clickNestedMenuItem('Hobgoblin', 'settings.lang', 'settings.lang.ko')
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'lang-pref-set-requested',
      pref: 'ko',
    })
  })

  test('keeps file and app commands available without the removed app accelerators', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const fileMenu = mocks.template.find((entry) => entry.label === 'menu.file')
    const appMenu = mocks.template.find((entry) => entry.label === 'Hobgoblin')
    const openItem = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.open-local-repo')
    const cloneItem = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.clone-repo')
    const remoteItem = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.open-remote-repo')
    const closeTabItem = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.close-tab')
    const closeWindowItem = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.close-window')
    const settingsItem = appMenu?.submenu?.find((entry: any) => entry.label === 'menu.app.settings')

    expect(openItem?.accelerator).toBeUndefined()
    expect(cloneItem?.accelerator).toBeUndefined()
    expect(remoteItem?.accelerator).toBeUndefined()
    expect(closeTabItem?.accelerator).toBeUndefined()
    expect(closeWindowItem?.accelerator).toBeUndefined()
    expect(settingsItem?.accelerator).toBeUndefined()
  })

  test('keeps the terminal primary action menu item without the removed view accelerator', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    const terminalPrimaryItem = viewMenu?.submenu?.find(
      (entry: any) => entry.label === 'menu.view.terminal-primary-action',
    )
    expect(terminalPrimaryItem?.accelerator).toBeUndefined()

    terminalPrimaryItem.click()
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'terminal-primary-action-requested',
    })
  })

  test('removes view accelerators and obsolete numbered terminal menu items', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    const statusItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.status')
    const changesItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.changes')
    const terminalItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.terminal')
    const firstTerminalItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.terminal 1')
    const lastTerminalItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.terminal 7')

    expect(statusItem?.accelerator).toBeUndefined()
    expect(changesItem?.accelerator).toBeUndefined()
    expect(terminalItem?.accelerator).toBeUndefined()
    expect(firstTerminalItem).toBeUndefined()
    expect(lastTerminalItem).toBeUndefined()

    const refreshItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.refresh')
    const reloadItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.reload-page')
    expect(refreshItem?.accelerator).toBeUndefined()
    expect(reloadItem?.accelerator).toBeUndefined()
  })

  test('omits obsolete workspace layout and desktop detail toggle commands', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    expect(viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.workspace-layout')).toBeUndefined()
    expect(viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.toggle-detail')).toBeUndefined()
  })

  test('wires the platform primary modifier to toggle the web developer tools', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    const devToolsItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.toggle-dev-tools')

    expect(devToolsItem?.role).toBe('toggleDevTools')
    expect(devToolsItem?.accelerator).toBe('CmdOrCtrl+Shift+I')
  })

  test('includes standard edit roles and full screen in the menu', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const editMenu = mocks.template.find((entry) => entry.label === 'menu.edit')
    expect(editMenu?.submenu?.map((entry: any) => entry.role)).toEqual([
      'undo',
      'redo',
      undefined,
      'cut',
      'copy',
      'paste',
      'pasteAndMatchStyle',
      'delete',
      'selectAll',
    ])
    expect(editMenu?.submenu?.map((entry: any) => entry.label)).toEqual([
      'menu.edit.undo',
      'menu.edit.redo',
      undefined,
      'menu.edit.cut',
      'menu.edit.copy',
      'menu.edit.paste',
      'menu.edit.paste-match-style',
      'menu.edit.delete',
      'menu.edit.select-all',
    ])
    expect(editMenu?.submenu?.map((entry: any) => entry.accelerator)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])

    const viewMenu = mocks.template.find((entry) => entry.label === 'menu.view')
    const fullScreenItem = viewMenu?.submenu?.find((entry: any) => entry.label === 'menu.view.toggle-full-screen')
    expect(fullScreenItem?.role).toBe('togglefullscreen')
  })

  test('registers standard edit accelerators outside macOS', async () => {
    const { buildAppMenu, platform } = await import('#/main/menu.ts')
    vi.mocked(platform.isMacOS).mockReturnValue(false)

    buildAppMenu()

    const editMenu = mocks.template.find((entry) => entry.label === 'menu.edit')
    expect(editMenu?.submenu?.map((entry: any) => entry.accelerator)).toEqual([
      'CmdOrCtrl+Z',
      'Ctrl+Y',
      undefined,
      'CmdOrCtrl+X',
      'CmdOrCtrl+C',
      'CmdOrCtrl+V',
      'CmdOrCtrl+Shift+V',
      undefined,
      'CmdOrCtrl+A',
    ])
  })

  test('puts native window management items before repo navigation', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()

    const windowMenu = mocks.template.find((entry) => entry.label === 'menu.window')
    expect(windowMenu?.submenu?.slice(0, 3).map((entry: any) => entry.label)).toEqual([
      'menu.window.minimize',
      'menu.window.zoom',
      undefined,
    ])
    const nextRepoItem = windowMenu?.submenu?.find((entry: any) => entry.label === 'menu.window.next-repo')
    const previousRepoItem = windowMenu?.submenu?.find((entry: any) => entry.label === 'menu.window.prev-repo')
    expect(nextRepoItem?.accelerator).toBeUndefined()
    expect(previousRepoItem?.accelerator).toBeUndefined()
  })

  test('routes clear recent through renderer intent', async () => {
    mocks.readMenuRuntimeState.mockReturnValue({
      ...defaultMenuRuntimeState(),
      recentRepos: [{ kind: 'local', id: '/tmp/repo' }],
    })
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()
    const fileMenu = mocks.template.find((entry) => entry.label === 'menu.file')
    const recentMenu = fileMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.open-recent')
    const clearItem = recentMenu?.submenu?.find((entry: any) => entry.label === 'menu.file.clear-recent')
    expect(clearItem?.click).toBeTypeOf('function')
    clearItem.click()
    await Promise.resolve()

    expect(mocks.sendRendererEffectIntent).toHaveBeenCalledWith(mocks.win, {
      type: 'clear-recent-repos-requested',
    })
  })

  test('opens the local web version from the file menu', async () => {
    const { buildAppMenu } = await import('#/main/menu.ts')

    buildAppMenu()
    clickMenuItem('menu.file', 'menu.file.open-in-browser')
    await Promise.resolve()

    expect(mocks.openHttpExternal).toHaveBeenCalledWith('http://127.0.0.1:32100')
  })
})

function clickMenuItem(menuLabel: string, itemLabel: string): void {
  const menu = mocks.template.find((entry) => entry.label === menuLabel)
  const item = menu?.submenu?.find((entry: any) => entry.label === itemLabel)
  expect(item?.click).toBeTypeOf('function')
  item.click()
}

function clickNestedMenuItem(menuLabel: string, parentItemLabel: string, itemLabel: string): void {
  const menu = mocks.template.find((entry) => entry.label === menuLabel)
  const parent = menu?.submenu?.find((entry: any) => entry.label === parentItemLabel)
  const item = parent?.submenu?.find((entry: any) => entry.label === itemLabel)
  expect(item?.click).toBeTypeOf('function')
  item.click()
}
