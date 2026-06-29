// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PathTargetText } from '#/web/components/PathTargetText.tsx'

describe('PathTargetText', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('renders path spans and dispatches click and double click targets', async () => {
    const onRevealPath = vi.fn()
    const onOpenPathInEditor = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    await act(async () => {
      root.render(
        <PathTargetText
          text="see src/app.ts:12"
          onRevealPath={onRevealPath}
          onOpenPathInEditor={onOpenPathInEditor}
        />,
      )
    })

    try {
      const path = container.querySelector('[data-path-target]')
      expect(path?.textContent).toBe('src/app.ts:12')

      await act(async () => {
        path?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')

      await act(async () => {
        path?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      })
      expect(onOpenPathInEditor).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12 })
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
