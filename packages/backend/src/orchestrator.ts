// SearchOrchestrator — 두 엔진 병렬 실행 + 패널 합성(부분 실패 격리)
// 담당: backend-agent | 근거: docs/아키텍처_설계서.md §5

import type { PanelResult, SearchResponse, Engine } from "@scm/shared";
import type { SolarClient } from "./solarClient.js";
import { runVector } from "./engines/vectorEngine.js";
import { runRdb } from "./engines/rdbEngine.js";

export async function search(
  query: string,
  topK: number,
  engines: Engine[],
  solar: SolarClient
): Promise<SearchResponse> {
  // Promise.allSettled 로 격리 — 한 엔진 예외가 다른 패널을 막지 않음(NFR-09)
  const [v, r] = await Promise.allSettled([
    engines.includes("vector") ? runVector(query, topK, solar) : skip("vector"),
    engines.includes("rdb") ? runRdb(query, topK, solar) : skip("rdb"),
  ]);
  return { query, vector: settle(v, "vector"), rdb: settle(r, "rdb") };
}

function skip(engine: Engine): Promise<PanelResult> {
  return Promise.resolve({ status: "empty", engine, tookMs: 0, hits: [], advice: null, reason: "engine 미선택" });
}

function settle(res: PromiseSettledResult<PanelResult>, engine: Engine): PanelResult {
  if (res.status === "fulfilled") return res.value;
  return { status: "error", engine, tookMs: 0, hits: [], advice: null, reason: String(res.reason?.message ?? res.reason) };
}
