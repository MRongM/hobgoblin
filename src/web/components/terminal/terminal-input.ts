export type TerminalInput =
  | {
      origin: 'user-intent'
      source: 'keyboard' | 'paste' | 'drop' | 'toolbar' | 'command' | 'xterm'
      data: string
    }
  | {
      origin: 'terminal-emulator'
      source: 'data'
      data: string
    }
