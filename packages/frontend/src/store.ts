// 상태 관리 — zustand 로 패널별 독립 상태 + 검색 액션 관리
// 근거: docs/프론트엔드_기능정의서.md §3.1·§6, docs/화면_설계서.md §4
// (이전 useReducer 구현을 zustand store 로 대체. 패널 단위 실패 격리 NFR-09 유지)

import { create } from "zustand";
import type { Hit, PanelResult, SearchResponse } from "@scm/shared";
import { searchOrders, checkHealth } from "./api.js";

/* ── 패널 상태 (5개) ── */
export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; hits: Hit[]; advice: string; keywords?: string[] }
  | { status: "empty"; reason: string; keywords?: string[] }
  | { status: "error"; message: string };

/* ── PanelResult(API) → PanelState(UI) 매핑 ── */
function panelResultToState(result: PanelResult): PanelState {
  switch (result.status) {
    case "success":
      return {
        status: "success",
        hits: result.hits,
        advice: result.advice ?? "",
        keywords: result.keywords,
      };
    case "empty":
      return {
        status: "empty",
        reason: result.reason ?? "검색 결과가 없습니다.",
        keywords: result.keywords,
      };
    case "error":
      return {
        status: "error",
        message: result.reason ?? "알 수 없는 오류가 발생했습니다.",
      };
  }
}

interface SearchStore {
  vector: PanelState;
  rdb: PanelState;
  query: string;
  connected: boolean | null; // null = 확인 중
  refreshHealth: () => Promise<void>;
  search: (query: string) => Promise<void>;
  retry: () => void;
}

// 클라이언트 캐시 / 마지막 질의 — 렌더링에 관여하지 않으므로 store 밖에 둔다.
const cache = new Map<string, SearchResponse>();
let lastQuery = "";

export const useSearchStore = create<SearchStore>((set, get) => ({
  vector: { status: "idle" },
  rdb: { status: "idle" },
  query: "",
  connected: null,

  // 연결 상태 확인
  refreshHealth: async () => {
    const ok = await checkHealth();
    set({ connected: ok });
  },

  // 검색 실행
  search: async (query) => {
    lastQuery = query;
    set({ query, vector: { status: "loading" }, rdb: { status: "loading" } });

    // 캐시 확인 (동일 query 재요청 방지)
    const cached = cache.get(query);
    if (cached) {
      set({
        vector: panelResultToState(cached.vector),
        rdb: panelResultToState(cached.rdb),
      });
      return;
    }

    try {
      const res = await searchOrders({
        query,
        topK: 3,
        engines: ["vector", "rdb"],
      });

      cache.set(query, res);

      // 각 패널 독립 매핑 (격리 — NFR-09)
      try {
        set({ vector: panelResultToState(res.vector) });
      } catch {
        set({ vector: { status: "error", message: "벡터 검색 결과 처리 중 오류" } });
      }

      try {
        set({ rdb: panelResultToState(res.rdb) });
      } catch {
        set({ rdb: { status: "error", message: "RDB 검색 결과 처리 중 오류" } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "네트워크 오류";
      // 전체 요청 실패 시 양쪽 모두 에러
      set({
        vector: { status: "error", message: msg },
        rdb: { status: "error", message: msg },
      });
    }
  },

  // 다시 시도
  retry: () => {
    if (lastQuery) {
      cache.delete(lastQuery);
      get().search(lastQuery);
    }
  },
}));
