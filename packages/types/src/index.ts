export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export interface User {
  id: string
  email: string
  publicKey: string
  encryptedPrivateKey: string
  createdAt: Date
}

export interface Workspace {
  id: string
  name: string
  slug: string
  createdBy: string
  createdAt: Date
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  slug: string
  createdAt: Date
}

export interface Environment {
  id: string
  projectId: string
  name: string
  createdAt: Date
}

export interface Secret {
  id: string
  environmentId: string
  key: string
  encryptedValue: string
  iv: string
  createdAt: Date
  updatedAt: Date
}

export interface ActivityLog {
  id: string
  workspaceId: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  createdAt: Date
}

export interface InviteLink {
  id: string
  workspaceId: string
  projectId: string
  environmentId: string
  token: string
  expiresAt: Date
  createdBy: string
  createdAt: Date
}
