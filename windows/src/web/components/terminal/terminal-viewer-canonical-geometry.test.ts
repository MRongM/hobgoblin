import { Terminal } from '@xterm/headless'
import { describe, expect, test } from 'vitest'

const CANONICAL_COLS = 120
const CANONICAL_ROWS = 40
const STATUS_REDRAW_COUNT = 8

async function writeTerminal(term: Terminal, data: string): Promise<void> {
  await new Promise<void>((resolve) => term.write(data, resolve))
}

async function redrawCanonicalFinalRow(term: Terminal): Promise<void> {
  const statusLine = ' tmux status '.padEnd(CANONICAL_COLS, ' ')
  for (let index = 0; index < STATUS_REDRAW_COUNT; index += 1) {
    await writeTerminal(term, `\x1b[${CANONICAL_ROWS};1H${statusLine}`)
  }
}

describe('read-only terminal canonical geometry', () => {
  test('prevents repeated final-row redraws from manufacturing scrollback', async () => {
    const canonical = new Terminal({
      allowProposedApi: true,
      cols: CANONICAL_COLS,
      rows: CANONICAL_ROWS,
      scrollback: 100,
    })
    const locallyFitted = new Terminal({ allowProposedApi: true, cols: 40, rows: 20, scrollback: 100 })

    try {
      await redrawCanonicalFinalRow(canonical)
      await redrawCanonicalFinalRow(locallyFitted)

      expect(canonical.buffer.active.baseY).toBe(0)
      expect(locallyFitted.buffer.active.baseY).toBeGreaterThan(0)
    } finally {
      canonical.dispose()
      locallyFitted.dispose()
    }
  })
})
