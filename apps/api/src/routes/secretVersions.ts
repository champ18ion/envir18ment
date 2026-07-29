import { Router } from 'express'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  auditEvents,
  environmentKeys,
  getDb,
  repositories,
  secretRevisions,
  secrets,
  users,
} from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { getEnvironmentPermission } from '../lib/access.js'

interface ChangeContext {
  repositoryFingerprint?: string
  branch?: string
  commit?: string
  dirty?: boolean
  source?: 'cli' | 'web' | 'api'
}

interface SecretChange {
  key: string
  encryptedValue: string
  iv: string
  baseRevisionId?: string | null
}

export const secretVersionsRouter = Router()
secretVersionsRouter.use(requireAuth)

secretVersionsRouter.post('/batch', async (req: AuthRequest, res) => {
  const { environmentId, changes, context = {} } = req.body as {
    environmentId?: string
    changes?: SecretChange[]
    context?: ChangeContext
  }
  if (!environmentId || !Array.isArray(changes) || !changes.length) {
    return res.status(400).json({ error: 'environmentId and changes required' })
  }
  if (changes.some(change => !change.key || !change.encryptedValue || !change.iv)) {
    return res.status(400).json({ error: 'Each change requires key, encryptedValue, and iv' })
  }
  if (new Set(changes.map(change => change.key)).size !== changes.length) {
    return res.status(400).json({ error: 'Duplicate keys in batch' })
  }

  const db = getDb()
  const access = await getEnvironmentAccess(db, environmentId, req.userId!)
  if (!access?.canWrite) return res.status(403).json({ error: 'Write access required' })

  const repositoryId = await resolveRepositoryId(db, access.projectId, context.repositoryFingerprint)

  try {
    const result = await db.transaction(async tx => {
      const written: { secretId: string; revisionId: string; revision: number; key: string }[] = []

      for (const change of changes) {
        const [existing] = await tx.select().from(secrets)
          .where(and(
            eq(secrets.environmentId, environmentId),
            eq(secrets.key, change.key),
            isNull(secrets.deletedAt),
          ))
          .limit(1)

        const [latest] = existing
          ? await tx.select().from(secretRevisions)
            .where(eq(secretRevisions.secretId, existing.id))
            .orderBy(desc(secretRevisions.revision))
            .limit(1)
          : []

        if (change.baseRevisionId !== undefined && change.baseRevisionId !== (latest?.id ?? null)) {
          throw new RevisionConflict(change.key, latest?.id ?? null)
        }

        const operation = existing ? 'updated' : 'created'
        const [secret] = existing
          ? await tx.update(secrets)
            .set({ encryptedValue: change.encryptedValue, iv: change.iv, updatedAt: new Date() })
            .where(eq(secrets.id, existing.id))
            .returning()
          : await tx.insert(secrets)
            .values({
              environmentId,
              key: change.key,
              encryptedValue: change.encryptedValue,
              iv: change.iv,
            })
            .returning()

        const [revision] = await tx.insert(secretRevisions).values({
          secretId: secret.id,
          revision: (latest?.revision ?? 0) + 1,
          operation,
          encryptedValue: change.encryptedValue,
          iv: change.iv,
          source: context.source ?? 'cli',
          createdBy: req.userId!,
          repositoryId,
          gitBranch: context.branch,
          gitCommit: context.commit,
          gitDirty: context.dirty,
        }).returning()

        await tx.insert(auditEvents).values({
          workspaceId: access.workspaceId,
          projectId: access.projectId,
          environmentId,
          actorId: req.userId!,
          action: `secret.${operation}`,
          resourceType: 'secret',
          resourceId: secret.id,
          resourceName: change.key,
          revisionId: revision.id,
          source: context.source ?? 'cli',
          repositoryId,
          gitBranch: context.branch,
          gitCommit: context.commit,
          gitDirty: context.dirty,
        })

        written.push({
          secretId: secret.id,
          revisionId: revision.id,
          revision: revision.revision,
          key: change.key,
        })
      }

      return written
    })

    res.status(201).json({ written: result })
  } catch (error) {
    if (error instanceof RevisionConflict) {
      return res.status(409).json({
        error: `${error.key} changed since it was loaded`,
        key: error.key,
        currentRevisionId: error.currentRevisionId,
      })
    }
    throw error
  }
})

secretVersionsRouter.get('/history', async (req: AuthRequest, res) => {
  const { environmentId, key } = req.query
  if (!environmentId) return res.status(400).json({ error: 'environmentId required' })

  const db = getDb()
  const access = await getEnvironmentAccess(db, environmentId as string, req.userId!)
  if (!access) return res.status(403).json({ error: 'Forbidden' })

  const conditions = [
    eq(secrets.environmentId, environmentId as string),
    ...(key ? [eq(secrets.key, key as string)] : []),
  ]

  const history = await db.select({
    secretId: secrets.id,
    key: secrets.key,
    revisionId: secretRevisions.id,
    revision: secretRevisions.revision,
    operation: secretRevisions.operation,
    encryptedValue: secretRevisions.encryptedValue,
    iv: secretRevisions.iv,
    restoredFromRevisionId: secretRevisions.restoredFromRevisionId,
    source: secretRevisions.source,
    actorEmail: users.email,
    repositoryHost: repositories.remoteHost,
    repositoryPath: repositories.remotePath,
    gitBranch: secretRevisions.gitBranch,
    gitCommit: secretRevisions.gitCommit,
    gitDirty: secretRevisions.gitDirty,
    createdAt: secretRevisions.createdAt,
  })
    .from(secretRevisions)
    .innerJoin(secrets, eq(secretRevisions.secretId, secrets.id))
    .innerJoin(users, eq(secretRevisions.createdBy, users.id))
    .leftJoin(repositories, eq(secretRevisions.repositoryId, repositories.id))
    .where(and(...conditions))
    .orderBy(desc(secretRevisions.createdAt))
    .limit(500)

  res.json(history)
})

secretVersionsRouter.post('/:secretId/rollback', async (req: AuthRequest, res) => {
  const { revisionId, baseRevisionId, context = {} } = req.body as {
    revisionId?: string
    baseRevisionId?: string
    context?: ChangeContext
  }
  if (!revisionId) return res.status(400).json({ error: 'revisionId required' })

  const db = getDb()
  const [secret] = await db.select().from(secrets).where(eq(secrets.id, req.params.secretId)).limit(1)
  if (!secret) return res.status(404).json({ error: 'Secret not found' })

  const access = await getEnvironmentAccess(db, secret.environmentId, req.userId!)
  if (!access?.canWrite) return res.status(403).json({ error: 'Write access required' })

  const [target] = await db.select().from(secretRevisions)
    .where(and(
      eq(secretRevisions.id, revisionId),
      eq(secretRevisions.secretId, secret.id),
    ))
    .limit(1)
  if (!target || !target.encryptedValue || !target.iv) {
    return res.status(400).json({ error: 'Revision cannot be restored' })
  }

  const repositoryId = await resolveRepositoryId(db, access.projectId, context.repositoryFingerprint)

  try {
    const restored = await db.transaction(async tx => {
      const [latest] = await tx.select().from(secretRevisions)
        .where(eq(secretRevisions.secretId, secret.id))
        .orderBy(desc(secretRevisions.revision))
        .limit(1)

      if (baseRevisionId && latest?.id !== baseRevisionId) {
        throw new RevisionConflict(secret.key, latest?.id ?? null)
      }

      await tx.update(secrets).set({
        encryptedValue: target.encryptedValue!,
        iv: target.iv!,
        deletedAt: null,
        updatedAt: new Date(),
      }).where(eq(secrets.id, secret.id))

      const [revision] = await tx.insert(secretRevisions).values({
        secretId: secret.id,
        revision: (latest?.revision ?? 0) + 1,
        operation: 'restored',
        encryptedValue: target.encryptedValue,
        iv: target.iv,
        keyVersionId: target.keyVersionId,
        restoredFromRevisionId: target.id,
        source: context.source ?? 'cli',
        createdBy: req.userId!,
        repositoryId,
        gitBranch: context.branch,
        gitCommit: context.commit,
        gitDirty: context.dirty,
      }).returning()

      await tx.insert(auditEvents).values({
        workspaceId: access.workspaceId,
        projectId: access.projectId,
        environmentId: secret.environmentId,
        actorId: req.userId!,
        action: 'secret.restored',
        resourceType: 'secret',
        resourceId: secret.id,
        resourceName: secret.key,
        revisionId: revision.id,
        source: context.source ?? 'cli',
        repositoryId,
        gitBranch: context.branch,
        gitCommit: context.commit,
        gitDirty: context.dirty,
      })

      return revision
    })

    res.json(restored)
  } catch (error) {
    if (error instanceof RevisionConflict) {
      return res.status(409).json({
        error: `${error.key} changed since it was loaded`,
        key: error.key,
        currentRevisionId: error.currentRevisionId,
      })
    }
    throw error
  }
})

async function getEnvironmentAccess(
  db: ReturnType<typeof getDb>,
  environmentId: string,
  userId: string,
) {
  const permission = await getEnvironmentPermission(db, environmentId, userId)
  if (!permission) return null
  const [key] = await db.select({ id: environmentKeys.id }).from(environmentKeys)
    .where(and(eq(environmentKeys.environmentId, environmentId), eq(environmentKeys.userId, userId)))
    .limit(1)
  return key ? permission : null
}

async function resolveRepositoryId(
  db: ReturnType<typeof getDb>,
  projectId: string,
  fingerprint?: string,
) {
  if (!fingerprint) return null
  const [repository] = await db.select({ id: repositories.id }).from(repositories)
    .where(and(
      eq(repositories.projectId, projectId),
      eq(repositories.remoteFingerprint, fingerprint),
    ))
    .limit(1)
  return repository?.id ?? null
}

class RevisionConflict extends Error {
  constructor(
    readonly key: string,
    readonly currentRevisionId: string | null,
  ) {
    super(`${key} changed since it was loaded`)
  }
}
