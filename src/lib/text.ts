import type { Source, SourceType } from "./types.ts";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

/** "https://www.cabinet-dupont.lu/x" -> "cabinet dupont" */
export function domainStem(url: string): string {
  const host = domainOf(url);
  const parts = host.split(".");
  const stem = parts.length > 1 ? parts.slice(0, -1).join(" ") : host;
  return normalize(stem);
}

/** Vrai si le nom (ou le nom de domaine) apparaît dans le texte, sans tenir compte des accents ni de la casse. */
export function mentions(text: string, name: string, siteUrl?: string): boolean {
  const t = ` ${normalize(text)} `;
  const n = normalize(name);
  if (n.length >= 3 && t.includes(` ${n} `)) return true;
  if (siteUrl) {
    const d = domainOf(siteUrl);
    if (d && text.toLowerCase().includes(d)) return true;
    const stem = domainStem(siteUrl);
    if (stem.length >= 4 && t.includes(` ${stem} `)) return true;
  }
  return false;
}

export function toSource(url: string, title?: string): Source {
  return { url, title, domain: domainOf(url) };
}

export function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const k = s.url.replace(/[#?].*$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const DIRECTORIES = ["editus.lu", "yelp", "pagesjaunes", "google.com/maps", "maps.google", "lu.kompass", "kompass.com", "europages", "firmenwissen", "infogreffe", "lbr.lu", "goodyear", "123annuaire", "cylex", "hotfrog", "luxembourg.public.lu"];
const REVIEWS = ["trustpilot", "avis-verifies", "tripadvisor", "glassdoor", "kununu", "provenexpert", "judge.me"];
const MEDIA = ["paperjam.lu", "wort.lu", "lessentiel.lu", "rtl.lu", "virgule.lu", "delano.lu", "silicon.lu", "itnation.lu", "lequotidien.lu", "tageblatt.lu", "forbes", "lesechos", "lemonde", "wikipedia.org"];
const SOCIAL = ["linkedin.com", "facebook.com", "instagram.com", "youtube.com", "x.com", "twitter.com", "reddit.com", "tiktok.com"];

export function classifySource(domain: string, siteUrl: string, competitorDomains: string[] = []): SourceType {
  const own = domainOf(siteUrl);
  if (own && (domain === own || domain.endsWith(`.${own}`))) return "site";
  if (competitorDomains.some((c) => c && (domain === c || domain.endsWith(`.${c}`)))) return "concurrent";
  if (DIRECTORIES.some((d) => domain.includes(d))) return "annuaire";
  if (REVIEWS.some((d) => domain.includes(d))) return "avis";
  if (MEDIA.some((d) => domain.includes(d))) return "media";
  if (SOCIAL.some((d) => domain.includes(d))) return "reseau";
  return "autre";
}

export function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
