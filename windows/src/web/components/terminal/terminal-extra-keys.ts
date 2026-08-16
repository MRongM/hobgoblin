export type TerminalExtraKey =
  | 'escape'
  | 'slash'
  | 'minus'
  | 'home'
  | 'arrow-up'
  | 'end'
  | 'page-up'
  | 'tab'
  | 'arrow-left'
  | 'arrow-down'
  | 'arrow-right'
  | 'page-down'

export type TerminalCommandDeckKey = TerminalExtraKey | 'control' | 'alt'

export interface TerminalExtraKeyInput {
  key: TerminalExtraKey
  ctrlPressed: boolean
  altPressed: boolean
}

interface TerminalCommandDeckKeyDefinition {
  key: TerminalCommandDeckKey
  label: string
}

export const TERMINAL_EXTRA_KEY_ROWS = [
  [
    { key: 'escape', label: 'ESC' },
    { key: 'slash', label: '/' },
    { key: 'minus', label: '-' },
    { key: 'home', label: 'HOME' },
    { key: 'arrow-up', label: '↑' },
    { key: 'end', label: 'END' },
    { key: 'page-up', label: 'PGUP' },
  ],
  [
    { key: 'tab', label: 'TAB' },
    { key: 'control', label: 'CTRL' },
    { key: 'alt', label: 'ALT' },
    { key: 'arrow-left', label: '←' },
    { key: 'arrow-down', label: '↓' },
    { key: 'arrow-right', label: '→' },
    { key: 'page-down', label: 'PGDN' },
  ],
] as const satisfies ReadonlyArray<ReadonlyArray<TerminalCommandDeckKeyDefinition>>

const CURSOR_SUFFIX_BY_KEY: Partial<Record<TerminalExtraKey, string>> = {
  home: 'H',
  'arrow-up': 'A',
  end: 'F',
  'arrow-left': 'D',
  'arrow-down': 'B',
  'arrow-right': 'C',
}

export function terminalInputForExtraKey(
  input: TerminalExtraKeyInput,
  options: { applicationCursorKeysMode: boolean },
): string {
  const modifier = 1 + (input.altPressed ? 2 : 0) + (input.ctrlPressed ? 4 : 0)
  const cursorSuffix = CURSOR_SUFFIX_BY_KEY[input.key]
  if (cursorSuffix) {
    if (modifier !== 1) return `\x1b[1;${modifier}${cursorSuffix}`
    return options.applicationCursorKeysMode ? `\x1bO${cursorSuffix}` : `\x1b[${cursorSuffix}`
  }

  if (input.key === 'page-up' || input.key === 'page-down') {
    const page = input.key === 'page-up' ? 5 : 6
    return modifier === 1 ? `\x1b[${page}~` : `\x1b[${page};${modifier}~`
  }

  if (input.key === 'escape') return input.altPressed ? '\x1b\x1b' : '\x1b'
  if (input.key === 'tab') return `${input.altPressed ? '\x1b' : ''}\t`

  const text = input.ctrlPressed ? '\x1f' : input.key === 'slash' ? '/' : '-'
  return `${input.altPressed ? '\x1b' : ''}${text}`
}
