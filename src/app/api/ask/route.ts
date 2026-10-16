import { NextResponse } from "next/server";
import { askEngine } from "@/lib/engines/index.ts";
import { analyzeAnswer } from "@/lib/analyze.ts";
import { verifyToken } from "@/lib/token.ts";
import { tasksFor, type AuditPayload } from "@/lib/plan.ts";
import type { TaskResult } from "@/lib/types.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let audit: AuditPayload;
  try {
    audit = verifyToken<AuditPayload>(String(body.token ?? ""));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jeton invalide." }, { status: 401 });
  }
  const tasks = tasksFor(audit);
  const task = tasks[Number(body.taskIndex)];
  if (!task) return NextResponse.json({ error: "Requête inconnue." }, { status: 400 });

  const answer = await askEngine(task.engine, task.text, task.lang, task.questionIndex, audit.profile);
  const analysis = await analyzeAnswer(answer, task.text, audit.profile, audit.site.excerpt);
  const result: TaskResult = { task, answer, analysis };
  return NextResponse.json(result);
}
