import { arrayMove } from '@dnd-kit/sortable'

export function moveTerminalCustomButtonRow<T>(rows: T[], fromIndex: number, toIndex: number): T[] {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return rows
  if (fromIndex === toIndex) return rows
  if (fromIndex < 0 || toIndex < 0) return rows
  if (fromIndex >= rows.length || toIndex >= rows.length) return rows
  return arrayMove(rows, fromIndex, toIndex)
}
