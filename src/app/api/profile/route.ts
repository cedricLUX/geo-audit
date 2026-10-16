import { NextResponse } from "next/server";
import { inspectSite } from "@/lib/site.ts";
import { suggestProfile } from "@/lib/profile.ts";
import { engineStatuses } from "@/lib/engines/index.ts";
import { signToken } from "@/lib/token.ts";
import { isEmail } from "@/lib/plan.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!isEmail(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (!body.consent) return NextResponse.json({ error: "Merci d'accepter l'utilisation de vos données pour l'audit." }, { status: 400 });
  if (!url) return NextResponse.json({ error: "Indiquez l'adresse de votre site." }, { status: 400 });
  try {
    const site = await inspectSite(url);
    const { profile, method } = await suggestProfile(site);
    const siteToken = signToken({ url: site.url, excerpt: site.excerpt, checks: site.checks, exp: Date.now() + 2 * 3600_000 });
    return NextResponse.json({
      profile,
      method,
      site: { url: site.url, title: site.title, description: site.description, checks: site.checks },
      siteToken,
      engines: engineStatuses(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: `Impossible de lire le site : ${message}` }, { status: 422 });
  }
}
