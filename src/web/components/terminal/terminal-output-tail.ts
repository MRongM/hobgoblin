import { TELEGRAM_OUTPUT_FRAME_CHARACTERS, TELEGRAM_OUTPUT_TAIL_MAX_LENGTH } from '#/shared/telegram-notifications.ts'

export interface TerminalOutputTail {
  push(data: string): void
  value(): string
  reset(): void
}

type ParserState = 'plain' | 'escape' | 'escape-intermediate' | 'csi' | 'osc' | 'st-string' | 'string-escape'

type CharacterSet = 'ascii' | 'dec-special'

const ESC = '\u001b'
const CAN = '\u0018'
const SUB = '\u001a'
const C1_DCS = '\u0090'
const C1_SOS = '\u0098'
const C1_CSI = '\u009b'
const C1_ST = '\u009c'
const C1_OSC = '\u009d'
const C1_PM = '\u009e'
const C1_APC = '\u009f'

const CSI_TEXT_BOUNDARY_FINALS = new Set([
  '@',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'S',
  'T',
  'Z',
  '`',
  'a',
  'd',
  'e',
  'f',
  'u',
])

const DEC_SPECIAL_GRAPHICS: Readonly<Record<string, string>> = {
  '`': '◆',
  a: '▒',
  f: '°',
  g: '±',
  h: '␤',
  j: '┘',
  k: '┐',
  l: '┌',
  m: '└',
  n: '┼',
  o: '⎺',
  p: '⎻',
  q: '─',
  r: '⎼',
  s: '⎽',
  t: '├',
  u: '┤',
  v: '┴',
  w: '┬',
  x: '│',
  y: '≤',
  z: '≥',
  '{': 'π',
  '|': '≠',
  '}': '£',
  '~': '·',
}

export function createTerminalOutputTail(maxCharacters = TELEGRAM_OUTPUT_TAIL_MAX_LENGTH): TerminalOutputTail {
  let state: ParserState = 'plain'
  let escapeIntermediates = ''
  let g0: CharacterSet = 'ascii'
  let g1: CharacterSet = 'ascii'
  let activeCharacterSet: 0 | 1 = 0
  let characters: string[] = []
  let previousWasCarriageReturn = false
  let whitespacePending = false
  let horizontalRuleLength = 0

  function append(character: string): void {
    if (
      character === ' ' ||
      character === '\t' ||
      character === '\n' ||
      character === '\r' ||
      TELEGRAM_OUTPUT_FRAME_CHARACTERS.includes(character)
    ) {
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

  function selectCharacterSet(intermediates: string, finalCharacter: string): void {
    const characterSet: CharacterSet = finalCharacter === '0' ? 'dec-special' : 'ascii'
    if (intermediates === '(') g0 = characterSet
    else if (intermediates === ')') g1 = characterSet
  }

  function applyEscapeIntroducer(character: string): void {
    if (character === '[') state = 'csi'
    else if (character === ']') state = 'osc'
    else if (character === 'P' || character === 'X' || character === '^' || character === '_') {
      state = 'st-string'
    } else if (character === ESC) state = 'escape'
    else if (character >= ' ' && character <= '/') {
      escapeIntermediates = character
      state = 'escape-intermediate'
    } else state = 'plain'
  }

  function applyPlainCharacter(character: string): void {
    if (character === ESC) {
      state = 'escape'
      previousWasCarriageReturn = false
      return
    }
    if (character === C1_CSI) {
      state = 'csi'
      return
    }
    if (character === C1_OSC) {
      state = 'osc'
      return
    }
    if (character === C1_DCS || character === C1_SOS || character === C1_PM || character === C1_APC) {
      state = 'st-string'
      return
    }
    if (character === '\u000e') {
      activeCharacterSet = 1
      return
    }
    if (character === '\u000f') {
      activeCharacterSet = 0
      return
    }
    if (character === '\r') {
      append('\n')
      previousWasCarriageReturn = true
      return
    }
    if (character === '\n' && previousWasCarriageReturn) {
      previousWasCarriageReturn = false
      return
    }
    previousWasCarriageReturn = false
    if (
      character === '\n' ||
      character === '\t' ||
      character === '\b' ||
      character === '\u000b' ||
      character === '\u000c'
    ) {
      append(' ')
      return
    }
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return
    const characterSet = activeCharacterSet === 0 ? g0 : g1
    append(characterSet === 'dec-special' ? (DEC_SPECIAL_GRAPHICS[character] ?? character) : character)
  }

  function push(data: string): void {
    for (const character of data) {
      if (character === CAN || character === SUB) {
        state = 'plain'
        escapeIntermediates = ''
        previousWasCarriageReturn = false
        continue
      }
      if (state === 'escape') {
        applyEscapeIntroducer(character)
        continue
      }
      if (state === 'escape-intermediate') {
        if (character >= ' ' && character <= '/') {
          escapeIntermediates += character
        } else if (character >= '0' && character <= '~') {
          selectCharacterSet(escapeIntermediates, character)
          escapeIntermediates = ''
          state = 'plain'
        } else if (character === ESC) {
          escapeIntermediates = ''
          state = 'escape'
        }
        continue
      }
      if (state === 'csi') {
        if (character >= '@' && character <= '~') {
          if (CSI_TEXT_BOUNDARY_FINALS.has(character)) append(' ')
          state = 'plain'
        } else if (character === ESC) state = 'escape'
        continue
      }
      if (state === 'osc') {
        if (character === '\u0007' || character === C1_ST) state = 'plain'
        else if (character === ESC) state = 'string-escape'
        continue
      }
      if (state === 'st-string') {
        if (character === C1_ST) state = 'plain'
        else if (character === ESC) state = 'string-escape'
        continue
      }
      if (state === 'string-escape') {
        if (character === '\\') state = 'plain'
        else applyEscapeIntroducer(character)
        continue
      }
      applyPlainCharacter(character)
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
      escapeIntermediates = ''
      g0 = 'ascii'
      g1 = 'ascii'
      activeCharacterSet = 0
      characters = []
      previousWasCarriageReturn = false
      whitespacePending = false
      horizontalRuleLength = 0
    },
  }
}
