type TerminalExternalInputFillHandler = (value: string) => boolean

const handlers = new Map<string, TerminalExternalInputFillHandler>()

export function setTerminalExternalInputFillHandler(
  worktreeTerminalKey: string,
  handler: TerminalExternalInputFillHandler,
): () => void {
  handlers.set(worktreeTerminalKey, handler)
  return () => {
    if (handlers.get(worktreeTerminalKey) === handler) handlers.delete(worktreeTerminalKey)
  }
}

export function fillTerminalExternalInput(worktreeTerminalKey: string, value: string): boolean {
  return handlers.get(worktreeTerminalKey)?.(value) ?? false
}
