import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Same as verifyPin, but runs off the main thread so several checks can run side by side. */
export async function verifyPinAsync(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const { scrypt } = await import("node:crypto");
  const b = await new Promise<Buffer>((res, rej) => scrypt(pin, salt, 32, (e, k) => (e ? rej(e) : res(k))));
  const a = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
