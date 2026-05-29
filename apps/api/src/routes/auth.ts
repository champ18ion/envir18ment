import { Router } from 'express'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import argon2 from 'argon2'
import { getDb, users } from '@envir18ment/db'
import { generateKeypair, encryptPrivateKey, deriveKey } from '@envir18ment/crypto'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import crypto from 'crypto'

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const db = getDb()
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) return res.status(409).json({ error: 'Email already in use' })

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  const { publicKey, privateKey } = await generateKeypair()

  const salt = crypto.randomBytes(16).toString('hex')
  const masterKey = await deriveKey(password, salt)
  const { ciphertext, nonce } = await encryptPrivateKey(privateKey, masterKey)

  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    publicKey,
    encryptedPrivateKey: JSON.stringify({ ciphertext, nonce, salt }),
  }).returning()

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
  res.status(201).json({ token, user: { id: user.id, email: user.email, publicKey: user.publicKey, encryptedPrivateKey: user.encryptedPrivateKey } })
})

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const db = getDb()
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await argon2.verify(user.passwordHash, password)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, email: user.email, publicKey: user.publicKey, encryptedPrivateKey: user.encryptedPrivateKey } })
})
