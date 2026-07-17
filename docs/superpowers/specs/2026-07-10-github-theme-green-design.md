# GitHub Theme Green Redesign

**Goal:** Replace the blue accent system in the GitHub theme with a white/green color scheme — pure white topbar in light mode, deep-green topbar in dark mode, and GitHub's brand green as the sole accent color throughout.

**Scope:** Only `src/web/theme/themes/github.css`. No component logic changes, no new tokens, no new CSS files.

---

## Color Philosophy

GitHub's green identity comes from two sources:
- **Brand green** (`#1a7f37` light / `#3fb950` dark) — contribution graph deep/bright green, used in GitHub's own UI for success states and action buttons
- **Action green** (`#1f883d` light / `#238636` dark) — primary button green, already present in the file

The redesign promotes brand green to be the **accent color** (focus ring, selection highlight, active states) while keeping action green for primary buttons — a natural pairing that GitHub itself uses.

Terminal ANSI blue is preserved because blue has semantic meaning in terminals (directories, links).

---

## Changes

### 1. Accent Token Replacement

#### Light mode

| Token | Before | After |
|---|---|---|
| `--goblin-accent` | `#0969da` | `#1a7f37` |
| `--goblin-accent-text` | `#0969da` | `#1a7f37` |
| `--goblin-accent-rgb` | `9 105 218` | `26 127 55` |
| `--goblin-focus-ring` | `#0969da` | `#1a7f37` |

#### Dark mode

| Token | Before | After |
|---|---|---|
| `--goblin-accent` | `#58a6ff` | `#3fb950` |
| `--goblin-accent-text` | `#58a6ff` | `#3fb950` |
| `--goblin-accent-rgb` | `88 166 255` | `63 185 80` |
| `--goblin-focus-ring` | `#58a6ff` | `#3fb950` |

The derived tokens (`--goblin-accent-selection`, `--goblin-accent-surface`, `--goblin-accent-border`) use `rgb(var(--goblin-accent-rgb) / alpha)` and update automatically.

---

### 2. Topbar Color Replacement

#### Light mode — light green topbar

Replaces the current dark (`#24292f`) topbar with a soft green surface (`#dcfce7`), visually distinct from macOS's light topbar while keeping readability. Control backgrounds use slightly deeper greens to create a subtle layered hierarchy.

| Token | Before | After |
|---|---|---|
| `--goblin-topbar-bg` | `#24292f` | `#dcfce7` |
| `--goblin-topbar-border` | `#30363d` | `#bbf7d0` |
| `--goblin-topbar-fg` | `#f0f6fc` | `#1f2328` |
| `--goblin-topbar-muted-fg` | `#b1bac4` | `#59636e` |
| `--goblin-topbar-control-bg` | `#30363d` | `#bbf7d0` |
| `--goblin-topbar-control-hover-bg` | `#3d444d` | `#a7f3d0` |
| `--goblin-topbar-control-border` | `#57606a` | `#6ee7b7` |
| `--goblin-topbar-control-fg` | `#f0f6fc` | `#1f2328` |

#### Dark mode — deep green topbar

Replaces the near-black (`#010409`) topbar with a dark forest green, giving the GitHub theme a strong visual identity distinct from macOS dark.

| Token | Before | After |
|---|---|---|
| `--goblin-topbar-bg` | `#010409` | `#0d2818` |
| `--goblin-topbar-border` | `#30363d` | `#1a4028` |
| `--goblin-topbar-fg` | `#f0f6fc` | `#e6edf3` |
| `--goblin-topbar-muted-fg` | `#8b949e` | `#8b949e` |
| `--goblin-topbar-control-bg` | `#161b22` | `#112210` |
| `--goblin-topbar-control-hover-bg` | `#21262d` | `#1a3520` |
| `--goblin-topbar-control-border` | `#30363d` | `#2d5a3d` |
| `--goblin-topbar-control-fg` | `#f0f6fc` | `#e6edf3` |

---

### 3. Terminal Selection Background

Only the selection highlight color follows the accent. ANSI colors are unchanged.

#### Light mode

| Token | Before | After |
|---|---|---|
| `--color-terminal-selection-background` | `rgba(9, 105, 218, 0.18)` | `rgba(26, 127, 55, 0.18)` |

#### Dark mode

| Token | Before | After |
|---|---|---|
| `--color-terminal-selection-background` | `rgba(47, 129, 247, 0.28)` | `rgba(63, 185, 80, 0.28)` |

---

## What Does Not Change

- All surface, border, text, status, and shadow tokens — unchanged
- Terminal ANSI colors including blue — unchanged (semantic terminal colors)
- Terminal search match/active-match colors — unchanged
- Classic terminal palette — unchanged
- `--goblin-action-primary` and `--goblin-action-danger` — already correct green/red
- `--goblin-terminal-bell` — already green

## File Map

- Modify: `src/web/theme/themes/github.css`

## Acceptance Criteria

1. GitHub light mode shows white topbar with dark text and green accent highlights.
2. GitHub dark mode shows deep-green topbar with light text and bright-green accent highlights.
3. Focus rings, selected rows, and active tabs use green in both modes.
4. Primary action buttons remain the existing GitHub green (unchanged).
5. Terminal ANSI blue is visually unchanged.
6. Terminal text selection highlight is green-tinted in both modes.
7. No other theme is affected.
