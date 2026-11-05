// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { TerminalStashMenu } from '#/web/components/terminal/TerminalStashMenu.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { useTerminalStashStore } from '#/web/components/terminal/terminal-stash-store.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const { catalog, runCommand } = vi.hoisted(() => ({ catalog: [] as any[], runCommand: vi.fn() }))
vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({ useTerminalCatalog: () => catalog }))
vi.mock('#/web/commands/workspace-commands.ts', () => ({ runTerminalDeepLinkCommand: runCommand }))
vi.mock('#/web/main-window-navigation.tsx', () => ({ useMainWindowNavigation: () => ({}) }))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

afterEach(() => {
  catalog.length = 0
  runCommand.mockReset()
  useTerminalStashStore.setState({ stashedTerminals: {} })
  document.body.innerHTML = ''
})

describe('TerminalStashMenu', () => {
  test('lists only current project sessions with matching identities and restores their destination', async () => {
    const repo = seedRepoState({ id: '/project' })
    const other = seedRepoState({ id: '/other' })
    resetReposStore()
    useReposStore.setState({ repos: { '/project': repo, '/other': other }, activeProjectId: '/project' })
    catalog.push(
      {
        key: 'one',
        repoRoot: '/project',
        worktreePath: '/project/worktree',
        worktreeTerminalKey: 'scope',
        terminalId: 'terminal-1',
        branch: 'feature',
      },
      {
        key: 'old',
        repoRoot: '/project',
        worktreePath: '/project/worktree',
        worktreeTerminalKey: 'scope',
        terminalId: 'terminal-2',
        branch: 'feature',
      },
      {
        key: 'other',
        repoRoot: '/other',
        worktreePath: '/other',
        worktreeTerminalKey: 'other-scope',
        terminalId: 'terminal-1',
        branch: 'main',
      },
    )
    useTerminalStashStore.setState({ stashedTerminals: { one: 'id-1', old: 'old-id', other: 'id-3' } })
    const read = {
      subscribeWorktree: () => () => {},
      worktreeSnapshot: () => ({
        sessions: [
          { key: 'one', sessionId: 'id-1', title: 'Build', hasBell: false },
          { key: 'old', sessionId: 'new-id', title: 'Reused', hasBell: false },
        ],
      }),
    } as any
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () =>
      root.render(
        <TerminalSessionContext.Provider value={{ selectTerminal: vi.fn() } as any}>
          <TerminalSessionReadContext.Provider value={read}>
            <TerminalStashMenu repoId="/project" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      ),
    )
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="terminal.stashed"]')!
    await act(async () => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      button.click()
    })
    expect(document.body.textContent).toContain('Build')
    expect(document.body.textContent).not.toContain('Reused')
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
      node.textContent?.includes('Build'),
    )!
    await act(async () => item.click())
    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          repoId: '/project',
          worktreePath: '/project/worktree',
          terminalId: 'terminal-1',
        }),
      }),
    )
    await act(async () => root.unmount())
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  })
})
