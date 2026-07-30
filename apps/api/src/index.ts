import 'dotenv/config'
import 'express-async-errors'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { authRouter } from './routes/auth.js'
import { workspaceRouter } from './routes/workspaces.js'
import { projectRouter } from './routes/projects.js'
import { secretRouter } from './routes/secrets.js'
import { environmentRouter } from './routes/environments.js'
import { resolveRouter } from './routes/resolve.js'
import { membersRouter } from './routes/members.js'
import { activityRouter } from './routes/activity.js'
import { vaultRouter } from './routes/vault.js'
import { repositoryRouter } from './routes/repositories.js'
import { secretVersionsRouter } from './routes/secretVersions.js'
import { sealedInvitesRouter } from './routes/sealedInvites.js'

for (const name of ['DATABASE_URL', 'JWT_SECRET'] as const) {
  if (!process.env[name]) throw new Error(`${name} is required`)
}
if (process.env.JWT_SECRET!.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')

const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
if (process.env.NODE_ENV === 'production' && !allowedOrigins.length) {
  throw new Error('CORS_ORIGINS or WEB_URL is required in production')
}

const app = express()

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true)
    }
    callback(new Error('Origin not allowed'))
  },
}))
app.use(express.json({ limit: '1mb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

app.use('/api/auth', authRouter)
app.use('/api/workspaces', workspaceRouter)
app.use('/api/projects', projectRouter)
app.use('/api/secrets', secretRouter)
app.use('/api/environments', environmentRouter)
app.use('/api/resolve', resolveRouter)
app.use('/api/members', membersRouter)
app.use('/api/activity', activityRouter)
app.use('/api/vault', vaultRouter)
app.use('/api/repositories', repositoryRouter)
app.use('/api/v2/secrets', secretVersionsRouter)
app.use('/api/v2/invites', sealedInvitesRouter)

app.get('/health', (_, res) => res.json({ ok: true, version: 'v2' }))

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error)
  if (res.headersSent) return
  const message = error instanceof Error && error.message === 'Origin not allowed'
    ? error.message
    : 'Internal server error'
  res.status(error instanceof Error && error.message === 'Origin not allowed' ? 403 : 500).json({ error: message })
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => console.log(`API running on :${PORT}`))
