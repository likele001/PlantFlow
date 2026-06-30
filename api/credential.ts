import { encryptSecret, decryptSecret, maskSecret } from './crypto.js'

const SECRET_KEYS_BY_TYPE: Record<string, string[]> = {
  api_key: ['apiKey'],
  oauth2: ['accessToken', 'refreshToken', 'clientSecret'],
  basic_auth: ['password'],
  bearer_token: ['token'],
  custom: ['value'],
}

export function encryptCredentialData(
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const secretKeys = SECRET_KEYS_BY_TYPE[type] ?? ['value']
  const result = { ...data }
  for (const key of secretKeys) {
    const val = result[key]
    if (typeof val === 'string' && val && !val.startsWith('enc:')) {
      const enc = encryptSecret(val)
      result[key] = 'enc:' + Buffer.concat([enc.iv, enc.tag, enc.ciphertext]).toString('base64')
    }
  }
  return result
}

export function decryptCredentialData(
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const secretKeys = SECRET_KEYS_BY_TYPE[type] ?? ['value']
  const result = { ...data }
  for (const key of secretKeys) {
    const val = result[key]
    if (typeof val === 'string' && val.startsWith('enc:')) {
      try {
        const buf = Buffer.from(val.slice(4), 'base64')
        const iv = buf.subarray(0, 12)
        const tag = buf.subarray(12, 28)
        const ciphertext = buf.subarray(28)
        result[key] = decryptSecret({ iv, tag, ciphertext })
      } catch {
        result[key] = '[decrypt-failed]'
      }
    }
  }
  return result
}

export function buildMaskedPreview(
  type: string,
  decrypted: Record<string, unknown>,
): string {
  const keys = SECRET_KEYS_BY_TYPE[type] ?? ['value']
  const first = keys.find((k) => typeof decrypted[k] === 'string' && decrypted[k])
  if (first) return maskSecret(String(decrypted[first]))
  return ''
}

export type CredentialType = 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom'

export interface Credential {
  id: string
  tenantId: string
  name: string
  type: CredentialType
  data: Record<string, unknown>
  maskedPreview: string
  createdAt: string
  updatedAt: string
}

export interface OAuthState {
  id: string
  credentialId: string
  state: string
  redirectUri: string
  extra: Record<string, unknown>
  expiresAt: string
}
