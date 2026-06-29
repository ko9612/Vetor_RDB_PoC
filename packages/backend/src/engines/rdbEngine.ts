// RdbEngine — 키워드 추출 → FTS5 검색 → LLM 추천(0건이면 empty)
// 담당: backend-agent | 근거: docs/아키텍처_설계서.md §4, docs/RAG_파이프라인_설계서.md

import type { PanelResult } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";
import { searchFts } from "../stores/sqlite.js";

export async function runRdb(
  query: string,
  topK: number,
  solar: SolarClient
): Promise<PanelResult> {
  const t0 = Date.now();

  try {
    // [1] FTS5 검색 (키워드 추출은 searchFts 내부에서 처리)
    const { keywords, hits } = searchFts(query, topK);

    // [2] 0건이면 empty 반환 (LLM 호출하지 않음 — 환각 방지)
    if (hits.length === 0) {
      return {
        status: "empty",
        engine: "rdb",
        tookMs: Date.now() - t0,
        hits: [],
        advice: null,
        keywords,
        reason: "추출 키워드가 과거 수주 텍스트와 일치하지 않습니다.",
      };
    }

    // [3] 매칭 키워드를 evidence에 부여
    for (const hit of hits) {
      hit.evidence = keywords.map((kw) => `키워드: ${kw}`);
    }

    // [4] LLM 추천 생성
    const advice = await solar.recommend(query, hits);

    return {
      status: "success",
      engine: "rdb",
      tookMs: Date.now() - t0,
      hits,
      advice,
      keywords,
    };
  } catch (err) {
    return {
      status: "error",
      engine: "rdb",
      tookMs: Date.now() - t0,
      hits: [],
      advice: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
