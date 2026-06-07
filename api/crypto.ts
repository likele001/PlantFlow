/**
 * Symmetric encryption helpers (AES-256-GCM) for sensitive at-rest secrets
 * such as LLM provider API keys. The master key is read from LLM_MASTER_KEY
 * (64 hex chars = 32 bytes). A new random IV is generated per encryption.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const hex = process.env.LLM_MASTER_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'LLM_MASTER_KEY is missing or invalid (expected 64 hex chars / 32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plaintext: string): {
  iv: Buffer
  tag: Buffer
  ciphertext: Buffer
} {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, tag, ciphertext }
}

export function decryptSecret(input: {
  iv: Buffer
  tag: Buffer
  ciphertext: Buffer
}): string {
  const key = getKey()
  const decipher = createDecipheriv(ALGO, key, input.iv)
  decipher.setAuthTag(input.tag)
  const plain = Buffer.concat([decipher.update(input.ciphertext), decipher.final()])
  return plain.toString('utf8')
}

/**
 * Build a masked preview for the UI, e.g.
 *   "sk-abcdef1234567890DEF" -> "sk-...DEF"
 *   ""                       -> ""
 *   "1234"                   -> "****"
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (plaintext.length <= 8) return '****'
  return `${plaintext.slice(0, 3)}...${plaintext.slice(-4)}`
}
