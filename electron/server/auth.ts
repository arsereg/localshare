/**
 * Authentication Manager
 * Handles credential creation, validation, and session management
 */

const MAX_CREDENTIALS = 10;
const MAX_RETRIES = 3;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds

/**
 * Stored credential information
 */
interface Credential {
  username: string;
  pin: string;
  createdAt: Date;
}

/**
 * Failed attempt tracking
 */
interface FailedAttempt {
  count: number;
  lastAttempt: Date;
  lockedUntil: Date | null;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  message?: string;
  retriesRemaining?: number;
  lockoutUntil?: Date;
}

/**
 * Authentication Manager Class
 */
export class AuthManager {
  private credentials: Map<string, Credential> = new Map();
  private failedAttempts: Map<string, FailedAttempt> = new Map();

  /**
   * Generates a random 6-digit PIN
   */
  private generatePin(): string {
    // Use crypto for better randomness
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(4);
    const randomNumber = randomBytes.readUInt32BE(0);
    const pin = (randomNumber % 1000000).toString().padStart(6, '0');
    return pin;
  }

  /**
   * Creates a new credential for a guest user
   */
  createCredential(username: string): { success: boolean; pin?: string; error?: string } {
    // Validate username
    if (!username || username.trim().length === 0) {
      return { success: false, error: 'Username cannot be empty' };
    }

    const sanitizedUsername = username.trim().toLowerCase();

    // Check for invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedUsername)) {
      return {
        success: false,
        error: 'Username can only contain letters, numbers, underscores, and hyphens',
      };
    }

    // Check for duplicate username
    if (this.credentials.has(sanitizedUsername)) {
      return { success: false, error: 'Username already exists' };
    }

    // Check max credentials limit
    if (this.credentials.size >= MAX_CREDENTIALS) {
      return {
        success: false,
        error: `Maximum of ${MAX_CREDENTIALS} credentials reached. Please revoke some before creating new ones.`,
      };
    }

    // Generate PIN
    const pin = this.generatePin();

    // Store credential (in memory only)
    this.credentials.set(sanitizedUsername, {
      username: sanitizedUsername,
      pin,
      createdAt: new Date(),
    });

    console.log(`Credential created for: ${sanitizedUsername}`);

    return { success: true, pin };
  }

  /**
   * Revokes a credential
   */
  revokeCredential(username: string): { success: boolean; error?: string } {
    const sanitizedUsername = username.trim().toLowerCase();

    if (!this.credentials.has(sanitizedUsername)) {
      return { success: false, error: 'Username not found' };
    }

    this.credentials.delete(sanitizedUsername);
    this.failedAttempts.delete(sanitizedUsername);

    console.log(`Credential revoked for: ${sanitizedUsername}`);

    return { success: true };
  }

  /**
   * Lists all active credentials (without PINs)
   */
  listCredentials(): { success: boolean; credentials: Array<{ username: string; createdAt: Date }> } {
    const credentialList = Array.from(this.credentials.values()).map((cred) => ({
      username: cred.username,
      createdAt: cred.createdAt,
    }));

    return { success: true, credentials: credentialList };
  }

  /**
   * Authenticates a user
   */
  authenticate(username: string, pin: string): AuthResult {
    const sanitizedUsername = username.trim().toLowerCase();

    // Check for lockout
    const attempts = this.failedAttempts.get(sanitizedUsername);
    if (attempts?.lockedUntil) {
      const now = new Date();
      if (now < attempts.lockedUntil) {
        return {
          success: false,
          message: 'Account is temporarily locked due to too many failed attempts',
          lockoutUntil: attempts.lockedUntil,
        };
      } else {
        // Lockout expired, reset
        this.failedAttempts.delete(sanitizedUsername);
      }
    }

    // Check if credential exists
    const credential = this.credentials.get(sanitizedUsername);
    if (!credential) {
      this.recordFailedAttempt(sanitizedUsername);
      const updatedAttempts = this.failedAttempts.get(sanitizedUsername);
      return {
        success: false,
        message: 'Invalid username or PIN',
        retriesRemaining: MAX_RETRIES - (updatedAttempts?.count || 0),
      };
    }

    // Constant-time comparison to prevent timing attacks
    const isValid = this.constantTimeCompare(credential.pin, pin);

    if (isValid) {
      // Clear failed attempts on successful login
      this.failedAttempts.delete(sanitizedUsername);
      return { success: true };
    } else {
      this.recordFailedAttempt(sanitizedUsername);
      const updatedAttempts = this.failedAttempts.get(sanitizedUsername);

      if (updatedAttempts?.lockedUntil) {
        return {
          success: false,
          message: 'Too many failed attempts. Account is temporarily locked.',
          lockoutUntil: updatedAttempts.lockedUntil,
        };
      }

      return {
        success: false,
        message: 'Invalid username or PIN',
        retriesRemaining: MAX_RETRIES - (updatedAttempts?.count || 0),
      };
    }
  }

  /**
   * Records a failed authentication attempt
   */
  private recordFailedAttempt(username: string): void {
    const existing = this.failedAttempts.get(username);
    const now = new Date();

    if (existing) {
      existing.count++;
      existing.lastAttempt = now;

      if (existing.count >= MAX_RETRIES) {
        existing.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        existing.count = 0; // Reset count after lockout
      }
    } else {
      this.failedAttempts.set(username, {
        count: 1,
        lastAttempt: now,
        lockedUntil: null,
      });
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    const crypto = require('crypto');

    if (a.length !== b.length) {
      // Still do a comparison to maintain constant time
      crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Gets the number of active credentials
   */
  getCredentialCount(): number {
    return this.credentials.size;
  }

  /**
   * Checks if a username exists
   */
  hasCredential(username: string): boolean {
    return this.credentials.has(username.trim().toLowerCase());
  }
}
