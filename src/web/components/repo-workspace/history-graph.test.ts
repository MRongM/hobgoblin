import { describe, expect, test } from 'vitest'
import { buildHistoryGraphRows, commitFileStatusTone, formatHistoryDate } from '#/web/components/repo-workspace/history-graph.ts'
import type { CommitHistoryEntry } from '#/web/types.ts'

function entry(hash: string, parents: string[] = []): CommitHistoryEntry {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    subject: `commit ${hash}`,
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents,
  }
}

describe('history graph model', () => {
  test('keeps a straight line for single-parent history', () => {
    expect(buildHistoryGraphRows([entry('c3', ['c2']), entry('c2', ['c1']), entry('c1')])).toEqual([
      { commit: entry('c3', ['c2']), lane: 0, laneCount: 1, parentLanes: [0] },
      { commit: entry('c2', ['c1']), lane: 0, laneCount: 1, parentLanes: [0] },
      { commit: entry('c1'), lane: 0, laneCount: 1, parentLanes: [] },
    ])
  })

  test('adds lanes for merge parents', () => {
    const rows = buildHistoryGraphRows([entry('m1', ['a1', 'b1']), entry('a1'), entry('b1')])

    expect(rows[0]).toEqual({ commit: entry('m1', ['a1', 'b1']), lane: 0, laneCount: 2, parentLanes: [0, 1] })
    expect(rows[1]?.lane).toBe(0)
    expect(rows[2]?.lane).toBe(1)
  })

  test('maps file status tones', () => {
    expect(commitFileStatusTone('added')).toBe('text-success')
    expect(commitFileStatusTone('deleted')).toBe('text-danger')
    expect(commitFileStatusTone('modified')).toBe('text-warning')
    expect(commitFileStatusTone('unknown')).toBe('text-muted-foreground')
  })

  test('formats dates defensively', () => {
    expect(formatHistoryDate('2026-06-15T09:00:00+08:00')).toContain('2026')
    expect(formatHistoryDate('not-a-date')).toBe('not-a-date')
  })
})
