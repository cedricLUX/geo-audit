import type { EngineId, EngineStatus, Profile, SourceType, TaskResult, TechCheck } from "./types.ts";
import { classifySource, normalize } from "./text.ts";

export interface EngineScore {
  engine: EngineId;
  label: string;
  live: boolean;
  cited: number;
  answered: number;
  total: number;
}

export interface Summary {
  score: number;
  verdict: string;
  components: { key: string; label: string; value: number | null; weight: number }[];
  perEngine: EngineScore[];
  otherLang: { cited: number; total: number };
  competitors: { name: string; count: number }[];
  ownCitations: number;
  sources: { domain: string; count: number; type: SourceType; withYou: number }[];
  inaccuracies: { engine: EngineId; question: string; claim: string; correction: string }[];
  accuracyChecked: boolean;
  demo: boolean;
}

const WEIGHTS = { citation: 40, voice: 20, accuracy: 15, sources: 10, multilingual: 5, tech: 10 };

export function summarize(results: TaskResult[], engines: EngineStatus[], checks: TechCheck[], profile: Profile): Summary {
  const fr = results.filter((r) => r.task.lang === "fr");
  const other = results.filter((r) => r.task.lang !== "fr");

  const perEngine: EngineScore[] = engines.map((e) => {
    const rows = fr.filter((r) => r.task.engine === e.id);
    return {
      engine: e.id,
      label: e.label,
      live: e.live,
      cited: rows.filter((r) => r.analysis.cited).length,
      answered: rows.filter((r) => r.answer.answered).length,
      total: rows.length,
    };
  });

  const citedFr = fr.filter((r) => r.analysis.cited).length;
  const citation = fr.length ? citedFr / fr.length : 0;

  // Concurrents : regroupés par nom normalisé, le libellé le plus fréquent est gardé.
  const comp = new Map<string, { name: string; count: number }>();
  for (const r of results) {
    for (const name of new Set(r.analysis.competitors)) {
      const k = normalize(name);
      if (!k) continue;
      const cur = comp.get(k) ?? { name, count: 0 };
      cur.count++;
      comp.set(k, cur);
    }
  }
  const competitors = [...comp.values()].sort((a, b) => b.count - a.count);
  const ownCitations = results.filter((r) => r.analysis.cited).length;
  const totalMentions = ownCitations + competitors.reduce((s, c) => s + c.count, 0);
  const voice = totalMentions ? ownCitations / totalMentions : 0;

  const checkedRows = results.filter((r) => r.analysis.cited && r.analysis.method === "ia");
  const accuracyChecked = checkedRows.length > 0;
  const accuracy = accuracyChecked ? checkedRows.filter((r) => r.analysis.inaccuracies.length === 0).length / checkedRows.length : null;

  const competitorDomains: string[] = [];
  const srcMap = new Map<string, { domain: string; count: number; type: SourceType; withYou: number }>();
  for (const r of results) {
    for (const s of r.answer.sources) {
      const cur = srcMap.get(s.domain) ?? { domain: s.domain, count: 0, type: classifySource(s.domain, profile.siteUrl, competitorDomains), withYou: 0 };
      cur.count++;
      if (r.analysis.cited) cur.withYou++;
      srcMap.set(s.domain, cur);
    }
  }
  const sources = [...srcMap.values()].sort((a, b) => b.count - a.count);
  const totalSources = sources.reduce((s, x) => s + x.count, 0);
  const owned = totalSources ? sources.filter((s) => s.type === "site").reduce((s, x) => s + x.count, 0) / totalSources : 0;

  const otherLang = { cited: other.filter((r) => r.analysis.cited).length, total: other.length };
  const multilingual = other.length ? otherLang.cited / other.length : 0;

  const techTotal = checks.reduce((s, c) => s + c.weight, 0);
  const tech = techTotal ? checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0) / techTotal : 0;

  const components = [
    { key: "citation", label: "Taux de citation", value: citation, weight: WEIGHTS.citation },
    { key: "voice", label: "Part de voix face aux concurrents", value: voice, weight: WEIGHTS.voice },
    { key: "accuracy", label: "Exactitude des informations", value: accuracy, weight: WEIGHTS.accuracy },
    { key: "sources", label: "Sources maîtrisées (votre site)", value: owned, weight: WEIGHTS.sources },
    { key: "multilingual", label: "Visibilité en anglais et allemand", value: multilingual, weight: WEIGHTS.multilingual },
    { key: "tech", label: "Santé technique du site", value: tech, weight: WEIGHTS.tech },
  ];
  // Sans vérification d'exactitude possible, son poids est réparti sur les autres indicateurs.
  const used = components.filter((c) => c.value !== null);
  const wsum = used.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((used.reduce((s, c) => s + (c.value as number) * c.weight, 0) / wsum) * 100);

  const inaccuracies = results.flatMap((r) =>
    r.analysis.inaccuracies.map((i) => ({ engine: r.task.engine, question: r.task.text, ...i })),
  );

  return {
    score,
    verdict: verdictFor(score),
    components,
    perEngine,
    otherLang,
    competitors: competitors.slice(0, 10),
    ownCitations,
    sources: sources.slice(0, 12),
    inaccuracies,
    accuracyChecked,
    demo: results.some((r) => r.answer.demo),
  };
}

export function verdictFor(score: number): string {
  if (score >= 70) return "Les IA vous connaissent et vous recommandent souvent.";
  if (score >= 45) return "Vous êtes visible, mais vos concurrents sont cités plus souvent.";
  if (score >= 20) return "Les IA vous citent rarement : vos concurrents captent la plupart des recommandations.";
  return "Les IA ne vous recommandent quasiment jamais pour l'instant.";
}
