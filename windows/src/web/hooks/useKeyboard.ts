// Workspace keyboard shortcuts. Mounted once in App.tsx; terminal-focused
// bindings live with TerminalSlot because they must pre-empt xterm input.
//
// Only unmodified branch action and selection keys live here.
//
// Modal awareness: when an overlay/dialog/menu is open every workspace
// shortcut is suppressed.

import { useEffect, useRef } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { isShortcutBlockingLayerOpen } from '#/web/lib/layers.ts'
import { runBranchActionShortcut } from '#/web/keyboard/branch-action-shortcuts.ts'
import { matchRendererKeyboardShortcut } from '#/shared/shortcut-definitions.ts'
import { isTerminalFocused } from '#/web/terminal-focus.ts'
import { getRuntimeShortcutSettings } from '#/web/runtime-settings-shortcuts.ts'
import { keyboardRuntimeStateFromStore } from '#/web/stores/repos/selector-state.ts'

const INTERACTIVE_SHORTCUT_TARGET_SELECTOR =
  'button,a,input,textarea,select,[role="button"],[role="tab"],[role="menuitem"],[data-interactive]'

interface Options {
  currentRepoId: string | null
  /** Returns true when workspace shortcuts should not affect the repo view. */
  isWorkspaceShortcutSuppressed: () => boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SHORTCUT_TARGET_SELECTOR) !== null
}

export function useKeyboard({ currentRepoId, isWorkspaceShortcutSuppressed }: Options) {
  // Stash the latest closures in refs so the effect deps can be `[]` —
  // otherwise React adds + removes the window listener on every App
  // render (both options are recreated each render).
  const isWorkspaceShortcutSuppressedRef = useRef(isWorkspaceShortcutSuppressed)
  const currentRepoIdRef = useRef(currentRepoId)
  isWorkspaceShortcutSuppressedRef.current = isWorkspaceShortcutSuppressed
  currentRepoIdRef.current = currentRepoId

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (getRuntimeShortcutSettings().shortcutsDisabled) return
      const workspaceShortcutsSuppressed = isWorkspaceShortcutSuppressedRef.current() || isShortcutBlockingLayerOpen()
      const action = matchRendererKeyboardShortcut(e)

      if (isTerminalFocused()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const state = useReposStore.getState()
      const keyboardState = keyboardRuntimeStateFromStore(state, currentRepoIdRef.current)
      const repo = keyboardState.repo
      const overlayOpen = workspaceShortcutsSuppressed
      const interactiveTarget = isInteractiveTarget(e.target)

      if (interactiveTarget) return

      switch (action) {
        case 'pull':
        case 'push':
        case 'externalTerminal':
        case 'editor':
        case 'remote': {
          if (overlayOpen || !repo || !repo.ui.selectedBranch) break
          e.preventDefault()
          runBranchActionShortcut(action)
          break
        }
        case 'checkout-selected': {
          if (overlayOpen || !repo) break
          e.preventDefault()
          void state.checkoutSelectedInRepo(repo.id)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
