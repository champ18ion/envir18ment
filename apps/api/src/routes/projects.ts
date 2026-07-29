import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { environmentAccess, getDb, projectAccess, projects, environments, workspaceMembers, environmentKeys, users } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { generateEnvKey, encryptEnvKey } from '@envir18ment/crypto'

export const projectRouter = Router()
projectRouter.use(requireAuth)

projectRouter.post('/', async (req: AuthRequest, res) => {
  const { workspaceId, name } = req.body
  if (!workspaceId || !name) return res.status(400).json({ error: 'workspaceId and name required' })

  const db = getDb()

  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length || !['owner', 'admin'].includes(member[0].role)) return res.status(403).json({ error: 'Forbidden' })

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const [project] = await db.insert(projects).values({ workspaceId, name, slug }).returning()

  // create default environments and generate keys for all workspace members
  const envNames = ['development', 'staging', 'production']
  const members = await db.select({ user: users, role: workspaceMembers.role }).from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))

  for (const envName of envNames) {
    const [env] = await db.insert(environments).values({ projectId: project.id, name: envName }).returning()
    const envKey = await generateEnvKey()

    for (const { user, role } of members) {
      if (!['owner', 'admin'].includes(role)) continue
      const encryptedKey = await encryptEnvKey(envKey, user.publicKey)
      await db.insert(environmentKeys).values({ environmentId: env.id, userId: user.id, encryptedKey })
    }
  }

  res.status(201).json(project)
})

projectRouter.get('/', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  const db = getDb()
  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length) return res.status(403).json({ error: 'Forbidden' })

  const result = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId as string))
  if (['owner', 'admin'].includes(member[0].role)) return res.json(result)

  const projectGrants = await db.select({ projectId: projectAccess.projectId }).from(projectAccess)
    .where(eq(projectAccess.userId, req.userId!))
  const environmentGrants = await db.select({ projectId: environments.projectId }).from(environmentAccess)
    .innerJoin(environments, eq(environmentAccess.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(
      eq(environmentAccess.userId, req.userId!),
      eq(projects.workspaceId, workspaceId as string),
    ))
  const allowed = new Set([
    ...projectGrants.map(grant => grant.projectId),
    ...environmentGrants.map(grant => grant.projectId),
  ])
  res.json(result.filter(project => allowed.has(project.id)))
})

projectRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const db = getDb()
  const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1)
  if (!project) return res.status(404).json({ error: 'Not found' })
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member || !['owner', 'admin'].includes(member.role)) return res.status(403).json({ error: 'Forbidden' })
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const [updated] = await db.update(projects).set({ name, slug }).where(eq(projects.id, req.params.id)).returning()
  res.json(updated)
})

projectRouter.delete('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1)
  if (!project) return res.status(404).json({ error: 'Not found' })
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member || !['owner', 'admin'].includes(member.role)) return res.status(403).json({ error: 'Forbidden' })
  await db.delete(projects).where(eq(projects.id, req.params.id))
  res.status(204).send()
})
