// ─────────────────────────────────────────────────────────────
// vectorEngine.ts — "의미로 찾는 검색" 담당 (좌측 패널)
//
// 흐름: 검색어를 숫자로 바꿔 → Pinecone에서 비슷한 의미의 과거 수주를 찾고 → AI 추천을 붙인다.
// 키워드가 안 겹쳐도 "뜻이 비슷하면" 찾아내는 게 이 방식의 강점.
//   예) "설비가 멈출 위험" 으로 검색해도 "라인 정지 위험" 수주를 찾아냄.
// ─────────────────────────────────────────────────────────────

import type { PanelResult } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";
import { searchVector } from "../stores/pinecone.js";

export async function runVector(
  query: string,
  topK: number,
  solar: SolarClient
): Promise<PanelResult> {
  const t0 = Date.now(); // 소요시간 측정용 시작 시각

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

    // [4] 각 결과에 "왜 잡혔는지" 근거 태그 부여 (화면 배지로 표시됨)
    //     cosine = 0~1 사이 유사도 점수(1에 가까울수록 비슷함)
    for (const hit of hits) {
      hit.evidence = [`의미 유사`, `cosine: ${hit.score.toFixed(2)}`];
    }

    // [5] 찾은 과거 수주들을 근거로 AI에게 대응방안 글 작성 요청
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
