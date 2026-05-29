import { Router } from 'express'
import { eq, and, inArray } from 'drizzle-orm'
import { getDb, users, workspaces, workspaceMembers, environments, projects, environmentKeys, workspaceKeys } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { logActivity } from './activity.js'

export const membersRouter = Router()
membersRouter.use(requireAuth)

// GET /api/members?workspaceId=xxx
membersRouter.get('/', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()

  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length) return res.status(403).json({ error: 'Forbidden' })

  const members = await db
    .select({ id: users.id, email: users.email, publicKey: users.publicKey, role: workspaceMembers.role, joinedAt: workspaceMembers.createdAt })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId as string))

  const envList = await db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(projects.workspaceId, workspaceId as string))

  const envIds = envList.map(e => e.id)
  let keyCounts: Record<string, number> = {}
  if (envIds.length > 0) {
    const keyRows = await db.select({ userId: environmentKeys.userId })
      .from(environmentKeys)
      .where(inArray(environmentKeys.environmentId, envIds))
    for (const row of keyRows) keyCounts[row.userId] = (keyCounts[row.userId] ?? 0) + 1
  }

  res.json(members.map(m => ({ ...m, needsKeys: envIds.length > 0 && (keyCounts[m.id] ?? 0) < envIds.length })))
})

// GET /api/members/lookup?email=xxx — returns publicKey for invite key distribution
membersRouter.get('/lookup', async (req: AuthRequest, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })
  const db = getDb()
  const [user] = await db.select({ id: users.id, publicKey: users.publicKey })
    .from(users).where(eq(users.email, email as string)).limit(1)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

// POST /api/members — add member + distribute env keys
// body: { workspaceId, userId, role, encryptedKeys: [{environmentId, encryptedKey}] }
membersRouter.post('/', async (req: AuthRequest, res) => {
  const { workspaceId, userId, role, encryptedKeys } = req.body
  if (!workspaceId || !userId || !encryptedKeys) return res.status(400).json({ error: 'workspaceId, userId, encryptedKeys required' })

  const db = getDb()
  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length || !['owner', 'admin'].includes(me[0].role)) return res.status(403).json({ error: 'Forbidden' })

  const existing = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1)
  if (existing.length) return res.status(409).json({ error: 'User is already a member' })

  await db.insert(workspaceMembers).values({ workspaceId, userId, role: role ?? 'member' })

  for (const { environmentId, encryptedKey } of encryptedKeys as { environmentId: string; encryptedKey: string }[]) {
    await db.insert(environmentKeys).values({ environmentId, userId, encryptedKey })
  }

  await logActivity(db, workspaceId, req.userId!, 'member.added', 'member', userId)

  const [user] = await db.select({ id: users.id, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1)

  res.status(201).json(user)
})

// POST /api/members/:userId/keys — distribute env keys + optional vault key to an existing member
membersRouter.post('/:userId/keys', async (req: AuthRequest, res) => {
  const { workspaceId, encryptedKeys, vaultKey } = req.body
  if (!workspaceId || !encryptedKeys) return res.status(400).json({ error: 'workspaceId and encryptedKeys required' })

  const db = getDb()
  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length || !['owner', 'admin'].includes(me[0].role)) return res.status(403).json({ error: 'Forbidden' })

  for (const { environmentId, encryptedKey } of encryptedKeys as { environmentId: string; encryptedKey: string }[]) {
    await db.delete(environmentKeys)
      .where(and(eq(environmentKeys.environmentId, environmentId), eq(environmentKeys.userId, req.params.userId)))
    await db.insert(environmentKeys).values({ environmentId, userId: req.params.userId, encryptedKey })
  }

  if (vaultKey) {
    await db.delete(workspaceKeys)
      .where(and(eq(workspaceKeys.workspaceId, workspaceId), eq(workspaceKeys.userId, req.params.userId)))
    await db.insert(workspaceKeys).values({ workspaceId, userId: req.params.userId, encryptedKey: vaultKey })
  }

  res.json({ ok: true })
})

// PATCH /api/members/:userId — change role
membersRouter.patch('/:userId', async (req: AuthRequest, res) => {
  const { workspaceId, role } = req.body
  if (!workspaceId || !role) return res.status(400).json({ error: 'workspaceId and role required' })
  const db = getDb()

  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length || !['owner', 'admin'].includes(me[0].role)) return res.status(403).json({ error: 'Forbidden' })

  await db.update(workspaceMembers).set({ role })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.params.userId)))

  res.json({ ok: true })
})

// DELETE /api/members/me?workspaceId=xxx — leave workspace (self-removal, non-owners only)
membersRouter.delete('/me', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()

  const [me] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me) return res.status(404).json({ error: 'Not a member' })
  if (me.role === 'owner') return res.status(400).json({ error: 'Owner cannot leave — delete the workspace instead' })

  const envList = await db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(projects.workspaceId, workspaceId as string))

  for (const env of envList) {
    await db.delete(environmentKeys)
      .where(and(eq(environmentKeys.environmentId, env.id), eq(environmentKeys.userId, req.userId!)))
  }

  await db.delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))

  res.status(204).send()
})

// DELETE /api/members/:userId?workspaceId=xxx
membersRouter.delete('/:userId', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()

  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length || !['owner', 'admin'].includes(me[0].role)) return res.status(403).json({ error: 'Forbidden' })
  if (req.params.userId === req.userId) return res.status(400).json({ error: 'Cannot remove yourself' })

  // Remove their environment keys too
  const envList = await db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(projects.workspaceId, workspaceId as string))

  for (const env of envList) {
    await db.delete(environmentKeys)
      .where(and(eq(environmentKeys.environmentId, env.id), eq(environmentKeys.userId, req.params.userId)))
  }

  await db.delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.params.userId)))

  await logActivity(db, workspaceId as string, req.userId!, 'member.removed', 'member', req.params.userId)

  res.status(204).send()
})
