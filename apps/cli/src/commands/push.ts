import { Command } from 'commander'
import { readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, encryptSecret } from '@envir18ment/crypto'
import { apiFetch, resolveEnv } from '../lib/api.js'

export const pushCommand = new Command('push')
  .description('Push secrets from a .env file')
  .argument('[ref]', 'workspace/project/env — overrides .e18 if provided')
  .option('-e, --environment-id <id>', 'Environment ID (UUID)')
  .option('-f, --file <file>', 'Input .env file', '.env')
  .action(async (ref: string | undefined, opts) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    if (!existsSync(opts.file)) {
      console.log(chalk.red(`  File not found: ${opts.file}`))
      process.exit(1)
    }

    const secrets = parseEnvFile(opts.file)
    if (!secrets.length) {
      console.log(chalk.yellow('  No secrets found in file'))
      process.exit(0)
    }

    console.log(chalk.gray(`  Found ${secrets.length} secret${secrets.length === 1 ? '' : 's'} in ${opts.file}`))

    let environmentId: string

    try {
      if (opts.environmentId) {
        environmentId = opts.environmentId
      } else {
        const resolveRef = ref ?? readE18Config()
        if (!resolveRef) {
          console.log(chalk.red('  Provide a ref (workspace/project/env) or run e18 link first'))
          process.exit(1)
        }
        process.stdout.write(chalk.gray('  Resolving...'))
        environmentId = await resolveEnv(resolveRef)
        process.stdout.write('\r')
      }

      process.stdout.write(chalk.gray('  Fetching environment key...'))
      const res = await apiFetch(`/api/secrets?environmentId=${environmentId}`)
      if (!res.ok) {
        process.stdout.write('\r')
        const body = await res.json() as { error: string }
        console.log(chalk.red(`  Error: ${body.error}`))
        process.exit(1)
      }

      const data = await res.json() as { encryptedKey: string; secrets: unknown[] }
      const publicKey = config.get('publicKey') as string
      const privateKey = config.get('privateKey') as string
      const envKey = decryptEnvKey(data.encryptedKey, publicKey, privateKey)
      process.stdout.write('\r')

      let pushed = 0
      for (const { key, value } of secrets) {
        process.stdout.write(chalk.gray(`  Encrypting ${key}...`))
        const { ciphertext, iv } = encryptSecret(value, envKey)
        const pushRes = await apiFetch('/api/secrets', {
          method: 'POST',
          body: JSON.stringify({ environmentId, key, encryptedValue: ciphertext, iv }),
        })
        process.stdout.write('\r')
        if (!pushRes.ok) {
          console.log(chalk.red(`  Failed to push ${key}`))
        } else {
          pushed++
        }
      }

      console.log(chalk.green(`  Pushed ${pushed}/${secrets.length} secrets`))
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

function readE18Config(): string | null {
  if (existsSync('.e18')) {
    try {
      const c = JSON.parse(readFileSync('.e18', 'utf8'))
      return c.ref ?? null
    } catch {
      return null
    }
  }
  return null
}
