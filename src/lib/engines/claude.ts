import type Anthropic from "@anthropic-ai/sdk";
import type { EngineAnswer, Source } from "../types.ts";
import { anthropic, CLAUDE_MODEL } from "../anthropic.ts";
import { dedupeSources, toSource } from "../text.ts";

/** Claude avec l'outil de recherche web, sans historique ni consigne système. */
export async function askClaude(question: string): Promise<EngineAnswer> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let text = "";
  const sources: Source[] = [];
  // Une recherche longue peut s'arrêter en pause_turn : on reprend jusqu'à 3 fois.
  for (let i = 0; i < 3; i++) {
    const res = await anthropic().messages.create({
      model: CLAUDE_MODEL(),
      max_tokens: 16000,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "LU" } }],
      messages,
    });
    for (const block of res.content) {
      if (block.type === "text") {
        text += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") sources.push(toSource(c.url, c.title ?? undefined));
        }
      }
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text, sources: dedupeSources(sources), answered: text.length > 0, demo: false };
}
