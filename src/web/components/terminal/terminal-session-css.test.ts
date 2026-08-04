import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./terminal-session.css', import.meta.url), 'utf8')

describe('terminal session CSS layout contract', () => {
  test('keeps a 3px inset around the terminal canvas', () => {
    expect(css).toMatch(/\.goblin-managed-terminal-frame\s*\{[^}]*padding:\s*3px;/)
  })

  test('keeps the button dock at the visible viewport bottom and reserves its full clearance', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height: 44px;')
    expect(css).toContain('--goblin-terminal-visual-viewport-bottom-inset: 0px;')
    expect(css).toMatch(
      /\.goblin-terminal-slot:has\(\.goblin-terminal-bottom-dock\) \.goblin-managed-terminal-frame\s*\{[^}]*padding-bottom:\s*calc\(\s*var\(--goblin-terminal-bottom-dock-height\)\s*\+\s*var\(--goblin-terminal-visual-viewport-bottom-inset\)\s*\);/,
    )
    expect(css).toMatch(
      /\.goblin-terminal-bottom-dock\s*\{[^}]*bottom:\s*var\(--goblin-terminal-visual-viewport-bottom-inset\);/,
    )
    expect(css).not.toMatch(/\.goblin-terminal-bottom-dock\s*\{[^}]*bottom:\s*var\(--goblin-terminal-overlay-offset\);/)
  })

  test('keeps command-deck and custom-button styles in the terminal dock', () => {
    expect(css).toContain('.goblin-terminal-bottom-dock')
    expect(css).toContain('.goblin-terminal-custom-buttons')
    expect(css).toContain('.goblin-terminal-command-deck')
    const removedClass = ['goblin', 'terminal', 'external', 'input'].join('-')
    expect(css).not.toContain(`.${removedClass}`)
    expect(css).not.toContain(`${removedClass}__control`)
    expect(css).not.toContain(`${removedClass}__resize`)
  })

  test('keeps the xterm scrollbar blended with the terminal background', () => {
    expect(css).toContain(
      'scrollbar-color: color-mix(in srgb, var(--color-terminal-foreground) 28%, transparent) transparent;',
    )
    expect(css).toContain('.goblin-managed-terminal-host .xterm-viewport::-webkit-scrollbar-thumb')
    expect(css).toContain('background: color-mix(in srgb, var(--color-terminal-foreground) 28%, transparent);')
    expect(css).toContain('.goblin-managed-terminal-host .xterm-viewport::-webkit-scrollbar-corner')
    expect(css).toContain('background: transparent;')
    expect(css).toMatch(
      /\.goblin-managed-terminal-host \.xterm-scrollable-element > \.scrollbar\.vertical\s*\{[^}]*background:\s*transparent;/,
    )
  })

  test('uses xterm native scrollbar geometry without extra layout clearance', () => {
    expect(css).toContain(`.goblin-managed-terminal-host {
  width: 100%;`)
    expect(css).not.toContain('--goblin-terminal-scrollbar-clearance')
    expect(css).not.toContain('padding-right: var(--goblin-terminal-scrollbar-clearance);')
    expect(css).not.toMatch(/\.goblin-managed-terminal-host\s*\{[^}]*margin-right:\s*14px;/)
    expect(css).not.toMatch(
      /\.goblin-managed-terminal-host \.xterm-scrollable-element > \.scrollbar\.vertical\s*\{[^}]*margin-left:\s*14px;/,
    )
  })

  test('reserves vertical touch gestures for mobile terminal scrolling', () => {
    expect(css).toMatch(/\.goblin-terminal-slot__host--touch-scroll\s*\{[^}]*touch-action:\s*pan-x pinch-zoom;/)
  })

  test('provides a touch-sized edge scrubber without a persistent scrollbar', () => {
    expect(css).not.toContain('.goblin-terminal-mobile-scrollbar')
    expect(css).not.toContain('::-webkit-slider-thumb')
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\s*\{[^}]*position:\s*absolute;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\s*\{[^}]*right:\s*0;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\s*\{[^}]*width:\s*32px;/)
    expect(css).toMatch(
      /\.goblin-terminal-edge-scrubber\s*\{[^}]*bottom:\s*var\(--goblin-terminal-edge-scrubber-bottom\);/,
    )
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\s*\{[^}]*background:\s*transparent;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\s*\{[^}]*touch-action:\s*none;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber::before\s*\{[^}]*content:\s*attr\(data-position\);/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber::after\s*\{[^}]*height:\s*2px;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber\[data-active='true'\]::before/)
    expect(css).toMatch(
      /\.goblin-terminal-slot:has\(\.goblin-terminal-bottom-dock\) \.goblin-terminal-edge-scrubber\s*\{[^}]*--goblin-terminal-edge-scrubber-bottom:\s*calc\(\s*var\(--goblin-terminal-bottom-dock-height\)\s*\+\s*var\(--goblin-terminal-visual-viewport-bottom-inset\)\s*\+\s*8px\s*\);/,
    )
    expect(css).toMatch(
      /\.goblin-terminal-slot:has\(\.goblin-terminal-slot__viewer-status\) \.goblin-terminal-edge-scrubber\s*\{[^}]*--goblin-terminal-edge-scrubber-bottom:\s*88px;/,
    )
    expect(css).toMatch(
      /\.goblin-terminal-slot:has\(\.goblin-terminal-focus-exit\) \.goblin-terminal-edge-scrubber\s*\{[^}]*--goblin-terminal-edge-scrubber-top:\s*50px;/,
    )
  })

  test('lays out the mobile command deck inside the dock without floating over output', () => {
    expect(css).toMatch(/\.goblin-terminal-command-deck\s*\{[^}]*width:\s*100%;/)
    expect(css).toMatch(/\.goblin-terminal-command-deck\s*\{[^}]*pointer-events:\s*auto;/)
    expect(css).not.toMatch(/\.goblin-terminal-command-deck\s*\{[^}]*position:\s*absolute;/)
    expect(css).toMatch(/\.goblin-terminal-command-deck__row\s*\{[^}]*overflow-x:\s*auto;/)
    expect(css).toMatch(/\.goblin-terminal-command-deck__row\s*\{[^}]*touch-action:\s*pan-x;/)
    expect(css).toMatch(
      /\.goblin-terminal-command-deck__row--extra-keys > \.goblin-terminal-command-deck__btn\s*\{[^}]*flex:\s*1 0 44px;/,
    )
  })

  test('keeps the auxiliary keyboard compact and its focus exit handle at the top right', () => {
    expect(css).toMatch(/\.goblin-terminal-command-deck__btn\s*\{[^}]*height:\s*32px;/)
    expect(css).toMatch(/\.goblin-terminal-command-deck__btn\s*\{[^}]*min-height:\s*32px;/)
    expect(css).toMatch(/\.goblin-terminal-command-deck__composer-input\s*\{[^}]*height:\s*32px;/)
    expect(css).toMatch(/\.goblin-terminal-focus-exit\s*\{[^}]*pointer-events:\s*auto;/)
  })

  test('shows the active scrubber percentage two font sizes larger', () => {
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber::before\s*\{[^}]*min-width:\s*52px;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber::before\s*\{[^}]*padding:\s*5px 9px;/)
    expect(css).toMatch(/\.goblin-terminal-edge-scrubber::before\s*\{[^}]*font-size:\s*14px;/)
  })

  test('keeps read-only return-to-bottom and takeover actions together', () => {
    expect(css).toMatch(/\.goblin-terminal-slot__viewer-actions\s*\{[^}]*display:\s*flex;/)
    expect(css).toMatch(/\.goblin-terminal-slot__viewer-actions\s*\{[^}]*flex:\s*0 0 auto;/)
    expect(css).toMatch(/\.goblin-terminal-slot__viewer-actions\s*\{[^}]*pointer-events:\s*auto;/)
  })

  test('uses a horizontally pannable 720px terminal only in original-width mode', () => {
    expect(css).toMatch(/\.goblin-terminal-slot__host--original-width\s*\{[^}]*overflow-x:\s*auto;/)
    expect(css).toMatch(
      /\.goblin-terminal-slot__host--original-width > \.goblin-managed-terminal-frame\s*\{[^}]*min-width:\s*720px;/,
    )
  })

  test('presents read-only canonical geometry through a horizontal viewport', () => {
    expect(css).toMatch(
      /\.goblin-terminal-slot__host--canonical-readonly\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/,
    )
    expect(css).toMatch(
      /\.goblin-terminal-slot__host--canonical-readonly > \.goblin-managed-terminal-frame[^}]*\{[^}]*overflow:\s*visible;/,
    )
    expect(css).toMatch(
      /\.goblin-terminal-slot__host--canonical-readonly \.goblin-managed-terminal-host[^}]*\{[^}]*overflow:\s*visible;/,
    )
  })

  test('keeps the terminal Copy action touch-sized and above terminal overlays', () => {
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*position:\s*fixed;/)
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*z-index:\s*4;/)
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*min-width:\s*44px;/)
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*min-height:\s*44px;/)
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*left:\s*clamp\(/)
    expect(css).toMatch(/\.goblin-terminal-selection-copy\s*\{[^}]*top:\s*clamp\(/)
  })
})
