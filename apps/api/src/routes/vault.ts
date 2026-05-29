import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { getDb, vaultItems, workspaceKeys, workspaceMembers, users } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { generateEnvKey, encryptEnvKey } from '@envir18ment/crypto'

export const vaultRouter = Router()
vaultRouter.use(requireAuth)

// GET /api/vault/key?workspaceId= — user's encrypted workspace key
vaultRouter.get('/key', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()
  const [key] = await db.select().from(workspaceKeys)
    .where(and(eq(workspaceKeys.workspaceId, workspaceId as string), eq(workspaceKeys.userId, req.userId!)))
    .limit(1)
  if (!key) {
    // Distinguish: has any member been bootstrapped yet?
    const [any] = await db.select().from(workspaceKeys)
      .where(eq(workspaceKeys.workspaceId, workspaceId as string)).limit(1)
    return res.status(403).json({ bootstrapped: !!any })
  }
  res.json({ encryptedKey: key.encryptedKey })
})

// POST /api/vault/bootstrap — generate + distribute vault key to all members (admin/owner only, one-time)
vaultRouter.post('/bootstrap', async (req: AuthRequest, res) => {
  const { workspaceId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()

  const [me] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: 'Forbidden' })

  const [existing] = await db.select().from(workspaceKeys)
    .where(eq(workspaceKeys.workspaceId, workspaceId)).limit(1)
  if (existing) return res.status(409).json({ error: 'Already initialized' })

  const members = await db.select({ userId: users.id, publicKey: users.publicKey })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))

  const wsKey = await generateEnvKey()
  for (const m of members) {
    const encryptedKey = await encryptEnvKey(wsKey, m.publicKey)
    await db.insert(workspaceKeys).values({ workspaceId, userId: m.userId, encryptedKey })
  }

  const [myKey] = await db.select().from(workspaceKeys)
    .where(and(eq(workspaceKeys.workspaceId, workspaceId), eq(workspaceKeys.userId, req.userId!)))
    .limit(1)
  res.json({ encryptedKey: myKey.encryptedKey })
})

// GET /api/vault?workspaceId= — list vault items (encrypted)
vaultRouter.get('/', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId as string), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member) return res.status(403).json({ error: 'Forbidden' })
  res.json(await db.select().from(vaultItems).where(eq(vaultItems.workspaceId, workspaceId as string)))
})

// POST /api/vault — create vault item
vaultRouter.post('/', async (req: AuthRequest, res) => {
  const { workspaceId, name, type, encryptedValue, iv, note } = req.body
  if (!workspaceId || !name || !encryptedValue || !iv) {
    return res.status(400).json({ error: 'workspaceId, name, encryptedValue, iv required' })
  }
  const db = getDb()
  const [key] = await db.select().from(workspaceKeys)
    .where(and(eq(workspaceKeys.workspaceId, workspaceId), eq(workspaceKeys.userId, req.userId!)))
    .limit(1)
  if (!key) return res.status(403).json({ error: 'No vault key' })
  const [item] = await db.insert(vaultItems)
    .values({ workspaceId, name, type: type ?? 'note', encryptedValue, iv, note: note ?? null, createdBy: req.userId! })
    .returning()
  res.status(201).json(item)
})

// PATCH /api/vault/:id — update name/type/value/note
vaultRouter.patch('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [item] = await db.select().from(vaultItems).where(eq(vaultItems.id, req.params.id)).limit(1)
  if (!item) return res.status(404).json({ error: 'Not found' })
  const [key] = await db.select().from(workspaceKeys)
    .where(and(eq(workspaceKeys.workspaceId, item.workspaceId), eq(workspaceKeys.userId, req.userId!)))
    .limit(1)
  if (!key) return res.status(403).json({ error: 'Forbidden' })
  const { name, type, encryptedValue, iv, note } = req.body
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (name) set.name = name
  if (type) set.type = type
  if (encryptedValue && iv) { set.encryptedValue = encryptedValue; set.iv = iv }
  if (note !== undefined) set.note = note
  const [updated] = await db.update(vaultItems).set(set).where(eq(vaultItems.id, req.params.id)).returning()
  res.json(updated)
})

// DELETE /api/vault/:id
vaultRouter.delete('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [item] = await db.select().from(vaultItems).where(eq(vaultItems.id, req.params.id)).limit(1)
  if (!item) return res.status(404).json({ error: 'Not found' })
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, item.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!member) return res.status(403).json({ error: 'Forbidden' })
  await db.delete(vaultItems).where(eq(vaultItems.id, req.params.id))
  res.status(204).send()
})
