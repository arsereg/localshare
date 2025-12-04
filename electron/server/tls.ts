/**
 * TLS Certificate Generation
 * Generates self-signed certificates for secure WebSocket connections
 */
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export interface CertificateResult {
  privateKey: string;
  certificate: string;
  fingerprint: string;
}

/**
 * Generates a self-signed TLS certificate
 */
export async function generateCertificate(): Promise<CertificateResult> {
  // Dynamic import of selfsigned (ESM compatible)
  const selfsigned = require('selfsigned');

  // Get the app data directory for storing certs
  let certDir: string;
  try {
    certDir = path.join(app.getPath('userData'), 'certs');
  } catch {
    // Fallback if app is not ready
    const os = require('os');
    certDir = path.join(os.homedir(), '.collab-editor', 'certs');
  }

  // Ensure cert directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');
  const fingerprintPath = path.join(certDir, 'fingerprint.txt');

  // Check if existing certs are still valid (less than 30 days old)
  if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(fingerprintPath)) {
    const certStats = fs.statSync(certPath);
    const certAge = Date.now() - certStats.mtime.getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (certAge < thirtyDays) {
      console.log('Using existing TLS certificate');
      return {
        privateKey: fs.readFileSync(keyPath, 'utf-8'),
        certificate: fs.readFileSync(certPath, 'utf-8'),
        fingerprint: fs.readFileSync(fingerprintPath, 'utf-8').trim(),
      };
    }
  }

  // Generate new certificate
  console.log('Generating new self-signed TLS certificate...');

  const attrs = [
    { name: 'commonName', value: 'Collab Editor Local Server' },
    { name: 'organizationName', value: 'Collab Editor' },
    { name: 'countryName', value: 'US' },
  ];

  const options = {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: false,
      },
      {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' }, // DNS
          { type: 7, ip: '127.0.0.1' }, // IP
          { type: 7, ip: '0.0.0.0' }, // IP (all interfaces)
        ],
      },
    ],
  };

  return new Promise((resolve, reject) => {
    selfsigned.generate(attrs, options, (err: Error | null, pems: { private: string; cert: string }) => {
      if (err) {
        reject(err);
        return;
      }

      // Calculate fingerprint
      const crypto = require('crypto');
      const fingerprint = crypto
        .createHash('sha256')
        .update(pems.cert)
        .digest('hex')
        .match(/.{2}/g)!
        .join(':')
        .toUpperCase();

      // Save certificate files
      try {
        fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
        fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
        fs.writeFileSync(fingerprintPath, fingerprint, { mode: 0o644 });

        console.log('TLS certificate generated successfully');
        console.log(`Certificate fingerprint: ${fingerprint}`);

        resolve({
          privateKey: pems.private,
          certificate: pems.cert,
          fingerprint,
        });
      } catch (writeErr) {
        reject(writeErr);
      }
    });
  });
}

/**
 * Gets the certificate fingerprint (for user verification)
 */
export function getCertificateFingerprint(): string | null {
  let certDir: string;
  try {
    certDir = path.join(app.getPath('userData'), 'certs');
  } catch {
    const os = require('os');
    certDir = path.join(os.homedir(), '.collab-editor', 'certs');
  }

  const fingerprintPath = path.join(certDir, 'fingerprint.txt');

  if (fs.existsSync(fingerprintPath)) {
    return fs.readFileSync(fingerprintPath, 'utf-8').trim();
  }

  return null;
}
