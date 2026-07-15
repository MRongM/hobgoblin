import type { RepoGroupColor } from '#/web/stores/repos/types.ts'

export const GROUP_COLORS = {
  gray: {
    bg: 'bg-zinc-500/20 dark:bg-zinc-500/30',
    border: 'border-zinc-500/30',
    dot: 'bg-zinc-500',
    hover: 'hover:bg-zinc-500/30 dark:hover:bg-zinc-500/40',
  },
  blue: {
    bg: 'bg-blue-500/20 dark:bg-blue-500/30',
    border: 'border-blue-500/30',
    dot: 'bg-blue-500',
    hover: 'hover:bg-blue-500/30 dark:hover:bg-blue-500/40',
  },
  red: {
    bg: 'bg-red-500/20 dark:bg-red-500/30',
    border: 'border-red-500/30',
    dot: 'bg-red-500',
    hover: 'hover:bg-red-500/30 dark:hover:bg-red-500/40',
  },
  yellow: {
    bg: 'bg-yellow-500/20 dark:bg-yellow-500/30',
    border: 'border-yellow-500/30',
    dot: 'bg-yellow-500',
    hover: 'hover:bg-yellow-500/30 dark:hover:bg-yellow-500/40',
  },
  green: {
    bg: 'bg-green-500/20 dark:bg-green-500/30',
    border: 'border-green-500/30',
    dot: 'bg-green-500',
    hover: 'hover:bg-green-500/30 dark:hover:bg-green-500/40',
  },
  pink: {
    bg: 'bg-pink-500/20 dark:bg-pink-500/30',
    border: 'border-pink-500/30',
    dot: 'bg-pink-500',
    hover: 'hover:bg-pink-500/30 dark:hover:bg-pink-500/40',
  },
  purple: {
    bg: 'bg-purple-500/20 dark:bg-purple-500/30',
    border: 'border-purple-500/30',
    dot: 'bg-purple-500',
    hover: 'hover:bg-purple-500/30 dark:hover:bg-purple-500/40',
  },
  cyan: {
    bg: 'bg-cyan-500/20 dark:bg-cyan-500/30',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-500',
    hover: 'hover:bg-cyan-500/30 dark:hover:bg-cyan-500/40',
  },
} as const

export function getGroupColorClasses(color: RepoGroupColor) {
  return GROUP_COLORS[color]
}

export const ALL_GROUP_COLORS: RepoGroupColor[] = ['gray', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']
