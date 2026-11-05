export function nextVisibleTerminal(keys: string[], stashed: ReadonlySet<string>, current: string): string | null {
  const index = keys.indexOf(current)
  return (
    keys.slice(index + 1).find((key) => !stashed.has(key)) ??
    keys
      .slice(0, Math.max(index, 0))
      .reverse()
      .find((key) => !stashed.has(key)) ??
    null
  )
}

export function reorderVisibleTerminals(all: string[], visible: string[]): string[] {
  const visibleKeys = new Set(visible)
  let index = 0
  return all.map((key) => (visibleKeys.has(key) ? visible[index++]! : key))
}
