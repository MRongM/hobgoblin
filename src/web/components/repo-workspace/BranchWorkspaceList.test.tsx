// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceList } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import type { BranchWorkspaceLifecycle, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${String(params.count)}`,
}))

vi.mock('#/web/hooks/useFolderExternalOpenActions.ts', () => ({
  useFolderExternalOpenActions: () => ({
    editor: { disabled: false, busy: false, iconPref: 'auto', onSelect: vi.fn() },
    externalTerminal: { disabled: false, busy: false, iconPref: 'auto', onSelect: vi.fn() },
  }),
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalCount: () => 2,
  useWorktreeTerminalHasBell: () => true,
  useWorktreeTerminalHasOutputActivity: () => true,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceList', () => {
  test('renders one non-expandable folder row with root-scoped terminal badges and ready actions', () => {
    const onActivate = vi.fn()
    const onRemove = vi.fn()
    act(() =>
      root.render(
        <BranchWorkspaceList
          rootId="/workspace"
          items={[workspace('ready')]}
          activeId="branch-1"
          onActivate={onActivate}
          onReorder={() => {}}
          onInspect={() => {}}
          onRepair={() => {}}
          onRemove={onRemove}
          onCancel={() => {}}
        />,
      ),
    )

    expect(container.textContent).toContain('feature/auth')
    expect(container.textContent).not.toContain('goblin-feature-auth')
    expect(container.querySelector('[aria-expanded]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-terminal-count-badge"]')?.textContent).toBe('2')
    expect(container.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
    expect(container.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-editor"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-external-terminal"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-internal-terminal"]')).not.toBeNull()
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.delete"]')?.click())
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'branch-1', path: '/workspace/goblin-feature-auth' }))
  })

  test.each([
    ['active', ['workspace.branch-workspace.cancel'], ['workspace.branch-workspace.delete']],
    ['create-incomplete', ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.retry'], ['workspace.branch-workspace.delete']],
    ['needs-repair', ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.repair'], ['workspace.branch-workspace.delete']],
    ['delete-incomplete', ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.continue-delete'], ['workspace.branch-workspace.open-editor']],
  ] as const)('exposes the exact %s lifecycle actions', (lifecycle, present, absent) => {
    act(() =>
      root.render(
        <BranchWorkspaceList
          rootId="/workspace"
          items={[workspace(lifecycle)]}
          activeId={null}
          onActivate={() => {}}
          onReorder={() => {}}
          onInspect={() => {}}
          onRepair={() => {}}
          onRemove={() => {}}
          onCancel={() => {}}
        />,
      ),
    )
    for (const label of present) expect(container.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    for (const label of absent) expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull()
  })
})

function workspace(lifecycle: BranchWorkspaceLifecycle): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    lifecycle,
    available: lifecycle !== 'delete-incomplete',
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
    ...(lifecycle === 'active'
      ? { activeOperation: { kind: 'create', currentStep: 1, completedCount: 0, totalCount: 2, cancellable: true } }
      : {}),
  }
}
