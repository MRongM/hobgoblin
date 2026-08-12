import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'
import { canOpenDetachedFileAreaWindow, openDetachedFileAreaWindow } from '#/web/app-shell-client.ts'
import { isFileAreaTabDropOutsideViewport } from '#/web/lib/detached-file-area.ts'
import { useT } from '#/web/stores/i18n.ts'

type CapturedFileAreaRequest = DetachedFileAreaWindowRequest extends infer Request
  ? Request extends DetachedFileAreaWindowRequest
    ? Omit<Request, 'releasePoint'>
    : never
  : never

export function useDetachFileArea(request: CapturedFileAreaRequest, options: { enabled?: boolean } = {}) {
  const t = useT()
  const enabled = options.enabled !== false && canOpenDetachedFileAreaWindow()
  const [dragging, setDragging] = useState(false)
  const dragRequestRef = useRef<CapturedFileAreaRequest | null>(null)

  const open = (capturedRequest: CapturedFileAreaRequest, releasePoint?: { x: number; y: number }) => {
    if (!enabled) return
    void openDetachedFileAreaWindow({
      ...capturedRequest,
      ...(releasePoint ? { releasePoint } : {}),
    } as DetachedFileAreaWindowRequest)
      .then((result) => {
        if (!result.ok) toast.error(t(result.message))
      })
      .catch(() => toast.error(t('error.failed-open-window')))
  }

  return {
    enabled,
    dragging,
    bindings: {
      draggable: enabled,
      title: enabled ? t('file-area.detach-hint') : undefined,
      'aria-keyshortcuts': enabled ? 'Shift+Enter' : undefined,
      onDragStart(event: DragEvent<HTMLElement>) {
        if (!enabled) {
          event.preventDefault()
          return
        }
        dragRequestRef.current = request
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData('application/x-hobgoblin-file-area-tab', request.tab)
        setDragging(true)
      },
      onDragEnd(event: DragEvent<HTMLElement>) {
        setDragging(false)
        const capturedRequest = dragRequestRef.current ?? request
        dragRequestRef.current = null
        if (
          !enabled ||
          !isFileAreaTabDropOutsideViewport(event, { width: window.innerWidth, height: window.innerHeight })
        )
          return
        open(
          capturedRequest,
          Number.isFinite(event.screenX) && Number.isFinite(event.screenY)
            ? { x: event.screenX, y: event.screenY }
            : undefined,
        )
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (!enabled || !event.shiftKey || event.key !== 'Enter') return
        event.preventDefault()
        open(request)
      },
    },
  }
}
