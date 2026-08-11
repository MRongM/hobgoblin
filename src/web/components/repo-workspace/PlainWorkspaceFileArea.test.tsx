// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'

vi.mock('#/web/components/file-tree/ProjectFileTree.tsx', () => ({ ProjectFileTree: () => <div data-testid="tree" /> }))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))
vi.mock('#/web/app-shell-client.ts', () => ({
  canOpenDetachedFileAreaWindow: () => true,
  openDetachedFileAreaWindow: vi.fn(async () => ({ ok: true, windowKey: 'one' })),
}))

test('provides the shared detachable Files tab around a plain project tree', async () => {
  const { PlainWorkspaceFileArea } = await import('#/web/components/repo-workspace/PlainWorkspaceFileArea.tsx')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(<PlainWorkspaceFileArea repoId="/plain" revealRequest={null} />))
  expect(container.querySelector('[role="tab"]')?.getAttribute('draggable')).not.toBe('true')
  expect(container.querySelector<HTMLElement>('[data-testid="plain-file-area-toolbar"]')?.draggable).toBe(true)
  expect(container.querySelector('[data-testid="tree"]')).toBeTruthy()
  await act(async () => root.unmount())
})
