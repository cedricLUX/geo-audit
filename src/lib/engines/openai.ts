import type { EngineAnswer, Lang } from "../types.ts";
import { dedupeSources, toSource } from "../text.ts";
import { fetchJson } from "./http.ts";

/** ChatGPT : API Responses d'OpenAI avec l'outil de recherche web, sans historique. */
export async function askChatGPT(question: string, lang: Lang): Promise<EngineAnswer> {
  const data = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      tools: [{ type: "web_search", user_location: { type: "approximate", country: "LU" } }],
      input: question,
      store: false,
    }),
  });
  let text = "";
  const sources = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      text += part.text;
      for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) sources.push(toSource(a.url, a.title));
    }
  }
  void lang;
  return { text, sources: dedupeSources(sources), answered: text.length > 0, demo: false };
}
