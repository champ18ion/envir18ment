import { Command } from 'commander'
import chalk from 'chalk'
import { config } from '../index.js'
import { apiFetch } from '../lib/api.js'

export const whoamiCommand = new Command('whoami')
  .description('Show currently logged in user')
  .action(async () => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    const res = await apiFetch('/api/auth/me')
    if (!res.ok) {
      console.log(chalk.red('  Session expired. Run: e18 login'))
      process.exit(1)
    }

    const user = await res.json() as { email: string; id: string }
    const apiUrl = config.get('apiUrl') as string
    console.log(`\n  ${chalk.bold(user.email)}`)
    console.log(chalk.gray(`  ${apiUrl}\n`))
  })
