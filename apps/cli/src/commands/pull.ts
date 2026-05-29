import { Command } from 'commander'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, decryptSecret } from '@envir18ment/crypto'
import { apiFetch, resolveEnv } from '../lib/api.js'

export const pullCommand = new Command('pull')
  .description('Pull secrets into a .env file')
  .argument('[ref]', 'workspace/project/env — overrides .e18 if provided')
  .option('-e, --environment-id <id>', 'Environment ID (UUID)')
  .option('-o, --output <file>', 'Output file', '.env')
  .action(async (ref: string | undefined, opts) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

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

      process.stdout.write(chalk.gray('  Pulling secrets...'))

      const res = await apiFetch(`/api/secrets?environmentId=${environmentId}`)
      if (!res.ok) {
        process.stdout.write('\r')
        const body = await res.json() as { error: string }
        console.log(chalk.red(`  Error: ${body.error}`))
        process.exit(1)
      }

      const data = await res.json() as { encryptedKey: string; secrets: { key: string; encryptedValue: string; iv: string }[] }
      const publicKey = config.get('publicKey') as string
      const privateKey = config.get('privateKey') as string
      const envKey = decryptEnvKey(data.encryptedKey, publicKey, privateKey)

      const lines: string[] = []
      for (const secret of data.secrets) {
        const value = decryptSecret(secret.encryptedValue, secret.iv, envKey)
        lines.push(`${secret.key}=${value}`)
      }

      writeFileSync(opts.output, lines.join('\n') + '\n')
      process.stdout.write('\r')
      console.log(chalk.green(`  Wrote ${lines.length} secret${lines.length === 1 ? '' : 's'} to ${opts.output}`))
    } catch (err: unknown) {
      process.stdout.write('\r')
      console.log(chalk.red(`  ${err instanceof Error ? err.message : 'Unknown error'}`))
      process.exit(1)
    }
  })

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
