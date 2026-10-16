import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SiteInfo, TechCheck } from "./types.ts";
import { clip } from "./text.ts";

const UA = "Mozilla/5.0 (compatible; AIDepartmentGEOAudit/1.0; +https://github.com/cedricLUX/geo-audit)";

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::" || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Normalise l'URL saisie et refuse les adresses internes (protection SSRF). */
export async function safeUrl(input: string): Promise<URL> {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Adresse non prise en charge.");
  const host = url.hostname;
  // Pour les tests locaux uniquement : jamais actif en production.
  if (process.env.GEO_ALLOW_PRIVATE_HOSTS === "1" && process.env.NODE_ENV !== "production") return url;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("Adresse non autorisée.");
  }
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.some(isPrivateIp)) throw new Error("Adresse non autorisée.");
  return url;
}

async function get(url: string, timeoutMs = 10_000): Promise<{ status: number; text: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    // Redirections suivies à la main pour revalider chaque saut.
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "manual", signal: ctrl.signal });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = (await safeUrl(new URL(loc, current).toString())).toString();
        continue;
      }
      const text = (await res.text()).slice(0, 1_500_000);
      return { status: res.status, text, finalUrl: current };
    }
    throw new Error("Trop de redirections.");
  } finally {
    clearTimeout(timer);
  }
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] ?? "";
  return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim();
}

export function visibleText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

type JsonLd = Record<string, unknown>;

export function jsonLd(html: string): JsonLd[] {
  const out: JsonLd[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const it of items) if (it && typeof it === "object") out.push(it as JsonLd);
    } catch {
      // JSON-LD invalide : ignoré, et signalé par le contrôle technique.
    }
  }
  return out;
}

function types(item: JsonLd): string[] {
  const t = item["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

const ORG_TYPES = /Organization|LocalBusiness|Corporation|ProfessionalService|Store|Restaurant|LegalService|MedicalBusiness|Dentist|Attorney|AccountingService|FinancialService|RealEstateAgent|HomeAndConstructionBusiness|AutomotiveBusiness|HealthAndBeautyBusiness|LodgingBusiness|FoodEstablishment/;

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "Google-Extended", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "anthropic-ai", "CCBot"];

/** Vrai si robots.txt interdit tout le site à ce robot. */
export function robotsBlocks(robots: string, bot: string): boolean {
  const groups: { agents: string[]; disallowAll: boolean; allowAll: boolean }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false, allowAll: false };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === "disallow" && val === "/") current.disallowAll = true;
      if (key === "allow" && val === "/") current.allowAll = true;
    }
  }
  const specific = groups.find((g) => g.agents.includes(bot.toLowerCase()));
  const group = specific ?? groups.find((g) => g.agents.includes("*"));
  return Boolean(group && group.disallowAll && !group.allowAll);
}

export interface SiteData extends SiteInfo {
  html: string;
  orgName: string;
  city: string;
  siteName: string;
}

export async function inspectSite(input: string): Promise<SiteData> {
  const url = await safeUrl(input);
  const home = await get(url.toString());
  if (home.status >= 400) throw new Error(`Le site répond avec une erreur ${home.status}.`);
  const origin = new URL(home.finalUrl).origin;
  const [robots, llms] = await Promise.all([
    get(`${origin}/robots.txt`, 6000).catch(() => ({ status: 0, text: "", finalUrl: "" })),
    get(`${origin}/llms.txt`, 6000).catch(() => ({ status: 0, text: "", finalUrl: "" })),
  ]);

  const html = home.text;
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const description = meta(html, "description") || meta(html, "og:description");
  const siteName = meta(html, "og:site_name");
  const text = visibleText(html);
  const ld = jsonLd(html);
  const org = ld.find((i) => types(i).some((t) => ORG_TYPES.test(t)));
  const address = (org?.address ?? {}) as Record<string, unknown>;
  const orgName = typeof org?.name === "string" ? org.name : "";
  const city = typeof address.addressLocality === "string" ? address.addressLocality : "";
  const hasFaq = ld.some((i) => types(i).includes("FAQPage")) || /\b(faq|questions fréquentes|foire aux questions|häufige fragen)\b/i.test(text);

  const robotsTxt = robots.status === 200 ? robots.text : "";
  const blocked = AI_BOTS.filter((b) => robotsTxt && robotsBlocks(robotsTxt, b));
  const llmsOk = llms.status === 200 && llms.text.trim().length > 0 && !/<html/i.test(llms.text.slice(0, 500));
  const hasPhone = /(\+352|00352)[\s\d]{6,}/.test(text) || typeof org?.telephone === "string";
  const langs = [...html.matchAll(/hreflang=["']([a-z]{2})/gi)].map((m) => m[1].toLowerCase());

  const checks: TechCheck[] = [
    {
      id: "robots",
      label: "Les robots des IA peuvent lire le site",
      ok: blocked.length === 0,
      detail: blocked.length ? `robots.txt bloque : ${blocked.join(", ")}` : robotsTxt ? "Aucun robot IA bloqué dans robots.txt." : "Pas de robots.txt : tout est autorisé par défaut.",
      weight: 3,
    },
    {
      id: "schema",
      label: "Données structurées de l'entreprise (schema.org)",
      ok: Boolean(org),
      detail: org ? `Bloc ${types(org).join(", ")} trouvé${orgName ? ` pour « ${orgName} »` : ""}.` : "Aucun bloc Organization ou LocalBusiness en JSON-LD sur la page d'accueil.",
      weight: 2,
    },
    {
      id: "text",
      label: "Contenu lisible sans JavaScript",
      ok: text.length >= 800,
      detail: `${text.length.toLocaleString("fr-FR")} caractères de texte dans le HTML initial${text.length < 800 ? " : les robots IA voient une page presque vide." : "."}`,
      weight: 2,
    },
    {
      id: "meta",
      label: "Titre et description clairs",
      ok: title.length >= 10 && description.length >= 50,
      detail: `Titre : « ${clip(title || "absent", 70)} ». Description : ${description ? `${description.length} caractères` : "absente"}.`,
      weight: 1,
    },
    {
      id: "faq",
      label: "Page ou bloc FAQ",
      ok: hasFaq,
      detail: hasFaq ? "Une FAQ répond déjà à des questions de clients." : "Pas de FAQ repérée : les IA reprennent volontiers des réponses courtes et directes.",
      weight: 1,
    },
    {
      id: "nap",
      label: "Coordonnées visibles (adresse, téléphone)",
      ok: hasPhone && Boolean(city || /\bL-\d{4}\b/.test(text)),
      detail: hasPhone ? "Téléphone trouvé." : "Téléphone luxembourgeois non trouvé sur la page d'accueil.",
      weight: 1,
    },
    {
      id: "langs",
      label: "Versions en plusieurs langues",
      ok: new Set(langs).size >= 2,
      detail: langs.length ? `Langues déclarées : ${[...new Set(langs)].join(", ")}.` : "Aucune balise hreflang : le site semble monolingue.",
      weight: 1,
    },
    {
      id: "llms",
      label: "Fichier llms.txt",
      ok: llmsOk,
      detail: llmsOk ? "llms.txt présent." : "Pas de llms.txt (fichier récent, encore peu exploité par les IA).",
      weight: 1,
    },
  ];

  return {
    url: home.finalUrl,
    title,
    description,
    excerpt: clip(text, 12_000),
    checks,
    html,
    orgName,
    city,
    siteName,
  };
}

export function guessCompanyName(site: SiteData): string {
  if (site.orgName) return site.orgName;
  if (site.siteName) return site.siteName;
  const parts = site.title.split(/\s[|\-–—:]\s/).map((s) => s.trim()).filter(Boolean);
  return parts.sort((a, b) => a.length - b.length)[0] ?? "";
}
