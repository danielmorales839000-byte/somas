const utf8 = value => new TextEncoder().encode(value);
const hex = value => [...new Uint8Array(value)].map(n => n.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g), s => parseInt(s, 16));
const ITERATIONS = 100000; // Workers WebCrypto's supported PBKDF2 work factor.
export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 200) throw Object.assign(new Error('Use a password with 12–200 characters.'), {status: 400, code: 'password_invalid'});
  return value;
}
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: unhex(salt), iterations: ITERATIONS, hash: 'SHA-256'}, key, 256));
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2-sha256$${ITERATIONS}$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 200 || !/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded || '')) return false;
  const parts = encoded.split('$'), actual = await derive(password, parts[2]);
  let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0;
}
