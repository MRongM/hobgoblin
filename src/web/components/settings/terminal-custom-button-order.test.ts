import { describe, expect, test } from 'vitest'
import { moveTerminalCustomButtonRow } from '#/web/components/settings/terminal-custom-button-order.ts'

describe('moveTerminalCustomButtonRow', () => {
  test('moves a row forward while preserving every row object', () => {
    const first = { id: 'first' }
    const second = { id: 'second' }
    const third = { id: 'third' }
    const rows = [first, second, third]

    const nextRows = moveTerminalCustomButtonRow(rows, 0, 2)

    expect(nextRows).toEqual([second, third, first])
    expect(nextRows[2]).toBe(first)
    expect(nextRows).not.toBe(rows)
  })

  test('moves a row backward while preserving every row object', () => {
    const first = { id: 'first' }
    const second = { id: 'second' }
    const third = { id: 'third' }
    const rows = [first, second, third]

    const nextRows = moveTerminalCustomButtonRow(rows, 2, 0)

    expect(nextRows).toEqual([third, first, second])
    expect(nextRows[0]).toBe(third)
    expect(nextRows).not.toBe(rows)
  })

  test('returns the same array for no-op and invalid moves', () => {
    const rows = [{ id: 'first' }, { id: 'second' }]

    expect(moveTerminalCustomButtonRow(rows, 0, 0)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, -1, 1)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0, -1)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 2, 0)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0, 2)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0.5, 1)).toBe(rows)
  })
})
