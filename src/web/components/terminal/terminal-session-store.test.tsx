// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import {
  useTerminalAggregateCount,
  useTerminalAggregateHasBell,
  useTerminalAggregateHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import type {
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('terminal session aggregate hooks', () => {
  test('aggregates terminal count, unread bell, and output activity across worktrees', () => {
    const worktreeKeys = ['/repo-a\0/worktree-a', '/repo-b\0/worktree-b']
    const subscribedKeys: string[] = []
    const unsubscribedKeys: string[] = []
    const snapshots = new Map<string, WorktreeTerminalSnapshot>([
      [worktreeKeys[0]!, worktreeSnapshot(worktreeKeys[0]!, [terminalSession(worktreeKeys[0]!, 1, { hasBell: true })])],
      [
        worktreeKeys[1]!,
        worktreeSnapshot(worktreeKeys[1]!, [
          terminalSession(worktreeKeys[1]!, 1, { isOutputActive: true }),
          terminalSession(worktreeKeys[1]!, 2),
        ]),
      ],
    ])
    const readContext = terminalReadContext(snapshots, subscribedKeys, unsubscribedKeys)

    act(() => {
      root!.render(
        <TerminalSessionReadContext.Provider value={readContext}>
          <AggregateProbe worktreeKeys={worktreeKeys} />
        </TerminalSessionReadContext.Provider>,
      )
    })

    const output = container!.querySelector('output')
    expect(output?.getAttribute('data-count')).toBe('3')
    expect(output?.getAttribute('data-bell')).toBe('true')
    expect(output?.getAttribute('data-output-active')).toBe('true')
    expect(subscribedKeys.filter((key) => key === worktreeKeys[0])).toHaveLength(3)
    expect(subscribedKeys.filter((key) => key === worktreeKeys[1])).toHaveLength(3)

    act(() => root?.unmount())
    root = null

    expect(unsubscribedKeys.filter((key) => key === worktreeKeys[0])).toHaveLength(3)
    expect(unsubscribedKeys.filter((key) => key === worktreeKeys[1])).toHaveLength(3)
  })

  test('returns empty aggregate state without subscribing when no worktrees are provided', () => {
    const subscribedKeys: string[] = []
    const readContext = terminalReadContext(new Map(), subscribedKeys, [])

    act(() => {
      root!.render(
        <TerminalSessionReadContext.Provider value={readContext}>
          <AggregateProbe worktreeKeys={[]} />
        </TerminalSessionReadContext.Provider>,
      )
    })

    const output = container!.querySelector('output')
    expect(output?.getAttribute('data-count')).toBe('0')
    expect(output?.getAttribute('data-bell')).toBe('false')
    expect(output?.getAttribute('data-output-active')).toBe('false')
    expect(subscribedKeys).toEqual([])
  })
})

function AggregateProbe({ worktreeKeys }: { worktreeKeys: string[] }) {
  const count = useTerminalAggregateCount(worktreeKeys)
  const hasBell = useTerminalAggregateHasBell(worktreeKeys)
  const hasOutputActivity = useTerminalAggregateHasOutputActivity(worktreeKeys)
  return <output data-count={count} data-bell={hasBell} data-output-active={hasOutputActivity} />
}

function terminalReadContext(
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
  subscribedKeys: string[],
  unsubscribedKeys: string[],
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) => snapshots.get(key) ?? worktreeSnapshot(key, []),
    subscribeWorktree: (key) => {
      subscribedKeys.push(key)
      return vi.fn(() => unsubscribedKeys.push(key))
    },
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function worktreeSnapshot(key: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return {
    worktreeTerminalKey: key,
    selectedDescriptor: null,
    sessions,
    count: sessions.length,
  }
}

function terminalSession(
  worktreeTerminalKey: string,
  index: number,
  overrides: Partial<Pick<TerminalSessionSummary, 'hasBell' | 'isOutputActive'>> = {},
): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-${index}`,
    worktreeTerminalKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal-${index}`,
    phase: 'open',
    selected: index === 1,
    hasBell: false,
    ...overrides,
  }
}
