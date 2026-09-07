const DEFAULT_MAX_ATTEMPTS = 3

export interface BranchWorkspaceRetryOptions<T> {
  signal?: AbortSignal
  retryResult?: (value: T) => boolean
}

export async function withBranchWorkspaceRetry<T>(
  operation: () => Promise<T>,
  options: BranchWorkspaceRetryOptions<T> = {},
): Promise<T> {
  // Keep retries bounded and cancellable so transient Git races never block a workspace action indefinitely.
  let lastError: unknown
  for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) throw new Error('cancelled')
    try {
      const value = await operation()
      if (!options.retryResult?.(value) || attempt + 1 >= DEFAULT_MAX_ATTEMPTS) return value
      await delay(25 * (attempt + 1), options.signal)
      continue
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) throw new Error('cancelled')
      if (!isTransientBranchWorkspaceFailure(error) || attempt + 1 >= DEFAULT_MAX_ATTEMPTS) throw error
      await delay(25 * (attempt + 1), options.signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function isTransientBranchWorkspaceFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (
    !message ||
    /cancelled|abort|invalid-|outside-root|protected|locked-worktree|primary-worktree|permission denied/iu.test(message)
  )
    return false
  return /temporary|timed? ?out|timeout|connection|e(?:again|busy|io|pipe|connreset|connrefused)|resource busy|index\.lock|unable to access|could not resolve/iu.test(
    message,
  )
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    if (!signal) return
    const abort = () => {
      clearTimeout(timer)
      reject(new Error('cancelled'))
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
