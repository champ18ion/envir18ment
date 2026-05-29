import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { workspaceRouter } from './routes/workspaces.js'
import { projectRouter } from './routes/projects.js'
import { secretRouter } from './routes/secrets.js'
import { environmentRouter } from './routes/environments.js'
import { resolveRouter } from './routes/resolve.js'
import { membersRouter } from './routes/members.js'
import { activityRouter } from './routes/activity.js'
import { invitesRouter } from './routes/invites.js'
import { vaultRouter } from './routes/vault.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/workspaces', workspaceRouter)
app.use('/api/projects', projectRouter)
app.use('/api/secrets', secretRouter)
app.use('/api/environments', environmentRouter)
app.use('/api/resolve', resolveRouter)
app.use('/api/members', membersRouter)
app.use('/api/activity', activityRouter)
app.use('/api/invites', invitesRouter)
app.use('/api/vault', vaultRouter)

app.get('/health', (_, res) => res.json({ ok: true }))

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => console.log(`API running on :${PORT}`))
