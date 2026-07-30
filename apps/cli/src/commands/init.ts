import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { config } from '../index.js'
import { deriveKey, decryptEnvKey, decryptPrivateKey, encryptSecret } from '@envir18ment/crypto'
import { apiFetch, getApiUrl } from '../lib/api.js'
import { detectRepository, type RepositoryIdentity } from '../lib/repository.js'
import { getGitContext } from '../lib/gitContext.js'

interface Workspace { id: string; name: string; slug: string }
interface Project { id: string; name: string; slug: string }
interface Environment { id: string; name: string }
interface RepositoryMatch {
  repositoryId: string
  projectId: string
  projectName: string
  projectSlug: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
}


export const initCommand = new Command('init')
  .description('Set up envir18ment for this project')
  .action(async () => {
    console.log(chalk.bold('\n  envir18ment setup\n'))

    try {
      if (!config.get('token')) await authenticate()
      const suggestedName = detectProjectName()
      const repository = detectRepository()
      const mapped = repository ? await resolveRepository(repository.fingerprint) : null
      const workspace = mapped
        ? { id: mapped.workspaceId, name: mapped.workspaceName, slug: mapped.workspaceSlug }
        : await pickWorkspace(suggestedName)
      const project = mapped
        ? { id: mapped.projectId, name: mapped.projectName, slug: mapped.projectSlug }
        : await pickProject(workspace, suggestedName)
      if (mapped) console.log(chalk.green(`  ✓ Recognized ${mapped.workspaceSlug}/${mapped.projectSlug} from Git`))
      if (repository && !mapped) await mapRepository(project.id, repository)
      const environment = await pickEnvironment(project)
      const ref = `${workspace.slug}/${project.slug}/${environment.name}`

      writeFileSync('.e18', JSON.stringify({
        version: 2,
        workspace: workspace.slug,
        project: project.slug,
        projectId: project.id,
        ref,
        environmentId: environment.id,
      }, null, 2) + '\n')
      console.log(chalk.green(`\n  ✓ Linked ${ref}`))

      if (existsSync('.env')) {
        const secrets = parseEnvFile('.env')
        if (secrets.length) {
          const { shouldImport } = await prompts({
            type: 'confirm', name: 'shouldImport',
            message: `Encrypt and import ${secrets.length} secret${secrets.length === 1 ? '' : 's'} from .env?`,
            initial: true,
          })
          if (shouldImport) await importSecrets(environment.id, secrets)
        }
      }

      console.log(chalk.green('\n  Setup complete.'))
      console.log(chalk.gray('  Run your app securely with:'))
      console.log(chalk.cyan(`\n    e18 run -- ${detectRunCommand()}\n`))
    } catch (err: unknown) {
      console.log(chalk.red(`\n  ${err instanceof Error ? err.message : 'Setup failed'}\n`))
      process.exit(1)
    }
  })

async function authenticate() {
  const { mode } = await prompts({
    type: 'select', name: 'mode', message: 'Get started',
    choices: [
      { title: 'Create an account', value: 'register' },
      { title: 'Sign in', value: 'login' },
    ],
  })
  if (!mode) throw new Error('Cancelled')

  const answers = await prompts([
    {
      type: 'text', name: 'email', message: 'Email',
      validate: (value: string) => value.includes('@') || 'Enter a valid email',
    },
    {
      type: 'password', name: 'password', message: 'Password',
      validate: (value: string) => value.length >= 8 || 'Use at least 8 characters',
    },
  ])
  if (!answers.email || !answers.password) throw new Error('Cancelled')

  process.stdout.write(chalk.gray(`  ${mode === 'register' ? 'Creating account' : 'Signing in'}...`))
  const res = await fetch(`${getApiUrl()}/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: answers.email, password: answers.password }),
  })
  const data = await res.json() as {
    error?: string
    token?: string
    user?: { id: string; email: string; publicKey: string; encryptedPrivateKey: string }
  }
  process.stdout.write('\r')
  if (!res.ok || !data.token || !data.user) throw new Error(data.error ?? 'Authentication failed')

  const { ciphertext, nonce, salt } = JSON.parse(data.user.encryptedPrivateKey)
  const masterKey = await deriveKey(answers.password, salt)
  const privateKey = decryptPrivateKey(ciphertext, nonce, masterKey)
  config.set('token', data.token)
  config.set('userId', data.user.id)
  config.set('publicKey', data.user.publicKey)
  config.set('privateKey', privateKey)
  console.log(chalk.green(`  ✓ ${mode === 'register' ? 'Account created' : 'Signed in'} as ${data.user.email}`))
}

async function resolveRepository(fingerprint: string): Promise<RepositoryMatch | null> {
  const res = await apiFetch(`/api/repositories/resolve?fingerprint=${fingerprint}`)
  if (res.status === 404) return null
  return readJson<RepositoryMatch>(res)
}

async function mapRepository(projectId: string, repository: RepositoryIdentity) {
  const res = await apiFetch('/api/repositories', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      fingerprint: repository.fingerprint,
      remoteHost: repository.host,
      remotePath: repository.path,
    }),
  })
  if (res.ok) {
    console.log(chalk.green(`  ✓ Remembered ${repository.host}/${repository.path}`))
    return
  }

  const data = await res.json() as { error?: string }
  if (res.status !== 403) throw new Error(data.error ?? 'Failed to map repository')
  console.log(chalk.gray('  Repository linking requires a workspace admin'))
}

async function pickWorkspace(suggestedName: string): Promise<Workspace> {
  const workspaces = await readJson<Workspace[]>(await apiFetch('/api/workspaces'))
  const { choice } = await prompts({
    type: 'select', name: 'choice', message: 'Workspace',
    choices: [
      ...workspaces.map(workspace => ({ title: workspace.name, value: workspace.id })),
      { title: 'Create a new workspace', value: '__new' },
    ],
  })
  if (!choice) throw new Error('Cancelled')
  if (choice !== '__new') return workspaces.find(workspace => workspace.id === choice)!

  const { name } = await prompts({
    type: 'text', name: 'name', message: 'Workspace name',
    initial: `${suggestedName} workspace`,
    validate: (value: string) => value.trim().length > 0 || 'Enter a name',
  })
  if (!name) throw new Error('Cancelled')
  return readJson<Workspace>(await apiFetch('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  }))
}

async function pickProject(workspace: Workspace, suggestedName: string): Promise<Project> {
  const projects = await readJson<Project[]>(await apiFetch(`/api/projects?workspaceId=${workspace.id}`))
  const { choice } = await prompts({
    type: 'select', name: 'choice', message: 'Project',
    choices: [
      ...projects.map(project => ({ title: project.name, value: project.id })),
      { title: `Create "${suggestedName}"`, value: '__new' },
    ],
  })
  if (!choice) throw new Error('Cancelled')
  if (choice !== '__new') return projects.find(project => project.id === choice)!

  const project = await readJson<Project>(await apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: workspace.id, name: suggestedName }),
  }))
  console.log(chalk.green(`  ✓ Created ${project.name} with development, staging, and production`))
  return project
}

async function pickEnvironment(project: Project): Promise<Environment> {
  const environments = await readJson<Environment[]>(await apiFetch(`/api/environments?projectId=${project.id}`))
  if (!environments.length) throw new Error('This project has no environments')

  const development = environments.find(environment => environment.name === 'development')
  if (development) {
    const { useDevelopment } = await prompts({
      type: 'confirm', name: 'useDevelopment',
      message: 'Use the development environment?', initial: true,
    })
    if (useDevelopment) return development
  }

  const { environmentId } = await prompts({
    type: 'select', name: 'environmentId', message: 'Environment',
    choices: environments.map(environment => ({ title: environment.name, value: environment.id })),
  })
  if (!environmentId) throw new Error('Cancelled')
  return environments.find(environment => environment.id === environmentId)!
}

async function importSecrets(environmentId: string, secrets: { key: string; value: string }[]) {
  const data = await readJson<{ encryptedKey: string }>(await apiFetch(`/api/secrets?environmentId=${environmentId}`))
  const envKey = decryptEnvKey(
    data.encryptedKey,
    config.get('publicKey') as string,
    config.get('privateKey') as string,
  )

  process.stdout.write(chalk.gray(`  Encrypting and importing ${secrets.length} secrets...`))
  const historyResponse = await apiFetch(`/api/v2/secrets/history?environmentId=${environmentId}`)
  const history = historyResponse.ok
    ? await historyResponse.json() as { key: string; revisionId: string }[]
    : []
  const baseRevisions = new Map<string, string>()
  for (const entry of history) {
    if (!baseRevisions.has(entry.key)) baseRevisions.set(entry.key, entry.revisionId)
  }
  const changes = secrets.map(secret => {
    const { ciphertext, iv } = encryptSecret(secret.value, envKey)
    return {
      key: secret.key,
      encryptedValue: ciphertext,
      iv,
      baseRevisionId: baseRevisions.get(secret.key) ?? null,
    }
  })
  const res = await apiFetch('/api/v2/secrets/batch', {
    method: 'POST',
    body: JSON.stringify({ environmentId, changes, context: getGitContext() }),
  })
  if (!res.ok) {
    process.stdout.write('\r')
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? 'Failed to import secrets')
  }
  process.stdout.write('\r')
  console.log(chalk.green(`  ✓ Imported ${secrets.length} encrypted secrets`))
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

function detectProjectName(): string {
  if (existsSync('package.json')) {
    try {
      const name = JSON.parse(readFileSync('package.json', 'utf8')).name
      if (typeof name === 'string' && name) return name.replace(/^@[^/]+\//, '')
    } catch {}
  }
  return basename(process.cwd())
}

function detectRunCommand(): string {
  if (!existsSync('package.json')) return 'your-command'
  try {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}
    if (scripts.dev) return 'npm run dev'
    if (scripts.start) return 'npm start'
  } catch {}
  return 'your-command'
}

function parseEnvFile(file: string): { key: string; value: string }[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const index = line.indexOf('=')
      if (index === -1) return null
      return { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }
    })
    .filter((secret): secret is { key: string; value: string } => secret !== null && secret.key.length > 0)
}
