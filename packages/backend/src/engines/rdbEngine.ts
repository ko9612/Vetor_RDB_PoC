// ─────────────────────────────────────────────────────────────
// rdbEngine.ts — "글자(키워드)로 찾는 검색" 담당 (우측 패널)
//
// 흐름: 검색어에서 단어를 뽑아 → SQLite에서 그 단어가 든 과거 수주를 찾고 → AI 추천을 붙인다.
// 단어가 실제로 똑같이 들어있어야 찾는다(전통적인 검색 방식).
//   → 그래서 뜻은 같아도 단어가 다르면 "못 찾음"이 나옴 = 이 PoC가 보여주려는 한계.
// ─────────────────────────────────────────────────────────────

import type { PanelResult } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";
import { searchFts } from "../stores/sqlite.js";

export async function runRdb(
  query: string,
  topK: number,
  solar: SolarClient
): Promise<PanelResult> {
  const t0 = Date.now(); // 소요시간 측정용 시작 시각

  try {
    // [1] 검색어에서 키워드를 뽑아 SQLite 전문검색(FTS5) 실행
    //     keywords = 뽑힌 단어들, hits = 그 단어가 든 과거 수주들
    const { keywords, hits } = searchFts(query, topK);

    // [2] 한 건도 못 찾으면 여기서 끝(empty). AI는 부르지 않는다.
    //     → 근거가 없는데 AI가 지어내는 것을 막기 위함
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

    // [3] 각 결과에 "어떤 키워드로 잡혔는지" 근거 태그 부여 (화면 배지로 표시됨)
    for (const hit of hits) {
      hit.evidence = keywords.map((kw) => `키워드: ${kw}`);
    }

    // [4] 찾은 과거 수주들을 근거로 AI에게 대응방안 글 작성 요청
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
