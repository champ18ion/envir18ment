#!/usr/bin/env node
import { Command } from 'commander'
import Conf from 'conf'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { whoamiCommand } from './commands/whoami.js'
import { pullCommand } from './commands/pull.js'
import { pushCommand } from './commands/push.js'
import { linkCommand } from './commands/link.js'
import { syncCommand } from './commands/sync.js'
import { runCommand } from './commands/run.js'
import { listCommand } from './commands/list.js'

export const config = new Conf({ projectName: 'envir18ment' })

const program = new Command()

program
  .name('e18')
  .description('envir18ment CLI — manage your env secrets')
  .version('0.0.1')
  .enablePositionalOptions(true)

program.addCommand(loginCommand)
program.addCommand(logoutCommand)
program.addCommand(whoamiCommand)
program.addCommand(linkCommand)
program.addCommand(syncCommand)
program.addCommand(runCommand)
program.addCommand(listCommand)
program.addCommand(pullCommand)
program.addCommand(pushCommand)

program.parse()
