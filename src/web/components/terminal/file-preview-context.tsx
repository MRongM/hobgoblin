import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { TerminalFilePreview } from '#/web/components/terminal/TerminalFilePreview.tsx'
import {
  createTerminalFilePreviewTarget,
  terminalFilePreviewIdentity,
  type TerminalFilePreviewTarget,
} from '#/web/components/terminal/terminal-file-preview.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'

// Keep the clicked row/link in place until double-click editor intent is resolved.
const SINGLE_CLICK_DELAY_MS = 500

export function useFilePreviewController(scopeKey: string) {
  const [selection, setSelection] = useState<{ scopeKey: string; target: TerminalFilePreviewTarget } | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPendingPreview = useCallback(() => {
    if (pendingTimer.current !== null) clearTimeout(pendingTimer.current)
    pendingTimer.current = null
  }, [])
  const closePreview = useCallback(() => {
    cancelPendingPreview()
    setSelection(null)
  }, [cancelPendingPreview])
  useEffect(() => {
    closePreview()
    return cancelPendingPreview
  }, [scopeKey, closePreview, cancelPendingPreview])
  const requestPreview = useCallback(
    (repoId: string, worktreePath: string, file: FilePathTarget) => {
      cancelPendingPreview()
      const next = createTerminalFilePreviewTarget(repoId, worktreePath, file)
      if (!next) return false
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null
        setSelection((current) =>
          current?.scopeKey === scopeKey &&
          terminalFilePreviewIdentity(current.target) === terminalFilePreviewIdentity(next)
            ? null
            : { scopeKey, target: next },
        )
      }, SINGLE_CLICK_DELAY_MS)
      return true
    },
    [cancelPendingPreview, scopeKey],
  )
  return {
    target: selection?.scopeKey === scopeKey ? selection.target : null,
    requestPreview,
    cancelPendingPreview,
    closePreview,
  }
}

type FilePreviewContextValue = ReturnType<typeof useFilePreviewController> & {
  registerTerminalSurface: () => () => void
}
const FilePreviewContext = createContext<FilePreviewContextValue | null>(null)

export function useFilePreview() {
  return useContext(FilePreviewContext)
}

// A standalone file area owns its preview; inside a workspace it shares that workspace's controller.
export function FilePreviewProvider({ scopeKey, children }: { scopeKey: string; children: ReactNode }) {
  const parent = useFilePreview()
  return parent ? children : <WorkspaceFilePreview scopeKey={scopeKey}>{children}</WorkspaceFilePreview>
}

function WorkspaceFilePreview({ scopeKey, children }: { scopeKey: string; children: ReactNode }) {
  const controller = useFilePreviewController(scopeKey)
  const [terminalSurfaces, setTerminalSurfaces] = useState(0)
  const surface = useRef<HTMLDivElement | null>(null)
  const fallbackSurface = useRef<HTMLDivElement | null>(null)
  const previousFocus = useRef<{ element: HTMLElement; scopeKey: string } | null>(null)
  const [narrow, setNarrow] = useState(false)
  const compactUi = useIsCompactUi()
  const compact = compactUi || narrow
  useLayoutEffect(() => {
    const element = surface.current
    if (!element) return
    const measure = () => {
      const width = element.getBoundingClientRect().width
      setNarrow(width > 0 && width < 800)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const registerTerminalSurface = useCallback(() => {
    setTerminalSurfaces((count) => count + 1)
    return () => setTerminalSurfaces((count) => count - 1)
  }, [])
  const value = useMemo(
    () => ({ ...controller, registerTerminalSurface }),
    [
      controller.target,
      controller.requestPreview,
      controller.cancelPendingPreview,
      controller.closePreview,
      registerTerminalSurface,
    ],
  )
  const fallbackTarget = terminalSurfaces === 0 ? controller.target : null
  useLayoutEffect(() => {
    if (fallbackTarget && compact) {
      if (!previousFocus.current && document.activeElement instanceof HTMLElement) {
        previousFocus.current = { element: document.activeElement, scopeKey }
      }
      fallbackSurface.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    } else if (!fallbackTarget && previousFocus.current) {
      const previous = previousFocus.current
      previousFocus.current = null
      if (previous.scopeKey === scopeKey && previous.element.isConnected) {
        previous.element.focus({ preventScroll: true })
      }
    }
  }, [fallbackTarget, compact, scopeKey])
  return (
    <FilePreviewContext.Provider value={value}>
      <div ref={surface} data-file-preview-surface className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className={fallbackTarget && compact ? 'hidden' : 'flex min-h-0 min-w-0 flex-1 flex-col'}
          inert={(!!fallbackTarget && compact) || undefined}
        >
          {children}
        </div>
        {fallbackTarget && (
          <div
            ref={fallbackSurface}
            className={compact ? 'flex min-h-0 min-w-0 flex-1' : 'flex min-h-0 w-2/5 min-w-80 border-l border-border'}
          >
            <TerminalFilePreview target={fallbackTarget} onClose={controller.closePreview} compact={compact} />
          </div>
        )}
      </div>
    </FilePreviewContext.Provider>
  )
}
