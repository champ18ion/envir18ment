import { existsSync, readFileSync } from 'fs'

export interface E18Context {
  version?: number
  workspace?: string
  project?: string
  projectId?: string
  ref: string
  environmentId: string
}

export function readE18Context(): E18Context {
  if (!existsSync('.e18')) throw new Error('No .e18 found. Run: e18 init')
  const context = JSON.parse(readFileSync('.e18', 'utf8')) as Partial<E18Context>
  if (!context.ref || !context.environmentId) throw new Error('.e18 is invalid. Run: e18 init')
  return context as E18Context
}
