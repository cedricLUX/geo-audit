import type { EngineAnswer } from "../types.ts";
import { dedupeSources } from "../text.ts";
import { fetchJson } from "./http.ts";

/** Gemini avec ancrage dans la recherche Google. */
export async function askGemini(question: string): Promise<EngineAnswer> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: question }] }], tools: [{ google_search: {} }] }),
    },
  );
  const cand = data.candidates?.[0];
  const text: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  // Les liens d'ancrage sont des redirections Google : le titre porte le domaine d'origine.
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c: { web?: { uri?: string; title?: string } }) => c.web)
    .filter((w: { uri?: string } | undefined) => w?.uri)
    .map((w: { uri: string; title?: string }) => {
      const domain = (w.title ?? "").replace(/^www\./, "").toLowerCase() || "google";
      return { url: w.uri, title: w.title, domain };
    });
  return { text, sources: dedupeSources(sources), answered: text.length > 0, demo: false };
}
