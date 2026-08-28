// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useLatestPlanRequest } from '#/web/hooks/useLatestPlanRequest.ts'

interface Request {
  value: string
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useLatestPlanRequest', () => {
  test('aborts an obsolete request and starts only the latest request after it settles', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const requestPlan = vi
      .fn<(request: Request, signal: AbortSignal) => Promise<boolean>>()
      .mockImplementationOnce(async (_request, signal) => {
        await first.promise
        if (signal.aborted) return false
        return true
      })
      .mockImplementationOnce(async () => await second.promise)
    let state: ReturnType<typeof useLatestPlanRequest<Request>> | null = null
    const render = (request: Request | null) => {
      act(() =>
        root.render(
          <Harness
            request={request}
            requestPlan={requestPlan}
            onReady={(value) => {
              state = value
            }}
          />,
        ),
      )
    }

    render({ value: 'first' })
    await flushAsyncWork()
    expect(requestPlan).toHaveBeenCalledTimes(1)
    const firstSignal = requestPlan.mock.calls[0]?.[1]

    render({ value: 'second' })
    await flushAsyncWork()
    expect(firstSignal?.aborted).toBe(true)
    expect(requestPlan).toHaveBeenCalledTimes(1)
    expect(state!.status).toBe('planning')
    expect(state!.readyRequestKey).toBeNull()

    await act(async () => {
      first.resolve(true)
      await first.promise
      await Promise.resolve()
    })
    expect(requestPlan).toHaveBeenCalledTimes(2)
    expect(requestPlan.mock.calls[1]?.[0]).toEqual({ value: 'second' })

    await act(async () => {
      second.resolve(true)
      await second.promise
      await Promise.resolve()
    })
    expect(state!.status).toBe('ready')
    expect(state!.readyRequestKey).toBe(JSON.stringify({ value: 'second' }))
  })

  test('waits until the supplied planning boundary before starting text-input work', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'))
    const requestPlan = vi.fn(async () => true)

    act(() =>
      root.render(
        <Harness
          request={{ value: 'feature/new-name' }}
          notBefore={Date.now() + 300}
          requestPlan={requestPlan}
          onReady={() => {}}
        />,
      ),
    )

    await act(async () => vi.advanceTimersByTime(299))
    expect(requestPlan).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(requestPlan).toHaveBeenCalledOnce()
  })

  test('replans the same request after an explicit revision change', async () => {
    const requestPlan = vi.fn(async () => true)
    let revision = 0
    const render = () => {
      act(() =>
        root.render(
          <Harness request={{ value: 'same' }} revision={revision} requestPlan={requestPlan} onReady={() => {}} />,
        ),
      )
    }

    render()
    await flushAsyncWork()
    expect(requestPlan).toHaveBeenCalledOnce()

    render()
    await flushAsyncWork()
    expect(requestPlan).toHaveBeenCalledOnce()

    revision += 1
    render()
    await flushAsyncWork()
    expect(requestPlan).toHaveBeenCalledTimes(2)
  })
})

function Harness({
  request,
  revision = 0,
  notBefore = 0,
  requestPlan,
  onReady,
}: {
  request: Request | null
  revision?: number
  notBefore?: number
  requestPlan: (request: Request, signal: AbortSignal) => Promise<boolean>
  onReady: (value: ReturnType<typeof useLatestPlanRequest<Request>>) => void
}) {
  const value = useLatestPlanRequest({
    enabled: true,
    request,
    requestKey: request ? JSON.stringify(request) : null,
    revision,
    notBefore,
    requestPlan,
  })
  useEffect(() => onReady(value), [onReady, value])
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
