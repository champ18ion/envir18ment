import { createHash } from 'crypto'
import { execFileSync } from 'child_process'

export interface RepositoryIdentity {
  fingerprint: string
  host: string
  path: string
}

export function detectRepository(): RepositoryIdentity | null {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return normalizeRepositoryRemote(remote)
  } catch {
    return null
  }
}

export function normalizeRepositoryRemote(remote: string): RepositoryIdentity | null {
  const value = remote.trim()
  if (!value) return null

  let host: string
  let path: string

  const scpMatch = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/)
  if (scpMatch && !value.includes('://')) {
    host = scpMatch[1]
    path = scpMatch[2]
  } else {
    try {
      const url = new URL(value)
      host = url.hostname
      path = url.pathname
    } catch {
      return null
    }
  }

  host = host.toLowerCase()
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase()
  if (!host || !path) return null

  return {
    host,
    path,
    fingerprint: createHash('sha256').update(`${host}/${path}`).digest('hex'),
  }
}
