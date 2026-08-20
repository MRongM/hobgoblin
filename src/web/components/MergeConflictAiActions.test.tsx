// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MergeConflictAiActions } from '#/web/components/MergeConflictAiActions.tsx'

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(async () => {}),
  onHandoffComplete: vi.fn(),
}))

vi.mock('#/web/hooks/useMergeConflictAiActions.ts', () => ({
  useMergeConflictAiActions: () => ({ actions: [], error: null }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
const originalResizeObserver = globalThis.ResizeObserver

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  document.body.innerHTML = ''
  if (originalClipboard) Object.defineProperty(globalThis.navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('MergeConflictAiActions', () => {
  test('copies the raw prompt even when no AI provider is available', async () => {
    render(
      <MergeConflictAiActions
        prompt="Resolve the current merge conflict."
        onHandoff={vi.fn(async () => false)}
        onHandoffComplete={mocks.onHandoffComplete}
      />,
    )

    const copy = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="action.merge-conflict-ai-copy-prompt"]',
    )
    expect(document.body.querySelector('[data-slot="merge-conflict-ai-actions"]')).not.toBeNull()
    expect(copy).not.toBeNull()

    await act(async () => copy?.click())

    expect(mocks.writeText).toHaveBeenCalledWith('Resolve the current merge conflict.')
    expect(mocks.onHandoffComplete).not.toHaveBeenCalled()
    expect(copy?.getAttribute('aria-label')).toBe('action.merge-conflict-ai-prompt-copied')
  })
})

function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(node))
}
