import { drizzle } from 'drizzle-orm/neon-serverless'
import { Pool } from '@neondatabase/serverless'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null
let _pool: Pool | null = null

export function getDb() {
  if (!_db) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL! })
    _db = drizzle(_pool, { schema })
  }
  return _db
}

export * from './schema'
