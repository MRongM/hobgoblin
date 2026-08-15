// Application menu. Provides native macOS menu bar entries and dispatches
// renderer-owned commands from those entries.
//
// Renderer-driven actions (Open / Close Tab / Switch Tab / Refresh /
// Toggle View) are dispatched as typed RPC events so the
// renderer can run them in its existing store/state, instead of
// duplicating that logic in main.
// A small number of truly native menu actions (for example open data
// folder, open in browser, and native-only projections) still run in
// main because they need Electron shell APIs.
//
// Labels run through `t()` so the menu re-renders in the active
// language whenever `setCurrentLang` fires (the i18n IPC handler
// rebuilds this menu on lang change).

import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { activateMainWindow, getMainWindow } from '#/main/window.ts'
import { t } from '#/main/i18n/index.ts'
import { sendRendererEffectIntent } from '#/main/renderer-surface-events.ts'
import { getTheme } from '#/main/theme.ts'
import { tildifyPath } from '#/shared/paths.ts'
import type { LangPref, ThemePref } from '#/shared/rpc.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { RendererEffectIntent } from '#/shared/renderer-effect-intents.ts'
import { focusedRegisteredSurface } from '#/main/window-registry.ts'
import { readMenuRuntimeState } from '#/main/menu-state.ts'
import { rendererMenuCommandById } from '#/shared/shortcut-definitions.ts'
import {
  openDataFolder as runOpenDataFolder,
  openWebVersionFromMenu as runOpenWebVersionFromMenu,
} from '#/main/native-menu-actions.ts'

interface AppMenuState {
  isMac: boolean
  name: string
  recentRepos: RepoSessionEntry[]
  shortcutsDisabled: boolean
  themePref: ThemePref
  langPref: LangPref
}

const APPEARANCE_MENU_OPTIONS = [
  { pref: 'auto', labelKey: 'settings.appearance.auto' },
  { pref: 'light', labelKey: 'settings.appearance.light' },
  { pref: 'dark', labelKey: 'settings.appearance.dark' },
] as const

const LANGUAGE_MENU_OPTIONS = [
  { pref: 'auto', labelKey: 'settings.lang.auto' },
  { pref: 'en', labelKey: 'settings.lang.en' },
  { pref: 'zh', labelKey: 'settings.lang.zh' },
  { pref: 'ko', labelKey: 'settings.lang.ko' },
  { pref: 'ja', labelKey: 'settings.lang.ja' },
] as const

function send(intent: RendererEffectIntent): void {
  void sendRendererIntent(intent)
}

async function sendRendererIntent(intent: RendererEffectIntent): Promise<void> {
  try {
    const win = getMainWindow() ?? focusedRegisteredSurface()?.window ?? (await activateMainWindow())
    sendRendererEffectIntent(win, intent)
  } catch (err) {
    console.warn('[menu] failed to send renderer intent', err)
  }
}

function separator(): MenuItemConstructorOptions {
  return { type: 'separator' }
}

export function buildAppMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createAppMenuTemplate(readMenuState())))
}

export const platform = {
  isMacOS(): boolean {
    return process.platform === 'darwin'
  },
}

function readMenuState(): AppMenuState {
  const runtimeState = readMenuRuntimeState()
  return {
    isMac: platform.isMacOS(),
    name: app.name,
    recentRepos: runtimeState.recentRepos,
    shortcutsDisabled: runtimeState.shortcutsDisabled,
    themePref: getTheme().pref,
    langPref: runtimeState.langPref,
  }
}

function createAppMenuTemplate(state: AppMenuState): MenuItemConstructorOptions[] {
  return [
    ...(state.isMac ? [createMacAppMenu(state)] : []),
    createFileMenu(state),
    createEditMenu(state.isMac),
    createViewMenu(state),
    createWindowMenu(state),
    createHelpMenu(),
  ]
}

function createMacAppMenu(state: AppMenuState): MenuItemConstructorOptions {
  return {
    label: state.name,
    submenu: [
      {
        label: t('menu.app.about', { name: state.name }),
        click: () => send({ type: 'open-settings-requested', page: 'about' }),
      },
      separator(),
      createRendererCommandMenuItem('app-settings'),
      createAppearanceMenu(state.themePref),
      createLanguageMenu(state.langPref),
      separator(),
      { role: 'services', label: t('menu.app.services') },
      separator(),
      { role: 'hide', label: t('menu.app.hide', { name: state.name }) },
      { role: 'hideOthers', label: t('menu.app.hide-others') },
      { role: 'unhide', label: t('menu.app.show-all') },
      separator(),
      { role: 'quit', label: t('menu.app.quit', { name: state.name }) },
    ],
  }
}

function createFileMenu(state: AppMenuState): MenuItemConstructorOptions {
  return {
    label: t('menu.file'),
    submenu: [
      createRendererCommandMenuItem('file-open-local-repo'),
      createRendererCommandMenuItem('file-open-local-repo-path'),
      createRendererCommandMenuItem('file-clone-repo'),
      createRendererCommandMenuItem('file-open-remote-repo'),
      { label: t('menu.file.open-recent'), submenu: createRecentReposMenu(state.recentRepos) },
      separator(),
      createRendererCommandMenuItem('file-close-tab'),
      { label: t('menu.file.close-window'), click: () => focusedRegisteredSurface()?.window.close() },
      separator(),
      { label: t('menu.file.open-in-browser'), click: () => void openWebVersionFromMenu() },
      { label: t('menu.file.open-data-folder'), click: () => void openDataFolder() },
      ...(state.isMac
        ? []
        : [
            separator(),
            createRendererCommandMenuItem('file-settings'),
            separator(),
            { role: 'quit' as const, label: t('menu.file.quit') },
          ]),
    ],
  }
}

function createRecentReposMenu(recentRepos: RepoSessionEntry[]): MenuItemConstructorOptions[] {
  const home = app.getPath('home')
  return recentRepos.length > 0
    ? [
        ...recentRepos.map((entry) => ({
          label:
            entry.kind === 'local'
              ? tildifyPath(entry.id, home)
              : `${entry.ref.displayName} — ${entry.ref.alias}:${entry.ref.remotePath}`,
          click: () => send({ type: 'open-recent-repo-requested', entry }),
        })),
        separator(),
        { label: t('menu.file.clear-recent'), click: () => send({ type: 'clear-recent-repos-requested' }) },
      ]
    : [{ label: t('menu.file.no-recent'), enabled: false }]
}

function createEditMenu(isMac: boolean): MenuItemConstructorOptions {
  const editAccelerators = isMac
    ? {}
    : ({
        undo: 'CmdOrCtrl+Z',
        redo: 'Ctrl+Y',
        cut: 'CmdOrCtrl+X',
        copy: 'CmdOrCtrl+C',
        paste: 'CmdOrCtrl+V',
        pasteAndMatchStyle: 'CmdOrCtrl+Shift+V',
        selectAll: 'CmdOrCtrl+A',
      } as const)
  return {
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.edit.undo'), accelerator: editAccelerators.undo },
      { role: 'redo', label: t('menu.edit.redo'), accelerator: editAccelerators.redo },
      separator(),
      { role: 'cut', label: t('menu.edit.cut'), accelerator: editAccelerators.cut },
      { role: 'copy', label: t('menu.edit.copy'), accelerator: editAccelerators.copy },
      { role: 'paste', label: t('menu.edit.paste'), accelerator: editAccelerators.paste },
      {
        role: 'pasteAndMatchStyle',
        label: t('menu.edit.paste-match-style'),
        accelerator: editAccelerators.pasteAndMatchStyle,
      },
      { role: 'delete', label: t('menu.edit.delete') },
      { role: 'selectAll', label: t('menu.edit.select-all'), accelerator: editAccelerators.selectAll },
    ],
  }
}

function createViewMenu(state: AppMenuState): MenuItemConstructorOptions {
  return {
    label: t('menu.view'),
    submenu: [
      createRendererCommandMenuItem('view-status'),
      createRendererCommandMenuItem('view-changes'),
      createRendererCommandMenuItem('view-terminal'),
      createRendererCommandMenuItem('view-terminal-primary-action'),
      ...(state.isMac ? [] : [separator(), createAppearanceMenu(state.themePref), createLanguageMenu(state.langPref)]),
      separator(),
      createRendererCommandMenuItem('view-refresh'),
      {
        label: t('menu.view.reload-page'),
        click: () => focusedRegisteredSurface()?.window.webContents.reload(),
      },
      { role: 'togglefullscreen', label: t('menu.view.toggle-full-screen') },
      separator(),
      state.shortcutsDisabled
        ? {
            label: t('menu.view.toggle-dev-tools'),
            click: () => focusedRegisteredSurface()?.window.webContents.toggleDevTools(),
          }
        : {
            role: 'toggleDevTools',
            label: t('menu.view.toggle-dev-tools'),
            accelerator: 'CmdOrCtrl+Shift+I',
          },
    ],
  }
}

function createWindowMenu(state: AppMenuState): MenuItemConstructorOptions {
  return {
    label: t('menu.window'),
    submenu: [
      { role: 'minimize', label: t('menu.window.minimize') },
      { role: 'zoom', label: t('menu.window.zoom') },
      separator(),
      createRendererCommandMenuItem('window-next-repo'),
      createRendererCommandMenuItem('window-prev-repo'),
      ...(state.isMac ? [separator(), { role: 'front' as const, label: t('menu.window.front') }] : []),
    ],
  }
}

function createHelpMenu(): MenuItemConstructorOptions {
  return {
    label: t('menu.help'),
    submenu: [createRendererCommandMenuItem('help-shortcuts')],
  }
}

function createAppearanceMenu(themePref: ThemePref): MenuItemConstructorOptions {
  return {
    label: t('settings.appearance'),
    submenu: APPEARANCE_MENU_OPTIONS.map(({ pref, labelKey }) => ({
      type: 'radio' as const,
      label: t(labelKey),
      checked: themePref === pref,
      click: () => send({ type: 'theme-pref-set-requested', pref }),
    })),
  }
}

function createLanguageMenu(langPref: LangPref): MenuItemConstructorOptions {
  return {
    label: t('settings.lang'),
    submenu: LANGUAGE_MENU_OPTIONS.map(({ pref, labelKey }) => ({
      type: 'radio' as const,
      label: t(labelKey),
      checked: langPref === pref,
      click: () => send({ type: 'lang-pref-set-requested', pref }),
    })),
  }
}

function createRendererCommandMenuItem(
  id: Parameters<typeof rendererMenuCommandById>[0],
): MenuItemConstructorOptions {
  const command = rendererMenuCommandById(id)
  return {
    label: t(command.menuLabelKey),
    click: () => send(command.intent),
  }
}

async function openWebVersionFromMenu(): Promise<void> {
  await runOpenWebVersionFromMenu()
}

async function openDataFolder(): Promise<void> {
  await runOpenDataFolder()
}
