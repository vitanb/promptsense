const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

if (!process.env.ENCRYPTION_KEY) {
  // Crash at startup rather than silently using a per-process random key.
  // A random key means every restart renders all stored provider API keys
  // permanently unrecoverable — a silent, catastrophic data loss.
  throw new Error(
    '[PromptSense] ENCRYPTION_KEY environment variable is required but not set.\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'and add it to your Render / .env environment.'
  );
}

// Derive exactly 32 bytes via SHA-256 so any key length works
const KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;
  try {
    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const encrypted = data.slice(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
