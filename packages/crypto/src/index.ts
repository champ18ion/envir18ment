import nacl from 'tweetnacl'
import argon2 from 'argon2'

const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64')
const unb64 = (str: string) => new Uint8Array(Buffer.from(str, 'base64'))

export async function deriveKey(password: string, salt: string): Promise<Buffer> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    salt: Buffer.from(salt, 'hex'),
    raw: true,
    hashLength: 32,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  }) as unknown as Buffer
}

export function generateKeypair() {
  const keypair = nacl.box.keyPair()
  return {
    publicKey: b64(keypair.publicKey),
    privateKey: b64(keypair.secretKey),
  }
}

export function encryptPrivateKey(privateKey: string, masterKey: Buffer): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const ciphertext = nacl.secretbox(unb64(privateKey), nonce, masterKey)
  return { ciphertext: b64(ciphertext), nonce: b64(nonce) }
}

export function decryptPrivateKey(ciphertext: string, nonce: string, masterKey: Buffer): string {
  const decrypted = nacl.secretbox.open(unb64(ciphertext), unb64(nonce), masterKey)
  if (!decrypted) throw new Error('Decryption failed')
  return b64(decrypted)
}

export function generateEnvKey(): string {
  return b64(nacl.randomBytes(nacl.secretbox.keyLength))
}

export function encryptEnvKey(envKey: string, recipientPublicKey: string): string {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(unb64(envKey), nonce, unb64(recipientPublicKey), ephemeral.secretKey)
  return JSON.stringify({ ephPub: b64(ephemeral.publicKey), nonce: b64(nonce), ciphertext: b64(ciphertext) })
}

export function decryptEnvKey(encryptedKey: string, _publicKey: string, privateKey: string): string {
  const { ephPub, nonce, ciphertext } = JSON.parse(encryptedKey)
  const decrypted = nacl.box.open(unb64(ciphertext), unb64(nonce), unb64(ephPub), unb64(privateKey))
  if (!decrypted) throw new Error('Decryption failed')
  return b64(decrypted)
}

export function encryptSecret(value: string, envKey: string): { ciphertext: string; iv: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const ciphertext = nacl.secretbox(Buffer.from(value, 'utf8'), nonce, unb64(envKey))
  return { ciphertext: b64(ciphertext), iv: b64(nonce) }
}

export function decryptSecret(ciphertext: string, iv: string, envKey: string): string {
  const decrypted = nacl.secretbox.open(unb64(ciphertext), unb64(iv), unb64(envKey))
  if (!decrypted) throw new Error('Decryption failed')
  return Buffer.from(decrypted).toString('utf8')
}
