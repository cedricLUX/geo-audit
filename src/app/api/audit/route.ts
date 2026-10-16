import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { MAX_QUESTION_LENGTH, MULTILINGUAL_INDEXES, TEMPLATES, templateTranslation } from "@/lib/corpus.ts";
import { anyLiveEngine, engineStatuses } from "@/lib/engines/index.ts";
import { translateQuestions } from "@/lib/profile.ts";
import { signToken, verifyToken } from "@/lib/token.ts";
import { cleanProfile, isEmail, tasksFor, type AuditPayload, type SitePayload } from "@/lib/plan.ts";
import { countAuditsSince, createAudit } from "@/lib/store.ts";
import type { Question } from "@/lib/types.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });

  let site: SitePayload;
  try {
    site = verifyToken<SitePayload>(String(body.siteToken ?? ""));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jeton invalide." }, { status: 400 });
  }

  const profile = { ...cleanProfile(body.profile), siteUrl: site.url };
  if (!profile.entreprise) return NextResponse.json({ error: "Indiquez le nom de votre entreprise." }, { status: 400 });

  const raw: unknown[] = Array.isArray(body.questions) ? body.questions : [];
  const questions: Question[] = TEMPLATES.map((t, index) => ({
    index,
    text: String(raw[index] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH),
    kind: t.kind,
    multilingual: MULTILINGUAL_INDEXES.includes(index),
  })).filter((q) => q.text.length > 0);
  if (questions.length < 3) return NextResponse.json({ error: "Gardez au moins 3 questions." }, { status: 400 });
  if (questions.some((q) => /\[[^\]]+\]/.test(q.text))) {
    return NextResponse.json({ error: "Certaines questions contiennent encore des crochets à remplir." }, { status: 400 });
  }

  // La limite par jour ne s'applique que si de vrais moteurs (payants) sont branchés.
  if (anyLiveEngine()) {
    const limit = Number(process.env.AUDITS_PER_DAY || 1);
    const since = new Date(Date.now() - 24 * 3600_000);
    if ((await countAuditsSince(email, since)) >= limit) {
      return NextResponse.json({ error: `Limite atteinte : ${limit} audit par jour et par e-mail. Revenez demain.` }, { status: 429 });
    }
  }

  const translations = await translateQuestions(
    questions
      .filter((q) => q.multilingual)
      .map((q) => ({ index: q.index, text: q.text, fallback: { en: templateTranslation(q.index, "en", profile), de: templateTranslation(q.index, "de", profile) } })),
  );

  const payload: AuditPayload = {
    id: randomUUID(),
    email,
    profile,
    questions,
    translations,
    site: { excerpt: site.excerpt, checks: site.checks },
    exp: Date.now() + 3600_000,
  };
  await createAudit({ id: payload.id, email, profile }).catch(() => undefined);
  return NextResponse.json({ token: signToken(payload), id: payload.id, tasks: tasksFor(payload), engines: engineStatuses(), questions, checks: site.checks, profile });
}
