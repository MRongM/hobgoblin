import { useEffect, useRef, useState } from 'react'

export type LatestPlanRequestStatus = 'incomplete' | 'planning' | 'ready' | 'error'

export interface LatestPlanRequestState {
  status: LatestPlanRequestStatus
  readyRequestKey: string | null
}

export function useLatestPlanRequest<TRequest>({
  enabled,
  request,
  requestKey,
  revision = 0,
  notBefore = 0,
  debounceMs = 0,
  requestPlan,
}: {
  enabled: boolean
  request: TRequest | null
  requestKey: string | null
  revision?: number
  notBefore?: number
  debounceMs?: number
  requestPlan: (request: TRequest, signal: AbortSignal) => Promise<boolean>
}): LatestPlanRequestState {
  const [state, setState] = useState<LatestPlanRequestState>({ status: 'incomplete', readyRequestKey: null })
  const requestPlanRef = useRef(requestPlan)
  requestPlanRef.current = requestPlan

  useEffect(() => {
    if (!enabled || !request || !requestKey) {
      setState({ status: 'incomplete', readyRequestKey: null })
      return
    }
    // Start the latest request without waiting for an aborted slow request to settle.
    const controller = new AbortController()
    setState({ status: 'planning', readyRequestKey: null })
    const run = async () => {
      const ok = await requestPlanRef.current(request, controller.signal).catch(() => false)
      if (!controller.signal.aborted) {
        setState({ status: ok ? 'ready' : 'error', readyRequestKey: ok ? requestKey : null })
      }
    }
    const delay = Math.max(debounceMs, notBefore - Date.now(), 0)
    const timer = delay > 0 ? setTimeout(() => void run(), delay) : null
    if (timer === null) void run()
    return () => {
      if (timer !== null) clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, notBefore, requestKey, revision, debounceMs])

  return state
}
