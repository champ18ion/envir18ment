import { Command } from 'commander'
import chalk from 'chalk'
import { config } from '../index.js'
import { decryptSecret, encryptEnvKey } from '@envir18ment/crypto'
import { apiFetch } from '../lib/api.js'

interface SealedPayload {
  version: number
  keys: { environmentId: string; envKey: string }[]
}

export const acceptCommand = new Command('accept')
  .description('Accept a sealed e18 invitation')
  .argument('<invite-url>', 'sealed invitation URL')
  .action(async (inviteUrl: string) => {
    if (!config.get('token')) throw new Error('Not logged in. Run: e18 login')

    const url = new URL(inviteUrl)
    const token = url.pathname.split('/').filter(Boolean).at(-1)
    const shareKey = decodeURIComponent(url.hash.slice(1))
    if (!token || !shareKey) throw new Error('Invalid sealed invitation URL')

    const inviteRes = await apiFetch(`/api/v2/invites/${token}`)
    const invite = await inviteRes.json() as {
      error?: string
      workspaceName: string
      scope: string
      role: string
      sealedPayload: string
      payloadNonce: string
    }
    if (!inviteRes.ok) throw new Error(invite.error ?? 'Invite not found')

    let payload: SealedPayload
    try {
      payload = JSON.parse(decryptSecret(invite.sealedPayload, invite.payloadNonce, shareKey))
    } catch {
      throw new Error('Invitation decryption failed')
    }
    if (payload.version !== 1 || !Array.isArray(payload.keys) || !payload.keys.length) {
      throw new Error('Unsupported invitation payload')
    }

    const publicKey = config.get('publicKey') as string
    const encryptedKeys = payload.keys.map(key => ({
      environmentId: key.environmentId,
      encryptedKey: encryptEnvKey(key.envKey, publicKey),
    }))

    const acceptRes = await apiFetch(`/api/v2/invites/${token}/accept`, {
      method: 'POST',
      body: JSON.stringify({ encryptedKeys }),
    })
    const accepted = await acceptRes.json() as { error?: string; scope?: string }
    if (!acceptRes.ok) throw new Error(accepted.error ?? 'Could not accept invitation')

    console.log(chalk.green(`\n  Access granted to ${invite.workspaceName}`))
    console.log(chalk.gray(`  Scope: ${invite.scope} · role: ${invite.role}`))
    console.log(chalk.cyan('  Clone the repository and run: e18 init\n'))
  })
