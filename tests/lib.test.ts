import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, buildTasks, fill } from "../src/lib/corpus.ts";
import { analyzeHeuristic } from "../src/lib/analyze.ts";
import { robotsBlocks, jsonLd } from "../src/lib/site.ts";
import { summarize } from "../src/lib/score.ts";
import { askDemo } from "../src/lib/engines/demo.ts";
import { emptyProfile } from "../src/lib/profile.ts";
import type { EngineStatus, Profile, TaskResult } from "../src/lib/types.ts";

const p: Profile = {
  ...emptyProfile("https://www.fiduciaire-exemple.lu"),
  entreprise: "Fiduciaire Exemple",
  metier: "expert-comptable",
  ville: "Luxembourg",
  service: "comptabilité pour PME",
  besoin: "une start-up",
  concurrent: "Fiduciaire Martin",
  niche: "fiscalité des holdings",
  probleme: "je suis en retard sur ma TVA",
  questionClients: "Combien coûte une comptabilité mensuelle ?",
};

test("les crochets sont remplis, les champs vides restent visibles", () => {
  const qs = buildQuestions(p);
  assert.equal(qs.length, 13);
  assert.equal(qs[0].text, "Quel est le meilleur expert-comptable à Luxembourg ?");
  assert.equal(qs[4].text, "Fiduciaire Exemple ou Fiduciaire Martin : lequel choisir ?");
  assert.equal(qs[7].text, "Je suis en retard sur ma TVA : que faire ?");
  assert.equal(qs[9].text, "Combien coûte une comptabilité mensuelle ?");
  assert.equal(fill("Quel est le meilleur [métier] à [ville] ?", { ...p, ville: "" }), "Quel est le meilleur expert-comptable à [ville] ?");
});

test("le plan compte 13 × 5 + 2 × 2 × 5 requêtes", () => {
  const qs = buildQuestions(p);
  const tasks = buildTasks(qs, ["chatgpt", "google", "perplexity", "gemini", "claude"], { 0: { en: "a", de: "b" }, 1: { en: "c", de: "d" } });
  assert.equal(tasks.length, 85);
});

test("l'analyse heuristique trouve l'entreprise, sa position et les concurrents", () => {
  const text = "Voici :\n1. **Fiduciaire Martin** : très connue.\n2. **Fiduciaire Exemple** : spécialiste des holdings.\n3. **Alzette & Co** : généraliste.";
  const a = analyzeHeuristic(text, p);
  assert.equal(a.cited, true);
  assert.equal(a.position, 2);
  assert.deepEqual(a.competitors, ["Fiduciaire Martin", "Alzette & Co"]);
  assert.equal(analyzeHeuristic("Aucune mention ici.", p).cited, false);
  assert.equal(analyzeHeuristic("Voir fiduciaire-exemple.lu pour plus d'infos", p).cited, true);
});

test("robots.txt : blocage par robot et par défaut", () => {
  const robots = "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n";
  assert.equal(robotsBlocks(robots, "GPTBot"), true);
  assert.equal(robotsBlocks(robots, "ClaudeBot"), false);
  assert.equal(robotsBlocks("User-agent: *\nDisallow: /", "PerplexityBot"), true);
  assert.equal(robotsBlocks("User-agent: *\nDisallow: /admin", "PerplexityBot"), false);
});

test("JSON-LD lu, y compris dans un @graph", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"LocalBusiness","name":"X"}]}</script>`;
  assert.equal(jsonLd(html).length, 2);
});

test("le mode démo est stable et le score reste entre 0 et 100", () => {
  const a1 = askDemo("chatgpt", "q", "fr", 0, p);
  const a2 = askDemo("chatgpt", "q", "fr", 0, p);
  assert.deepEqual(a1, a2);
  const engines: EngineStatus[] = [{ id: "chatgpt", label: "ChatGPT", live: false }];
  const results: TaskResult[] = buildQuestions(p).map((q) => {
    const answer = askDemo("chatgpt", q.text, "fr", q.index, p);
    return { task: { questionIndex: q.index, engine: "chatgpt", lang: "fr", text: q.text }, answer, analysis: analyzeHeuristic(answer.text, p) };
  });
  const s = summarize(results, engines, [{ id: "x", label: "x", ok: true, detail: "", weight: 1 }], p);
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.equal(s.perEngine[0].total, 13);
  assert.equal(s.accuracyChecked, false);
  assert.ok(s.competitors.length > 0);
});
