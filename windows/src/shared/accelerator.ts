export const DEFAULT_GLOBAL_SHORTCUT = 'Alt+G'

const MODIFIERS = ['Command', 'Control', 'Alt', 'Shift'] as const
const PRIMARY_MODIFIERS = new Set<string>(['Command', 'Control', 'Alt'])
const SPECIAL_SHORTCUT_KEYS = new Set<string>([',', '.', '[', ']'])
const MAX_GLOBAL_SHORTCUT_LENGTH = 128
const RESERVED_GLOBAL_SHORTCUTS = new Set<string>([
  'Command+O',
  'Control+O',
  'Command+Shift+O',
  'Control+Shift+O',
  'Command+1',
  'Control+1',
  'Command+2',
  'Control+2',
  'Command+3',
  'Control+3',
  'Command+4',
  'Control+4',
  'Command+J',
  'Control+J',
  'Command+R',
  'Control+R',
  'Command+W',
  'Control+W',
  'Command+Shift+T',
  'Control+Shift+T',
  'Command+Shift+W',
  'Control+Shift+W',
  'Command+Alt+I',
  'Control+Shift+I',
  'Command+]',
  'Control+]',
  'Command+[',
  'Control+[',
  'Command+,',
  'Control+,',
  'Command+A',
  'Control+A',
  'Command+C',
  'Control+C',
  'Command+V',
  'Control+V',
  'Command+X',
  'Control+X',
  'Command+Y',
  'Control+Y',
  'Command+Z',
  'Control+Z',
  'Command+Shift+Z',
  'Control+Shift+Z',
  'Command+H',
  'Command+M',
  'Command+Q',
  'Command+Alt+H',
])

const MODIFIER_ALIASES: Record<string, (typeof MODIFIERS)[number]> = {
  cmd: 'Command',
  command: 'Command',
  meta: 'Command',
  ctrl: 'Control',
  control: 'Control',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
}

export function parseGlobalShortcut(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length > MAX_GLOBAL_SHORTCUT_LENGTH) return null
  const tokens = value
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  if (tokens.length < 2) return null

  const modifiers = new Set<(typeof MODIFIERS)[number]>()
  let key: string | null = null
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()]
    if (modifier) {
      modifiers.add(modifier)
      continue
    }
    if (key || !isAllowedShortcutKey(token)) return null
    key = normalizeShortcutKey(token)
  }

  if (!key || ![...modifiers].some((modifier) => PRIMARY_MODIFIERS.has(modifier))) return null
  return [...MODIFIERS.filter((modifier) => modifiers.has(modifier)), key].join('+')
}

export function normalizeGlobalShortcut(value: unknown): string {
  const parsed = parseGlobalShortcut(value)
  return parsed && !isReservedGlobalShortcut(parsed) ? parsed : DEFAULT_GLOBAL_SHORTCUT
}

export function isReservedGlobalShortcut(accelerator: string): boolean {
  const parsed = parseGlobalShortcut(accelerator)
  return parsed !== null && RESERVED_GLOBAL_SHORTCUTS.has(parsed)
}

function isAllowedShortcutKey(token: string): boolean {
  return /^[a-z0-9]$/i.test(token) || /^f([1-9]|1[0-9]|2[0-4])$/i.test(token) || SPECIAL_SHORTCUT_KEYS.has(token)
}

function normalizeShortcutKey(token: string): string {
  return token.toUpperCase()
}
