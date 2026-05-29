import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { getDb, inviteLinks, workspaces, workspaceMembers } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

export const invitesRouter = Router()

// POST /api/invites — generate invite link for a workspace
invitesRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { workspaceId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  const db = getDb()
  const me = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)
  if (!me.length || !['owner', 'admin'].includes(me[0].role)) return res.status(403).json({ error: 'Forbidden' })

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(inviteLinks).values({ workspaceId, token, expiresAt, createdBy: req.userId! })

  res.json({ token })
})

// GET /api/invites/:token — validate token, return workspace info
invitesRouter.get('/:token', async (req, res) => {
  const db = getDb()
  const [invite] = await db
    .select({ id: inviteLinks.id, expiresAt: inviteLinks.expiresAt, workspaceName: workspaces.name, workspaceSlug: workspaces.slug })
    .from(inviteLinks)
    .innerJoin(workspaces, eq(inviteLinks.workspaceId, workspaces.id))
    .where(eq(inviteLinks.token, req.params.token))
    .limit(1)

  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (new Date() > invite.expiresAt) return res.status(410).json({ error: 'Invite expired' })

  res.json({ workspaceName: invite.workspaceName, workspaceSlug: invite.workspaceSlug })
})

// POST /api/invites/:token/accept — join workspace after auth
invitesRouter.post('/:token/accept', requireAuth, async (req: AuthRequest, res) => {
  const db = getDb()
  const [invite] = await db
    .select({ id: inviteLinks.id, workspaceId: inviteLinks.workspaceId, expiresAt: inviteLinks.expiresAt })
    .from(inviteLinks)
    .where(eq(inviteLinks.token, req.params.token))
    .limit(1)

  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (new Date() > invite.expiresAt) return res.status(410).json({ error: 'Invite expired' })

  const existing = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, req.userId!)))
    .limit(1)

  if (!existing.length) {
    await db.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId: req.userId!, role: 'member' })
  }

  const [ws] = await db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1)

  res.json({ workspaceSlug: ws.slug, alreadyMember: existing.length > 0 })
})
