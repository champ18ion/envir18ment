import { Command } from 'commander'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import chalk from 'chalk'
import prompts from 'prompts'
import { config } from '../index.js'
import { apiFetch, resolveEnv } from '../lib/api.js'

export const linkCommand = new Command('link')
  .description('Link current directory to a workspace/project/env')
  .argument('[ref]', 'workspace/project/env — omit to pick interactively')
  .action(async (ref: string | undefined) => {
    const token = config.get('token') as string
    if (!token) {
      console.log(chalk.red('  Not logged in. Run: e18 login'))
      process.exit(1)
    }

    if (!ref) {
      const wsListRes = await apiFetch('/api/workspaces')
      const wsList = await wsListRes.json() as { name: string; slug: string; id: string }[]
      if (!wsList.length) { console.log(chalk.red('  No workspaces found')); process.exit(1) }

      const { wsSlug } = await prompts({
        type: 'select', name: 'wsSlug', message: 'Workspace',
        choices: wsList.map(w => ({ title: w.name, value: w.slug })),
      })
      if (!wsSlug) process.exit(0)

      const wsRes = await apiFetch(`/api/workspaces/${wsSlug}`)
      const ws = await wsRes.json() as { id: string }

      const projRes = await apiFetch(`/api/projects?workspaceId=${ws.id}`)
      const projList = await projRes.json() as { id: string; name: string; slug: string }[]
      if (!projList.length) { console.log(chalk.red('  No projects found')); process.exit(1) }

      const { projId } = await prompts({
        type: 'select', name: 'projId', message: 'Project',
        choices: projList.map(p => ({ title: p.name, value: p.id })),
      })
      if (!projId) process.exit(0)

      const proj = projList.find(p => p.id === projId)!
      const envRes = await apiFetch(`/api/environments?projectId=${projId}`)
      const envList = await envRes.json() as { name: string }[]
      if (!envList.length) { console.log(chalk.red('  No environments found')); process.exit(1) }

      const { envName } = await prompts({
        type: 'select', name: 'envName', message: 'Environment',
        choices: envList.map(e => ({ title: e.name, value: e.name })),
      })
      if (!envName) process.exit(0)

      ref = `${wsSlug}/${proj.slug}/${envName}`
      console.log(chalk.gray(`  Selected: ${ref}`))
    }

    if (existsSync('.e18')) {
      const existing = JSON.parse(readFileSync('.e18', 'utf8'))
      console.log(chalk.yellow(`  Already linked to ${existing.ref}. Overwriting...`))
    }

    try {
      process.stdout.write(chalk.gray('  Verifying...'))
      const environmentId = await resolveEnv(ref)
      process.stdout.write('\r')

      writeFileSync('.e18', JSON.stringify({ ref, environmentId }, null, 2))
      console.log(chalk.green(`  Linked to ${ref}`))
      console.log(chalk.gray('  Run e18 sync to fetch secrets\n'))
    } catch (err: unknown) {
      process.stdout.write('\r')
      console.log(chalk.red(`  ${err instanceof Error ? err.message : 'Unknown error'}`))
      process.exit(1)
    }
  })
