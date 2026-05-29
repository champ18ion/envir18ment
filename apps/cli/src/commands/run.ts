import { Command } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { spawn } from 'child_process'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, decryptSecret } from '@envir18ment/crypto'
import { apiFetch } from '../lib/api.js'

export const runCommand = new Command('run')
  .description('Run a command with secrets injected as environment variables')
  .argument('<cmd...>', 'command to run')
  .passThroughOptions(true)
  .allowUnknownOption(true)
  .action(async (cmd: string[]) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    const environmentId = readE18EnvironmentId()

    process.stdout.write(chalk.gray('  Loading secrets...'))

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

    const injected: Record<string, string> = {}
    for (const secret of data.secrets) {
      injected[secret.key] = decryptSecret(secret.encryptedValue, secret.iv, envKey)
    }

    process.stdout.write('\r')

    const [bin, ...args] = cmd
    const child = spawn(bin, args, {
      stdio: 'inherit',
      env: { ...process.env, ...injected },
      shell: true,
    })

    child.on('exit', (code) => process.exit(code ?? 0))
  })

function readE18EnvironmentId(): string {
  if (!existsSync('.e18')) {
    console.log(chalk.red('  No .e18 found. Run: e18 link workspace/project/env'))
    process.exit(1)
  }
  try {
    const c = JSON.parse(readFileSync('.e18', 'utf8'))
    if (!c.environmentId) throw new Error()
    return c.environmentId
  } catch {
    console.log(chalk.red('  .e18 is invalid. Run: e18 link workspace/project/env'))
    process.exit(1)
  }
}
