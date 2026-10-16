import type { EngineAnswer, EngineId, Lang, Profile, Source } from "../types.ts";
import { domainOf, toSource } from "../text.ts";

/** Générateur pseudo-aléatoire stable : un même audit donne toujours le même résultat de démo. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const FICTIONAL = ["Atelier Moselle", "Kirchberg Solutions", "Alzette & Co", "Groupe Pétrusse", "Lux Partners", "Cabinet Belair"];
const BASE_RATE: Record<EngineId, number> = { chatgpt: 0.45, google: 0.35, perplexity: 0.55, gemini: 0.4, claude: 0.3 };
const SOURCE_POOL = [
  "https://www.editus.lu/fr/recherche",
  "https://paperjam.lu/article/entreprises",
  "https://www.google.com/maps",
  "https://www.linkedin.com/company",
  "https://www.wort.lu/fr/economie",
  "https://fr.trustpilot.com/review",
  "https://www.yelp.com/lu",
];

const PHRASES: Record<Lang, { intro: string; why: string; outro: string }> = {
  fr: {
    intro: "Voici quelques entreprises souvent recommandées au Luxembourg :",
    why: "reconnue pour son expertise et ses avis clients",
    outro: "Je vous conseille de comparer les devis et de consulter les avis récents avant de choisir.",
  },
  en: {
    intro: "Here are a few companies frequently recommended in Luxembourg:",
    why: "known for its expertise and client reviews",
    outro: "Compare quotes and check recent reviews before choosing.",
  },
  de: {
    intro: "Hier sind einige häufig empfohlene Unternehmen in Luxemburg:",
    why: "bekannt für Fachwissen und Kundenbewertungen",
    outro: "Vergleichen Sie Angebote und lesen Sie aktuelle Bewertungen, bevor Sie sich entscheiden.",
  },
};

export function askDemo(engine: EngineId, question: string, lang: Lang, questionIndex: number, p: Profile): EngineAnswer {
  const rnd = seeded(`${engine}|${lang}|${questionIndex}|${p.entreprise}|${p.siteUrl}`);
  if (engine === "google" && rnd() < 0.15) {
    return { text: "", sources: [], answered: false, demo: true, error: "Pas d'aperçu IA pour cette recherche (démo)." };
  }
  let rate = BASE_RATE[engine] * (lang === "fr" ? 1 : 0.6);
  if (questionIndex === 4 || questionIndex === 5 || questionIndex === 8) rate = Math.max(rate, 0.75); // questions qui nomment l'entreprise
  const cited = rnd() < rate;

  const competitors = [p.concurrent, ...p.autresConcurrents].filter(Boolean);
  const pool = [...competitors, ...FICTIONAL];
  const names: string[] = [];
  while (names.length < 3) {
    const pick = pool[Math.floor(rnd() * Math.min(pool.length, competitors.length + 4))];
    if (pick && !names.includes(pick)) names.push(pick);
  }
  if (cited && p.entreprise) names.splice(Math.floor(rnd() * 3), 0, p.entreprise);

  const t = PHRASES[lang];
  const text = [
    `${t.intro}`,
    ...names.map((n, i) => `${i + 1}. **${n}** : ${t.why}.`),
    "",
    t.outro,
  ].join("\n");

  const sources: Source[] = [];
  if (cited && p.siteUrl && rnd() < 0.6) sources.push(toSource(p.siteUrl, p.entreprise));
  const count = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) {
    const url = SOURCE_POOL[Math.floor(rnd() * SOURCE_POOL.length)];
    if (!sources.some((s) => s.url === url)) sources.push({ url, domain: domainOf(url) });
  }
  void question;
  return { text, sources, answered: true, demo: true };
}
