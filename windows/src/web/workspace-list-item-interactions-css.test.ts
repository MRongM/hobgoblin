import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const stylesCss = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('workspace list item interactions', () => {
  test('reveals the drag handle only from its leading-icon hit target', () => {
    expect(stylesCss).toContain('.workspace-list-item-drag-handle:hover,')
    expect(stylesCss).toContain('.workspace-list-item-drag-handle:focus-visible,')
    expect(stylesCss).toContain(':has(.workspace-list-item-drag-handle:hover)')
    expect(stylesCss).toContain(':has(.workspace-list-item-drag-handle:focus-visible)')
    expect(stylesCss).not.toContain('.workspace-list-item:hover .workspace-list-item-drag-handle')
    expect(stylesCss).not.toContain('.workspace-list-item:focus-within .workspace-list-item-drag-handle')
  })

  test('keeps editor row-hover and coarse-pointer grip access unchanged', () => {
    expect(stylesCss).toContain('.workspace-list-item:hover .workspace-list-item-action-editor')
    expect(stylesCss).toContain(
      "[data-workspace-list-item][data-selected='true'] .workspace-list-item-drag-handle",
    )
  })
})
