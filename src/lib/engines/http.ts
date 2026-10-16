export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 90_000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${body.slice(0, 300)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}
