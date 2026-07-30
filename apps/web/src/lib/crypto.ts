import nacl from "tweetnacl";
import { argon2id } from "hash-wasm";

const b64 = (data: Uint8Array): string => {
  let str = "";
  for (const byte of data) str += String.fromCharCode(byte);
  return btoa(str);
};

const unb64 = (value: string, field = "encrypted value"): Uint8Array => {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${field}`);

  let normalized = value.trim();
  for (let pass = 0; pass < 2 && normalized.includes("%"); pass++) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      throw new Error(`Invalid ${field} encoding`);
    }
  }
  normalized = normalized
    .replace(/ /g, "+")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  normalized += "=".repeat((4 - normalized.length % 4) % 4);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error(`Invalid ${field} encoding`);

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
};

export async function deriveKey(password: string, saltHex: string): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt: hexToBytes(saltHex),
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "binary",
  });
  return hash as Uint8Array;
}

export function decryptPrivateKey(ciphertext: string, nonce: string, masterKey: Uint8Array): string {
  const decrypted = nacl.secretbox.open(unb64(ciphertext, "private key ciphertext"), unb64(nonce, "private key nonce"), masterKey);
  if (!decrypted) throw new Error("Decryption failed");
  return b64(decrypted);
}

export function decryptEnvKey(encryptedKey: string, privateKey: string): string {
  const { ephPub, nonce, ciphertext } = JSON.parse(encryptedKey);
  const decrypted = nacl.box.open(unb64(ciphertext, "environment key ciphertext"), unb64(nonce, "environment key nonce"), unb64(ephPub, "ephemeral public key"), unb64(privateKey, "private key"));
  if (!decrypted) throw new Error("Decryption failed");
  return b64(decrypted);
}

export function decryptSecret(ciphertext: string, iv: string, envKey: string): string {
  const decrypted = nacl.secretbox.open(unb64(ciphertext, "secret ciphertext"), unb64(iv, "secret nonce"), unb64(envKey, "decryption key"));
  if (!decrypted) throw new Error("Decryption failed");
  return new TextDecoder().decode(decrypted);
}

export function encryptEnvKey(envKey: string, recipientPublicKey: string): string {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(unb64(envKey, "environment key"), nonce, unb64(recipientPublicKey, "recipient public key"), ephemeral.secretKey);
  return JSON.stringify({ ephPub: b64(ephemeral.publicKey), nonce: b64(nonce), ciphertext: b64(ciphertext) });
}

export function generateEnvKey(): string {
  return b64(nacl.randomBytes(nacl.secretbox.keyLength));
}

export function encryptSecret(value: string, envKey: string): { ciphertext: string; iv: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(new TextEncoder().encode(value), nonce, unb64(envKey, "encryption key"));
  return { ciphertext: b64(ciphertext), iv: b64(nonce) };
}
