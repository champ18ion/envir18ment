import { execFileSync } from 'child_process'
import { detectRepository } from './repository.js'

export interface GitContext {
  repositoryFingerprint?: string
  branch?: string
  commit?: string
  dirty?: boolean
  source: 'cli'
}

export function getGitContext(): GitContext {
  const repository = detectRepository()
  return {
    repositoryFingerprint: repository?.fingerprint,
    branch: git(['branch', '--show-current']) || undefined,
    commit: git(['rev-parse', 'HEAD']) || undefined,
    dirty: git(['status', '--porcelain']).length > 0,
    source: 'cli',
  }
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}
