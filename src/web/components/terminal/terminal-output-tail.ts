import { TELEGRAM_OUTPUT_TAIL_MAX_LENGTH } from '#/shared/telegram-notifications.ts'

export interface TerminalOutputTail {
  push(data: string): void
  value(): string
  reset(): void
}

type ParserState = 'plain' | 'escape' | 'csi' | 'osc' | 'osc-escape'

export function createTerminalOutputTail(maxCharacters = TELEGRAM_OUTPUT_TAIL_MAX_LENGTH): TerminalOutputTail {
  let state: ParserState = 'plain'
  let characters: string[] = []
  let previousWasCarriageReturn = false
  let whitespacePending = false
  let horizontalRuleLength = 0

  function append(character: string): void {
    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      whitespacePending = characters.length > 0
      horizontalRuleLength = 0
      return
    }
    if (character === '─') {
      horizontalRuleLength += 1
      if (horizontalRuleLength > 3) return
    } else {
      horizontalRuleLength = 0
    }
    if (whitespacePending) characters.push(' ')
    characters.push(character)
    whitespacePending = false
  }

  function push(data: string): void {
    for (const character of data) {
      if (state === 'escape') {
        if (character === '[') state = 'csi'
        else if (character === ']') state = 'osc'
        else state = 'plain'
        continue
      }
      if (state === 'csi') {
        if (character >= '@' && character <= '~') state = 'plain'
        continue
      }
      if (state === 'osc') {
        if (character === '\u0007') state = 'plain'
        else if (character === '\u001b') state = 'osc-escape'
        continue
      }
      if (state === 'osc-escape') {
        state = character === '\\' ? 'plain' : character === '\u001b' ? 'osc-escape' : 'osc'
        continue
      }
      if (character === '\u001b') {
        state = 'escape'
        previousWasCarriageReturn = false
        continue
      }
      if (character === '\r') {
        append('\n')
        previousWasCarriageReturn = true
        continue
      }
      if (character === '\n' && previousWasCarriageReturn) {
        previousWasCarriageReturn = false
        continue
      }
      previousWasCarriageReturn = false
      const codePoint = character.codePointAt(0) ?? 0
      if (character === '\n' || character === '\t' || codePoint >= 0x20) append(character)
    }
    if (characters.length > maxCharacters) {
      characters = characters.slice(-maxCharacters)
      if (characters[0] === ' ') characters.shift()
    }
  }

  return {
    push,
    value: () => characters.join(''),
    reset: () => {
      state = 'plain'
      characters = []
      previousWasCarriageReturn = false
      whitespacePending = false
      horizontalRuleLength = 0
    },
  }
}
