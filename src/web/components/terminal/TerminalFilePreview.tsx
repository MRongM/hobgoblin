import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'
import {
  readTerminalFilePreview,
  terminalFilePreviewPath,
  type TerminalFilePreviewReadResult,
  type TerminalFilePreviewTarget,
} from '#/web/components/terminal/terminal-file-preview.ts'

export interface TerminalFilePreviewProps {
  target: TerminalFilePreviewTarget
  onClose: () => void
  compact?: boolean
}

type PreviewState = {
  target: TerminalFilePreviewTarget
} & (
  | { status: 'loading' | 'closed' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: TerminalFilePreviewReadResult & { ok: true } }
)

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

export function TerminalFilePreview({ target, onClose, compact = false }: TerminalFilePreviewProps) {
  const t = useT()
  const [state, setState] = useState<PreviewState>({ target, status: 'loading' })
  const requestToken = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const token = ++requestToken.current
    activeController.current = controller
    setState({ target, status: 'loading' })
    void (async () => {
      try {
        const result = await readTerminalFilePreview(target, controller.signal)
        if (controller.signal.aborted || requestToken.current !== token) return
        if (result.ok) {
          setState({ target, status: 'ready', result })
        } else {
          const message =
            result.kind === 'image' && result.message === 'error.file-tree-clipboard-file-too-large'
              ? 'terminal.file-preview.image-too-large'
              : result.message
          setState({ target, status: 'error', message })
        }
      } catch {
        if (controller.signal.aborted || requestToken.current !== token) return
        setState({ target, status: 'error', message: 'terminal.file-preview.read-failed' })
      }
    })()
    return () => {
      controller.abort()
      if (activeController.current === controller) activeController.current = null
    }
  }, [target])

  const current = state.target === target ? state : null
  const displayPath = target.relativePath ?? terminalFilePreviewPath(target)
  const basename = displayPath.split(/[\\/]/u).at(-1) ?? displayPath
  const line = target.target.line
  const column = target.target.column
  const ready = current?.status === 'ready' ? current.result : null
  const imageMime =
    ready?.kind === 'image'
      ? ready.mimeType || IMAGE_MIME_TYPES[displayPath.split('.').at(-1)?.toLowerCase() ?? '']
      : undefined

  function close() {
    ++requestToken.current
    activeController.current?.abort()
    setState({ target, status: 'closed' })
    onClose()
  }

  return (
    <section
      data-terminal-file-preview
      aria-label={t('terminal.file-preview.title')}
      className={`goblin-terminal-file-preview${compact ? ' goblin-terminal-file-preview--compact' : ''}`}
    >
      <header className="goblin-terminal-file-preview__header">
        <div className="goblin-terminal-file-preview__identity">
          <strong className="goblin-terminal-file-preview__name" title={basename}>
            {basename}
          </strong>
          <div className="goblin-terminal-file-preview__path" title={displayPath}>
            {displayPath}
          </div>
          {line !== undefined && (
            <div className="goblin-terminal-file-preview__location">
              {column === undefined
                ? t('terminal.file-preview.line', { line })
                : t('terminal.file-preview.line-column', { line, column })}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={close} aria-label={t('terminal.file-preview.close')}>
          {t('terminal.file-preview.close')}
        </Button>
      </header>
      <div className="goblin-terminal-file-preview__body">
        {(!current || current.status === 'loading') && (
          <div className="goblin-terminal-file-preview__state" role="status">
            {t('terminal.file-preview.loading')}
          </div>
        )}
        {current?.status === 'error' && (
          <div className="goblin-terminal-file-preview__state" role="alert">
            {t(current.message)}
          </div>
        )}
        {ready?.kind === 'text' && <PreviewText content={ready.content} line={line} />}
        {ready?.kind === 'image' &&
          (imageMime ? (
            <div className="goblin-terminal-file-preview__image-container">
              <img
                className="goblin-terminal-file-preview__image"
                src={`data:${imageMime};base64,${ready.bytesBase64}`}
                alt={basename}
                onError={() => {
                  setState((previous) =>
                    previous === current
                      ? { target, status: 'error', message: 'terminal.file-preview.invalid-image' }
                      : previous,
                  )
                }}
              />
            </div>
          ) : (
            <div className="goblin-terminal-file-preview__state" role="alert">
              {t('terminal.file-preview.unsupported')}
            </div>
          ))}
      </div>
    </section>
  )
}

function PreviewText({ content, line }: { content: string; line?: number }) {
  const referencedLine = useRef<HTMLSpanElement | null>(null)
  const text = useMemo(() => {
    // Keep text and gutter as single strings rather than creating a DOM element per line.
    // A 1 MiB text file may contain more than a million blank lines.
    let gutter = '1'
    let lineNumber = 1
    let start = line === 1 ? 0 : -1
    let end = -1
    for (let index = 0; index < content.length; index++) {
      if (content[index] !== '\n') continue
      if (lineNumber === line) end = index
      lineNumber++
      gutter += `\n${lineNumber}`
      if (lineNumber === line) start = index + 1
    }
    if (start >= 0 && end < 0) end = content.length
    return { gutter, start, end }
  }, [content, line])

  useEffect(() => {
    referencedLine.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [content, line])

  return (
    <div className="goblin-terminal-file-preview__text-scroll" tabIndex={0}>
      <div className="goblin-terminal-file-preview__text">
        <pre className="goblin-terminal-file-preview__gutter" aria-hidden="true" data-preview-gutter>
          {text.gutter}
        </pre>
        <pre className="goblin-terminal-file-preview__source" data-preview-source>
          {text.start < 0 ? (
            content
          ) : (
            <>
              {content.slice(0, text.start)}
              <span
                className="goblin-terminal-file-preview__referenced-line"
                data-preview-line={line}
                ref={referencedLine}
              >
                {content.slice(text.start, text.end)}
              </span>
              {content.slice(text.end)}
            </>
          )}
        </pre>
      </div>
    </div>
  )
}
