import { Router } from 'express'
import { and, eq, desc } from 'drizzle-orm'
import { getDb, activityLogs, users, workspaceMembers } from '@envir18ment/db'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

export const activityRouter = Router()
activityRouter.use(requireAuth)

export async function logActivity(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
) {
  await db.insert(activityLogs).values({ workspaceId, userId, action, resourceType, resourceId })
}

// GET /api/activity?workspaceId=xxx
activityRouter.get('/', async (req: AuthRequest, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })
  const db = getDb()

  const member = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId as string),
      eq(workspaceMembers.userId, req.userId!),
    ))
    .limit(1)
  if (!member.length) return res.status(403).json({ error: 'Forbidden' })

  const logs = await db
    .select({ id: activityLogs.id, action: activityLogs.action, resourceType: activityLogs.resourceType, resourceId: activityLogs.resourceId, createdAt: activityLogs.createdAt, userEmail: users.email })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.workspaceId, workspaceId as string))
    .orderBy(desc(activityLogs.createdAt))
    .limit(100)

  res.json(logs)
})
