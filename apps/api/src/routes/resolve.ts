import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { getDb, workspaces, projects, environments, workspaceMembers } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

export const resolveRouter = Router()
resolveRouter.use(requireAuth)

resolveRouter.get('/', async (req: AuthRequest, res) => {
  const { w, p, e } = req.query
  if (!w || !p || !e) return res.status(400).json({ error: 'w, p, e query params required' })

  const db = getDb()

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, w as string)).limit(1)
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length) return res.status(403).json({ error: 'Forbidden' })

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), eq(projects.slug, p as string)))
    .limit(1)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const [env] = await db.select().from(environments)
    .where(and(eq(environments.projectId, project.id), eq(environments.name, e as string)))
    .limit(1)
  if (!env) return res.status(404).json({ error: 'Environment not found' })

  res.json({ environmentId: env.id })
})
