import type { RendererEffectIntent } from '#/shared/renderer-effect-intents.ts'
import type { DictKey } from '#/shared/i18n/dictionaries.ts'

export type BranchActionShortcutAction = 'pull' | 'push' | 'externalTerminal' | 'editor' | 'remote'
export type RendererSelectionShortcutAction = 'checkout-selected'
export type RendererKeyboardShortcutAction = BranchActionShortcutAction | RendererSelectionShortcutAction
export type RendererMenuCommandId =
  | 'app-settings'
  | 'file-open-local-repo'
  | 'file-open-local-repo-path'
  | 'file-open-wsl-project'
  | 'file-clone-repo'
  | 'file-open-remote-repo'
  | 'file-close-tab'
  | 'file-settings'
  | 'view-status'
  | 'view-changes'
  | 'view-terminal'
  | 'view-terminal-primary-action'
  | 'view-refresh'
  | 'window-next-repo'
  | 'window-prev-repo'
  | 'help-shortcuts'

export interface KeyboardShortcutMatch {
  key?: string
  code?: string
  shiftKey?: boolean
}

export interface AcceleratorShortcutDefinition {
  accelerator: string
  labelKey: DictKey
  labelParams?: Record<string, string | number>
}

export interface TerminalCycleShortcutDefinition extends AcceleratorShortcutDefinition {
  key: 'ArrowUp' | 'ArrowDown'
  direction: -1 | 1
}

export interface RendererMenuCommandDefinition {
  id: RendererMenuCommandId
  menuLabelKey: DictKey
  helpLabelKey?: DictKey
  intent: RendererEffectIntent
}

export interface BranchActionShortcutDefinition {
  matches: KeyboardShortcutMatch[]
  action: BranchActionShortcutAction
  combos: string[][]
  labelKey: DictKey
}

export interface RendererKeyboardShortcutDefinition<
  Action extends RendererKeyboardShortcutAction = RendererKeyboardShortcutAction,
> {
  matches: KeyboardShortcutMatch[]
  action: Action
  combos: string[][]
  labelKey: DictKey
}

export const BRANCH_ACTION_SHORTCUTS: BranchActionShortcutDefinition[] = [
  branchActionShortcut([{ code: 'KeyP', shiftKey: false }], 'pull', [['p']], 'action.pull'),
  branchActionShortcut([{ code: 'KeyP', shiftKey: true }], 'push', [['⇧', 'P']], 'action.push'),
  branchActionShortcut([{ code: 'KeyG', shiftKey: false }], 'externalTerminal', [['g']], 'terminal.external'),
  branchActionShortcut([{ code: 'KeyV', shiftKey: false }], 'editor', [['v']], 'worktrees.open-in-editor-label'),
  branchActionShortcut([{ code: 'KeyG', shiftKey: true }], 'remote', [['⇧', 'G']], 'action.remote'),
]

export const RENDERER_SELECTION_SHORTCUTS: RendererKeyboardShortcutDefinition<RendererSelectionShortcutAction>[] = [
  keyboardShortcut([{ key: 'Enter' }], 'checkout-selected', [['Enter']], 'help.row.checkout'),
]

export const RENDERER_MENU_COMMANDS: RendererMenuCommandDefinition[] = [
  rendererMenuCommand('app-settings', 'menu.app.settings', { type: 'open-settings-requested', page: 'general' }),
  rendererMenuCommand('file-open-local-repo', 'menu.file.open-local-repo', { type: 'open-repo-requested' }),
  rendererMenuCommand('file-open-local-repo-path', 'menu.file.open-local-repo-path', {
    type: 'open-repo-path-requested',
  }),
  rendererMenuCommand('file-open-wsl-project', 'menu.file.open-wsl-project', {
    type: 'open-wsl-repo-requested',
  }),
  rendererMenuCommand('file-clone-repo', 'menu.file.clone-repo', { type: 'clone-repo-requested' }),
  rendererMenuCommand('file-open-remote-repo', 'menu.file.open-remote-repo', {
    type: 'open-remote-repo-requested',
  }),
  rendererMenuCommand('file-close-tab', 'menu.file.close-tab', { type: 'close-repo-requested' }),
  rendererMenuCommand('file-settings', 'menu.file.settings', {
    type: 'open-settings-requested',
    page: 'general',
  }),
  rendererMenuCommand('view-status', 'menu.view.status', { type: 'show-detail-tab-requested', tab: 'status' }),
  rendererMenuCommand('view-changes', 'menu.view.changes', { type: 'show-detail-tab-requested', tab: 'changes' }),
  rendererMenuCommand('view-terminal', 'menu.view.terminal', {
    type: 'show-detail-tab-requested',
    tab: 'terminal',
  }),
  rendererMenuCommand('view-terminal-primary-action', 'menu.view.terminal-primary-action', {
    type: 'terminal-primary-action-requested',
  }),
  rendererMenuCommand('view-refresh', 'menu.view.refresh', { type: 'repo-refresh-requested' }),
  rendererMenuCommand('window-next-repo', 'menu.window.next-repo', {
    type: 'cycle-repo-requested',
    direction: 1,
  }),
  rendererMenuCommand('window-prev-repo', 'menu.window.prev-repo', {
    type: 'cycle-repo-requested',
    direction: -1,
  }),
  rendererMenuCommand('help-shortcuts', 'menu.help.shortcuts', { type: 'open-settings-requested', page: 'shortcuts' }),
]

export const TERMINAL_CYCLE_SHORTCUTS: TerminalCycleShortcutDefinition[] = [
  {
    key: 'ArrowUp',
    direction: -1,
    accelerator: 'CmdOrCtrl+Alt+Up',
    labelKey: 'terminal.command-deck.previous-terminal',
  },
  {
    key: 'ArrowDown',
    direction: 1,
    accelerator: 'CmdOrCtrl+Alt+Down',
    labelKey: 'terminal.command-deck.next-terminal',
  },
]

export const RENDERER_KEYBOARD_SHORTCUTS: RendererKeyboardShortcutDefinition[] = [
  ...BRANCH_ACTION_SHORTCUTS,
  ...RENDERER_SELECTION_SHORTCUTS,
]

export function matchBranchActionShortcut(input: {
  code: string
  shiftKey: boolean
}): BranchActionShortcutAction | null {
  return matchKeyboardShortcut(BRANCH_ACTION_SHORTCUTS, input)
}

export function matchRendererKeyboardShortcut(input: {
  key: string
  code: string
  shiftKey: boolean
}): RendererKeyboardShortcutAction | null {
  return matchKeyboardShortcut(RENDERER_KEYBOARD_SHORTCUTS, input)
}

export function matchTerminalCycleShortcut(
  input: {
    key: string
    altKey: boolean
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
  },
  isMac: boolean,
): -1 | 1 | null {
  if (!input.altKey || input.shiftKey) return null
  if (isMac ? !input.metaKey || input.ctrlKey : !input.ctrlKey || input.metaKey) return null
  return TERMINAL_CYCLE_SHORTCUTS.find((shortcut) => shortcut.key === input.key)?.direction ?? null
}

export function rendererMenuCommandById(id: RendererMenuCommandId): RendererMenuCommandDefinition {
  const command = RENDERER_MENU_COMMANDS.find((candidate) => candidate.id === id)
  if (!command) throw new Error(`Unknown renderer menu command: ${id}`)
  return command
}

function keyboardShortcut<Action extends RendererKeyboardShortcutAction>(
  matches: KeyboardShortcutMatch[],
  action: Action,
  combos: string[][],
  labelKey: DictKey,
): RendererKeyboardShortcutDefinition<Action> {
  return { matches, action, combos, labelKey }
}

function branchActionShortcut(
  matches: KeyboardShortcutMatch[],
  action: BranchActionShortcutAction,
  combos: string[][],
  labelKey: DictKey,
): BranchActionShortcutDefinition {
  return { matches, action, combos, labelKey }
}

function rendererMenuCommand(
  id: RendererMenuCommandId,
  menuLabelKey: DictKey,
  intent: RendererEffectIntent,
): RendererMenuCommandDefinition {
  return { id, menuLabelKey, intent }
}

function matchKeyboardShortcut<Action extends string>(
  shortcuts: readonly { matches: readonly KeyboardShortcutMatch[]; action: Action }[],
  input: { key?: string; code?: string; shiftKey?: boolean },
): Action | null {
  for (const shortcut of shortcuts) {
    if (shortcut.matches.some((match) => keyboardShortcutMatch(match, input))) return shortcut.action
  }
  return null
}

function keyboardShortcutMatch(
  match: KeyboardShortcutMatch,
  input: { key?: string; code?: string; shiftKey?: boolean },
): boolean {
  if (match.key !== undefined && input.key !== match.key) return false
  if (match.code !== undefined && input.code !== match.code) return false
  if (match.shiftKey !== undefined && input.shiftKey !== match.shiftKey) return false
  return true
}
