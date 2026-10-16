import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.AUDIT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new Error("AUDIT_SECRET manquant.");
  return "dev-secret-ne-pas-utiliser-en-production";
}

const b64 = (b: Buffer) => b.toString("base64url");

/** Jeton signé qui porte tout le plan d'audit : le serveur reste sans état entre les requêtes. */
export function signToken(payload: object): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken<T extends { exp: number }>(token: string): T {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Jeton invalide.");
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("Jeton invalide.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  if (payload.exp < Date.now()) throw new Error("Audit expiré, relancez-le.");
  return payload;
}
