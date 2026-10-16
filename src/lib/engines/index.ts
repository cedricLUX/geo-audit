import type { EngineAnswer, EngineId, EngineStatus, Lang, Profile } from "../types.ts";
import { askChatGPT } from "./openai.ts";
import { askGoogle } from "./google.ts";
import { askPerplexity } from "./perplexity.ts";
import { askGemini } from "./gemini.ts";
import { askClaude } from "./claude.ts";
import { askDemo } from "./demo.ts";

export const ENGINES: { id: EngineId; label: string; envKey: string }[] = [
  { id: "chatgpt", label: "ChatGPT", envKey: "OPENAI_API_KEY" },
  { id: "google", label: "Google (aperçu IA)", envKey: "SERPAPI_API_KEY" },
  { id: "perplexity", label: "Perplexity", envKey: "PERPLEXITY_API_KEY" },
  { id: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY" },
  { id: "claude", label: "Claude", envKey: "ANTHROPIC_API_KEY" },
];

export function engineStatuses(): EngineStatus[] {
  return ENGINES.map((e) => ({ id: e.id, label: e.label, live: Boolean(process.env[e.envKey]) }));
}

export function anyLiveEngine(): boolean {
  return engineStatuses().some((e) => e.live);
}

export async function askEngine(
  engine: EngineId,
  question: string,
  lang: Lang,
  questionIndex: number,
  profile: Profile,
): Promise<EngineAnswer> {
  const def = ENGINES.find((e) => e.id === engine);
  if (!def || !process.env[def.envKey]) return askDemo(engine, question, lang, questionIndex, profile);
  try {
    switch (engine) {
      case "chatgpt":
        return await askChatGPT(question, lang);
      case "google":
        return await askGoogle(question, lang);
      case "perplexity":
        return await askPerplexity(question);
      case "gemini":
        return await askGemini(question);
      case "claude":
        return await askClaude(question);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", sources: [], answered: false, demo: false, error: `Erreur du moteur : ${message.slice(0, 200)}` };
  }
}
