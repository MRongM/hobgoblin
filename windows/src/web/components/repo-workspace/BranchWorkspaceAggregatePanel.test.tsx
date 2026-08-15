// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vitest'
import { BranchWorkspaceAggregatePanel } from '#/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

test('constrains aggregate content to its own scroll area', () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  const root = createRoot(container)

  act(() => root.render(<BranchWorkspaceAggregatePanel workspace={workspace} kind="status" />))

  const panel = container.querySelector('[data-testid="branch-workspace-status-panel"]')
  expect(panel?.classList.contains('flex')).toBe(true)
  expect(panel?.classList.contains('flex-col')).toBe(true)
  expect(panel?.classList.contains('overflow-hidden')).toBe(true)

  act(() => root.unmount())
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

const workspace: BranchWorkspaceSnapshot = {
  id: 'branch-1',
  rootId: '/workspace',
  branch: 'feature/auth',
  directoryName: 'hobgoblin-feature-auth',
  path: '/workspace/hobgoblin-feature-auth',
  state: { kind: 'ready' },
  available: true,
  issues: [],
  repositories: [],
  auxiliaryEntries: [],
}
