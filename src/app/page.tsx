"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildQuestions, TEMPLATES } from "@/lib/corpus.ts";
import type { Action, EngineId, EngineStatus, Profile, Task, TaskResult, TechCheck } from "@/lib/types.ts";
import type { Summary } from "@/lib/score.ts";

type Step = "start" | "profile" | "running" | "report";

interface SiteView {
  url: string;
  title: string;
  description: string;
  checks: TechCheck[];
}

interface Report {
  date: string;
  profile: Profile;
  summary: Summary;
  actions: Action[];
  results: TaskResult[];
  questions: { index: number; text: string }[];
  engines: EngineStatus[];
  checks: TechCheck[];
}

const FIELDS: { key: keyof Profile; label: string; hint: string; placeholder: string }[] = [
  { key: "entreprise", label: "Votre entreprise", hint: "[vous]", placeholder: "Cabinet Dupont" },
  { key: "metier", label: "Votre métier", hint: "[métier]", placeholder: "expert-comptable" },
  { key: "ville", label: "Votre ville", hint: "[ville]", placeholder: "Luxembourg-Ville" },
  { key: "service", label: "Votre service principal", hint: "[service]", placeholder: "comptabilité pour PME" },
  { key: "besoin", label: "Un besoin client typique", hint: "[besoin]", placeholder: "une start-up qui lève des fonds" },
  { key: "concurrent", label: "Votre principal concurrent", hint: "[concurrent]", placeholder: "Fiduciaire Martin" },
  { key: "niche", label: "Votre spécialité", hint: "[niche]", placeholder: "fiscalité des holdings" },
  { key: "probleme", label: "Le problème que vous résolvez", hint: "[problème que vous résolvez]", placeholder: "Je suis en retard sur ma TVA" },
  { key: "questionClients", label: "La question que vos clients posent le plus", hint: "[la question que vos clients posent le plus]", placeholder: "Combien coûte une comptabilité mensuelle ?" },
];

const CONCURRENCY = 5;
const HISTORY_KEY = "ai-department-geo-history";

function readHistory(): Record<string, { date: string; score: number }> {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data as T;
}

export default function Home() {
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileMethod, setProfileMethod] = useState<"ia" | "heuristique">("heuristique");
  const [site, setSite] = useState<SiteView | null>(null);
  const [siteToken, setSiteToken] = useState("");
  const [engines, setEngines] = useState<EngineStatus[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [edited, setEdited] = useState<boolean[]>([]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [results, setResults] = useState<(TaskResult | null)[]>([]);
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<Report | null>(null);
  const [previous, setPrevious] = useState<{ date: string; score: number } | null>(null);
  const cancelled = useRef(false);

  // Les questions suivent le profil tant que l'utilisateur ne les a pas retouchées.
  useEffect(() => {
    if (!profile) return;
    const auto = buildQuestions(profile).map((q) => q.text);
    setQuestions((prev) => auto.map((q, i) => (edited[i] ? prev[i] : q)));
  }, [profile, edited]);

  async function analyzeSite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await post<{ profile: Profile; method: "ia" | "heuristique"; site: SiteView; siteToken: string; engines: EngineStatus[] }>(
        "/api/profile",
        { url, email, consent },
      );
      setProfile(data.profile);
      setProfileMethod(data.method);
      setSite(data.site);
      setSiteToken(data.siteToken);
      setEngines(data.engines);
      setEdited(TEMPLATES.map(() => false));
      setStep("profile");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function launch() {
    if (!profile) return;
    setError("");
    setBusy(true);
    try {
      const data = await post<{ token: string; tasks: Task[]; engines: EngineStatus[]; questions: { index: number; text: string }[]; checks: TechCheck[]; profile: Profile }>(
        "/api/audit",
        { email, siteToken, profile, questions },
      );
      setTasks(data.tasks);
      setEngines(data.engines);
      const slots: (TaskResult | null)[] = data.tasks.map(() => null);
      setResults(slots);
      setStep("running");
      window.scrollTo({ top: 0 });
      cancelled.current = false;

      let next = 0;
      const worker = async () => {
        while (!cancelled.current && next < data.tasks.length) {
          const i = next++;
          setRunning((s) => new Set(s).add(i));
          let r: TaskResult;
          try {
            r = await post<TaskResult>("/api/ask", { token: data.token, taskIndex: i });
          } catch (err) {
            r = {
              task: data.tasks[i],
              answer: { text: "", sources: [], answered: false, demo: false, error: err instanceof Error ? err.message : String(err) },
              analysis: { cited: false, position: null, competitors: [], inaccuracies: [], sentiment: null, method: "heuristique" },
            };
          }
          slots[i] = r;
          setResults([...slots]);
          setRunning((s) => {
            const n = new Set(s);
            n.delete(i);
            return n;
          });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (cancelled.current) return;

      const finished = slots.filter((r): r is TaskResult => r !== null);
      const fin = await post<{ summary: Summary; actions: Action[] }>("/api/finish", { token: data.token, results: finished });
      const history = readHistory();
      const key = data.profile.siteUrl;
      setPrevious(history[key] ?? null);
      const date = new Date().toISOString();
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...history, [key]: { date, score: fin.summary.score } }));
      } catch {
        // Historique facultatif.
      }
      setReport({ date, profile: data.profile, summary: fin.summary, actions: fin.actions, results: finished, questions: data.questions, engines: data.engines, checks: data.checks });
      setStep("report");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep((s) => (s === "running" ? "profile" : s));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    cancelled.current = true;
    setStep("start");
    setReport(null);
    setResults([]);
    setTasks([]);
    setError("");
  }

  const demoEngines = engines.filter((e) => !e.live);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="brand-mark">AI</div>
          AI Department
        </div>
        <span className="pill">Audit de visibilité IA</span>
      </header>

      {step === "start" && (
        <>
          <h1>Les IA recommandent-elles votre entreprise ?</h1>
          <p className="lead">
            Nous posons les questions de vos clients à ChatGPT, Google, Perplexity, Gemini et Claude, en français, anglais et allemand.
            Vous voyez qui est cité à votre place, sur quelles sources, et vos 3 premières actions.
          </p>
          <form className="card" onSubmit={analyzeSite}>
            <div className="grid2">
              <label className="field">
                Adresse de votre site
                <input type="text" inputMode="url" required placeholder="www.votre-entreprise.lu" value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>
              <label className="field">
                Votre e-mail
                <input type="email" required placeholder="vous@entreprise.lu" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              J'accepte qu'AI Department conserve mon e-mail et le résultat de l'audit pour me le restituer. Aucun envoi commercial sans mon accord.
            </label>
            <div className="actions-row">
              <button type="submit" disabled={busy || !consent}>{busy ? "Lecture du site…" : "Analyser mon site"}</button>
              <span className="muted small">Gratuit · environ 3 minutes · aucun compte nécessaire</span>
            </div>
            {error && <div className="error">{error}</div>}
          </form>
          <div className="grid3">
            <div className="card">
              <h3>1. Votre cas</h3>
              <p className="muted small">Nous lisons votre site et pré-remplissons votre métier, votre ville et vos services. Vous corrigez.</p>
            </div>
            <div className="card">
              <h3>2. Les questions</h3>
              <p className="muted small">13 questions que posent vos clients, posées à 5 IA sans historique, comme en navigation privée.</p>
            </div>
            <div className="card">
              <h3>3. Votre bilan</h3>
              <p className="muted small">Score, concurrents cités, sources, erreurs à votre sujet et 3 actions. À télécharger en PDF.</p>
            </div>
          </div>
        </>
      )}

      {step === "profile" && profile && (
        <>
          <h1>Votre cas</h1>
          <p className="lead">
            {profileMethod === "ia" ? "Nous avons pré-rempli ces champs à partir de votre site." : "Complétez ces champs : ils remplacent les crochets des questions."} Vérifiez-les, puis relisez les questions.
          </p>
          {demoEngines.length > 0 && (
            <div className="notice">
              Mode démo pour {demoEngines.map((e) => e.label).join(", ")} : ces moteurs ne sont pas encore branchés, leurs réponses sont simulées.
            </div>
          )}
          <section className="card">
            <h2>Votre entreprise</h2>
            <p className="sub">Site analysé : {site?.url}</p>
            <div className="grid2">
              {FIELDS.map((f) => (
                <label className="field" key={f.key}>
                  <span>
                    {f.label} <span className="hint">{f.hint}</span>
                  </span>
                  <input
                    type="text"
                    placeholder={f.placeholder}
                    value={String(profile[f.key] ?? "")}
                    onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                <span>
                  Autres concurrents <span className="hint">séparés par des virgules</span>
                </span>
                <input
                  type="text"
                  placeholder="Concurrent B, Concurrent C"
                  value={profile.autresConcurrents.join(", ")}
                  onChange={(e) => setProfile({ ...profile, autresConcurrents: e.target.value.split(",").map((s) => s.trimStart()).slice(0, 3) })}
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Les questions posées aux IA</h2>
            <p className="sub">Les 10 questions du corpus et 3 questions libres. Les questions 1 et 2 sont aussi posées en anglais et en allemand. Videz une question pour la retirer.</p>
            <div className="qlist">
              {questions.map((q, i) => {
                const hasHole = /\[[^\]]+\]/.test(q);
                return (
                  <div className={`qrow${hasHole ? " warn" : ""}`} key={i}>
                    <div className="qnum">{i + 1}</div>
                    <textarea
                      rows={1}
                      value={q}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuestions((qs) => qs.map((x, j) => (j === i ? v : x)));
                        setEdited((ed) => ed.map((x, j) => (j === i ? true : x)));
                      }}
                    />
                    <div className="qtag">{TEMPLATES[i]?.kind === "libre" ? "libre" : i < 2 ? "FR · EN · DE" : "corpus"}</div>
                  </div>
                );
              })}
            </div>
            <div className="actions-row">
              <span className="muted small">Moteurs interrogés :</span>
              <div className="engines">
                {engines.map((e) => (
                  <span key={e.id} className={`pill ${e.live ? "live" : "demo"}`}>
                    {e.label} · {e.live ? "réel" : "démo"}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <div className="actions-row">
            <button onClick={launch} disabled={busy || questions.some((q) => /\[[^\]]+\]/.test(q)) || !profile.entreprise}>
              {busy ? "Préparation…" : "Lancer l'audit"}
            </button>
            <button className="secondary" onClick={restart}>Changer de site</button>
            {questions.some((q) => /\[[^\]]+\]/.test(q)) && <span className="muted small">Remplissez les champs pour compléter les crochets, ou modifiez les questions concernées.</span>}
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}

      {step === "running" && (
        <>
          <h1>Audit en cours</h1>
          <p className="lead">
            Nous interrogeons les IA une question après l'autre. Gardez cette page ouverte : le bilan s'affiche à la fin.
          </p>
          <div className="card">
            <strong>
              {results.filter(Boolean).length} / {tasks.length} réponses analysées
            </strong>
            <div className="progress">
              <div style={{ width: `${tasks.length ? (results.filter(Boolean).length / tasks.length) * 100 : 0}%` }} />
            </div>
            <Matrix tasks={tasks} results={results} running={running} engines={engines} questions={questions.map((text, index) => ({ index, text })).filter((q) => q.text.trim())} />
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}

      {step === "report" && report && <ReportView report={report} previous={previous} onRestart={restart} />}

      <footer className="foot no-print">
        AI Department · Audit inspiré de l'atelier « Mon audit de visibilité IA » (Paperjam Club × Takaneo). Les réponses des IA varient d'un jour à l'autre : refaites l'audit chaque mois avec les mêmes questions.
      </footer>
    </div>
  );
}

function cellState(r: TaskResult | null | undefined, isRunning: boolean): { cls: string; label: string } {
  if (!r) return isRunning ? { cls: "running", label: "…" } : { cls: "pending", label: "" };
  if (!r.answer.answered) return { cls: "none", label: "–" };
  return r.analysis.cited ? { cls: "yes", label: "✓" } : { cls: "no", label: "✗" };
}

function Matrix({
  tasks,
  results,
  running,
  engines,
  questions,
  onSelect,
  selected,
}: {
  tasks: Task[];
  results: (TaskResult | null)[];
  running?: Set<number>;
  engines: EngineStatus[];
  questions: { index: number; text: string }[];
  onSelect?: (i: number) => void;
  selected?: number | null;
}) {
  const rows = useMemo(() => {
    const keys: { q: number; lang: string; text: string }[] = [];
    for (const t of tasks) {
      if (!keys.some((k) => k.q === t.questionIndex && k.lang === t.lang)) keys.push({ q: t.questionIndex, lang: t.lang, text: t.text });
    }
    return keys;
  }, [tasks]);
  const find = (q: number, lang: string, engine: EngineId) => tasks.findIndex((t) => t.questionIndex === q && t.lang === lang && t.engine === engine);
  void questions;
  return (
    <div className="scroll-x">
      <table className="matrix">
        <thead>
          <tr>
            <th>Question</th>
            {engines.map((e) => (
              <th key={e.id}>{e.label.replace(" (aperçu IA)", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.q}-${row.lang}`}>
              <td className="q">
                <span className="muted small">{row.q + 1}{row.lang !== "fr" ? ` · ${row.lang.toUpperCase()}` : ""}</span> {row.text}
              </td>
              {engines.map((e) => {
                const i = find(row.q, row.lang, e.id);
                const st = cellState(results[i], running?.has(i) ?? false);
                return (
                  <td key={e.id}>
                    <button
                      type="button"
                      className={`cell ${st.cls}`}
                      style={selected === i ? { outline: "2px solid var(--accent)" } : undefined}
                      disabled={!results[i] || !onSelect}
                      onClick={() => onSelect?.(i)}
                      aria-label={`${e.label}, question ${row.q + 1}`}
                    >
                      {st.label}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pct(v: number | null): string {
  return v === null ? "n.d." : `${Math.round(v * 100)} %`;
}

function ScoreRing({ score }: { score: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--good)" : score >= 45 ? "var(--accent)" : score >= 20 ? "var(--warn)" : "var(--bad)";
  return (
    <svg className="score-ring" viewBox="0 0 150 150" role="img" aria-label={`Score ${score} sur 100`}>
      <circle cx="75" cy="75" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
      <circle cx="75" cy="75" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 75 75)" />
      <text x="75" y="80" textAnchor="middle" fontSize="38" fontWeight="750" fill="var(--ink)">{score}</text>
      <text x="75" y="102" textAnchor="middle" fontSize="13" fill="var(--muted)">sur 100</text>
    </svg>
  );
}

function recap(report: Report): string {
  const s = report.summary;
  const lines = [
    `Audit de visibilité IA · AI Department · ${new Date(report.date).toLocaleDateString("fr-FR")}`,
    `${report.profile.entreprise} (${report.profile.siteUrl})`,
    `Score : ${s.score}/100. ${s.verdict}`,
    "",
    ...s.perEngine.map((e) => `Cité dans ${e.label} : ${e.cited} / ${e.total}${e.live ? "" : " (démo)"}`),
    `Autres langues : ${s.otherLang.cited} / ${s.otherLang.total}`,
    "",
    `Concurrents qui reviennent le plus : ${s.competitors.slice(0, 5).map((c) => `${c.name} (${c.count})`).join(", ") || "aucun"}`,
    `Sources qui reviennent le plus : ${s.sources.slice(0, 5).map((x) => `${x.domain} (${x.count})`).join(", ") || "aucune"}`,
    "",
    "Ce qui est faux ou daté :",
    ...(s.inaccuracies.length ? s.inaccuracies.map((i) => `- ${i.claim} → ${i.correction}`) : ["- rien de relevé"]),
    "",
    "Mes 3 premières actions :",
    ...report.actions.map((a, i) => `${i + 1}. ${a.title} : ${a.detail}`),
  ];
  return lines.join("\n");
}

function ReportView({ report, previous, onRestart }: { report: Report; previous: { date: string; score: number } | null; onRestart: () => void }) {
  const s = report.summary;
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const tasks = report.results.map((r) => r.task);
  const sel = selected !== null ? report.results[selected] : null;
  const maxComp = Math.max(s.ownCitations, ...s.competitors.map((c) => c.count), 1);
  const delta = previous ? s.score - previous.score : null;

  return (
    <>
      {s.demo && (
        <div className="notice">
          Certaines réponses sont simulées (mode démo) : ce bilan illustre le fonctionnement de l'outil, pas votre visibilité réelle.
        </div>
      )}
      <section className="card">
        <div className="hero-score">
          <ScoreRing score={s.score} />
          <div>
            <p className="muted small" style={{ margin: 0 }}>
              {report.profile.entreprise} · {report.profile.siteUrl} · {new Date(report.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 style={{ fontSize: 30, margin: "6px 0 8px" }}>{s.verdict}</h1>
            {delta !== null && previous && (
              <p className="small" style={{ margin: 0 }}>
                Dernier audit le {new Date(previous.date).toLocaleDateString("fr-FR")} : {previous.score}/100,{" "}
                <span className={delta >= 0 ? "delta-up" : "delta-down"}>
                  {delta >= 0 ? "+" : ""}
                  {delta} points
                </span>
              </p>
            )}
            <div className="actions-row no-print">
              <button onClick={() => window.print()}>Télécharger le PDF</button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recap(report));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copié" : "Copier le récapitulatif"}
              </button>
              <button className="secondary" onClick={onRestart}>Nouvel audit</button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Mon bilan</h2>
        <p className="sub">Nombre de réponses où votre entreprise est citée, par IA, sur les questions en français.</p>
        <div className="grid3">
          {s.perEngine.map((e) => (
            <div className="stat" key={e.engine}>
              <div className="v">
                {e.cited} <span className="muted" style={{ fontSize: 18 }}>/ {e.total}</span>
              </div>
              <div className="l">
                Cité dans {e.label}
                {!e.live && " · démo"}
                {e.answered < e.total && ` · ${e.total - e.answered} sans réponse IA`}
              </div>
            </div>
          ))}
          <div className="stat">
            <div className="v">
              {s.otherLang.cited} <span className="muted" style={{ fontSize: 18 }}>/ {s.otherLang.total}</span>
            </div>
            <div className="l">Cité en anglais et allemand</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Mes 3 premières actions</h2>
        <p className="sub">Par ordre d'impact attendu.</p>
        <ol className="todo">
          {report.actions.map((a, i) => (
            <li key={i}>
              <div>
                <strong>{a.title}</strong>
                <div className="muted small">{a.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Détail du score</h2>
        <p className="sub">Chaque indicateur compte pour son poids dans la note sur 100.</p>
        {s.components.map((c) => (
          <div className="bar-row" key={c.key}>
            <div>
              {c.label} <span className="muted small">· {c.weight} pts</span>
            </div>
            <div className="bar you">
              <div style={{ width: `${(c.value ?? 0) * 100}%` }} />
            </div>
            <div className="n">{pct(c.value)}</div>
          </div>
        ))}
        {!s.accuracyChecked && <p className="muted small">L'exactitude n'a pas pu être vérifiée (analyse par IA indisponible) : son poids est réparti sur les autres indicateurs.</p>}
      </section>

      <section className="card">
        <h2>Question par question</h2>
        <p className="sub">✓ cité · ✗ non cité · – pas de réponse IA. Cliquez une case pour lire la réponse et ses sources.</p>
        <Matrix tasks={tasks} results={report.results} engines={report.engines} questions={report.questions} onSelect={setSelected} selected={selected} />
        {sel && (
          <div className="answer">
            <strong>
              {report.engines.find((e) => e.id === sel.task.engine)?.label} · {sel.task.text}
            </strong>
            {sel.answer.error && <p className="muted">{sel.answer.error}</p>}
            {sel.answer.text && <pre>{sel.answer.text}</pre>}
            {sel.analysis.competitors.length > 0 && <p className="small">Entreprises citées : {sel.analysis.competitors.join(", ")}</p>}
            {sel.answer.sources.length > 0 && (
              <p className="small">
                Sources :{" "}
                {sel.answer.sources.map((src, i) => (
                  <span key={src.url}>
                    {i > 0 && ", "}
                    <a href={src.url} target="_blank" rel="noreferrer noopener">
                      {src.domain}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Les concurrents qui reviennent le plus</h2>
          <p className="sub">Nombre de réponses où chaque entreprise est citée.</p>
          <div className="bar-row">
            <div>
              <strong>{report.profile.entreprise} (vous)</strong>
            </div>
            <div className="bar you">
              <div style={{ width: `${(s.ownCitations / maxComp) * 100}%` }} />
            </div>
            <div className="n">{s.ownCitations}</div>
          </div>
          {s.competitors.slice(0, 8).map((c) => (
            <div className="bar-row" key={c.name}>
              <div>{c.name}</div>
              <div className="bar">
                <div style={{ width: `${(c.count / maxComp) * 100}%` }} />
              </div>
              <div className="n">{c.count}</div>
            </div>
          ))}
          {s.competitors.length === 0 && <p className="muted small">Aucune autre entreprise repérée.</p>}
        </section>

        <section className="card">
          <h2>Les sources qui reviennent le plus</h2>
          <p className="sub">Soyez présent et à jour là où les IA s'informent.</p>
          <table className="plain">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Citée</th>
                <th>Avec vous</th>
              </tr>
            </thead>
            <tbody>
              {s.sources.slice(0, 8).map((x) => (
                <tr key={x.domain}>
                  <td>{x.domain}</td>
                  <td>
                    <span className={`tag ${x.type}`}>{x.type}</span>
                  </td>
                  <td>{x.count}</td>
                  <td>{x.withYou}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.sources.length === 0 && <p className="muted small">Aucune source affichée par les IA.</p>}
        </section>
      </div>

      <section className="card">
        <h2>Ce qui est faux ou daté à mon sujet</h2>
        {s.inaccuracies.length > 0 ? (
          <table className="plain">
            <thead>
              <tr>
                <th>IA</th>
                <th>Ce qui est dit</th>
                <th>Ce que dit votre site</th>
              </tr>
            </thead>
            <tbody>
              {s.inaccuracies.map((i, k) => (
                <tr key={k}>
                  <td>{report.engines.find((e) => e.id === i.engine)?.label}</td>
                  <td>{i.claim}</td>
                  <td>{i.correction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {s.accuracyChecked ? "Aucune contradiction relevée avec votre site." : "Vérification automatique indisponible pour cet audit : relisez les réponses où vous êtes cité."}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Santé technique du site</h2>
        <p className="sub">Ce qui aide les IA à lire et citer votre site.</p>
        <ul className="checks">
          {report.checks.map((c) => (
            <li key={c.id}>
              <span className={c.ok ? "ok" : "ko"}>{c.ok ? "✓" : "✗"}</span>
              <div>
                <strong>{c.label}</strong>
                <div className="muted small">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
