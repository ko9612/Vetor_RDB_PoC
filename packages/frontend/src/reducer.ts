// 상태 관리 — useReducer 로 패널별 독립 상태 관리
// 근거: docs/프론트엔드_기능정의서.md §3.1, docs/화면_설계서.md §4

import type { Hit, PanelResult } from "@scm/shared";

/* ── 패널 상태 ── */
export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; hits: Hit[]; advice: string; keywords?: string[] }
  | { status: "empty"; reason: string; keywords?: string[] }
  | { status: "error"; message: string };

export interface SearchState {
  vector: PanelState;
  rdb: PanelState;
  query: string;
}

/* ── 액션 ── */
export type SearchAction =
  | { type: "SEARCH_START"; query: string }
  | { type: "PANEL_RESULT"; engine: "vector" | "rdb"; result: PanelResult }
  | { type: "PANEL_ERROR"; engine: "vector" | "rdb"; message: string }
  | { type: "RESET" };

export const initialState: SearchState = {
  vector: { status: "idle" },
  rdb: { status: "idle" },
  query: "",
};

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

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "SEARCH_START":
      return {
        ...state,
        query: action.query,
        vector: { status: "loading" },
        rdb: { status: "loading" },
      };
    case "PANEL_RESULT":
      return {
        ...state,
        [action.engine]: panelResultToState(action.result),
      };
    case "PANEL_ERROR":
      return {
        ...state,
        [action.engine]: { status: "error", message: action.message },
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}
