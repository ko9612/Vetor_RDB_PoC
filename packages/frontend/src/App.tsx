// App — 좌우 비교 UI 루트
// 근거: docs/화면_설계서.md, docs/프론트엔드_기능정의서.md, docs/API_연동명세서.md

import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { searchReducer, initialState } from "./reducer.js";
import { searchOrders, checkHealth } from "./api.js";
import { Header } from "./components/Header.js";
import { SearchForm } from "./components/SearchForm.js";
import { CompareBoard } from "./components/CompareBoard.js";
import type { SearchResponse } from "@scm/shared";
import styles from "./App.module.css";

// 클라이언트 캐시 (동일 query 재요청 방지 — docs/프론트엔드_기능정의서.md §6)
const cache = new Map<string, SearchResponse>();

export function App() {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  const [connected, setConnected] = useState<boolean | null>(null);
  const lastQueryRef = useRef("");

  // 연결 상태 확인
  useEffect(() => {
    checkHealth().then(setConnected);
    const interval = setInterval(() => {
      checkHealth().then(setConnected);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // 검색 실행
  const handleSearch = useCallback(async (query: string) => {
    lastQueryRef.current = query;
    dispatch({ type: "SEARCH_START", query });

    // 캐시 확인
    const cached = cache.get(query);
    if (cached) {
      dispatch({ type: "PANEL_RESULT", engine: "vector", result: cached.vector });
      dispatch({ type: "PANEL_RESULT", engine: "rdb", result: cached.rdb });
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
        dispatch({ type: "PANEL_RESULT", engine: "vector", result: res.vector });
      } catch {
        dispatch({
          type: "PANEL_ERROR",
          engine: "vector",
          message: "벡터 검색 결과 처리 중 오류",
        });
      }

      try {
        dispatch({ type: "PANEL_RESULT", engine: "rdb", result: res.rdb });
      } catch {
        dispatch({
          type: "PANEL_ERROR",
          engine: "rdb",
          message: "RDB 검색 결과 처리 중 오류",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "네트워크 오류";
      // 전체 요청 실패 시 양쪽 모두 에러
      dispatch({ type: "PANEL_ERROR", engine: "vector", message: msg });
      dispatch({ type: "PANEL_ERROR", engine: "rdb", message: msg });
    }
  }, []);

  // 다시 시도
  const handleRetry = useCallback(() => {
    if (lastQueryRef.current) {
      cache.delete(lastQueryRef.current);
      handleSearch(lastQueryRef.current);
    }
  }, [handleSearch]);

  const isLoading =
    state.vector.status === "loading" || state.rdb.status === "loading";

  return (
    <div className={styles.app}>
      <Header connected={connected} />
      <SearchForm loading={isLoading} onSearch={handleSearch} />
      <CompareBoard
        vector={state.vector}
        rdb={state.rdb}
        onRetry={handleRetry}
      />
    </div>
  );
}
