import type { EngineId, Lang, Profile, Question, Task } from "./types.ts";

type Template = { fr: string; en?: string; de?: string; kind: Question["kind"] };

/** Les 10 questions du workshop Takaneo, puis 3 questions libres proposées. */
export const TEMPLATES: Template[] = [
  {
    kind: "corpus",
    fr: "Quel est le meilleur [métier] à [ville] ?",
    en: "Who is the best [métier] in [ville]?",
    de: "Wer ist der beste Anbieter für [métier] in [ville]?",
  },
  {
    kind: "corpus",
    fr: "Quelles entreprises proposent [service] au Luxembourg ?",
    en: "Which companies offer [service] in Luxembourg?",
    de: "Welche Unternehmen bieten [service] in Luxemburg an?",
  },
  { kind: "corpus", fr: "Combien coûte [service] au Luxembourg ?" },
  { kind: "corpus", fr: "Comment choisir un [métier] pour [besoin] ?" },
  { kind: "corpus", fr: "[Vous] ou [concurrent] : lequel choisir ?" },
  { kind: "corpus", fr: "Que pensent les clients de [vous] ?" },
  { kind: "corpus", fr: "Qui est le spécialiste de [niche] au Luxembourg ?" },
  { kind: "corpus", fr: "[Problème que vous résolvez] : que faire ?" },
  { kind: "corpus", fr: "Qu'est-ce que [votre entreprise] ?" },
  { kind: "corpus", fr: "[La question que vos clients posent le plus]" },
  { kind: "libre", fr: "Quelles sont les alternatives à [concurrent] au Luxembourg ?" },
  { kind: "libre", fr: "Je cherche un partenaire fiable pour [service] pour une PME, qui me recommandes-tu ?" },
  { kind: "libre", fr: "Quelles entreprises font référence en [métier] au Luxembourg en 2026 ?" },
];

export const MULTILINGUAL_INDEXES = [0, 1];
export const EXTRA_LANGS: Lang[] = ["en", "de"];
export const MAX_QUESTION_LENGTH = 300;

export function fill(template: string, p: Profile): string {
  const map: Record<string, string> = {
    "[métier]": p.metier,
    "[ville]": p.ville,
    "[service]": p.service,
    "[besoin]": p.besoin,
    "[concurrent]": p.concurrent,
    "[niche]": p.niche,
    "[vous]": p.entreprise,
    "[votre entreprise]": p.entreprise,
    "[problème que vous résolvez]": p.probleme,
    "[la question que vos clients posent le plus]": p.questionClients,
  };
  const out = template.replace(/\[[^\]]+\]/g, (m) => {
    const v = map[m.toLowerCase()];
    return v && v.trim() ? v.trim() : m;
  });
  // Une question qui commence par une valeur saisie prend une majuscule.
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function buildQuestions(p: Profile): Question[] {
  return TEMPLATES.map((t, index) => ({
    index,
    text: fill(t.fr, p),
    kind: t.kind,
    multilingual: MULTILINGUAL_INDEXES.includes(index),
  }));
}

/** Traduction de secours, utilisée quand aucune IA n'est disponible pour traduire. */
export function templateTranslation(index: number, lang: Lang, p: Profile): string | null {
  const t = TEMPLATES[index];
  const tpl = lang === "en" ? t?.en : lang === "de" ? t?.de : t?.fr;
  return tpl ? fill(tpl, p) : null;
}

export function hasPlaceholder(text: string): boolean {
  return /\[[^\]]+\]/.test(text);
}

/** Toutes les requêtes d'un audit : chaque question × chaque moteur, plus les langues supplémentaires. */
export function buildTasks(
  questions: Question[],
  engines: EngineId[],
  translations: Record<number, Partial<Record<Lang, string>>>,
): Task[] {
  const tasks: Task[] = [];
  for (const q of questions) {
    for (const engine of engines) tasks.push({ questionIndex: q.index, engine, lang: "fr", text: q.text });
  }
  for (const q of questions.filter((q) => q.multilingual)) {
    for (const lang of EXTRA_LANGS) {
      const text = translations[q.index]?.[lang];
      if (!text) continue;
      for (const engine of engines) tasks.push({ questionIndex: q.index, engine, lang, text });
    }
  }
  return tasks;
}
