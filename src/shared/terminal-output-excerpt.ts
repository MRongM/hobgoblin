const TERMINAL_OUTPUT_FRAME_RUN = /[╭╮╰╯│┌┐└┘├┤┬┴┼]+/gu

export function normalizeTerminalOutputExcerpt(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value
    .replace(TERMINAL_OUTPUT_FRAME_RUN, ' ')
    .replace(/[ \t\r\n]+/gu, ' ')
    .replace(/─{4,}/gu, '───')
    .trim()
  return normalized || undefined
}

export function truncateTerminalOutputExcerpt(value: string | undefined, maxCharacters: number): string | undefined {
  if (maxCharacters < 1) return undefined
  const normalized = normalizeTerminalOutputExcerpt(value)
  if (!normalized) return undefined
  const characters = Array.from(normalized)
  if (characters.length <= maxCharacters) return normalized
  const suffix = characters.slice(-maxCharacters)
  if (suffix[0] === ' ') suffix.shift()
  return suffix.join('') || undefined
}
