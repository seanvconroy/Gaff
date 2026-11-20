import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * ADR-0005: sensitive fields (check results now, the PPSN in Slice 3) are encrypted in the
 * application with AES-256-GCM, on top of the database's encryption at rest. Production must
 * set DATA_ENCRYPTION_KEY; development and tests use a fixed, public key.
 */
function key(): Buffer {
  // Read directly, so pure helpers and their tests don't need the whole environment. The
  // environment check (src/lib/env.ts) also refuses to start production without a key.
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (configured) {
    const bytes = Buffer.from(configured, 'base64');
    if (bytes.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64');
    return bytes;
  }
  if (process.env.GAFF_ENV === 'production') {
    throw new Error('DATA_ENCRYPTION_KEY is required in production');
  }
  return createHash('sha256').update('gaff-development-only-key').digest();
}

export function sealJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

export function openJson<T = unknown>(sealed: string): T {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Not a sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}

/**
 * BA-16 (P53): a file encrypted with Gaff's own key, on top of the store's encryption, for
 * renters' work and income documents: 'GAFF1', then the 12-byte IV, the 16-byte tag and the data.
 */
const SEALED_FILE = Buffer.from('GAFF1');

export function sealBytes(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([SEALED_FILE, iv, cipher.getAuthTag(), data]);
}

export function openBytes(sealed: Buffer): Buffer {
  if (!sealed.subarray(0, SEALED_FILE.length).equals(SEALED_FILE)) {
    throw new Error('Not a sealed file');
  }
  const at = SEALED_FILE.length;
  const iv = sealed.subarray(at, at + 12);
  const tag = sealed.subarray(at + 12, at + 28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(at + 28)), decipher.final()]);
}
