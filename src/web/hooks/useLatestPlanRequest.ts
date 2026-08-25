import { useEffect, useRef, useState } from 'react'

export type LatestPlanRequestStatus = 'incomplete' | 'planning' | 'ready' | 'error'

export interface LatestPlanRequestState {
  status: LatestPlanRequestStatus
  readyRequestKey: string | null
}

interface PlanJob<TRequest> {
  request: TRequest
  requestKey: string
  version: number
}

export function useLatestPlanRequest<TRequest>({
  enabled,
  request,
  requestKey,
  revision = 0,
  notBefore = 0,
  requestPlan,
}: {
  enabled: boolean
  request: TRequest | null
  requestKey: string | null
  revision?: number
  notBefore?: number
  requestPlan: (request: TRequest, signal: AbortSignal) => Promise<boolean>
}): LatestPlanRequestState {
  const [state, setState] = useState<LatestPlanRequestState>({
    status: 'incomplete',
    readyRequestKey: null,
  })
  const mounted = useRef(true)
  const desiredVersion = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuedJob = useRef<PlanJob<TRequest> | null>(null)
  const activeController = useRef<AbortController | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const requestPlanRef = useRef(requestPlan)
  requestPlanRef.current = requestPlan

  const pump = useRef<() => void>(() => undefined)
  pump.current = () => {
    if (running.current) return
    const run = async () => {
      while (queuedJob.current) {
        const job = queuedJob.current
        queuedJob.current = null
        const controller = new AbortController()
        activeController.current = controller
        let ok = false
        try {
          ok = await requestPlanRef.current(job.request, controller.signal)
        } catch {
          ok = false
        } finally {
          if (activeController.current === controller) activeController.current = null
        }
        if (!mounted.current || controller.signal.aborted || job.version !== desiredVersion.current) continue
        setState({
          status: ok ? 'ready' : 'error',
          readyRequestKey: ok ? job.requestKey : null,
        })
      }
    }
    running.current = run().finally(() => {
      running.current = null
      if (queuedJob.current) pump.current()
    })
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      queuedJob.current = null
      activeController.current?.abort()
      activeController.current = null
    }
  }, [])

  useEffect(() => {
    const version = desiredVersion.current + 1
    desiredVersion.current = version
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    queuedJob.current = null
    activeController.current?.abort()

    if (!enabled || !request || !requestKey) {
      setState({ status: 'incomplete', readyRequestKey: null })
      return
    }

    setState({ status: 'planning', readyRequestKey: null })
    const enqueue = () => {
      timer.current = null
      if (!mounted.current || version !== desiredVersion.current) return
      queuedJob.current = { request, requestKey, version }
      pump.current()
    }
    const delay = Math.max(0, notBefore - Date.now())
    if (delay === 0) enqueue()
    else timer.current = setTimeout(enqueue, delay)
  }, [enabled, notBefore, requestKey, revision])

  return state
}
