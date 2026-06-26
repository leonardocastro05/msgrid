const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const KEY_HEX   = process.env.ENCRYPT_KEY || '';

function getKey() {
  // La key debe tener exactamente 32 bytes
  const key = Buffer.from(KEY_HEX, 'utf8');
  if (key.length !== 32) throw new Error('ENCRYPT_KEY debe tener exactamente 32 caracteres');
  return key;
}

function cifrar(texto) {
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  // Guardamos iv:datos en base64 separado por ':'
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function descifrar(texto) {
  const [ivHex, encHex] = texto.split(':');
  const iv      = Buffer.from(ivHex, 'hex');
  const enc     = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { cifrar, descifrar };