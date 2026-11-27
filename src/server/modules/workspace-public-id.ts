import { createHash } from 'node:crypto'

export function workspacePublicId(locator: string): string {
  return createHash('sha256').update(locator).digest('hex').slice(0, 24)
}
