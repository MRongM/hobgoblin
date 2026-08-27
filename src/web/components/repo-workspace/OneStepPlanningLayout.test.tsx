// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  OneStepPlanningLayout,
  OneStepPlanningPlanPane,
  OneStepPlanningSelectionPane,
} from '#/web/components/repo-workspace/OneStepPlanningLayout.tsx'

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

describe('OneStepPlanningLayout', () => {
  test('renders a neutral operation console without increasing its viewport footprint', () => {
    act(() =>
      root.render(
        <OneStepPlanningLayout enabled testIdPrefix="workspace" presentation="operation-console">
          <OneStepPlanningSelectionPane
            enabled
            testIdPrefix="workspace"
            title="Configure"
            description="Choose repositories"
            presentation="operation-console"
            step="01"
          >
            selection
          </OneStepPlanningSelectionPane>
          <OneStepPlanningPlanPane
            enabled
            testIdPrefix="workspace"
            title="Plan"
            description="Review operations"
            presentation="operation-console"
            step="02"
          >
            plan
          </OneStepPlanningPlanPane>
        </OneStepPlanningLayout>,
      ),
    )

    const layout = document.querySelector<HTMLElement>('[data-testid="workspace-one-step-layout"]')
    expect(layout?.dataset.presentation).toBe('operation-console')
    expect(layout?.dataset.tone).toBeUndefined()
    expect(layout?.className).toContain('gap-0')
    expect(layout?.className).toContain('border-separator')
    expect(layout?.className).toContain('overflow-x-hidden')
    expect(layout?.className).toContain('lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]')
    const selectionStep = document.querySelector<HTMLElement>('[data-one-step-planning-step="01"]')
    const planStep = document.querySelector<HTMLElement>('[data-one-step-planning-step="02"]')
    expect(selectionStep?.textContent).toBe('01')
    expect(planStep?.textContent).toBe('02')
    expect(selectionStep?.className).toContain('border-separator')
    expect(planStep?.className).toContain('border-separator')
    expect(document.body.textContent).toContain('Choose repositories')
    expect(document.body.textContent).toContain('Review operations')
    expect(document.querySelector<HTMLElement>('[data-testid="workspace-plan-pane"]')?.className).toContain(
      'lg:border-l',
    )
  })

  test('keeps the default presentation plain', () => {
    act(() =>
      root.render(
        <OneStepPlanningLayout enabled testIdPrefix="workspace">
          plain
        </OneStepPlanningLayout>,
      ),
    )

    const layout = document.querySelector<HTMLElement>('[data-testid="workspace-one-step-layout"]')
    expect(layout?.dataset.presentation).toBe('plain')
    expect(layout?.className).toContain('gap-4')
    expect(layout?.className).not.toContain('rounded-lg')
  })
})
