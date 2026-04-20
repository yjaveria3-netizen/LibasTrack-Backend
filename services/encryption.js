const crypto = require('crypto');

// AES-256 encryption/decryption for sensitive tokens
// Note: Use ENCRYPTION_SECRET env var in production (32+ chars)
const secretKey = process.env.ENCRYPTION_SECRET || 'default-dev-secret-key-change-in-production';
if (secretKey === 'default-dev-secret-key-change-in-production' && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  CRITICAL: ENCRYPTION_SECRET not set in production!');
  console.warn('   Set ENCRYPTION_SECRET in .env to a 32+ character string');
}

const ENCRYPTION_KEY = crypto.scryptSync(secretKey, 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: base64-encoded string combining iv + authTag + encrypted data
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Combine: iv (16 bytes) + authTag (16 bytes) + encrypted data
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch (err) {
    console.error('Encryption error:', err.message);
    throw err;
  }
}

/**
 * Decrypt base64-encoded ciphertext
 * Format: base64(iv + authTag + encrypted)
 * Returns: plaintext string
 */
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const buffer = Buffer.from(ciphertext, 'base64');
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch (err) {
    console.error('Decryption failed:', err.message);
    // Return null instead of throwing to prevent auth crashes
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt
};
