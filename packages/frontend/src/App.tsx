// App — 좌우 비교 UI 루트
// 근거: docs/화면_설계서.md, docs/프론트엔드_기능정의서.md, docs/API_연동명세서.md

import { useEffect } from "react";
import { useSearchStore } from "./store.js";
import { Header } from "./components/Header.js";
import { SearchForm } from "./components/SearchForm.js";
import { CompareBoard } from "./components/CompareBoard.js";

export function App() {
  const vector = useSearchStore((s) => s.vector);
  const rdb = useSearchStore((s) => s.rdb);
  const connected = useSearchStore((s) => s.connected);
  const search = useSearchStore((s) => s.search);
  const retry = useSearchStore((s) => s.retry);
  const refreshHealth = useSearchStore((s) => s.refreshHealth);

  // 연결 상태 확인 (최초 + 30초 주기)
  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 30_000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const isLoading = vector.status === "loading" || rdb.status === "loading";

  return (
    <div className="mx-auto min-h-screen max-w-[1440px] px-6 pb-12">
      <Header connected={connected} />
      <SearchForm loading={isLoading} onSearch={search} />
      <CompareBoard vector={vector} rdb={rdb} onRetry={retry} />
    </div>
  );
}
