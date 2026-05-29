import { Router } from 'express'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { getDb, secrets, environments, environmentKeys, projects } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { logActivity } from './activity.js'

async function getWorkspaceId(db: ReturnType<typeof getDb>, environmentId: string): Promise<string | null> {
  const [row] = await db.select({ workspaceId: projects.workspaceId })
    .from(environments).innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(environments.id, environmentId)).limit(1)
  return row?.workspaceId ?? null
}

export const secretRouter = Router()
secretRouter.use(requireAuth)

// GET /api/secrets?environmentId=xxx&deleted=true — returns secrets + user's encrypted env key
secretRouter.get('/', async (req: AuthRequest, res) => {
  const { environmentId, deleted } = req.query
  if (!environmentId) return res.status(400).json({ error: 'environmentId required' })

  const db = getDb()

  const [envKey] = await db.select().from(environmentKeys)
    .where(and(eq(environmentKeys.environmentId, environmentId as string), eq(environmentKeys.userId, req.userId!)))
    .limit(1)
  if (!envKey) return res.status(403).json({ error: 'Forbidden' })

  const envSecrets = await db.select().from(secrets).where(
    and(
      eq(secrets.environmentId, environmentId as string),
      deleted === 'true' ? isNotNull(secrets.deletedAt) : isNull(secrets.deletedAt)
    )
  )

  res.json({ encryptedKey: envKey.encryptedKey, secrets: envSecrets })
})

// POST /api/secrets — upsert a secret (value must be pre-encrypted by client)
secretRouter.post('/', async (req: AuthRequest, res) => {
  const { environmentId, key, encryptedValue, iv } = req.body
  if (!environmentId || !key || !encryptedValue || !iv) {
    return res.status(400).json({ error: 'environmentId, key, encryptedValue, iv required' })
  }

  const db = getDb()

  const [envKey] = await db.select().from(environmentKeys)
    .where(and(eq(environmentKeys.environmentId, environmentId), eq(environmentKeys.userId, req.userId!)))
    .limit(1)
  if (!envKey) return res.status(403).json({ error: 'Forbidden' })

  const [existing] = await db.select().from(secrets)
    .where(and(eq(secrets.environmentId, environmentId), eq(secrets.key, key), isNull(secrets.deletedAt)))
    .limit(1)

  if (existing) {
    const [updated] = await db.update(secrets)
      .set({ encryptedValue, iv, updatedAt: new Date() })
      .where(eq(secrets.id, existing.id))
      .returning()
    const wsId = await getWorkspaceId(db, environmentId)
    if (wsId) await logActivity(db, wsId, req.userId!, 'secret.updated', 'secret', key)
    return res.json(updated)
  }

  const [created] = await db.insert(secrets).values({ environmentId, key, encryptedValue, iv }).returning()
  const wsId = await getWorkspaceId(db, environmentId)
  if (wsId) await logActivity(db, wsId, req.userId!, 'secret.created', 'secret', key)
  res.status(201).json(created)
})

// DELETE /api/secrets/:id — soft delete
secretRouter.delete('/:id', async (req: AuthRequest, res) => {
  const db = getDb()
  const [secret] = await db.select().from(secrets).where(eq(secrets.id, req.params.id)).limit(1)
  if (!secret) return res.status(404).json({ error: 'Not found' })

  const [envKey] = await db.select().from(environmentKeys)
    .where(and(eq(environmentKeys.environmentId, secret.environmentId), eq(environmentKeys.userId, req.userId!)))
    .limit(1)
  if (!envKey) return res.status(403).json({ error: 'Forbidden' })

  const wsId = await getWorkspaceId(db, secret.environmentId)
  await db.update(secrets).set({ deletedAt: new Date() }).where(eq(secrets.id, req.params.id))
  if (wsId) await logActivity(db, wsId, req.userId!, 'secret.deleted', 'secret', secret.key)
  res.status(204).send()
})

// PATCH /api/secrets/:id/restore — restore soft-deleted secret
secretRouter.patch('/:id/restore', async (req: AuthRequest, res) => {
  const db = getDb()
  const [secret] = await db.select().from(secrets).where(eq(secrets.id, req.params.id)).limit(1)
  if (!secret) return res.status(404).json({ error: 'Not found' })

  const [envKey] = await db.select().from(environmentKeys)
    .where(and(eq(environmentKeys.environmentId, secret.environmentId), eq(environmentKeys.userId, req.userId!)))
    .limit(1)
  if (!envKey) return res.status(403).json({ error: 'Forbidden' })

  const [restored] = await db.update(secrets).set({ deletedAt: null }).where(eq(secrets.id, req.params.id)).returning()
  const wsId = await getWorkspaceId(db, secret.environmentId)
  if (wsId) await logActivity(db, wsId, req.userId!, 'secret.restored', 'secret', secret.key)
  res.json(restored)
})
