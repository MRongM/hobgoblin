// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FileAreaSplitPane } from '#/web/components/repo-workspace/FileAreaSplitPane.tsx'

interface SplitPaneMockProps {
  before: ReactNode
  after: ReactNode
  afterSize: number
  onAfterSizeChange?: (size: number) => void
  orientation?: 'horizontal' | 'vertical'
  beforeMinSize?: number | string
  afterMinSize?: number | string
  afterMaxSize?: number | string
  beforeCollapsed?: boolean
  afterCollapsed?: boolean
}

const splitPaneMock = vi.hoisted(() => ({ props: null as SplitPaneMockProps | null }))

vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: (props: SplitPaneMockProps) => {
    splitPaneMock.props = props
    return (
      <div data-testid="split-pane" data-orientation={props.orientation} data-after-size={props.afterSize}>
        <div data-testid="before">{props.before}</div>
        <button type="button" data-testid="resize" onClick={() => props.onAfterSizeChange?.(25)}>
          resize
        </button>
        <div data-testid="after">{props.after}</div>
      </div>
    )
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  splitPaneMock.props = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('FileAreaSplitPane', () => {
  test('keeps the file area below navigation in vertical layouts', () => {
    const onFileAreaSizeChange = vi.fn()

    render('vertical', onFileAreaSizeChange, true)

    expect(container.querySelector('[data-testid="before"]')?.textContent).toBe('navigation')
    expect(container.querySelector('[data-testid="after"]')?.textContent).toBe('files')
    expect(splitPaneMock.props?.afterSize).toBe(35)
    expect(splitPaneMock.props?.beforeCollapsed).not.toBe(true)
    expect(splitPaneMock.props?.afterCollapsed).toBe(true)
    expect(splitPaneMock.props?.beforeMinSize).toBe('9rem')
    expect(splitPaneMock.props?.afterMinSize).toBe('8rem')
    expect(splitPaneMock.props?.afterMaxSize).toBe('80%')

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="resize"]')?.click())

    expect(onFileAreaSizeChange).toHaveBeenCalledWith(25)
  })

  test('keeps the file area after navigation in horizontal layouts', () => {
    const onFileAreaSizeChange = vi.fn()

    render('horizontal', onFileAreaSizeChange, true)

    expect(container.querySelector('[data-testid="before"]')?.textContent).toBe('navigation')
    expect(container.querySelector('[data-testid="after"]')?.textContent).toBe('files')
    expect(splitPaneMock.props?.afterSize).toBe(35)
    expect(splitPaneMock.props?.beforeCollapsed).not.toBe(true)
    expect(splitPaneMock.props?.afterCollapsed).toBe(true)
    expect(splitPaneMock.props?.beforeMinSize).toBe('9rem')
    expect(splitPaneMock.props?.afterMinSize).toBe('8rem')
    expect(splitPaneMock.props?.afterMaxSize).toBe('80%')

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="resize"]')?.click())

    expect(onFileAreaSizeChange).toHaveBeenCalledWith(25)
  })

  test('preserves navigation-first order for expanded vertical layouts', () => {
    const onFileAreaSizeChange = vi.fn()

    render('vertical', onFileAreaSizeChange, false)

    expect(container.querySelector('[data-testid="before"]')?.textContent).toBe('navigation')
    expect(container.querySelector('[data-testid="after"]')?.textContent).toBe('files')
    expect(splitPaneMock.props?.orientation).toBe('vertical')
    expect(splitPaneMock.props?.afterSize).toBe(35)

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="resize"]')?.click())

    expect(onFileAreaSizeChange).toHaveBeenCalledWith(25)
  })
})

function render(
  orientation: 'horizontal' | 'vertical',
  onFileAreaSizeChange: (size: number) => void,
  fileAreaCollapsed: boolean,
) {
  act(() => {
    root.render(
      <FileAreaSplitPane
        orientation={orientation}
        navigationArea={<div>navigation</div>}
        fileArea={<div>files</div>}
        fileAreaSize={35}
        onFileAreaSizeChange={onFileAreaSizeChange}
        navigationMinSize="9rem"
        fileAreaMinSize="8rem"
        fileAreaMaxSize="80%"
        fileAreaCollapsed={fileAreaCollapsed}
      />,
    )
  })
}
