import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['owner', 'admin', 'member', 'viewer'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  publicKey: text('public_key').notNull(),
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const workspaceMembers = pgTable('workspace_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  workspaceUserUnique: uniqueIndex('workspace_members_workspace_user_unique').on(table.workspaceId, table.userId),
}))

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  workspaceSlugUnique: uniqueIndex('projects_workspace_slug_unique').on(table.workspaceId, table.slug),
}))

export const environments = pgTable('environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  projectNameUnique: uniqueIndex('environments_project_name_unique').on(table.projectId, table.name),
}))

export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => ({
  environmentKeyUnique: uniqueIndex('secrets_environment_key_unique').on(table.environmentId, table.key),
}))

export const environmentKeys = pgTable('environment_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key').notNull(),
}, table => ({
  environmentUserUnique: uniqueIndex('environment_keys_environment_user_unique').on(table.environmentId, table.userId),
}))

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const workspaceKeys = pgTable('workspace_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key').notNull(),
}, table => ({
  workspaceUserUnique: uniqueIndex('workspace_keys_workspace_user_unique').on(table.workspaceId, table.userId),
}))

export const vaultItems = pgTable('vault_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('note'),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  note: text('note'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const inviteLinks = pgTable('invite_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id').references(() => environments.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const accessLevelEnum = pgEnum('access_level', ['member', 'viewer'])
export const revisionOperationEnum = pgEnum('revision_operation', ['created', 'updated', 'deleted', 'restored', 'promoted'])
export const eventSourceEnum = pgEnum('event_source', ['cli', 'web', 'api', 'system'])
export const inviteScopeEnum = pgEnum('invite_scope', ['workspace', 'project', 'environment'])
export const inviteStatusEnum = pgEnum('invite_status', ['active', 'accepted', 'revoked', 'expired'])

export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  remoteFingerprint: text('remote_fingerprint').notNull(),
  remoteHost: text('remote_host'),
  remotePath: text('remote_path'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  remoteFingerprintUnique: uniqueIndex('repositories_remote_fingerprint_unique').on(table.remoteFingerprint),
  projectIndex: index('repositories_project_id_idx').on(table.projectId),
}))

export const projectAccess = pgTable('project_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessLevel: accessLevelEnum('access_level').notNull().default('member'),
  grantedBy: uuid('granted_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  projectUserUnique: uniqueIndex('project_access_project_user_unique').on(table.projectId, table.userId),
  userIndex: index('project_access_user_id_idx').on(table.userId),
}))

export const environmentAccess = pgTable('environment_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessLevel: accessLevelEnum('access_level').notNull().default('member'),
  grantedBy: uuid('granted_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  environmentUserUnique: uniqueIndex('environment_access_environment_user_unique').on(table.environmentId, table.userId),
  userIndex: index('environment_access_user_id_idx').on(table.userId),
}))

export const environmentKeyVersions = pgTable('environment_key_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  retiredAt: timestamp('retired_at'),
}, table => ({
  environmentVersionUnique: uniqueIndex('environment_key_versions_environment_version_unique').on(table.environmentId, table.version),
}))

export const versionedEnvironmentKeys = pgTable('versioned_environment_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyVersionId: uuid('key_version_id').notNull().references(() => environmentKeyVersions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  versionUserUnique: uniqueIndex('versioned_environment_keys_version_user_unique').on(table.keyVersionId, table.userId),
  userIndex: index('versioned_environment_keys_user_id_idx').on(table.userId),
}))

export const secretRevisions = pgTable('secret_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  secretId: uuid('secret_id').notNull().references(() => secrets.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  operation: revisionOperationEnum('operation').notNull(),
  encryptedValue: text('encrypted_value'),
  iv: text('iv'),
  keyVersionId: uuid('key_version_id').references(() => environmentKeyVersions.id, { onDelete: 'restrict' }),
  restoredFromRevisionId: uuid('restored_from_revision_id'),
  source: eventSourceEnum('source').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'set null' }),
  gitBranch: text('git_branch'),
  gitCommit: text('git_commit'),
  gitDirty: boolean('git_dirty'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  secretRevisionUnique: uniqueIndex('secret_revisions_secret_revision_unique').on(table.secretId, table.revision),
  secretCreatedIndex: index('secret_revisions_secret_created_idx').on(table.secretId, table.createdAt),
}))

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id').references(() => environments.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  resourceName: text('resource_name'),
  revisionId: uuid('revision_id').references(() => secretRevisions.id, { onDelete: 'set null' }),
  source: eventSourceEnum('source').notNull(),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'set null' }),
  gitBranch: text('git_branch'),
  gitCommit: text('git_commit'),
  gitDirty: boolean('git_dirty'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  workspaceCreatedIndex: index('audit_events_workspace_created_idx').on(table.workspaceId, table.createdAt),
  environmentCreatedIndex: index('audit_events_environment_created_idx').on(table.environmentId, table.createdAt),
}))

export const sealedInvites = pgTable('sealed_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id').references(() => environments.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  scope: inviteScopeEnum('scope').notNull(),
  role: roleEnum('role').notNull().default('member'),
  includeHistory: boolean('include_history').notNull().default(false),
  sealedPayload: text('sealed_payload').notNull(),
  payloadNonce: text('payload_nonce').notNull(),
  status: inviteStatusEnum('status').notNull().default('active'),
  maxUses: integer('max_uses').notNull().default(1),
  useCount: integer('use_count').notNull().default(0),
  expiresAt: timestamp('expires_at').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  tokenHashUnique: uniqueIndex('sealed_invites_token_hash_unique').on(table.tokenHash),
  workspaceStatusIndex: index('sealed_invites_workspace_status_idx').on(table.workspaceId, table.status),
}))
