import { Command } from 'commander'
import chalk from 'chalk'
import { config } from '../index.js'

export const logoutCommand = new Command('logout')
  .description('Log out and clear stored credentials')
  .action(() => {
    config.clear()
    console.log(chalk.green('  Logged out'))
  })
