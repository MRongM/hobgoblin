import type { ReactNode } from 'react'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { filePathTargetsForText } from '#/shared/file-path-target.ts'
import { cn } from '#/web/lib/cn.ts'

interface PathTargetTextProps {
  text: string
  className?: string
  onRevealPath?: (relativePath: string) => void
  onOpenPathInEditor?: (target: FilePathTarget) => void
}

export function PathTargetText({ text, className, onRevealPath, onOpenPathInEditor }: PathTargetTextProps) {
  const spans = filePathTargetsForText(text)
  if (spans.length === 0) return <span className={className}>{text}</span>

  const nodes: ReactNode[] = []
  let cursor = 0
  spans.forEach((span, index) => {
    if (span.startIndex > cursor) nodes.push(text.slice(cursor, span.startIndex))
    nodes.push(
      <span
        key={`${span.startIndex}:${index}`}
        data-path-target={span.target.path}
        role="link"
        tabIndex={0}
        className="cursor-pointer text-brand-text underline decoration-border underline-offset-2 hover:decoration-brand-text"
        onClick={() => onRevealPath?.(span.target.path)}
        onDoubleClick={() => onOpenPathInEditor?.(span.target)}
      >
        {span.text}
      </span>,
    )
    cursor = span.endIndex
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))

  return <span className={cn('whitespace-pre-wrap break-words', className)}>{nodes}</span>
}
