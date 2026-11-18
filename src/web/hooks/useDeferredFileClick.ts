import { useCallback, useEffect, useRef } from 'react'

// A double click opens the editor. Keep its target in place until the second click can arrive.
const DOUBLE_CLICK_DELAY_MS = 500

export function useDeferredFileClick() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const schedule = useCallback(
    (action: () => void) => {
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        action()
      }, DOUBLE_CLICK_DELAY_MS)
    },
    [cancel],
  )
  useEffect(() => cancel, [cancel])
  return { schedule, cancel }
}
