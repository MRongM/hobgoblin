// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vitest'
import { StatusRow, StatusRows } from '#/web/components/branch-detail/status-ui.tsx'

test('uses compact row and column spacing for dense status tables', () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  const root = createRoot(container)

  act(() =>
    root.render(
      <StatusRows density="compact">
        <StatusRow icon={<span />} label="Branch" value="feature/auth" after={<span>dirty</span>} />
      </StatusRows>,
    ),
  )

  const row = container.querySelector('[role="listitem"]')
  expect(row?.classList.contains('h-8')).toBe(true)
  expect(row?.classList.contains('grid-cols-[1rem_5rem_minmax(0,1fr)]')).toBe(true)
  expect(row?.classList.contains('gap-1.5')).toBe(true)
  expect(row?.classList.contains('px-2')).toBe(true)
  expect(row?.querySelector('[data-status-row-value]')?.classList.contains('gap-1')).toBe(true)

  act(() => root.unmount())
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})
