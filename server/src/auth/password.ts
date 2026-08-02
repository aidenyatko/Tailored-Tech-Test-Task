import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, hash] = passwordHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(hash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
