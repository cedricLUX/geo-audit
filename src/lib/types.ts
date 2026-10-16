export type EngineId = "chatgpt" | "google" | "perplexity" | "gemini" | "claude";
export type Lang = "fr" | "en" | "de";

/** Les champs entre crochets du workshop, remplis par l'utilisateur. */
export interface Profile {
  siteUrl: string;
  entreprise: string;
  metier: string;
  ville: string;
  service: string;
  besoin: string;
  concurrent: string;
  niche: string;
  probleme: string;
  questionClients: string;
  /** Autres concurrents connus, pour la détection dans les réponses. */
  autresConcurrents: string[];
}

export interface Question {
  index: number;
  text: string;
  kind: "corpus" | "libre";
  /** Rejouée en anglais et en allemand. */
  multilingual: boolean;
}

export interface Task {
  questionIndex: number;
  engine: EngineId;
  lang: Lang;
  text: string;
}

export interface Source {
  url: string;
  title?: string;
  domain: string;
}

export interface EngineAnswer {
  text: string;
  sources: Source[];
  /** false quand le moteur n'a pas produit de réponse IA (ex. pas d'aperçu IA Google). */
  answered: boolean;
  demo: boolean;
  error?: string;
}

export type SourceType = "site" | "annuaire" | "media" | "avis" | "reseau" | "concurrent" | "autre";

export interface Analysis {
  cited: boolean;
  /** 1 = première entreprise mentionnée ; null si non citée. */
  position: number | null;
  competitors: string[];
  inaccuracies: { claim: string; correction: string }[];
  sentiment: "positif" | "neutre" | "negatif" | null;
  method: "ia" | "heuristique";
}

export interface TaskResult {
  task: Task;
  answer: EngineAnswer;
  analysis: Analysis;
}

export interface TechCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  weight: number;
}

export interface SiteInfo {
  url: string;
  title: string;
  description: string;
  excerpt: string;
  checks: TechCheck[];
}

export interface EngineStatus {
  id: EngineId;
  label: string;
  live: boolean;
}

export interface Action {
  title: string;
  detail: string;
}
