import { createHash, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string | Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, (error, key) => error ? reject(error) : resolve(key));
  });
}

/** Valida SHA-256 legado e scrypt$salt$chave em base64url, sem modificar a credencial. */
export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  if (/^[a-fA-F0-9]{64}$/.test(stored)) {
    const actual = createHash("sha256").update(password, "utf8").digest();
    return timingSafeEqual(actual, Buffer.from(stored, "hex"));
  }
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, encoded] = parts;
  if (!/^[A-Za-z0-9_-]{11,86}$/.test(salt) || !/^[A-Za-z0-9_-]{22,171}$/.test(encoded)) return false;
  const expected = Buffer.from(encoded, "base64url");
  const decodedSalt = Buffer.from(salt, "base64url");
  if (expected.length < 16 || expected.length > 128 || expected.toString("base64url") !== encoded || decodedSalt.toString("base64url") !== salt) return false;
  try {
    // Formatos existentes podem usar o salt codificado como texto ou como bytes.
    for (const value of [salt, decodedSalt]) {
      const actual = await derive(password, value, expected.length);
      if (timingSafeEqual(actual, expected)) return true;
    }
  } catch {
    return false;
  }
  return false;
}
