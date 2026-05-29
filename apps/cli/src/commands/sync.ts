import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, decryptSecret, encryptSecret } from '@envir18ment/crypto'
import { apiFetch } from '../lib/api.js'

interface E18Config {
  ref: string
  environmentId: string
}

function readE18(): E18Config {
  if (!existsSync('.e18')) {
    console.log(chalk.red('  No .e18 found. Run: e18 link workspace/project/env'))
    process.exit(1)
  }
  try {
    return JSON.parse(readFileSync('.e18', 'utf8'))
  } catch {
    console.log(chalk.red('  .e18 is invalid. Run: e18 link workspace/project/env'))
    process.exit(1)
  }
}

async function getEnvKey(environmentId: string): Promise<{ envKey: string; encryptedSecrets: { key: string; encryptedValue: string; iv: string }[] }> {
  const res = await apiFetch(`/api/secrets?environmentId=${environmentId}`)
  if (!res.ok) {
    const body = await res.json() as { error: string }
    throw new Error(body.error)
  }
  const data = await res.json() as { encryptedKey: string; secrets: { key: string; encryptedValue: string; iv: string }[] }
  const publicKey = config.get('publicKey') as string
  const privateKey = config.get('privateKey') as string
  const envKey = decryptEnvKey(data.encryptedKey, publicKey, privateKey)
  return { envKey, encryptedSecrets: data.secrets }
}

export const syncCommand = new Command('sync')
  .description('Sync secrets with the linked environment')
  .option('--push', 'Push local .env to remote instead of pulling')
  .option('-f, --file <file>', '.env file to read/write', '.env')
  .action(async (opts) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    const { ref, environmentId } = readE18()

    try {
      if (opts.push) {
        if (!existsSync(opts.file)) {
          console.log(chalk.red(`  File not found: ${opts.file}`))
          process.exit(1)
        }

        const secrets = parseEnvFile(opts.file)
        if (!secrets.length) {
          console.log(chalk.yellow('  No secrets found'))
          process.exit(0)
        }

        console.log(chalk.gray(`  Pushing ${secrets.length} secrets to ${ref}...`))
        const { envKey } = await getEnvKey(environmentId)

        let pushed = 0
        for (const { key, value } of secrets) {
          const { ciphertext, iv } = encryptSecret(value, envKey)
          const res = await apiFetch('/api/secrets', {
            method: 'POST',
            body: JSON.stringify({ environmentId, key, encryptedValue: ciphertext, iv }),
          })
          if (res.ok) pushed++
        }

        console.log(chalk.green(`  Pushed ${pushed}/${secrets.length} secrets to ${ref}`))
      } else {
        process.stdout.write(chalk.gray(`  Pulling from ${ref}...`))
        const { envKey, encryptedSecrets } = await getEnvKey(environmentId)

        const lines: string[] = []
        for (const secret of encryptedSecrets) {
          const value = decryptSecret(secret.encryptedValue, secret.iv, envKey)
          lines.push(`${secret.key}=${value}`)
        }

        writeFileSync(opts.file, lines.join('\n') + (lines.length ? '\n' : ''))
        process.stdout.write('\r')
        console.log(chalk.green(`  Pulled ${lines.length} secret${lines.length === 1 ? '' : 's'} → ${opts.file}`))
      }
    } catch (err: unknown) {
      process.stdout.write('\r')
      console.log(chalk.red(`  ${err instanceof Error ? err.message : 'Unknown error'}`))
      process.exit(1)
    }
  })

function parseEnvFile(file: string): { key: string; value: string }[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      if (idx === -1) return null
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
    })
    .filter((x): x is { key: string; value: string } => x !== null)
}
