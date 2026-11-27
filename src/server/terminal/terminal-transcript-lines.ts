import type { TerminalTranscriptInput, TerminalTranscriptLine } from '#/server/terminal/terminal-transcript-model.ts'

const MAX_LINE_CHARS = 2_048
type Escape = 'esc' | 'csi' | 'string' | 'string-end' | 'charset'

interface LineState {
  terminalId: string
  executionId: string
  text: string
  truncated: boolean
  carriageReturn: boolean
  escape?: Escape
}

export function createTerminalTranscriptLines() {
  const active = new Map<string, LineState>()

  function consume(inputs: TerminalTranscriptInput[]) {
    const lines: Array<TerminalTranscriptLine & { terminalId: string }> = []
    for (const input of inputs) {
      const { terminalId, executionId } = input
      let state = active.get(terminalId)
      if (state?.executionId !== executionId) {
        state = { terminalId, executionId, text: '', truncated: false, carriageReturn: false }
        active.set(terminalId, state)
      }
      const push = (text: string | null, truncated: boolean) => lines.push({ terminalId, executionId, text, truncated })
      if (input.kind === 'output') {
        for (const char of input.data) {
          if (char === '\n' && (!state.escape || state.escape === 'csi')) {
            push(state.text, state.truncated)
            state.text = ''
            state.truncated = false
            state.carriageReturn = false
          } else readChar(state, char)
        }
      } else if (input.kind === 'gap') {
        if (state.text) push(state.text, true)
        push(null, true)
        active.delete(terminalId)
      } else {
        if (state.text) push(state.text, state.truncated)
        active.delete(terminalId)
      }
    }
    return lines
  }

  return {
    consume,
    tail(terminalId: string) {
      const state = active.get(terminalId)
      return state?.text ? { executionId: state.executionId, text: state.text, truncated: state.truncated } : null
    },
    finish() {
      return consume(
        [...active.values()].map(({ terminalId, executionId }) => ({ terminalId, executionId, kind: 'end' })),
      )
    },
  }
}

function readChar(state: LineState, char: string) {
  if (state.escape) {
    switch (state.escape) {
      case 'esc':
        if (char === '[') state.escape = 'csi'
        else if (']PX^_'.includes(char)) state.escape = 'string'
        else if ('()*+-./'.includes(char)) state.escape = 'charset'
        else state.escape = undefined
        break
      case 'csi':
        if (char >= '@' && char <= '~') state.escape = undefined
        break
      case 'string':
        if (char === '\x07' || char === '\x9c') state.escape = undefined
        else if (char === '\x1b') state.escape = 'string-end'
        break
      case 'string-end':
        state.escape = char === '\\' ? undefined : 'string'
        break
      case 'charset':
        state.escape = undefined
        break
    }
    return
  }
  if (char === '\x1b') state.escape = 'esc'
  else if (char === '\x9b') state.escape = 'csi'
  else if ('\x90\x98\x9d\x9e\x9f'.includes(char)) state.escape = 'string'
  else if (char === '\r') state.carriageReturn = true
  else if (char === '\b') state.text = state.text.replace(/.$/u, '')
  else if (char === '\t' || (char >= ' ' && (char < '\x7f' || char > '\x9f'))) {
    if (state.carriageReturn) {
      state.text = ''
      state.truncated = false
      state.carriageReturn = false
    }
    if (state.text.length + char.length <= MAX_LINE_CHARS) state.text += char
    else state.truncated = true
  }
}
