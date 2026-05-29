import { Command } from 'commander'
import { existsSync, readFileSync } from 'fs'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, decryptSecret } from '@envir18ment/crypto'
import { apiFetch } from '../lib/api.js'

export const listCommand = new Command('list')
  .description('List secrets for the linked environment')
  .option('--show-values', 'Reveal secret values')
  .action(async (opts) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    if (!existsSync('.e18')) {
      console.log(chalk.red('  No .e18 found. Run: e18 link workspace/project/env'))
      process.exit(1)
    }

    const { ref, environmentId } = JSON.parse(readFileSync('.e18', 'utf8'))

    process.stdout.write(chalk.gray('  Fetching secrets...'))

    const res = await apiFetch(`/api/secrets?environmentId=${environmentId}`)
    if (!res.ok) {
      process.stdout.write('\r')
      const body = await res.json() as { error: string }
      console.log(chalk.red(`  ${body.error}`))
      process.exit(1)
    }

    const data = await res.json() as { encryptedKey: string; secrets: { key: string; encryptedValue: string; iv: string }[] }
    const publicKey = config.get('publicKey') as string
    const privateKey = config.get('privateKey') as string
    const envKey = decryptEnvKey(data.encryptedKey, publicKey, privateKey)

    process.stdout.write('\r')
    console.log(`\n  ${chalk.bold(ref)} — ${data.secrets.length} secret${data.secrets.length === 1 ? '' : 's'}\n`)

    for (const secret of data.secrets) {
      if (opts.showValues) {
        const value = decryptSecret(secret.encryptedValue, secret.iv, envKey)
        console.log(`  ${chalk.cyan(secret.key)}=${value}`)
      } else {
        console.log(`  ${chalk.cyan(secret.key)}=${chalk.gray('••••••••')}`)
      }
    }

    if (data.secrets.length) console.log()
  })
