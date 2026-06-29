// 공통 타입 — 모든 패키지가 재사용 (SSOT)

/** 과거 수주 1건 */
export interface Order {
  id: string;          // 수주 ID (SO-001 ~ SO-020)
  customer: string;    // 고객사
  item: string;        // 품목
  quantity: number;    // 수량
  deadline: string;    // 납기 (YYYY-MM-DD)
  note: string;        // 비고(특이사항)
}

/** 검색 엔진 종류 */
export type Engine = "vector" | "rdb";

/** 패널 상태 (프론트 상태와 1:1) */
export type PanelStatus = "success" | "empty" | "error";

/** 검색 결과 후보 1건 */
export interface Hit extends Order {
  /** 벡터=cosine(0~1, 클수록 유사), RDB=정규화 bm25(0~1) */
  score: number;
  /** RDB=매칭 키워드, 벡터=의미 태그 */
  evidence?: string[];
}

/** 한 엔진(패널)의 검색+추천 결과 블록 */
export interface PanelResult {
  status: PanelStatus;
  engine: Engine;
  tookMs: number;
  hits: Hit[];
  advice: string | null;   // empty/error 시 null
  keywords?: string[];     // RDB 전용: 추출 키워드
  reason?: string;         // empty/error 사유
}

/** POST /api/search 응답 */
export interface SearchResponse {
  query: string;
  vector: PanelResult;
  rdb: PanelResult;
}

/** POST /api/search 요청 */
export interface SearchRequest {
  query: string;
  fields?: Partial<Pick<Order, "customer" | "item" | "quantity" | "deadline">>;
  topK?: number;
  engines?: Engine[];
}

/** 테스트 시나리오 */
export interface Scenario {
  id: string;          // S1 ~ S5
  title: string;
  query: string;       // 질의문(문서와 동일)
  answer: string[];    // 정답 수주 ID
  rdbExpect: "fail" | "partial";   // 키워드 검색 기대(실패/부분)
  vectorExpect: "success";
}
