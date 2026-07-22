// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceFileTree } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'

const mocks = vi.hoisted(() => ({ projectFileTree: vi.fn(() => null) }))

vi.mock('#/web/components/file-tree/ProjectFileTree.tsx', () => ({
  ProjectFileTree: mocks.projectFileTree,
}))

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.projectFileTree.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  root = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceFileTree', () => {
  test('adapts a branch workspace into one non-Git protected folder context', async () => {
    await act(async () => {
      root!.render(
        <BranchWorkspaceFileTree
          context={{
            rootId: '/workspace',
            id: 'branch-1',
            branch: 'feature/auth',
            path: '/workspace/goblin-feature-auth',
            available: true,
            busy: false,
            managedRootNames: ['api'],
          }}
        />,
      )
    })

    expect(mocks.projectFileTree).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: '/workspace',
        folderContext: {
          repoId: '/workspace',
          worktreePath: '/workspace/goblin-feature-auth',
          branch: 'feature/auth',
          isGitRepo: false,
          status: [],
          protectedRootNames: ['api'],
        },
      }),
      undefined,
    )
  })
})
