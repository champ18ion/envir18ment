import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { getDb, environments, projects, workspaceMembers, environmentKeys, users } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { generateEnvKey, encryptEnvKey } from '@envir18ment/crypto'

export const environmentRouter = Router()
environmentRouter.use(requireAuth)

environmentRouter.get('/', async (req: AuthRequest, res) => {
  const { projectId } = req.query
  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const db = getDb()
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId as string)).limit(1)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length) return res.status(403).json({ error: 'Forbidden' })

  const result = await db.select().from(environments).where(eq(environments.projectId, projectId as string))
  res.json(result)
})

environmentRouter.post('/', async (req: AuthRequest, res) => {
  const { projectId, name } = req.body
  if (!projectId || !name) return res.status(400).json({ error: 'projectId and name required' })

  const db = getDb()
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length || !['owner', 'admin'].includes(member[0].role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const [env] = await db.insert(environments).values({ projectId, name }).returning()

  const members = await db.select({ user: users }).from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, project.workspaceId))

  const envKey = await generateEnvKey()
  for (const { user } of members) {
    const encryptedKey = await encryptEnvKey(envKey, user.publicKey)
    await db.insert(environmentKeys).values({ environmentId: env.id, userId: user.id, encryptedKey })
  }

  res.status(201).json(env)
})

environmentRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const db = getDb()
  const [env] = await db.select().from(environments).where(eq(environments.id, req.params.id)).limit(1)
  if (!env) return res.status(404).json({ error: 'Not found' })

  const [project] = await db.select().from(projects).where(eq(projects.id, env.projectId)).limit(1)
  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length || !['owner', 'admin'].includes(member[0].role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const [updated] = await db.update(environments).set({ name }).where(eq(environments.id, req.params.id)).returning()
  res.json(updated)
})

environmentRouter.delete('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [env] = await db.select().from(environments).where(eq(environments.id, req.params.id)).limit(1)
  if (!env) return res.status(404).json({ error: 'Not found' })

  const [project] = await db.select().from(projects).where(eq(projects.id, env.projectId)).limit(1)
  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length || !['owner', 'admin'].includes(member[0].role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  await db.delete(environments).where(eq(environments.id, req.params.id))
  res.status(204).send()
})
