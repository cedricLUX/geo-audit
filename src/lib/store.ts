/** Enregistre les audits (e-mail, profil, résultat). Supabase si configuré, sinon mémoire du serveur. */
type Row = { id: string; email: string; created_at: string; profile?: unknown; summary?: unknown };

const memory: Row[] = [];

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    url: `${url.replace(/\/$/, "")}/rest/v1/audits`,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  };
}

export async function countAuditsSince(email: string, since: Date): Promise<number> {
  const sb = supabase();
  if (!sb) return memory.filter((r) => r.email === email && new Date(r.created_at) >= since).length;
  const q = new URLSearchParams({ select: "id", email: `eq.${email}`, created_at: `gte.${since.toISOString()}` });
  const res = await fetch(`${sb.url}?${q}`, { headers: sb.headers });
  if (!res.ok) throw new Error(`Supabase : ${res.status}`);
  return ((await res.json()) as unknown[]).length;
}

export async function createAudit(row: { id: string; email: string; profile: unknown }): Promise<void> {
  const full = { ...row, created_at: new Date().toISOString() };
  const sb = supabase();
  if (!sb) {
    memory.push(full);
    return;
  }
  const res = await fetch(sb.url, { method: "POST", headers: { ...sb.headers, prefer: "return=minimal" }, body: JSON.stringify(full) });
  if (!res.ok) throw new Error(`Supabase : ${res.status}`);
}

export async function saveSummary(id: string, summary: unknown): Promise<void> {
  const sb = supabase();
  if (!sb) {
    const r = memory.find((m) => m.id === id);
    if (r) r.summary = summary;
    return;
  }
  await fetch(`${sb.url}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...sb.headers, prefer: "return=minimal" },
    body: JSON.stringify({ summary }),
  });
}
