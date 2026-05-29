import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { getDb, workspaces, workspaceMembers, workspaceKeys, users } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { generateEnvKey, encryptEnvKey } from '@envir18ment/crypto'

export const workspaceRouter = Router()
workspaceRouter.use(requireAuth)

workspaceRouter.post('/', async (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const db = getDb()

  const [workspace] = await db.insert(workspaces).values({
    name,
    slug,
    createdBy: req.userId!,
  }).returning()

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: req.userId!,
    role: 'owner',
  })

  // Generate workspace encryption key for vault and distribute to creator
  const [creator] = await db.select({ publicKey: users.publicKey }).from(users).where(eq(users.id, req.userId!)).limit(1)
  if (creator) {
    const wsKey = await generateEnvKey()
    const encryptedKey = await encryptEnvKey(wsKey, creator.publicKey)
    await db.insert(workspaceKeys).values({ workspaceId: workspace.id, userId: req.userId!, encryptedKey })
  }

  res.status(201).json(workspace)
})

workspaceRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const db = getDb()
  const member = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, req.params.id), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member.length || !['owner', 'admin'].includes(member[0].role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const [updated] = await db.update(workspaces)
    .set({ name, slug })
    .where(eq(workspaces.id, req.params.id))
    .returning()

  res.json(updated)
})

workspaceRouter.get('/:slug', async (req: AuthRequest, res) => {
  const db = getDb()
  const [ws] = await db.select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaces.slug, req.params.slug), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!ws) return res.status(404).json({ error: 'Not found' })
  res.json({ ...ws.workspace, role: ws.role })
})

workspaceRouter.get('/', async (req: AuthRequest, res) => {
  const db = getDb()
  const members = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, req.userId!))

  res.json(members.map(m => ({ ...m.workspace, role: m.role })))
})

workspaceRouter.delete('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, req.params.id), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member || member.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can delete a workspace' })
  }
  await db.delete(workspaces).where(eq(workspaces.id, req.params.id))
  res.status(204).send()
})
