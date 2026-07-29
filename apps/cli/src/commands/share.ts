import { Command } from 'commander'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptEnvKey, encryptSecret, generateEnvKey } from '@envir18ment/crypto'
import { apiFetch } from '../lib/api.js'
import { readE18Context } from '../lib/context.js'

interface Environment {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
}

interface KeyGrant {
  environmentId: string
  envKey: string
}

export const shareCommand = new Command('share')
  .description('Create a sealed, scoped invitation for this repository')
  .option('--project', 'share every environment in the linked project')
  .option('--workspace', 'share every project in the workspace')
  .option('--role <role>', 'admin, member, or viewer', 'member')
  .option('--expires <hours>', 'expiration in hours', '24')
  .action(async (options: { project?: boolean; workspace?: boolean; role: string; expires: string }) => {
    if (!config.get('token')) throw new Error('Not logged in. Run: e18 login')
    if (options.project && options.workspace) throw new Error('Choose either --project or --workspace')
    if (!['admin', 'member', 'viewer'].includes(options.role)) throw new Error('Role must be admin, member, or viewer')
    if (options.role === 'admin' && !options.workspace) throw new Error('Admin invitations require --workspace')

    const linked = readE18Context()
    if (!linked.workspace || !linked.projectId) throw new Error('Run e18 init to upgrade this repository to .e18 V2')

    const workspaceRes = await apiFetch(`/api/workspaces/${linked.workspace}`)
    const workspace = await readJson<{ id: string; name: string; slug: string }>(workspaceRes)

    let scope: 'workspace' | 'project' | 'environment' = 'environment'
    let projectId: string | undefined = linked.projectId
    let environmentId: string | undefined = linked.environmentId
    let environments: Environment[]

    if (options.workspace) {
      scope = 'workspace'
      projectId = undefined
      environmentId = undefined
      const projects = await readJson<Project[]>(await apiFetch(`/api/projects?workspaceId=${workspace.id}`))
      const lists = await Promise.all(projects.map(project =>
        readJson<Environment[]>(apiFetch(`/api/environments?projectId=${project.id}`)),
      ))
      environments = lists.flat()
    } else if (options.project) {
      scope = 'project'
      environmentId = undefined
      environments = await readJson<Environment[]>(await apiFetch(`/api/environments?projectId=${linked.projectId}`))
    } else {
      environments = [{ id: linked.environmentId, name: linked.ref.split('/').at(-1) ?? 'environment' }]
    }

    process.stdout.write(chalk.gray(`  Sealing ${environments.length} environment key${environments.length === 1 ? '' : 's'}...`))
    const keys = await Promise.all(environments.map(environment => loadKey(environment.id)))
    const shareKey = generateEnvKey()
    const payload = JSON.stringify({
      version: 1,
      workspaceId: workspace.id,
      projectId,
      environmentId,
      scope,
      keys,
    })
    const { ciphertext, iv } = encryptSecret(payload, shareKey)

    const res = await apiFetch('/api/v2/invites', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId,
        environmentId,
        scope,
        role: options.role,
        sealedPayload: ciphertext,
        payloadNonce: iv,
        expiresInHours: Number(options.expires),
      }),
    })
    const invite = await readJson<{ inviteUrl: string; expiresAt: string }>(res)
    process.stdout.write('\r')

    const url = `${invite.inviteUrl}#${encodeURIComponent(shareKey)}`
    console.log(chalk.green(`\n  Sealed ${scope} invitation created`))
    console.log(chalk.gray(`  Role: ${options.role} · expires ${new Date(invite.expiresAt).toLocaleString()}`))
    console.log(chalk.cyan(`\n  ${url}\n`))
    console.log(chalk.gray('  The decryption key is in the URL fragment and is never sent to the server.\n'))
  })

async function loadKey(environmentId: string): Promise<KeyGrant> {
  const data = await readJson<{ encryptedKey: string }>(await apiFetch(`/api/secrets?environmentId=${environmentId}`))
  return {
    environmentId,
    envKey: decryptEnvKey(
      data.encryptedKey,
      config.get('publicKey') as string,
      config.get('privateKey') as string,
    ),
  }
}

async function readJson<T>(response: Response | Promise<Response>): Promise<T> {
  const res = await response
  const data = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}
