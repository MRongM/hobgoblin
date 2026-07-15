import type { RepoGroupColor } from '#/web/stores/repos/types.ts'

/* Classes reference the --color-group-* theme tokens from contract.css;
 * raw palette values live in the theme layer, not here. */
export const GROUP_COLORS = {
  gray: {
    bg: 'bg-group-gray/20 dark:bg-group-gray/30',
    border: 'border-group-gray/30',
    dot: 'bg-group-gray',
    hover: 'hover:bg-group-gray/30 dark:hover:bg-group-gray/40',
  },
  blue: {
    bg: 'bg-group-blue/20 dark:bg-group-blue/30',
    border: 'border-group-blue/30',
    dot: 'bg-group-blue',
    hover: 'hover:bg-group-blue/30 dark:hover:bg-group-blue/40',
  },
  red: {
    bg: 'bg-group-red/20 dark:bg-group-red/30',
    border: 'border-group-red/30',
    dot: 'bg-group-red',
    hover: 'hover:bg-group-red/30 dark:hover:bg-group-red/40',
  },
  yellow: {
    bg: 'bg-group-yellow/20 dark:bg-group-yellow/30',
    border: 'border-group-yellow/30',
    dot: 'bg-group-yellow',
    hover: 'hover:bg-group-yellow/30 dark:hover:bg-group-yellow/40',
  },
  green: {
    bg: 'bg-group-green/20 dark:bg-group-green/30',
    border: 'border-group-green/30',
    dot: 'bg-group-green',
    hover: 'hover:bg-group-green/30 dark:hover:bg-group-green/40',
  },
  pink: {
    bg: 'bg-group-pink/20 dark:bg-group-pink/30',
    border: 'border-group-pink/30',
    dot: 'bg-group-pink',
    hover: 'hover:bg-group-pink/30 dark:hover:bg-group-pink/40',
  },
  purple: {
    bg: 'bg-group-purple/20 dark:bg-group-purple/30',
    border: 'border-group-purple/30',
    dot: 'bg-group-purple',
    hover: 'hover:bg-group-purple/30 dark:hover:bg-group-purple/40',
  },
  cyan: {
    bg: 'bg-group-cyan/20 dark:bg-group-cyan/30',
    border: 'border-group-cyan/30',
    dot: 'bg-group-cyan',
    hover: 'hover:bg-group-cyan/30 dark:hover:bg-group-cyan/40',
  },
} as const

export function getGroupColorClasses(color: RepoGroupColor) {
  return GROUP_COLORS[color]
}

export const ALL_GROUP_COLORS: RepoGroupColor[] = ['gray', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']
