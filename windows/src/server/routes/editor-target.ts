import type { FilePathTarget } from '#/shared/file-path-target.ts'

export function routeEditorTarget(value: unknown): FilePathTarget | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.path !== 'string') return null
  const target: FilePathTarget = { path: input.path }
  if (typeof input.line === 'number' && Number.isSafeInteger(input.line) && input.line > 0) {
    target.line = input.line
    if (typeof input.column === 'number' && Number.isSafeInteger(input.column) && input.column > 0) {
      target.column = input.column
    }
  }
  return target
}
