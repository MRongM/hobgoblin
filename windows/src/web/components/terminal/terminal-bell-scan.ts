/** Detects BEL rings in raw terminal output for sessions that have no live
 *  xterm view (background projects, viewer role, never-attached sessions),
 *  where output would otherwise be dropped without ringing.
 *
 *  A plain indexOf('\x07') would false-positive constantly: BEL is also the
 *  legacy terminator for OSC sequences (e.g. title updates `ESC]0;...\x07`).
 *  The scanner tracks just enough VT parser state to tell a real ring from a
 *  string terminator, and keeps that state across output chunks so sequences
 *  split between events are still handled.
 */

const BEL = 0x07
const CAN = 0x18
const SUB = 0x1a
const ESC = 0x1b
const BACKSLASH = 0x5c
const C1_DCS = 0x90
const C1_SOS = 0x98
const C1_ST = 0x9c
const C1_OSC = 0x9d
const C1_PM = 0x9e
const C1_APC = 0x9f

type BellScanState =
  | 'normal'
  | 'escape'
  // OSC payload: BEL or ST terminates.
  | 'osc'
  // DCS/SOS/PM/APC payload: only ST terminates; embedded BEL does not ring.
  | 'stString'
  // ESC seen inside a string payload: `\` completes ST, anything else cancels
  // the string and is reprocessed as an escape introducer.
  | 'stringEscape'

export interface TerminalBellScanner {
  scan: (data: string) => boolean
  reset: () => void
}

export function createTerminalBellScanner(): TerminalBellScanner {
  let state: BellScanState = 'normal'

  function applyEscapeIntroducer(code: number): void {
    if (code === 0x5d) state = 'osc'
    else if (code === 0x50 || code === 0x58 || code === 0x5e || code === 0x5f) state = 'stString'
    else if (code === ESC) state = 'escape'
    else state = 'normal'
  }

  return {
    scan(data: string): boolean {
      let found = false
      for (let i = 0; i < data.length; i++) {
        const code = data.charCodeAt(i)
        // CAN/SUB abort any in-flight sequence (VT "anywhere" transitions);
        // without this a stream cut off mid-DCS would swallow every later ring
        // until an ST happens to arrive.
        if ((code === CAN || code === SUB) && state !== 'normal') {
          state = 'normal'
          continue
        }
        switch (state) {
          case 'normal':
            if (code === BEL) found = true
            else if (code === ESC) state = 'escape'
            else if (code === C1_OSC) state = 'osc'
            else if (code === C1_DCS || code === C1_SOS || code === C1_PM || code === C1_APC) state = 'stString'
            break
          case 'escape':
            applyEscapeIntroducer(code)
            break
          case 'osc':
            if (code === BEL || code === C1_ST) state = 'normal'
            else if (code === ESC) state = 'stringEscape'
            break
          case 'stString':
            if (code === C1_ST) state = 'normal'
            else if (code === ESC) state = 'stringEscape'
            break
          case 'stringEscape':
            if (code === BACKSLASH) state = 'normal'
            else applyEscapeIntroducer(code)
            break
        }
      }
      return found
    },
    reset(): void {
      state = 'normal'
    },
  }
}
