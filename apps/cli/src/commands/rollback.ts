import { Command } from 'commander'
import chalk from 'chalk'
import prompts from 'prompts'
import { config } from '../index.js'
import { apiFetch } from '../lib/api.js'
import { readE18Context } from '../lib/context.js'
import { getGitContext } from '../lib/gitContext.js'

interface HistoryEntry {
  secretId: string
  revisionId: string
  revision: number
  operation: string
}

export const rollbackCommand = new Command('rollback')
  .description('Restore a secret from an encrypted revision')
  .argument('<key>', 'secret key')
  .requiredOption('-r, --revision <number>', 'revision number')
  .action(async (key: string, options: { revision: string }) => {
    if (!config.get('token')) throw new Error('Not logged in. Run: e18 login')
    const revisionNumber = Number(options.revision)
    if (!Number.isInteger(revisionNumber) || revisionNumber < 1) throw new Error('Revision must be a positive number')

    const { environmentId, ref } = readE18Context()
    const query = new URLSearchParams({ environmentId, key })
    const historyRes = await apiFetch(`/api/v2/secrets/history?${query}`)
    const history = await historyRes.json() as HistoryEntry[] | { error: string }
    if (!historyRes.ok) throw new Error((history as { error: string }).error)

    const entries = history as HistoryEntry[]
    const target = entries.find(entry => entry.revision === revisionNumber)
    if (!target) throw new Error(`Revision ${revisionNumber} not found for ${key}`)
    if (target.operation === 'deleted') throw new Error('A deleted revision cannot be restored')

    const latest = entries[0]
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: `Restore ${key} revision ${revisionNumber} to ${ref}?`,
      initial: false,
    })
    if (!confirmed) return

    const res = await apiFetch(`/api/v2/secrets/${target.secretId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({
        revisionId: target.revisionId,
        baseRevisionId: latest?.revisionId,
        context: getGitContext(),
      }),
    })
    const data = await res.json() as { error?: string; revision?: number }
    if (!res.ok) throw new Error(data.error ?? 'Rollback failed')
    console.log(chalk.green(`  Restored ${key} revision ${revisionNumber} as revision ${data.revision}`))
  })
