// ─────────────────────────────────────────────────────────────
// orchestrator.ts — "두 검색을 동시에 돌리고 결과를 한 봉투에 담는 지휘자"
//
// 화면에서 검색하면 벡터(의미)와 RDB(키워드) 두 방식을 좌/우로 같이 보여준다.
// 이 파일은 그 두 엔진을 "동시에" 실행하고, 결과를 { vector, rdb } 형태로 합쳐서 돌려준다.
//
// 핵심: 한쪽이 실패해도 다른 쪽은 살려서 보여준다(= 부분 실패 격리, NFR-09).
//   예) 벡터 검색이 에러나도 RDB 결과는 정상 표시 → 화면 전체가 죽지 않음.
// ─────────────────────────────────────────────────────────────

import type { PanelResult, SearchResponse, Engine } from "@scm/shared";
import type { SolarClient } from "./solarClient.js";
import { runVector } from "./engines/vectorEngine.js";
import { runRdb } from "./engines/rdbEngine.js";

export async function search(
  query: string,
  topK: number,
  engines: Engine[],          // 돌릴 엔진 목록 (보통 ["vector","rdb"] 둘 다)
  solar: SolarClient
): Promise<SearchResponse> {
  // Promise.allSettled = "둘 다 끝날 때까지 기다리되, 하나가 실패해도 멈추지 않음"
  // (Promise.all 과 달리 한쪽 에러가 전체를 무너뜨리지 않는다 → 그래서 격리됨)
  const [v, r] = await Promise.allSettled([
    // 선택된 엔진만 실제로 돌리고, 선택 안 된 건 skip()으로 빈 결과 처리
    engines.includes("vector") ? runVector(query, topK, solar) : skip("vector"),
    engines.includes("rdb") ? runRdb(query, topK, solar) : skip("rdb"),
  ]);
  // 두 결과를 화면이 기대하는 모양 { query, vector, rdb } 으로 합쳐서 반환
  return { query, vector: settle(v, "vector"), rdb: settle(r, "rdb") };
}

// 선택되지 않은 엔진 → "결과 없음(empty)"으로 처리
function skip(engine: Engine): Promise<PanelResult> {
  return Promise.resolve({ status: "empty", engine, tookMs: 0, hits: [], advice: null, reason: "engine 미선택" });
}

// allSettled 결과를 화면용 PanelResult 로 변환:
//   성공(fulfilled) → 그 결과 그대로 / 실패(rejected) → 에러 패널로 변환
function settle(res: PromiseSettledResult<PanelResult>, engine: Engine): PanelResult {
  if (res.status === "fulfilled") return res.value;
  return { status: "error", engine, tookMs: 0, hits: [], advice: null, reason: String(res.reason?.message ?? res.reason) };
}
