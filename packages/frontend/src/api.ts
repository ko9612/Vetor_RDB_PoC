// API 호출 — POST /api/search, GET /api/health
// 근거: docs/API_연동명세서.md §2

import type { SearchRequest, SearchResponse } from "@scm/shared";

const TIMEOUT_MS = 15_000;

/** POST /api/search — 동시 비교 검색 */
export async function searchOrders(req: SearchRequest): Promise<SearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return (await res.json()) as SearchResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/health — 연결 상태 확인 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === "ok";
  } catch {
    return false;
  }
}
