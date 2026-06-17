// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Toaster } from '#/web/components/ui/sonner.tsx'

interface CapturedSonnerProps {
  className?: string
  icons?: Record<string, ReactNode>
  richColors?: boolean
  style?: CSSProperties
  toastOptions?: {
    classNames?: Record<string, string>
  }
}

const sonnerState = vi.hoisted(() => ({
  props: null as CapturedSonnerProps | null,
}))

vi.mock('sonner', () => ({
  Toaster: (props: CapturedSonnerProps) => {
    sonnerState.props = props
    return <div data-testid="sonner-toaster" className={props.className} />
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  sonnerState.props = null
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('Toaster status colors', () => {
  test('maps supported Sonner rich-color statuses to soft semantic theme tokens', () => {
    render(<Toaster position="bottom-right" closeButton />)

    expect(sonnerState.props?.richColors).toBe(true)
    expect(sonnerState.props?.style).toMatchObject({
      '--normal-bg': 'var(--color-popover)',
      '--normal-text': 'var(--color-popover-foreground)',
      '--normal-border': 'var(--color-border)',
      '--success-bg': 'var(--color-success-surface)',
      '--success-text': 'var(--color-success)',
      '--success-border': 'var(--color-success-border)',
      '--error-bg': 'var(--color-danger-surface)',
      '--error-text': 'var(--color-danger)',
      '--error-border': 'var(--color-danger-border)',
      '--warning-bg': 'var(--color-warning-surface)',
      '--warning-text': 'var(--color-warning)',
      '--warning-border': 'var(--color-warning-border)',
      '--info-bg': 'var(--color-success-surface)',
      '--info-text': 'var(--color-success)',
      '--info-border': 'var(--color-success-border)',
    })
  })

  test('uses the warning color family for loading toasts and preserves caller classes', () => {
    render(
      <Toaster
        toastOptions={{
          classNames: {
            loading: 'caller-loading',
            toast: 'caller-toast',
          },
        }}
      />,
    )

    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!bg-warning-surface')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!text-warning')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!border-warning-border')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('caller-loading')
    expect(sonnerState.props?.toastOptions?.classNames?.toast).toContain('max-w-[calc(100vw-2rem)]')
    expect(sonnerState.props?.toastOptions?.classNames?.toast).toContain('caller-toast')
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}
