import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import {
  getDb,
  projectAccess,
  projects,
  repositories,
  workspaceMembers,
  workspaces,
} from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

export const repositoryRouter = Router()
repositoryRouter.use(requireAuth)

repositoryRouter.get('/resolve', async (req: AuthRequest, res) => {
  const { fingerprint } = req.query
  if (!fingerprint) return res.status(400).json({ error: 'fingerprint required' })

  const db = getDb()
  const [match] = await db
    .select({
      repositoryId: repositories.id,
      fingerprint: repositories.remoteFingerprint,
      projectId: projects.id,
      projectName: projects.name,
      projectSlug: projects.slug,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspaceRole: workspaceMembers.role,
    })
    .from(repositories)
    .innerJoin(projects, eq(repositories.projectId, projects.id))
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, req.userId!),
      ),
    )
    .where(eq(repositories.remoteFingerprint, fingerprint as string))
    .limit(1)

  if (!match) return res.status(404).json({ error: 'Repository not mapped' })

  if (!['owner', 'admin'].includes(match.workspaceRole)) {
    const [grant] = await db.select({ id: projectAccess.id }).from(projectAccess)
      .where(and(eq(projectAccess.projectId, match.projectId), eq(projectAccess.userId, req.userId!)))
      .limit(1)
    if (!grant) return res.status(403).json({ error: 'No access to this repository project' })
  }

  res.json(match)
})

repositoryRouter.post('/', async (req: AuthRequest, res) => {
  const { projectId, fingerprint, remoteHost, remotePath } = req.body
  if (!projectId || !fingerprint) {
    return res.status(400).json({ error: 'projectId and fingerprint required' })
  }

  const db = getDb()
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const [member] = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, project.workspaceId),
      eq(workspaceMembers.userId, req.userId!),
    ))
    .limit(1)
  if (!member || !['owner', 'admin'].includes(member.role)) {
    return res.status(403).json({ error: 'Only workspace admins can map repositories' })
  }

  const [existing] = await db.select().from(repositories)
    .where(eq(repositories.remoteFingerprint, fingerprint))
    .limit(1)
  if (existing) {
    if (existing.projectId !== projectId) {
      return res.status(409).json({ error: 'Repository is already mapped to another project' })
    }
    return res.json(existing)
  }

  const [repository] = await db.insert(repositories).values({
    projectId,
    remoteFingerprint: fingerprint,
    remoteHost,
    remotePath,
    createdBy: req.userId!,
  }).returning()

  res.status(201).json(repository)
})
