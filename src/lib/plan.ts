import type { Profile, Question, TechCheck } from "./types.ts";
import { buildTasks } from "./corpus.ts";
import { ENGINES } from "./engines/index.ts";

export interface SitePayload {
  url: string;
  excerpt: string;
  checks: TechCheck[];
  exp: number;
}

export interface AuditPayload {
  id: string;
  email: string;
  profile: Profile;
  questions: Question[];
  translations: Record<number, { en?: string; de?: string }>;
  site: { excerpt: string; checks: TechCheck[] };
  exp: number;
}

export const ENGINE_IDS = ENGINES.map((e) => e.id);

export function tasksFor(p: AuditPayload) {
  return buildTasks(p.questions, ENGINE_IDS, p.translations);
}

export function isEmail(s: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(s);
}

const LIMITS: Partial<Record<keyof Profile, number>> = { siteUrl: 300 };

/** Nettoie un profil reçu du navigateur. */
export function cleanProfile(raw: unknown): Profile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: keyof Profile) => String(r[k] ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS[k] ?? 160);
  const others = Array.isArray(r.autresConcurrents) ? r.autresConcurrents : [];
  return {
    siteUrl: str("siteUrl"),
    entreprise: str("entreprise"),
    metier: str("metier"),
    ville: str("ville"),
    service: str("service"),
    besoin: str("besoin"),
    concurrent: str("concurrent"),
    niche: str("niche"),
    probleme: str("probleme"),
    questionClients: str("questionClients"),
    autresConcurrents: others.map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 3),
  };
}
