import { describe, expect, test } from 'vitest'
import { commitFileStatusTone, formatHistoryDate } from '#/web/components/repo-workspace/history-graph.ts'

describe('history graph model', () => {
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
