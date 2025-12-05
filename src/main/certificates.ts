/**
 * TLS Certificate Management
 * Generates and manages self-signed certificates for secure WebSocket connections
 */

import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto'

// Certificate paths
const CERT_DIR = join(app.getPath('userData'), 'certificates')
const CERT_PATH = join(CERT_DIR, 'server.crt')
const KEY_PATH = join(CERT_DIR, 'server.key')

export interface CertificateInfo {
  certPath: string
  keyPath: string
  fingerprint: string
  expiresAt: Date
}

/**
 * Ensure certificate directory exists
 */
function ensureCertDir(): void {
  if (!existsSync(CERT_DIR)) {
    mkdirSync(CERT_DIR, { recursive: true })
  }
}

/**
 * Check if OpenSSL is available
 */
function isOpenSSLAvailable(): boolean {
  try {
    execSync('openssl version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Generate a self-signed certificate using OpenSSL
 */
export async function generateSelfSignedCertificate(): Promise<CertificateInfo | null> {
  ensureCertDir()

  if (!isOpenSSLAvailable()) {
    console.warn('OpenSSL not available, falling back to application-layer encryption')
    return null
  }

  try {
    // Generate private key and self-signed certificate
    // Valid for 365 days
    const subject = '/C=US/ST=Local/L=Local/O=LocalShare/CN=localhost'

    execSync(
      `openssl req -x509 -newkey rsa:4096 -keyout "${KEY_PATH}" -out "${CERT_PATH}" ` +
      `-days 365 -nodes -subj "${subject}" ` +
      `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: 'ignore' }
    )

    // Calculate fingerprint
    const certContent = readFileSync(CERT_PATH, 'utf-8')
    const fingerprint = calculateFingerprint(certContent)

    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 365)

    return {
      certPath: CERT_PATH,
      keyPath: KEY_PATH,
      fingerprint,
      expiresAt
    }
  } catch (error) {
    console.error('Failed to generate certificate:', error)
    return null
  }
}

/**
 * Load existing certificate or generate new one
 */
export async function loadOrGenerateCertificate(): Promise<CertificateInfo | null> {
  ensureCertDir()

  // Check if certificate exists
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    try {
      const certContent = readFileSync(CERT_PATH, 'utf-8')
      const fingerprint = calculateFingerprint(certContent)

      // Check expiration using OpenSSL
      if (isOpenSSLAvailable()) {
        try {
          const result = execSync(
            `openssl x509 -in "${CERT_PATH}" -enddate -noout`,
            { encoding: 'utf-8' }
          )
          const match = result.match(/notAfter=(.+)/)
          if (match) {
            const expiresAt = new Date(match[1])
            const now = new Date()

            // If certificate expires within 30 days, regenerate
            const thirtyDays = 30 * 24 * 60 * 60 * 1000
            if (expiresAt.getTime() - now.getTime() < thirtyDays) {
              console.log('Certificate expires soon, regenerating...')
              return generateSelfSignedCertificate()
            }

            return {
              certPath: CERT_PATH,
              keyPath: KEY_PATH,
              fingerprint,
              expiresAt
            }
          }
        } catch {
          // If we can't check expiration, regenerate
          return generateSelfSignedCertificate()
        }
      }

      // If OpenSSL not available, use certificate as-is
      return {
        certPath: CERT_PATH,
        keyPath: KEY_PATH,
        fingerprint,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    } catch {
      return generateSelfSignedCertificate()
    }
  }

  return generateSelfSignedCertificate()
}

/**
 * Calculate SHA-256 fingerprint of certificate
 */
function calculateFingerprint(certContent: string): string {
  const hash = createHash('sha256')
  hash.update(certContent)
  const digest = hash.digest('hex')

  // Format as colon-separated pairs
  return digest.match(/.{2}/g)?.join(':').toUpperCase() || digest
}

/**
 * Get certificate contents for HTTPS server
 */
export function getCertificateContents(): { cert: string; key: string } | null {
  if (!existsSync(CERT_PATH) || !existsSync(KEY_PATH)) {
    return null
  }

  return {
    cert: readFileSync(CERT_PATH, 'utf-8'),
    key: readFileSync(KEY_PATH, 'utf-8')
  }
}

// ============================================
// Application-Layer Encryption (Fallback)
// ============================================

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16
const KEY_LENGTH = 32
const PBKDF2_ITERATIONS = 100000

/**
 * Derive encryption key from username and PIN
 */
export function deriveKey(username: string, pin: string, salt: Buffer): Buffer {
  return pbkdf2Sync(
    `${username}:${pin}`,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  )
}

/**
 * Generate a random salt
 */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH)
}

/**
 * Encrypt a message using AES-256-GCM
 */
export function encryptMessage(message: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(message, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()

  // Return: IV (12) + ciphertext + authTag (16)
  return Buffer.concat([iv, encrypted, authTag])
}

/**
 * Decrypt a message using AES-256-GCM
 */
export function decryptMessage(encryptedData: Buffer, key: Buffer): string {
  if (encryptedData.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short')
  }

  const iv = encryptedData.subarray(0, IV_LENGTH)
  const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH)
  const encrypted = encryptedData.subarray(IV_LENGTH, encryptedData.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}

/**
 * Create an encrypted session
 */
export class EncryptedSession {
  private key: Buffer
  private salt: Buffer

  constructor(username: string, pin: string, salt?: Buffer) {
    this.salt = salt || generateSalt()
    this.key = deriveKey(username, pin, this.salt)
  }

  getSalt(): Buffer {
    return this.salt
  }

  encrypt(message: string): Buffer {
    return encryptMessage(message, this.key)
  }

  decrypt(encrypted: Buffer): string {
    return decryptMessage(encrypted, this.key)
  }
}
