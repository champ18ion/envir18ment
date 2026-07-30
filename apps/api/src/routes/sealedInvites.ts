import { Router } from 'express'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import {
  auditEvents,
  environmentAccess,
  environmentKeys,
  environments,
  getDb,
  projectAccess,
  projects,
  sealedInvites,
  workspaceMembers,
  workspaces,
} from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

interface EncryptedKeyGrant {
  environmentId: string
  encryptedKey: string
}

export const sealedInvitesRouter = Router()

sealedInvitesRouter.get('/:token', async (req, res) => {
  const db = getDb()
  const tokenHash = hashToken(req.params.token)
  const [invite] = await db.select({
    id: sealedInvites.id,
    workspaceId: sealedInvites.workspaceId,
    workspaceName: workspaces.name,
    workspaceSlug: workspaces.slug,
    projectId: sealedInvites.projectId,
    environmentId: sealedInvites.environmentId,
    scope: sealedInvites.scope,
    role: sealedInvites.role,
    sealedPayload: sealedInvites.sealedPayload,
    payloadNonce: sealedInvites.payloadNonce,
    status: sealedInvites.status,
    expiresAt: sealedInvites.expiresAt,
  })
    .from(sealedInvites)
    .innerJoin(workspaces, eq(sealedInvites.workspaceId, workspaces.id))
    .where(eq(sealedInvites.tokenHash, tokenHash))
    .limit(1)

  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (invite.status !== 'active') return res.status(410).json({ error: `Invite is ${invite.status}` })
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' })
  res.json(invite)
})

sealedInvitesRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const {
    workspaceId,
    projectId,
    environmentId,
    scope,
    role = 'member',
    sealedPayload,
    payloadNonce,
    expiresInHours = 24,
  } = req.body
  if (!workspaceId || !scope || !sealedPayload || !payloadNonce) {
    return res.status(400).json({ error: 'workspaceId, scope, sealedPayload, and payloadNonce required' })
  }
  if (!['workspace', 'project', 'environment'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' })
  }
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (role === 'admin' && scope !== 'workspace') {
    return res.status(400).json({ error: 'Admin invitations must be workspace-scoped' })
  }
  if (scope === 'project' && !projectId) return res.status(400).json({ error: 'projectId required' })
  if (scope === 'environment' && (!projectId || !environmentId)) {
    return res.status(400).json({ error: 'projectId and environmentId required' })
  }

  const db = getDb()
  const [creator] = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, req.userId!),
    ))
    .limit(1)
  if (!creator || !['owner', 'admin'].includes(creator.role)) {
    return res.status(403).json({ error: 'Only workspace admins can create invites' })
  }
  if (role === 'admin' && creator.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can invite admins' })
  }

  if (projectId) {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1)
    if (!project) return res.status(400).json({ error: 'Project is outside this workspace' })
  }
  if (environmentId) {
    const [environment] = await db.select().from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId)))
      .limit(1)
    if (!environment) return res.status(400).json({ error: 'Environment is outside this project' })
  }

  const hours = Math.min(Math.max(Number(expiresInHours) || 24, 1), 24 * 30)
  const token = crypto.randomBytes(32).toString('base64url')
  const [invite] = await db.insert(sealedInvites).values({
    workspaceId,
    projectId,
    environmentId,
    tokenHash: hashToken(token),
    scope,
    role,
    sealedPayload,
    payloadNonce,
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    createdBy: req.userId!,
  }).returning({ id: sealedInvites.id, expiresAt: sealedInvites.expiresAt })

  const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  res.status(201).json({
    id: invite.id,
    token,
    inviteUrl: `${webUrl}/invite/${token}`,
    expiresAt: invite.expiresAt,
  })
})

sealedInvitesRouter.post('/:token/accept', requireAuth, async (req: AuthRequest, res) => {
  const { encryptedKeys } = req.body as { encryptedKeys?: EncryptedKeyGrant[] }
  if (!Array.isArray(encryptedKeys)) {
    return res.status(400).json({ error: 'encryptedKeys required' })
  }

  const db = getDb()
  const [invite] = await db.select().from(sealedInvites)
    .where(eq(sealedInvites.tokenHash, hashToken(req.params.token)))
    .limit(1)
  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (invite.status !== 'active') return res.status(410).json({ error: `Invite is ${invite.status}` })
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' })

  const allowedEnvironmentIds = await getInviteEnvironmentIds(db, invite)
  const suppliedIds = encryptedKeys.map(key => key.environmentId)
  if (
    new Set(suppliedIds).size !== suppliedIds.length
    || suppliedIds.length !== allowedEnvironmentIds.length
    || suppliedIds.some(id => !allowedEnvironmentIds.includes(id))
  ) {
    return res.status(400).json({ error: 'Encrypted keys do not match invite scope' })
  }

  const result = await db.transaction(async tx => {
    const [claimed] = await tx.update(sealedInvites).set({
      status: 'accepted',
      useCount: invite.useCount + 1,
      acceptedBy: req.userId!,
      acceptedAt: new Date(),
    }).where(and(
      eq(sealedInvites.id, invite.id),
      eq(sealedInvites.status, 'active'),
    )).returning({ id: sealedInvites.id })
    if (!claimed) throw new InviteClaimConflict()

    const [existingMember] = await tx.select().from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, invite.workspaceId),
        eq(workspaceMembers.userId, req.userId!),
      ))
      .limit(1)

    if (!existingMember) {
      await tx.insert(workspaceMembers).values({
        workspaceId: invite.workspaceId,
        userId: req.userId!,
        role: invite.role,
      })
    }

    if (invite.scope === 'workspace') {
      const workspaceProjects = await tx.select({ id: projects.id }).from(projects)
        .where(eq(projects.workspaceId, invite.workspaceId))
      for (const project of workspaceProjects) {
        await grantProject(tx, project.id, req.userId!, invite.createdBy, invite.role)
      }
    } else if (invite.scope === 'project') {
      await grantProject(tx, invite.projectId!, req.userId!, invite.createdBy, invite.role)
    } else {
      await tx.insert(environmentAccess).values({
        environmentId: invite.environmentId!,
        userId: req.userId!,
        accessLevel: invite.role === 'viewer' ? 'viewer' : 'member',
        grantedBy: invite.createdBy,
      }).onConflictDoUpdate({
        target: [environmentAccess.environmentId, environmentAccess.userId],
        set: { accessLevel: invite.role === 'viewer' ? 'viewer' : 'member', grantedBy: invite.createdBy },
      })
    }

    for (const grant of encryptedKeys) {
      await tx.delete(environmentKeys).where(and(
        eq(environmentKeys.environmentId, grant.environmentId),
        eq(environmentKeys.userId, req.userId!),
      ))
      await tx.insert(environmentKeys).values({
        environmentId: grant.environmentId,
        userId: req.userId!,
        encryptedKey: grant.encryptedKey,
      })
    }

    await tx.insert(auditEvents).values({
      workspaceId: invite.workspaceId,
      projectId: invite.projectId,
      environmentId: invite.environmentId,
      actorId: req.userId!,
      action: 'invite.accepted',
      resourceType: 'invite',
      resourceId: invite.id,
      source: 'api',
    })

    return { workspaceId: invite.workspaceId, scope: invite.scope }
  }).catch(error => {
    if (error instanceof InviteClaimConflict) return null
    throw error
  })

  if (!result) return res.status(409).json({ error: 'Invite was already accepted' })
  res.json(result)
})

sealedInvitesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const db = getDb()
  const [invite] = await db.select().from(sealedInvites).where(eq(sealedInvites.id, req.params.id)).limit(1)
  if (!invite) return res.status(404).json({ error: 'Invite not found' })

  const [member] = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, invite.workspaceId),
      eq(workspaceMembers.userId, req.userId!),
    ))
    .limit(1)
  if (!member || !['owner', 'admin'].includes(member.role)) return res.status(403).json({ error: 'Forbidden' })

  await db.update(sealedInvites).set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(sealedInvites.id, invite.id))
  res.status(204).send()
})

async function getInviteEnvironmentIds(
  db: ReturnType<typeof getDb>,
  invite: typeof sealedInvites.$inferSelect,
) {
  if (invite.scope === 'environment') return [invite.environmentId!]
  if (invite.scope === 'project') {
    const rows = await db.select({ id: environments.id }).from(environments)
      .where(eq(environments.projectId, invite.projectId!))
    return rows.map(row => row.id)
  }
  const rows = await db.select({ id: environments.id }).from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(projects.workspaceId, invite.workspaceId))
  return rows.map(row => row.id)
}

async function grantProject(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  projectId: string,
  userId: string,
  grantedBy: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
) {
  await tx.insert(projectAccess).values({
    projectId,
    userId,
    accessLevel: role === 'viewer' ? 'viewer' : 'member',
    grantedBy,
  }).onConflictDoUpdate({
    target: [projectAccess.projectId, projectAccess.userId],
    set: { accessLevel: role === 'viewer' ? 'viewer' : 'member', grantedBy },
  })
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

class InviteClaimConflict extends Error {}
