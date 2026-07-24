// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  WorktreeBootstrapCandidateList,
  type WorktreeBootstrapCandidateChoice,
} from '#/web/components/WorktreeBootstrapCandidateList.tsx'
import type { WorktreeBootstrapCandidate } from '#/shared/worktree-bootstrap-summary.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(':')}` : key,
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

describe('WorktreeBootstrapCandidateList', () => {
  test('applies a bulk choice to every candidate when none are selected', () => {
    renderList([
      { path: 'node_modules', kind: 'directory' },
      { path: '.env', kind: 'file' },
    ])

    const copyButton = document.querySelector<HTMLButtonElement>('[data-materialization-bulk-choice="copy"]')
    expect(copyButton?.disabled).toBe(false)
    click('[data-materialization-bulk-choice="copy"]')

    expect(choice('node_modules')).toBe('copy')
    expect(choice('.env')).toBe('copy')
    expect(selected('node_modules')).toBe(false)
    expect(selected('.env')).toBe(false)
  })

  test('applies a bulk choice only to selected candidates and preserves the target selection', () => {
    renderList([
      { path: 'node_modules', kind: 'directory' },
      { path: '.env', kind: 'file' },
      { path: '.cache', kind: 'directory' },
    ])

    click('[data-materialization-select="node_modules"]')
    click('[data-materialization-select=".env"]')
    click('[data-materialization-bulk-choice="copy"]')

    expect(choice('node_modules')).toBe('copy')
    expect(choice('.env')).toBe('copy')
    expect(choice('.cache')).toBe('skip')
    expect(selected('node_modules')).toBe(true)
    expect(selected('.env')).toBe(true)

    click('[data-materialization-bulk-choice="skip"]')
    expect(choice('node_modules')).toBe('skip')
    expect(choice('.env')).toBe('skip')
    expect(selected('node_modules')).toBe(true)
    expect(selected('.env')).toBe(true)
  })

  test('selects every candidate, exposes indeterminate state, and clears all', () => {
    renderList([
      { path: 'node_modules', kind: 'directory' },
      { path: '.env', kind: 'file' },
    ])

    click('[data-materialization-select="node_modules"]')
    expect(selectAll().dataset.state).toBe('indeterminate')

    click('[data-materialization-select-all]')
    expect(selected('node_modules')).toBe(true)
    expect(selected('.env')).toBe(true)

    click('[data-materialization-select-all]')
    expect(selected('node_modules')).toBe(false)
    expect(selected('.env')).toBe(false)
  })

  test('prunes batch targets that disappear from the candidate list', () => {
    const nodeModules = { path: 'node_modules', kind: 'directory' } as const
    const envFile = { path: '.env', kind: 'file' } as const
    renderList([nodeModules, envFile])
    click('[data-materialization-select="node_modules"]')

    renderList([envFile])
    renderList([nodeModules, envFile])

    expect(selected('node_modules')).toBe(false)
  })
})

function CandidateHarness({ candidates }: { candidates: readonly WorktreeBootstrapCandidate[] }) {
  const [choices, setChoices] = useState<Record<string, WorktreeBootstrapCandidateChoice>>({})
  return (
    <WorktreeBootstrapCandidateList
      candidates={candidates}
      choices={choices}
      onChoiceChange={(path, nextChoice) => setChoices((current) => ({ ...current, [path]: nextChoice }))}
    />
  )
}

function renderList(candidates: readonly WorktreeBootstrapCandidate[]) {
  act(() => root.render(<CandidateHarness candidates={candidates} />))
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  act(() => element.click())
}

function choice(path: string): WorktreeBootstrapCandidateChoice | null {
  return document
    .querySelector(`[data-materialization-item="${path}"] [data-materialization-choice][data-state="on"]`)
    ?.getAttribute('data-materialization-choice') as WorktreeBootstrapCandidateChoice | null
}

function selected(path: string): boolean {
  return document.querySelector(`[data-materialization-select="${path}"]`)?.getAttribute('data-state') === 'checked'
}

function selectAll(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-materialization-select-all]')
  if (!element) throw new Error('Missing select-all checkbox')
  return element
}
