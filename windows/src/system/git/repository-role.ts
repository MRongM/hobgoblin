import path from 'node:path'
import { git } from '#/system/git/helper.ts'

export async function isPrimaryGitWorktree(cwd: string): Promise<boolean> {
  try {
    const [gitDirectory, commonDirectory] = await Promise.all([
      git(cwd, ['rev-parse', '--git-dir']),
      git(cwd, ['rev-parse', '--git-common-dir']),
    ])
    return path.resolve(cwd, gitDirectory) === path.resolve(cwd, commonDirectory)
  } catch {
    return false
  }
}
