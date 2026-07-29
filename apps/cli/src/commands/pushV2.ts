import { Command } from 'commander'
import { existsSync, readFileSync } from 'fs'
import chalk from 'chalk'
import prompts from 'prompts'
import { config } from '../index.js'
import { decryptEnvKey, decryptSecret, encryptSecret } from '@envir18ment/crypto'
import { apiFetch, resolveEnv } from '../lib/api.js'
import { readE18Context } from '../lib/context.js'
import { getGitContext } from '../lib/gitContext.js'

interface RemoteSecret {
  key: string
  encryptedValue: string
  iv: string
}

interface HistoryEntry {
  key: string
  revisionId: string
}

export const pushCommand = new Command('push')
  .description('Preview and atomically push encrypted secret revisions')
  .argument('[ref]', 'workspace/project/env — overrides .e18 if provided')
  .option('-e, --environment-id <id>', 'Environment ID (UUID)')
  .option('-f, --file <file>', 'Input .env file', '.env')
  .option('-y, --yes', 'skip confirmation')
  .action(async (ref: string | undefined, options) => {
    if (!config.get('token')) throw new Error('Not logged in. Run: e18 login')
    if (!existsSync(options.file)) throw new Error(`File not found: ${options.file}`)

    const local = parseEnvFile(options.file)
    if (!local.length) throw new Error(`No secrets found in ${options.file}`)

    const linked = ref || options.environmentId ? null : readE18Context()
    const environmentId = options.environmentId
      ?? (ref ? await resolveEnv(ref) : linked!.environmentId)
    const displayRef = ref ?? linked?.ref ?? environmentId

    const remoteRes = await apiFetch(`/api/secrets?environmentId=${environmentId}`)
    const remoteData = await remoteRes.json() as {
      error?: string
      encryptedKey: string
      secrets: RemoteSecret[]
    }
    if (!remoteRes.ok) throw new Error(remoteData.error ?? 'Failed to load remote secrets')

    const envKey = decryptEnvKey(
      remoteData.encryptedKey,
      config.get('publicKey') as string,
      config.get('privateKey') as string,
    )
    const remoteValues = new Map(remoteData.secrets.map(secret => [
      secret.key,
      decryptSecret(secret.encryptedValue, secret.iv, envKey),
    ]))

    const historyRes = await apiFetch(`/api/v2/secrets/history?environmentId=${environmentId}`)
    const history = historyRes.ok ? await historyRes.json() as HistoryEntry[] : []
    const baseRevisions = new Map<string, string>()
    for (const entry of history) {
      if (!baseRevisions.has(entry.key)) baseRevisions.set(entry.key, entry.revisionId)
    }

    const added = local.filter(secret => !remoteValues.has(secret.key))
    const changed = local.filter(secret => remoteValues.has(secret.key) && remoteValues.get(secret.key) !== secret.value)
    const unchanged = local.length - added.length - changed.length

    console.log(chalk.bold(`\n  ${displayRef}`))
    console.log(chalk.green(`  + ${added.length} added`))
    console.log(chalk.yellow(`  ~ ${changed.length} changed`))
    console.log(chalk.gray(`    ${unchanged} unchanged`))
    const missing = [...remoteValues.keys()].filter(key => !local.some(secret => secret.key === key))
    if (missing.length) console.log(chalk.gray(`  - ${missing.length} remote-only (not deleted)`))

    const pending = [...added, ...changed]
    if (!pending.length) {
      console.log(chalk.gray('\n  Already in sync\n'))
      return
    }

    if (!options.yes) {
      const { confirmed } = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: `Push ${pending.length} encrypted revision${pending.length === 1 ? '' : 's'}?`,
        initial: true,
      })
      if (!confirmed) return
    }

    const changes = pending.map(secret => {
      const { ciphertext, iv } = encryptSecret(secret.value, envKey)
      return {
        key: secret.key,
        encryptedValue: ciphertext,
        iv,
        baseRevisionId: baseRevisions.get(secret.key) ?? null,
      }
    })
    const res = await apiFetch('/api/v2/secrets/batch', {
      method: 'POST',
      body: JSON.stringify({ environmentId, changes, context: getGitContext() }),
    })
    const data = await res.json() as { error?: string; written?: unknown[] }
    if (!res.ok) throw new Error(data.error ?? 'Push failed')
    console.log(chalk.green(`\n  Pushed ${data.written?.length ?? pending.length} immutable revisions\n`))
  })

function parseEnvFile(file: string): { key: string; value: string }[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const index = line.indexOf('=')
      if (index === -1) return null
      return { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }
    })
    .filter((secret): secret is { key: string; value: string } => secret !== null && secret.key.length > 0)
}
