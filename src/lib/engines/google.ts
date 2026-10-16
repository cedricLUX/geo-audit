import type { EngineAnswer, Lang } from "../types.ts";
import { dedupeSources, toSource } from "../text.ts";
import { fetchJson } from "./http.ts";

type Block = { snippet?: string; title?: string; list?: Block[]; text_blocks?: Block[] };

function flatten(blocks: Block[] = []): string {
  return blocks
    .map((b) => [b.title, b.snippet, flatten(b.list), flatten(b.text_blocks)].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n");
}

/** Aperçu IA de Google, lu via SerpApi (Google ne propose pas d'API officielle pour l'aperçu IA). */
export async function askGoogle(question: string, lang: Lang): Promise<EngineAnswer> {
  const key = process.env.SERPAPI_API_KEY ?? "";
  const params = new URLSearchParams({ engine: "google", q: question, hl: lang, gl: "lu", google_domain: "google.lu", api_key: key });
  const data = await fetchJson(`https://serpapi.com/search.json?${params}`);
  let overview = data.ai_overview;
  if (overview?.page_token && !overview.text_blocks) {
    const p2 = new URLSearchParams({ engine: "google_ai_overview", page_token: overview.page_token, api_key: key });
    overview = (await fetchJson(`https://serpapi.com/search.json?${p2}`)).ai_overview;
  }
  if (!overview?.text_blocks) {
    return { text: "", sources: [], answered: false, demo: false, error: "Pas d'aperçu IA pour cette recherche." };
  }
  const text = flatten(overview.text_blocks);
  const sources = (overview.references ?? [])
    .filter((r: { link?: string }) => r.link)
    .map((r: { link: string; title?: string }) => toSource(r.link, r.title));
  return { text, sources: dedupeSources(sources), answered: text.length > 0, demo: false };
}
