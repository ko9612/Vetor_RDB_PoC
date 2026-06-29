// VectorEngine — 질의 임베딩 → Pinecone 검색 → LLM 추천
// 담당: backend-agent | 근거: docs/아키텍처_설계서.md §3, docs/RAG_파이프라인_설계서.md

import type { PanelResult } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";
import { searchVector } from "../stores/pinecone.js";

export async function runVector(
  query: string,
  topK: number,
  solar: SolarClient
): Promise<PanelResult> {
  const t0 = Date.now();

  try {
    // [1] 질의 임베딩 (query 모델, 4096-d)
    const qVector = await solar.embed(query, "query");

    // [2] Pinecone cosine 검색
    const hits = await searchVector(qVector, topK);

    // [3] 결과 없으면 empty
    if (hits.length === 0) {
      return {
        status: "empty",
        engine: "vector",
        tookMs: Date.now() - t0,
        hits: [],
        advice: null,
        reason: "벡터 검색 결과가 없습니다.",
      };
    }

    // [4] 의미 태그 부여 (evidence)
    for (const hit of hits) {
      hit.evidence = [`의미 유사`, `cosine: ${hit.score.toFixed(2)}`];
    }

    // [5] LLM 추천 생성
    const advice = await solar.recommend(query, hits);

    return {
      status: "success",
      engine: "vector",
      tookMs: Date.now() - t0,
      hits,
      advice,
    };
  } catch (err) {
    return {
      status: "error",
      engine: "vector",
      tookMs: Date.now() - t0,
      hits: [],
      advice: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
