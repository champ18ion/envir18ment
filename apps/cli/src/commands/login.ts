import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import { config } from '../index.js'
import { deriveKey, decryptPrivateKey } from '@envir18ment/crypto'

export const loginCommand = new Command('login')
  .description('Authenticate with your envir18ment account')
  .option('--api-url <url>', 'API URL', process.env.E18_API_URL ?? 'http://localhost:3001')
  .action(async (opts) => {
    console.log(chalk.bold('\n  envir18ment\n'))

    const answers = await prompts([
      {
        type: 'text',
        name: 'email',
        message: 'Email',
        validate: (v: string) => v.includes('@') || 'Enter a valid email',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password',
        validate: (v: string) => v.length >= 6 || 'Password too short',
      },
    ])

    if (!answers.email || !answers.password) {
      console.log(chalk.red('  Cancelled'))
      process.exit(1)
    }

    process.stdout.write(chalk.gray('  Authenticating...'))

    const res = await fetch(`${opts.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: answers.email, password: answers.password }),
    })

    if (!res.ok) {
      process.stdout.write('\r')
      const body = await res.json() as { error: string }
      console.log(chalk.red(`  Error: ${body.error}`))
      process.exit(1)
    }

    const data = await res.json() as {
      token: string
      user: { id: string; email: string; publicKey: string; encryptedPrivateKey: string }
    }

    const { ciphertext, nonce, salt } = JSON.parse(data.user.encryptedPrivateKey)
    const masterKey = await deriveKey(answers.password, salt)
    const privateKey = decryptPrivateKey(ciphertext, nonce, masterKey)

    config.set('token', data.token)
    config.set('userId', data.user.id)
    config.set('publicKey', data.user.publicKey)
    config.set('privateKey', privateKey)
    config.set('apiUrl', opts.apiUrl)

    process.stdout.write('\r')
    console.log(chalk.green(`  Logged in as ${data.user.email}\n`))
  })
