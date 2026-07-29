import { Command } from 'commander'
import chalk from 'chalk'
import { config } from '../index.js'
import { apiFetch } from '../lib/api.js'
import { readE18Context } from '../lib/context.js'

interface HistoryEntry {
  secretId: string
  key: string
  revisionId: string
  revision: number
  operation: string
  source: string
  actorEmail: string
  repositoryHost: string | null
  repositoryPath: string | null
  gitBranch: string | null
  gitCommit: string | null
  gitDirty: boolean | null
  createdAt: string
}

export const historyCommand = new Command('history')
  .description('Show immutable secret history for the linked environment')
  .argument('[key]', 'limit history to one secret key')
  .action(async (key?: string) => {
    if (!config.get('token')) throw new Error('Not logged in. Run: e18 login')
    const { environmentId, ref } = readE18Context()
    const query = new URLSearchParams({ environmentId })
    if (key) query.set('key', key)

    const res = await apiFetch(`/api/v2/secrets/history?${query}`)
    const data = await res.json() as HistoryEntry[] | { error: string }
    if (!res.ok) throw new Error((data as { error: string }).error)
    const history = data as HistoryEntry[]

    console.log(chalk.bold(`\n  ${ref}`))
    if (!history.length) {
      console.log(chalk.gray('  No revision history yet\n'))
      return
    }

    for (const entry of history) {
      const symbol = entry.operation === 'created' ? '+' : entry.operation === 'deleted' ? '-' : entry.operation === 'restored' ? '↶' : '~'
      const repository = entry.repositoryHost && entry.repositoryPath
        ? `${entry.repositoryHost}/${entry.repositoryPath}`
        : entry.source
      const commit = entry.gitCommit ? ` · ${entry.gitCommit.slice(0, 7)}` : ''
      const dirty = entry.gitDirty ? ' · dirty' : ''
      console.log(`  ${symbol} ${chalk.white(entry.key)} ${chalk.gray(`r${entry.revision}`)}`)
      console.log(chalk.gray(`    ${entry.actorEmail} · ${repository}${commit}${dirty} · ${formatDate(entry.createdAt)}`))
      console.log(chalk.gray(`    revision ${entry.revisionId}`))
    }
    console.log()
  })

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}
