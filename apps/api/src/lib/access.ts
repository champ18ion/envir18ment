import { and, eq } from 'drizzle-orm'
import {
  environmentAccess,
  environments,
  getDb,
  projectAccess,
  projects,
  workspaceMembers,
} from '@envir18ment/db'

type Db = ReturnType<typeof getDb>

export interface AccessPermission {
  workspaceId: string
  projectId: string
  environmentId?: string
  canWrite: boolean
  workspaceRole: 'owner' | 'admin' | 'member' | 'viewer'
}

export async function getProjectPermission(
  db: Db,
  projectId: string,
  userId: string,
): Promise<AccessPermission | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) return null

  const [membership] = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, project.workspaceId),
      eq(workspaceMembers.userId, userId),
    ))
    .limit(1)
  if (!membership) return null

  if (membership.role === 'owner' || membership.role === 'admin') {
    return {
      workspaceId: project.workspaceId,
      projectId,
      canWrite: true,
      workspaceRole: membership.role,
    }
  }

  const [grant] = await db.select().from(projectAccess)
    .where(and(eq(projectAccess.projectId, projectId), eq(projectAccess.userId, userId)))
    .limit(1)
  if (!grant) return null

  return {
    workspaceId: project.workspaceId,
    projectId,
    canWrite: membership.role === 'member' && grant.accessLevel === 'member',
    workspaceRole: membership.role,
  }
}

export async function getEnvironmentPermission(
  db: Db,
  environmentId: string,
  userId: string,
): Promise<AccessPermission | null> {
  const [environment] = await db.select({
    projectId: environments.projectId,
    workspaceId: projects.workspaceId,
  })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(environments.id, environmentId))
    .limit(1)
  if (!environment) return null

  const [membership] = await db.select().from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, environment.workspaceId),
      eq(workspaceMembers.userId, userId),
    ))
    .limit(1)
  if (!membership) return null

  if (membership.role === 'owner' || membership.role === 'admin') {
    return {
      ...environment,
      environmentId,
      canWrite: true,
      workspaceRole: membership.role,
    }
  }

  const [projectGrant] = await db.select().from(projectAccess)
    .where(and(
      eq(projectAccess.projectId, environment.projectId),
      eq(projectAccess.userId, userId),
    ))
    .limit(1)
  const [environmentGrant] = await db.select().from(environmentAccess)
    .where(and(
      eq(environmentAccess.environmentId, environmentId),
      eq(environmentAccess.userId, userId),
    ))
    .limit(1)
  const grant = environmentGrant ?? projectGrant
  if (!grant) return null

  return {
    ...environment,
    environmentId,
    canWrite: membership.role === 'member' && grant.accessLevel === 'member',
    workspaceRole: membership.role,
  }
}
