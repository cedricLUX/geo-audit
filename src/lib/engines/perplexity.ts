import type { EngineAnswer } from "../types.ts";
import { dedupeSources, toSource } from "../text.ts";
import { fetchJson } from "./http.ts";

export async function askPerplexity(question: string): Promise<EngineAnswer> {
  const data = await fetchJson("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || "sonar",
      messages: [{ role: "user", content: question }],
    }),
  });
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const results: { url: string; title?: string }[] =
    data.search_results ?? (data.citations ?? []).map((url: string) => ({ url }));
  const sources = results.filter((r) => r?.url).map((r) => toSource(r.url, r.title));
  return { text, sources: dedupeSources(sources), answered: text.length > 0, demo: false };
}
