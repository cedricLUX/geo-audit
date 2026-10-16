import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/token.ts";
import { tasksFor, type AuditPayload } from "@/lib/plan.ts";
import { engineStatuses } from "@/lib/engines/index.ts";
import { summarize } from "@/lib/score.ts";
import { buildActions } from "@/lib/actions.ts";
import { saveSummary } from "@/lib/store.ts";
import type { TaskResult } from "@/lib/types.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let audit: AuditPayload;
  try {
    audit = verifyToken<AuditPayload>(String(body.token ?? ""));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jeton invalide." }, { status: 401 });
  }
  const expected = tasksFor(audit);
  const results: TaskResult[] = (Array.isArray(body.results) ? body.results : []).slice(0, expected.length);
  const summary = summarize(results, engineStatuses(), audit.site.checks, audit.profile);
  const { actions, method } = await buildActions(summary, audit.site.checks, audit.profile);
  await saveSummary(audit.id, { score: summary.score, perEngine: summary.perEngine, actions }).catch(() => undefined);
  return NextResponse.json({ summary, actions, actionsMethod: method });
}
